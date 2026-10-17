import type { AnyInput } from './routes.ts';

/** Khoá TanStack Query của một lần đọc: `['api', id, params, query]` — vô hiệu hoá theo tiền tố (`['api', id]`, `['api']`). */
export const routeKey = (id: string, input?: AnyInput) =>
  ['api', id, input?.params ?? null, input?.query ?? null] as const;
