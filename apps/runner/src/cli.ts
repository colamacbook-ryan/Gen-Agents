import { RUNNER_COMMANDS, type RunnerCommand } from '@ga/contracts';
import { type AdapterRegistry, loadRegistry } from './adapters.ts';
import { cmdAuthGc, cmdProbe, cmdTurn, type RunnerContext } from './commands.ts';
import { cmdLogin } from './login.ts';
import { FIXED_ROOTS, RunnerError, type RunnerRoots } from './paths.ts';
import { EXIT_RUNNER_ERROR, emitError } from './report.ts';

// Điểm vào `ga-runner <lệnh>` — đúng HAI phần tử argv (contracts EXEC_ARGV): không nhận đối số thêm; dữ liệu đi bằng bundle
// có schema đóng (stdin / ba biến env của login). Đường gốc cố định (FIXED_ROOTS), không đọc đường từ env.

export async function main(
  argv: readonly string[],
  deps: { roots?: RunnerRoots; registry?: AdapterRegistry } = {},
): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    if (rest.length > 0) throw new RunnerError('usage', 'ga-runner không nhận đối số ngoài tên lệnh');
    if (!(RUNNER_COMMANDS as readonly string[]).includes(cmd ?? ''))
      throw new RunnerError('usage', 'lệnh không hỗ trợ');
    const ctx: RunnerContext = {
      roots: deps.roots ?? FIXED_ROOTS,
      registry: deps.registry ?? (await loadRegistry()),
      io: {
        env: process.env,
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        now: () => new Date(),
      },
    };
    switch (cmd as RunnerCommand) {
      case 'turn':
        return await cmdTurn(ctx);
      case 'login-check':
        return await cmdProbe(ctx, 'login-check');
      case 'probe':
        return await cmdProbe(ctx, 'probe');
      case 'auth-gc':
        return await cmdAuthGc(ctx);
      case 'login':
        return await cmdLogin(ctx);
    }
  } catch (e) {
    emitError(process.stderr, e);
    return EXIT_RUNNER_ERROR;
  }
  return EXIT_RUNNER_ERROR;
}
