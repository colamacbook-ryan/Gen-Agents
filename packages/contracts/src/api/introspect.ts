import type { z } from 'zod';
import { secretKindOf } from './common.ts';

// Duyệt cây schema zod (v4) để contract test của `api/*` kiểm luật hợp đồng: trần chuỗi, strict object, không any / unknown,
// vị trí của SecretInput. Chỉ đọc `_zod.def` (cấu trúc công khai ổn định của zod 4) — không chạy parse.

export type ZodDef = { type: string; [k: string]: unknown };
export const defOf = (s: z.ZodType): ZodDef => (s as unknown as { _zod: { def: ZodDef } })._zod.def;

export interface SchemaNode {
  schema: z.ZodType;
  type: string;
  /** Đường dẫn: `body.items[].name`, nhánh union `|0`, giá trị record `.*`. */
  path: string;
  /** Tên khoá object gần nhất chứa node (qua optional / nullable / array); null ở gốc. */
  key: string | null;
}

const WRAPPER_TYPES = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'readonly',
  'nonoptional',
  'catch',
  'success',
]);

function checksOf(schema: z.ZodType): Array<Record<string, unknown>> {
  const checks = (defOf(schema).checks as Array<{ _zod: { def: Record<string, unknown> } }> | undefined) ?? [];
  return checks.map((c) => c._zod.def);
}

/** Chuỗi có trần độ dài (`max_length` hoặc `length_equals`)? */
export function stringHasCeiling(schema: z.ZodType): boolean {
  return checksOf(schema).some((c) => c.check === 'max_length' || c.check === 'length_equals');
}

/** Mảng có trần số phần tử? */
export function arrayHasCeiling(schema: z.ZodType): boolean {
  return stringHasCeiling(schema);
}

/** object strict ⇔ `catchall` là `never`. */
export function isStrictObject(schema: z.ZodType): boolean {
  const catchall = defOf(schema).catchall as z.ZodType | undefined;
  return catchall !== undefined && defOf(catchall).type === 'never';
}

export interface WalkOptions {
  /** Không đi vào (và không báo) các nhánh này — dùng cho schema đóng băng của M0 đã biết. */
  skip?: (schema: z.ZodType) => boolean;
}

/** Thu mọi node của cây (kể cả node trung gian). `lazy` chỉ được mở một lần mỗi schema (chống vòng lặp). */
export function collectNodes(root: z.ZodType, rootPath = '$', options: WalkOptions = {}): SchemaNode[] {
  const out: SchemaNode[] = [];
  const seenLazy = new Set<z.ZodType>();

  const walk = (schema: z.ZodType, path: string, key: string | null): void => {
    if (options.skip?.(schema)) return;
    const def = defOf(schema);
    out.push({ schema, type: def.type, path, key });
    const child = (s: unknown, p: string, k: string | null = key) => walk(s as z.ZodType, p, k);

    if (WRAPPER_TYPES.has(def.type)) {
      child(def.innerType, path);
      return;
    }
    switch (def.type) {
      case 'object': {
        for (const [k, v] of Object.entries(def.shape as Record<string, unknown>)) child(v, `${path}.${k}`, k);
        const catchall = def.catchall as z.ZodType | undefined;
        if (catchall && defOf(catchall).type !== 'never') child(catchall, `${path}.*`);
        return;
      }
      case 'array':
        child(def.element, `${path}[]`);
        return;
      case 'union':
        (def.options as unknown[]).forEach((o, i) => {
          child(o, `${path}|${i}`);
        });
        return;
      case 'record':
        child(def.keyType, `${path}.<key>`);
        child(def.valueType, `${path}.*`);
        return;
      case 'tuple':
        (def.items as unknown[]).forEach((o, i) => {
          child(o, `${path}[${i}]`);
        });
        if (def.rest) child(def.rest, `${path}[...]`);
        return;
      case 'pipe':
        child(def.in, `${path}<in>`);
        child(def.out, `${path}<out>`);
        return;
      case 'intersection':
        child(def.left, `${path}&L`);
        child(def.right, `${path}&R`);
        return;
      case 'lazy': {
        if (seenLazy.has(schema)) return;
        seenLazy.add(schema);
        child((def.getter as () => unknown)(), `${path}<lazy>`);
        return;
      }
      default:
        return;
    }
  };

  walk(root, rootPath, null);
  return out;
}

export interface SecretField {
  path: string;
  key: string | null;
  kind: NonNullable<ReturnType<typeof secretKindOf>>;
}

/** Mọi node mang dấu `SecretInput`. */
export function secretFieldsOf(root: z.ZodType, rootPath = '$'): SecretField[] {
  const out: SecretField[] = [];
  for (const n of collectNodes(root, rootPath)) {
    if (n.type !== 'string') continue;
    const kind = secretKindOf(n.schema);
    if (kind) out.push({ path: n.path, key: n.key, kind });
  }
  return out;
}

/** Vi phạm "trần": chuỗi / mảng không trần, object không strict, any / unknown. Rỗng = đạt. */
export function schemaViolations(root: z.ZodType, rootPath = '$', options: WalkOptions = {}): string[] {
  const out: string[] = [];
  for (const n of collectNodes(root, rootPath, options)) {
    if (n.type === 'string' && !stringHasCeiling(n.schema)) out.push(`${n.path}: chuỗi không có trần độ dài`);
    else if (n.type === 'array' && !arrayHasCeiling(n.schema)) out.push(`${n.path}: mảng không có trần phần tử`);
    else if (n.type === 'object' && !isStrictObject(n.schema)) out.push(`${n.path}: object không strict`);
    else if (n.type === 'any' || n.type === 'unknown') out.push(`${n.path}: ${n.type}`);
    else if (n.type === 'lazy') out.push(`${n.path}: lazy (z.json() không có trần — dùng Json của common.ts)`);
  }
  return out;
}
