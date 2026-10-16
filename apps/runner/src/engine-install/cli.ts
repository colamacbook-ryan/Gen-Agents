import { ENGINE_INSTALL_COMMANDS, type EngineInstallStatus, runnerBundleSchemas } from '@ga/contracts';
import { type AdapterRegistry, loadRegistry, requireAdapter } from '../adapters.ts';
import { FIXED_ROOTS, RunnerError, type RunnerRoots } from '../paths.ts';
import { EXIT_RUNNER_ERROR, emitError } from '../report.ts';
import { readFirstLine } from '../stdin.ts';
import { installEngine, readInstallStatus, writeStatusLine } from './install.ts';
import type { InstallRecipe } from './recipe.ts';

// `ga-engine-install install|status` — đúng hai phần tử argv (contracts EXEC_ARGV 'engine-install' | 'engine-status');
// stdin = EngineInstallBundle {v:2, engineSlug (enum registry), source}. Công thức cài lấy từ adapter đóng sẵn trong image
// (không nhận URL từ ngoài). Nguồn `fake` nằm ở module riêng KHÔNG có trong image phát hành (Dockerfile.runtime chỉ chép tệp
// đã liệt kê) ⇒ image phát hành luôn trả failed. Proxy = ga-egress (HTTPS_PROXY / HTTP_PROXY của container).
// stdout: mỗi dòng một EngineInstallStatus (installing … rồi installed | failed); status ⇒ đúng một dòng.

function proxyFromEnv(env: NodeJS.ProcessEnv): URL | null {
  const raw = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

type FakeSourceModule = { fakeRecipe(slug: string, binaryName: string, env: NodeJS.ProcessEnv): InstallRecipe };

/** Module nguồn giả: chỉ có trong image test. Không có ⇒ null. */
async function loadFakeSource(): Promise<FakeSourceModule | null> {
  const specifier = './fake-source.ts';
  try {
    return (await import(specifier)) as FakeSourceModule;
  } catch {
    return null;
  }
}

export async function engineInstallMain(
  argv: readonly string[],
  deps: {
    roots?: RunnerRoots;
    registry?: AdapterRegistry;
    stdin?: NodeJS.ReadableStream;
    out?: (s: EngineInstallStatus) => void;
  } = {},
): Promise<number> {
  const [cmd, ...rest] = argv;
  const roots = deps.roots ?? FIXED_ROOTS;
  const out = deps.out ?? ((s: EngineInstallStatus) => writeStatusLine(1, s));
  try {
    if (rest.length > 0 || !(ENGINE_INSTALL_COMMANDS as readonly string[]).includes(cmd ?? '')) {
      throw new RunnerError('usage', 'cú pháp: ga-engine-install install|status (bundle qua stdin)');
    }
    const registry = deps.registry ?? (await loadRegistry());
    const raw = await readFirstLine((deps.stdin ?? process.stdin) as never, 4096, 10_000);
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      throw new RunnerError('bad_bundle', 'EngineInstallBundle không phải JSON');
    }
    const parsed = runnerBundleSchemas(registry.slugs).EngineInstallBundle.safeParse(v);
    if (!parsed.success) throw new RunnerError('bad_bundle', 'EngineInstallBundle sai schema / slug ngoài registry');
    const b = parsed.data;
    const adapter = requireAdapter(registry, b.engineSlug);
    if (cmd === 'status') {
      out(readInstallStatus(roots, b.engineSlug, new Date()));
      return 0;
    }
    if (!adapter.install) {
      out({ state: 'failed', reason: 'unknown', detail: 'adapter chưa khai công thức cài' });
      return 1;
    }
    let recipe: InstallRecipe = adapter.install;
    if (b.source === 'fake') {
      const fake = await loadFakeSource();
      if (!fake) {
        out({ state: 'failed', reason: 'unknown', detail: 'nguồn fake chỉ có ở image test' });
        return 1;
      }
      recipe = fake.fakeRecipe(b.engineSlug, adapter.install.binaryName, process.env);
    }
    const r = await installEngine(
      roots,
      { slug: b.engineSlug, recipe, httpsOnly: b.source === 'official', proxy: proxyFromEnv(process.env) },
      { emit: out, now: () => new Date() },
    );
    return r.state === 'installed' ? 0 : 1;
  } catch (e) {
    emitError(process.stderr, e);
    return EXIT_RUNNER_ERROR;
  }
}
