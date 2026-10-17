// Bộ sinh request MẪU theo schema zod của registry + bộ tìm MỌI trường Ref (params, query, body) — CHỈ TEST.
// Gốc: packages/contracts/test/api/sample.ts (L-API) — mở rộng thêm:
//   - `refFor(prefixes)`: điền MỌI Ref bằng giá trị thật (vd hàng seed của tenant A) thay vì ví dụ cố định;
//   - `target`: dẫn đường tới MỘT trường Ref (qua object / mảng / union / record / pipe) và đặt giá trị chỉ định (vd ref của
//     tenant B) — kể cả khi trường là optional hoặc nằm trong nhánh union khác nhánh 0.
// Chuỗi có regex / refine phải có `.meta({ example })` ở hợp đồng (contract test của L-API đã ép).
import { Anchor, type EntityPrefix, type Route, refPrefixesOf } from '@ga/contracts';
import type { z } from 'zod';
import { HR_ROUTE_PATCHES } from './sample-hr.ts';

type Def = { type: string; [k: string]: unknown };
type Check = Record<string, unknown>;

export class NoSample extends Error {}

const defOf = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;
const WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'readonly',
  'nonoptional',
  'catch',
  'success',
]);

function checksOf(schema: z.ZodType): Check[] {
  const checks = (defOf(schema).checks as Array<{ _zod: { def: Check } }> | undefined) ?? [];
  return checks.map((c) => c._zod.def);
}
function isOptionalIn(schema: z.ZodType): boolean {
  const optin = (schema as unknown as { _zod: { optin?: string } })._zod.optin;
  return optin === 'optional' || optin === 'defaulted';
}
function exampleOf(schema: z.ZodType): unknown {
  return (schema.meta() as Record<string, unknown> | undefined)?.example;
}
function numberSample(schema: z.ZodType): number {
  let lower = Number.NEGATIVE_INFINITY;
  let upper = Number.POSITIVE_INFINITY;
  for (const c of checksOf(schema)) {
    if (c.check === 'greater_than') lower = Math.max(lower, (c.value as number) + (c.inclusive ? 0 : 1));
    if (c.check === 'less_than') upper = Math.min(upper, (c.value as number) - (c.inclusive ? 0 : 1));
  }
  if (lower <= 0 && upper >= 0) return 0;
  return Number.isFinite(lower) ? lower : upper;
}

// ---------------------------------------------------------------- trường Ref
export type Step =
  | { kind: 'key'; key: string }
  | { kind: 'index' }
  | { kind: 'branch'; index: number }
  | { kind: 'recordValue' }
  | { kind: 'pipeIn' }
  | { kind: 'pipeOut' };

export type RequestPart = 'params' | 'query' | 'body';
export type RefPrefixes = readonly EntityPrefix[] | '*';

export interface RefField {
  part: RequestPart;
  /** Đường dễ đọc: `body.attachmentRefs[]`, `query.roleRef`, `params.roleRef`. */
  path: string;
  steps: readonly Step[];
  prefixes: RefPrefixes;
}

function walkRefs(
  schema: z.ZodType,
  steps: Step[],
  path: string,
  out: RefField[],
  part: RequestPart,
  depth: number,
): void {
  if (depth > 32) return;
  const prefixes = refPrefixesOf(schema);
  if (prefixes !== undefined) {
    out.push({ part, path, steps: [...steps], prefixes });
    return;
  }
  const def = defOf(schema);
  const rec = (s: unknown, step: Step | null, p: string): void =>
    walkRefs(s as z.ZodType, step ? [...steps, step] : steps, p, out, part, depth + 1);
  if (WRAPPERS.has(def.type)) {
    rec(def.innerType, null, path);
    return;
  }
  switch (def.type) {
    case 'object':
      for (const [k, v] of Object.entries(def.shape as Record<string, unknown>))
        rec(v, { kind: 'key', key: k }, `${path}.${k}`);
      return;
    case 'array':
      rec(def.element, { kind: 'index' }, `${path}[]`);
      return;
    case 'union':
      (def.options as unknown[]).forEach((o, i) => {
        rec(o, { kind: 'branch', index: i }, `${path}|${i}`);
      });
      return;
    case 'record':
      rec(def.valueType, { kind: 'recordValue' }, `${path}.*`);
      return;
    case 'pipe':
      rec(def.in, { kind: 'pipeIn' }, path);
      rec(def.out, { kind: 'pipeOut' }, path);
      return;
    default:
      return;
  }
}

/** Mọi trường Ref của request một route (params, query, body). */
export function refFieldsOf(route: Pick<Route, 'request'>): RefField[] {
  const out: RefField[] = [];
  for (const part of ['params', 'query', 'body'] as const) {
    const s = route.request[part];
    if (s) walkRefs(s, [], part, out, part, 0);
  }
  return out;
}

// ---------------------------------------------------------------- sinh mẫu
export interface SampleOptions {
  /** Giá trị cho mọi Ref KHÔNG phải đích (mặc định: ví dụ của schema). */
  refFor?: (prefixes: RefPrefixes) => string | undefined;
  /** Đích: đường tới một Ref + giá trị đặt vào đó. */
  target?: { steps: readonly Step[]; value: string };
}

/** Kiểu M0 đóng băng không có `.meta({ example })` (như contracts/test/api/schemas.test.ts): cấp mẫu ở đây. */
const OVERRIDES: ReadonlyMap<z.ZodType, unknown> = new Map<z.ZodType, unknown>([[Anchor, 'role:RL-0001']]);

