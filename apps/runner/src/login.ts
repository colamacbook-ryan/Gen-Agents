import { spawn } from 'node:child_process';
import { engineArgvViolations, PTY } from '@ga/contracts';
import { requireAdapter } from './adapters.ts';
import { cleanupOnError, newRunId, parseLoginEnv, type RunnerContext } from './commands.ts';
import { PTY_MARKER_ENV, RunnerError } from './paths.ts';
import { killMarked } from './pty.ts';
import { EXIT_RUNNER_ERROR, emitError } from './report.ts';
import { buildCliEnv, createSessionDir, finishSession, prepareSession, type Session } from './session.ts';
import { resolveCliBin } from './spawn.ts';

// `ga-runner login` (PTY đăng nhập — BUILD-PLAN §B.6, CNS-134; contracts EXEC_ARGV.login + LOGIN_EXEC.env):
// supervisor exec Tty:true với ĐÚNG ba biến env (slug, tài khoản, cách đăng nhập) lấy từ vé đã ký; runner dựng argv đăng nhập
// từ adapter đóng sẵn (loginArgv), kiểm engineArgvViolations, chạy CLI với HOME tmpfs + nối tệp allowlist (allowlist
// 'unknown' ⇒ HOME = /auth/<en>), rồi chép ngược + xoá tmpfs + auth-gc khi xong.
//
// ĐÓNG PHIÊN (supervisor không giết được exec qua Docker API, và EXEC_ARGV không có lệnh "kill"): runner tự kết thúc CLI khi
//   - nhận SIGHUP / SIGTERM (TTY bị treo / container dừng);
//   - cửa sổ PTY bị đổi sang kích thước "đóng phiên" LOGIN_CLOSE_WINSIZE — supervisor gọi Docker exec resize (trình duyệt
//     không gửi được: PtyClientMessage giới hạn 1..1000); kernel gửi SIGWINCH cho nhóm tiến trình foreground;
//   - hết trần PTY.maxDurationSeconds (phòng thủ, kể cả khi supervisor mất liên lạc).
// Giết = SIGTERM rồi SIGKILL tiến trình con + mọi tiến trình mang marker GA_PTY_ID=<id> (bắt cả tiến trình đã setsid).
// [ĐỀ XUẤT — L-RT] đưa lệnh đóng tường minh vào contracts (vd EXEC_ARGV 'login-close') thay cho tín hiệu kích thước.

/** Kích thước cửa sổ dành riêng cho tín hiệu "đóng phiên" (ngoài khoảng 1..1000 của trình duyệt). Trùng với supervisor. */
export const LOGIN_CLOSE_WINSIZE = { cols: 4093, rows: 4091 } as const;

export async function cmdLogin(ctx: RunnerContext, opts: { killGraceMs?: number } = {}): Promise<number> {
  const { roots, io } = ctx;
  let session: Session | null = null;
  let dir: string | null = null;
  try {
    const b = parseLoginEnv(ctx);
    const adapter = requireAdapter(ctx.registry, b.engineSlug);
    const argv = [...adapter.loginArgv({ authMethod: b.authMethod })];
    const v = engineArgvViolations(argv, b.engineSlug, adapter.flagTable);
    if (v.length > 0) throw new RunnerError('argv_rejected', `argv đăng nhập bị từ chối: ${v.slice(0, 3).join('; ')}`);
    const runId = newRunId();
    dir = createSessionDir(roots, `login-${runId}`);
    session = prepareSession(roots, dir, b.engineAccount, adapter.authAllowlist, []);
    const binPath = resolveCliBin(roots, b.engineSlug, argv[0] as string);
    const env = buildCliEnv(roots, b.engineSlug, session.cliHome, session.tmp, io.env, {}, adapter.flagTable);
    env.TERM = 'xterm-256color';
    env[PTY_MARKER_ENV] = runId;
    const s = session;
    const code = await new Promise<number>((resolve) => {
      const child = spawn(binPath, argv.slice(1), { argv0: argv[0], cwd: s.dir, env, stdio: 'inherit' });
      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        try {
          if (child.pid) process.kill(child.pid, 'SIGTERM');
        } catch {
          // đã thoát
        }
        killMarked(runId, 'SIGTERM');
        setTimeout(() => {
          try {
            if (child.pid) process.kill(child.pid, 'SIGKILL');
          } catch {
            // đã thoát
          }
          killMarked(runId, 'SIGKILL');
        }, opts.killGraceMs ?? 1500).unref();
      };
      const onResize = () => {
        const out = process.stdout;
        if (out.columns === LOGIN_CLOSE_WINSIZE.cols && out.rows === LOGIN_CLOSE_WINSIZE.rows) close();
      };
      process.on('SIGHUP', close);
      process.on('SIGTERM', close);
      // Ctrl-C của owner là cho CLI (cùng nhóm foreground), runner không thoát vì nó
      process.on('SIGINT', () => {});
      if (process.stdout.isTTY) process.stdout.on('resize', onResize);
      const maxTimer = setTimeout(close, PTY.maxDurationSeconds * 1000 + 5000);
      maxTimer.unref();
      child.on('error', () => resolve(127));
      child.on('exit', (c, sig) => {
        clearTimeout(maxTimer);
        killMarked(runId, 'SIGKILL');
        resolve(c ?? (sig ? 128 + 9 : 1));
      });
    });
    session = null;
    dir = null;
    finishSession(roots, s);
    return code;
  } catch (e) {
    emitError(io.stderr, e);
    return EXIT_RUNNER_ERROR;
  } finally {
    cleanupOnError(roots, session, dir, io);
  }
}
