import type { z } from 'zod';
import { defOf } from '../../src/api/introspect.ts';

// Bộ sinh mẫu DƯƠNG và biến thể ÂM theo schema zod (cho test hợp đồng API): mỗi route được kiểm tự động, không phải viết tay
// 200 ca. Mẫu dương = giá trị tối thiểu hợp lệ (chỉ khoá bắt buộc). Chuỗi có regex / refine PHẢI có `.meta({ example })` —
// thiếu thì `NoSample` (báo đúng nơi cần ví dụ). Ngoại lệ ghi đè theo schema qua `overrides` (kiểu M0 không có example).

type Def = { type: string; [k: string]: unknown };
type Check = Record<string, unknown>;

export class NoSample extends Error {}

export type Overrides = ReadonlyMap<z.ZodType, unknown>;

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
  const meta = schema.meta() as Record<string, unknown> | undefined;
  return meta?.example;
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

export function sampleOf(schema: z.ZodType, overrides: Overrides = new Map(), path = '$'): unknown {
  if (overrides.has(schema)) return overrides.get(schema);
  const ex = exampleOf(schema);
  if (ex !== undefined) return ex;
  const def = defOf(schema) as Def;
  const rec = (s: unknown, p: string) => sampleOf(s as z.ZodType, overrides, p);

  if (WRAPPERS.has(def.type)) return rec(def.innerType, path);
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
        if (isOptionalIn(v)) continue;
        out[k] = rec(v, `${path}.${k}`);
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
      return Array.from({ length: n }, () => rec(def.element, `${path}[]`));
    }
    case 'union':
      return rec((def.options as unknown[])[0], `${path}|0`);
    case 'record':
      return { [rec(def.keyType, `${path}.<key>`) as string]: rec(def.valueType, `${path}.*`) };
    case 'tuple':
      return (def.items as unknown[]).map((s, i) => rec(s, `${path}[${i}]`));
    case 'pipe':
      return rec(def.in, `${path}<in>`);
    default:
      throw new NoSample(`${path}: kiểu ${def.type} không sinh được mẫu`);
  }
}

// ---------------------------------------------------------------- biến thể ÂM
export interface Mutation {
  desc: string;
  apply: (root: unknown) => unknown;
}
type Path = Array<string | number>;

function clone<T>(v: T): T {
  return structuredClone(v);
}
function setAt(root: unknown, path: Path, val: unknown): unknown {
  if (path.length === 0) return val;
  const out = clone(root) as Record<string | number, unknown>;
  let cur: Record<string | number, unknown> = out;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as string | number] as Record<string | number, unknown>;
  cur[path[path.length - 1] as string | number] = val;
  return out;
}
function delAt(root: unknown, path: Path): unknown {
  const out = clone(root) as Record<string | number, unknown>;
  let cur: Record<string | number, unknown> = out;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as string | number] as Record<string | number, unknown>;
  delete cur[path[path.length - 1] as string | number];
  return out;
}
function getAt(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const k of path) cur = (cur as Record<string | number, unknown>)[k];
  return cur;
}

/** Biến thể âm: khoá thừa ở mọi object, thiếu khoá bắt buộc, chuỗi / mảng vượt trần, enum / literal / boolean sai, số vượt biên. */
export function mutationsOf(schema: z.ZodType, sample: unknown): Mutation[] {
  const out: Mutation[] = [];

  const walk = (s: z.ZodType, path: Path, label: string): void => {
    const def = defOf(s) as Def;
    const value = getAt(sample, path);
    if (value === undefined) return;
    if (WRAPPERS.has(def.type)) {
      walk(def.innerType as z.ZodType, path, label);
      return;
    }
    switch (def.type) {
      case 'object': {
        out.push({ desc: `${label}: khoá thừa`, apply: (r) => setAt(r, [...path, '__unknown_key__'], 1) });
        for (const [k, child] of Object.entries(def.shape as Record<string, z.ZodType>)) {
          const present = (value as Record<string, unknown>)[k] !== undefined;
          if (!present) continue;
          if (!isOptionalIn(child)) out.push({ desc: `${label}.${k}: thiếu`, apply: (r) => delAt(r, [...path, k]) });
          walk(child, [...path, k], `${label}.${k}`);
        }
        return;
      }
      case 'array': {
        const max = checksOf(s).find((c) => c.check === 'max_length')?.maximum as number | undefined;
        const arr = value as unknown[];
        if (max !== undefined && max <= 5000 && arr.length > 0) {
          out.push({
            desc: `${label}: mảng vượt trần ${max}`,
            apply: (r) =>
              setAt(
                r,
                path,
                Array.from({ length: max + 1 }, () => clone(arr[0])),
              ),
          });
        }
        if (arr.length > 0) walk(def.element as z.ZodType, [...path, 0], `${label}[]`);
        return;
      }
      case 'union':
        walk((def.options as z.ZodType[])[0] as z.ZodType, path, label);
        return;
      case 'pipe':
        walk(def.in as z.ZodType, path, label);
        return;
      case 'record': {
        const keys = Object.keys(value as object);
        if (keys[0] !== undefined) walk(def.valueType as z.ZodType, [...path, keys[0]], `${label}.*`);
        return;
      }
      case 'string': {
        for (const c of checksOf(s)) {
          if (c.check === 'max_length') {
            const max = c.maximum as number;
            out.push({ desc: `${label}: chuỗi vượt trần ${max}`, apply: (r) => setAt(r, path, 'a'.repeat(max + 1)) });
          }
          if (c.check === 'length_equals') {
            const len = c.length as number;
            out.push({ desc: `${label}: sai độ dài ${len}`, apply: (r) => setAt(r, path, 'a'.repeat(len + 1)) });
          }
        }
        return;
      }
      case 'enum':
        out.push({ desc: `${label}: enum sai`, apply: (r) => setAt(r, path, '__not_in_enum__') });
        return;
      case 'literal': {
        const v = (def.values as unknown[])[0];
        const wrong = typeof v === 'string' ? `${v}__x` : typeof v === 'boolean' ? !v : 1_234_567;
        out.push({ desc: `${label}: literal sai`, apply: (r) => setAt(r, path, wrong) });
        return;
      }
      case 'boolean':
        out.push({ desc: `${label}: không phải boolean`, apply: (r) => setAt(r, path, 'not-a-bool') });
        return;
      case 'number': {
        for (const c of checksOf(s)) {
          if (c.check === 'less_than') {
            const v = c.value as number;
            if (Math.abs(v) < 1e15)
              out.push({ desc: `${label}: vượt biên trên`, apply: (r) => setAt(r, path, v + (c.inclusive ? 1 : 0)) });
          }
          if (c.check === 'greater_than') {
            const v = c.value as number;
            if (Math.abs(v) < 1e15)
              out.push({ desc: `${label}: dưới biên dưới`, apply: (r) => setAt(r, path, v - (c.inclusive ? 1 : 0)) });
          }
        }
        return;
      }
      default:
        return;
    }
  };

  walk(schema, [], '$');
  return out;
}
