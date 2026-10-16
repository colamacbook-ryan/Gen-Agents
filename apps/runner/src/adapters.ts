import { type EngineAdapter, runnerBundleSchemas } from '@ga/contracts';
import type { InstallRecipe } from './engine-install/recipe.ts';
import { RunnerError } from './paths.ts';

// Registry adapter ĐÓNG SẴN trong image runner (Gen quyết, HIGH allowlist-semantic-escape): runner tự dựng argv / env / tệp
// từ adapter; ga-app chỉ gửi ý định. Slug của mọi bundle là ENUM lấy từ registry này (runnerBundleSchemas).
// Nguồn: @ga/engines (L-ENG) — export BUILTIN_ADAPTERS. Gói đó chưa vào nhánh L-RT ⇒ nạp động theo tên; image runtime đặt
// /opt/ga/node_modules/@ga/engines (bản thật khi L-ENG merge; IT dùng stub testing/it/runtime/stubs/engines).
// TODO(INT): khi @ga/engines vào workspace thì đổi sang import tĩnh + thêm dependency.

/** Adapter như contracts EngineAdapter + công thức cài (EngineAdapterExt.install của L-ENG). */
export interface RunnerAdapter extends EngineAdapter {
  readonly install?: InstallRecipe;
}

export interface AdapterRegistry {
  readonly slugs: readonly string[];
  get(slug: string): RunnerAdapter | null;
}

const REQUIRED_FUNCTIONS = ['loginArgv', 'loginCheck', 'capabilityScan', 'turnPlan'] as const;

export function registryOf(adapters: readonly RunnerAdapter[]): AdapterRegistry {
  const map = new Map<string, RunnerAdapter>();
  for (const a of adapters) {
    for (const f of REQUIRED_FUNCTIONS) {
      if (typeof (a as unknown as Record<string, unknown>)[f] !== 'function') {
        throw new RunnerError('bad_adapter', `adapter ${a.slug} thiếu ${f}`);
      }
    }
    if (!a.flagTable || !Array.isArray(a.flagTable.env))
      throw new RunnerError('bad_adapter', `adapter ${a.slug} thiếu flagTable`);
    if (map.has(a.slug)) throw new RunnerError('bad_adapter', `slug trùng: ${a.slug}`);
    map.set(a.slug, a);
  }
  const slugs = [...map.keys()];
  // ném lỗi nếu rỗng / slug sai định dạng (fail-closed)
  runnerBundleSchemas(slugs);
  return { slugs, get: (slug) => map.get(slug) ?? null };
}

export async function loadRegistry(): Promise<AdapterRegistry> {
  const specifier = '@ga/engines';
  let mod: { BUILTIN_ADAPTERS?: unknown };
  try {
    mod = (await import(specifier)) as { BUILTIN_ADAPTERS?: unknown };
  } catch {
    throw new RunnerError('no_adapters', 'không nạp được registry adapter (@ga/engines) trong image');
  }
  if (!Array.isArray(mod.BUILTIN_ADAPTERS))
    throw new RunnerError('no_adapters', '@ga/engines không có BUILTIN_ADAPTERS');
  return registryOf(mod.BUILTIN_ADAPTERS as RunnerAdapter[]);
}

export function requireAdapter(reg: AdapterRegistry, slug: string): RunnerAdapter {
  const a = reg.get(slug);
  if (!a) throw new RunnerError('unknown_engine', 'engineSlug ngoài registry');
  return a;
}