/** Route có ràng buộc chéo trường (refine) mà mẫu tối thiểu không thoả: bổ sung phần còn thiếu (bằng ref của `refFor`). */
const ROUTE_PATCHES: Readonly<Record<string, (s: SampleRequest, refFor: SampleOptions['refFor']) => void>> = {
  ...HR_ROUTE_PATCHES,
  // WRK-25: "ít nhất một bằng chứng"
  'WRK-25': (s, refFor) => {
    const body = s.body as Record<string, unknown> | undefined;
    if (body && body.taskRef === undefined && body.commitmentRef === undefined && body.auditRef === undefined) {
      body.taskRef = refFor?.(['TK']) ?? 'TK-0001';
    }
  },
};

function gen(schema: z.ZodType, opts: SampleOptions, rem: readonly Step[] | null, path: string): unknown {
  if (rem === null && OVERRIDES.has(schema)) return OVERRIDES.get(schema);
  const prefixes = refPrefixesOf(schema);
  if (prefixes !== undefined) {
    if (rem !== null && rem.length === 0 && opts.target) return opts.target.value;
    return opts.refFor?.(prefixes) ?? exampleOf(schema);
  }
  const def = defOf(schema);
  const next = (want: Step['kind'], pred: (s: Step) => boolean = () => true): readonly Step[] | null => {
    const s = rem?.[0];
    return s !== undefined && s.kind === want && pred(s) ? (rem as readonly Step[]).slice(1) : null;
  };
  if (WRAPPERS.has(def.type)) return gen(def.innerType as z.ZodType, opts, rem, path);
  if (rem === null) {
    const ex = exampleOf(schema);
    if (ex !== undefined) return ex;
  }
  switch (def.type) {
    case 'string': {
      const checks = checksOf(schema);
      if (checks.some((c) => c.check === 'string_format' || c.check === 'custom')) {
        throw new NoSample(`${path}: chuỗi có regex / refine cần .meta({ example })`);
      }
      let min = 0;
      let exact = -1;
      for (const c of checks) {
        if (c.check === 'min_length') min = Math.max(min, c.minimum as number);
        if (c.check === 'length_equals') exact = c.length as number;
      }
      return 'a'.repeat(exact >= 0 ? exact : Math.max(min, 1));
    }
    case 'number':
      return numberSample(schema);
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'literal':
      return (def.values as unknown[])[0];
    case 'enum':
      return Object.values(def.entries as Record<string, unknown>)[0];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(def.shape as Record<string, z.ZodType>)) {
        const r = next('key', (s) => s.kind === 'key' && s.key === k);
        if (r === null && isOptionalIn(v)) continue;
        out[k] = gen(v, opts, r, `${path}.${k}`);
      }
      return out;
    }
    case 'array': {
      let min = 0;
      let exact = -1;
      for (const c of checksOf(schema)) {
        if (c.check === 'min_length') min = Math.max(min, c.minimum as number);
        if (c.check === 'length_equals') exact = c.length as number;
      }
      const n = exact >= 0 ? exact : Math.max(min, 1);
      const r = next('index');
      return Array.from({ length: n }, (_, i) => gen(def.element as z.ZodType, opts, i === 0 ? r : null, `${path}[]`));
    }
    case 'union': {
      const s = rem?.[0];
      const branch = s?.kind === 'branch' ? s.index : 0;
      const r = s?.kind === 'branch' ? (rem as readonly Step[]).slice(1) : null;
      return gen((def.options as z.ZodType[])[branch] as z.ZodType, opts, r, `${path}|${branch}`);
    }
    case 'record': {
      const key = gen(def.keyType as z.ZodType, opts, null, `${path}.<key>`) as string;
      return { [key]: gen(def.valueType as z.ZodType, opts, next('recordValue'), `${path}.*`) };
    }
    case 'tuple':
      return (def.items as z.ZodType[]).map((s, i) => gen(s, opts, null, `${path}[${i}]`));
    case 'pipe': {
      // query dạng danh sách (`a,b`): Ref nằm ở nhánh `out` ⇒ chuỗi vào = đúng giá trị ref
      if (rem?.[0]?.kind === 'pipeOut' && opts.target) return opts.target.value;
      return gen(def.in as z.ZodType, opts, next('pipeIn'), `${path}<in>`);
    }
    default:
      throw new NoSample(`${path}: kiểu ${def.type} không sinh được mẫu`);
  }
}

/** Mẫu hợp lệ của một schema (chỉ khoá bắt buộc + đường tới đích nếu có). */
export function sampleOf(schema: z.ZodType, opts: SampleOptions = {}, path = '$'): unknown {
  return gen(schema, opts, opts.target ? opts.target.steps : null, path);
}

export interface SampleRequest {
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}

function stringifyQuery(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries((v ?? {}) as Record<string, unknown>)) out[k] = String(x);
  return out;
}

/**
 * Request mẫu HỢP LỆ của route. `targetField` + `targetValue`: đặt một Ref cụ thể (vd ref tenant B); mọi Ref khác lấy từ
 * `refFor`.
 */
export function sampleRequest(
  route: Pick<Route, 'request' | 'id'>,
  opts: { refFor?: SampleOptions['refFor']; targetField?: RefField; targetValue?: string } = {},
): SampleRequest {
  const out: SampleRequest = {};
  for (const part of ['params', 'query', 'headers', 'body'] as const) {
    const s = route.request[part];
    if (!s) continue;
    const target =
      opts.targetField && opts.targetField.part === part && opts.targetValue !== undefined
        ? { steps: opts.targetField.steps, value: opts.targetValue }
        : undefined;
    const v = sampleOf(s, { refFor: opts.refFor, ...(target ? { target } : {}) }, part);
    if (part === 'params' || part === 'query' || part === 'headers') out[part] = stringifyQuery(v);
    else out.body = v;
  }
  ROUTE_PATCHES[route.id]?.(out, opts.refFor);
  return out;
}
