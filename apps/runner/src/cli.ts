import type { Writable } from 'node:stream';
import { RUNNER_COMMANDS, type RunnerCommand } from '@ga/contracts';
import { type AdapterRegistry, loadRegistry } from './adapters.ts';
import { cmdAuthGc, cmdProbe, cmdTurn, type RunnerContext } from './commands.ts';
import { cmdLogin } from './login.ts';
import { parseBridgeArgs, runMcpBridge } from './mcp-bridge.ts';
import { FIXED_ROOTS, RunnerError, type RunnerRoots } from './paths.ts';
import { EXIT_RUNNER_ERROR, emitError, failWith } from './report.ts';

// Điểm vào `ga-runner <lệnh>` — đúng HAI phần tử argv (contracts EXEC_ARGV): không nhận đối số thêm; dữ liệu đi bằng bundle
// có schema đóng (stdin / ba biến env của login). Đường gốc cố định (FIXED_ROOTS), không đọc đường từ env.

export async function main(
  argv: readonly string[],
  deps: { roots?: RunnerRoots; registry?: AdapterRegistry; stdout?: Writable; stderr?: Writable } = {},
): Promise<number> {
  const [cmd, ...rest] = argv;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  // cầu MCP do CLI (trong container) chạy theo cấu hình adapter — không phải lệnh supervisor exec (ngoài EXEC_ARGV). stdout
  // của nó là KÊNH MCP của CLI (supervisor không đọc) ⇒ lỗi chỉ ra stderr + mã 125, không chen report vào luồng JSON-RPC.
  if (cmd === 'mcp-bridge') {
    try {
      return await runMcpBridge(parseBridgeArgs(rest), process, deps.roots ?? FIXED_ROOTS);
    } catch (e) {
      emitError(stderr, e);
      return EXIT_RUNNER_ERROR;
    }
  }
  try {
    if (rest.length > 0) throw new RunnerError('usage', 'ga-runner không nhận đối số ngoài tên lệnh');
    if (!(RUNNER_COMMANDS as readonly string[]).includes(cmd ?? ''))
      throw new RunnerError('usage', 'lệnh không hỗ trợ');
    const ctx: RunnerContext = {
      roots: deps.roots ?? FIXED_ROOTS,
      registry: deps.registry ?? (await loadRegistry()),
      io: { env: process.env, stdin: process.stdin, stdout, stderr, now: () => new Date() },
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
    throw new RunnerError('usage', 'lệnh không hỗ trợ');
  } catch (e) {
    return failWith({ stdout, stderr }, e);
  }
}
