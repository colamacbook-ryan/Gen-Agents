import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { isPtyId, PTY_MARKER_ENV, RunnerError, type RunnerRoots } from './paths.ts';
import { cmdlineOf, isAlive, pidsWithEnv } from './procs.ts';
import { killGroup } from './spawn.ts';

// `ga-runner pty --id <id> --account EN-x -- <argv đăng nhập>` (BUILD-PLAN §B.6; CNS-134):
// supervisor chạy lệnh này bằng `docker exec` Tty:true; argv đăng nhập lấy từ VÉ ĐÃ KÝ (không từ trình duyệt), binary chỉ tìm
// trong /opt/engines/bin (không shell). HOME = /auth/<en> để credential chính chủ rơi vào volume; sau khi đóng PTY app chạy
// auth-gc dọn mọi thứ ngoài allowlist.
// `ga-runner pty-kill <id>`: supervisor gọi khi đóng PTY (login_ok / owner_done / ws_closed / max_duration). Docker API không có
// lệnh giết một exec ⇒ giết trong container: nhóm tiến trình của ga-runner pty + mọi tiến trình mang marker GA_PTY_ID=<id>
// (bắt cả tiến trình đã setsid tách nhóm, miễn chưa tự xoá env). Rủi ro còn lại: CLI cố ý xoá env + setsid — ghi ở báo cáo.

export function pidFileOf(roots: RunnerRoots, id: string): string {
  return join(roots.run, 'pty', `${id}.pid`);
}

export function killMarked(id: string, signal: NodeJS.Signals): number {
  let n = 0;
  for (const pid of pidsWithEnv(PTY_MARKER_ENV, id)) {
    try {
      process.kill(pid, signal);
      n++;
    } catch {
      // đã thoát
    }
  }
  return n;
}

export interface PtyKillResult {
  signalled: number;
  remaining: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Giết phiên PTY `id`: SIGTERM nhóm + tiến trình mang marker, chờ tối đa graceMs, rồi SIGKILL. */
export async function ptyKill(roots: RunnerRoots, id: string, graceMs = 1500): Promise<PtyKillResult> {
  if (!isPtyId(id)) throw new RunnerError('bad_pty_id', 'mã PTY không hợp lệ');
  let leader: number | null = null;
  try {
    const pid = Number(readFileSync(pidFileOf(roots, id), 'utf8').trim());
    const cmd = Number.isInteger(pid) && pid > 1 ? cmdlineOf(pid) : null;
    // chống PID tái sử dụng: chỉ nhận nếu cmdline đúng là `ga-runner pty --id <id>`
    if (cmd?.includes('pty') && cmd[cmd.indexOf('--id') + 1] === id) leader = pid;
  } catch {
    leader = null;
  }
  const alive = () => (leader !== null && isAlive(leader) ? 1 : 0) + pidsWithEnv(PTY_MARKER_ENV, id).length;
  let signalled = 0;
  if (leader !== null) {
    killGroup(leader, 'SIGTERM');
    signalled++;
  }
  signalled += killMarked(id, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (alive() > 0 && Date.now() < deadline) await sleep(100);
  if (alive() > 0) {
    if (leader !== null) killGroup(leader, 'SIGKILL');
    killMarked(id, 'SIGKILL');
    const hard = Date.now() + 1500;
    while (alive() > 0 && Date.now() < hard) await sleep(100);
  }
  try {
    unlinkSync(pidFileOf(roots, id));
  } catch {
    // không còn
  }
  return { signalled, remaining: alive() };
}
