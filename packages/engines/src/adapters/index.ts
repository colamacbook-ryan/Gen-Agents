import type { EngineAdapterExt } from '../types.ts';
import { antigravityAdapter } from './antigravity/index.ts';
import { claudeCodeAdapter } from './claude/index.ts';

// Registry adapter dựng sẵn. Slug khớp danh mục `engines` của DB (dữ liệu); ngoài thư mục adapters không ai được
// nhắc tên CLI — tra adapter qua slug lấy từ DB (lint `no-model-cli-names`). Codex / OpenClaw: `coming_soon` ở MVP,
// chưa có adapter ⇒ adapterFor trả null (UI hiện mờ "sắp có" theo engines.adapter_status).

export const BUILTIN_ADAPTERS: readonly EngineAdapterExt[] = [antigravityAdapter, claudeCodeAdapter];

export function adapterFor(slug: string): EngineAdapterExt | null {
  return BUILTIN_ADAPTERS.find((a) => a.slug === slug) ?? null;
}
