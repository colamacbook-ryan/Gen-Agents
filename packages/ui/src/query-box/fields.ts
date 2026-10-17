// Whitelist trường của ô truy vấn theo từng lưới (DATABASE §8.2) + kiểm mệnh đề đã phân tích theo whitelist đó.
// Tên trường: tên en + alias tiếng Việt không dấu (vd `trang-thai`), không phân biệt hoa thường. Giá trị enum cũng nhận alias.
// Kết quả "đã giải" chỉ dùng phía client (chip, lỗi, nguồn dữ liệu trong bộ nhớ); máy chủ nhận nguyên chuỗi truy vấn và kiểm lại.
import { parseDisplayId } from '@ga/contracts';
import { foldVi } from './fold.ts';
import {
  type ParseResult,
  parseQuery,
  type QueryAtom,
  type QueryClause,
  type QueryError,
  type QueryOp,
} from './parse.ts';

export type QueryFieldType = 'text' | 'enum' | 'number' | 'bool' | 'date' | 'id';

export interface QueryEnumValue {
  value: string;
  aliases?: readonly string[];
}

export interface QueryField {
  /** tên en (khoá ổn định) */
  name: string;
  /** alias tiếng Việt không dấu (vd 'trang-thai') */
  aliases?: readonly string[];
  type: QueryFieldType;
  /** toán tử cho phép (mặc định theo kiểu) */
  ops?: readonly QueryOp[];
  /** enum: tập giá trị đóng */
  values?: readonly QueryEnumValue[];
}

const EQ_OPS: readonly QueryOp[] = [':', '=', '!='];
const ALL_OPS: readonly QueryOp[] = [':', '=', '!=', '>', '>=', '<', '<='];
export const DEFAULT_OPS: Readonly<Record<QueryFieldType, readonly QueryOp[]>> = {
  text: EQ_OPS,
  enum: EQ_OPS,
  bool: EQ_OPS,
  id: EQ_OPS,
  number: ALL_OPS,
  date: ALL_OPS,
};

const BOOL_TRUE = ['true', 'yes', '1', 'co', 'bat', 'on'];
const BOOL_FALSE = ['false', 'no', '0', 'khong', 'tat', 'off'];

export type ResolvedValue =
  | { kind: 'eq'; value: string | number | boolean }
  /** text kết thúc bằng `*`: khớp tiền tố */
  | { kind: 'prefix'; value: string }
  | { kind: 'range'; from: string | number; to: string | number }
  /** mốc tương đối: hiện tại trừ `ms` */
  | { kind: 'reldate'; ms: number };

export type ResolvedClause =
  | { kind: 'cmp'; negated: boolean; field: QueryField; op: QueryOp; values: ResolvedValue[]; source: QueryClause }
  | { kind: 'text'; negated: boolean; text: string; source: QueryClause }
  | { kind: 'id'; negated: boolean; ids: string[]; source: QueryClause };

export type ResolveResult =
  | { ok: true; clauses: ResolvedClause[] }
  | { ok: false; error: QueryError; clauses: readonly QueryClause[] };

const UNIT_MS = { h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z?)?$/;
const NUMBER_RE = /^-?\d{1,15}(?:\.\d{1,6})?$/;

/** tra trường theo tên / alias (không dấu, không phân biệt hoa thường) */
export function findField(fields: readonly QueryField[], name: string): QueryField | undefined {
  const key = foldVi(name);
  return fields.find((f) => foldVi(f.name) === key || (f.aliases ?? []).some((a) => foldVi(a) === key));
}

const atomError = (atom: QueryAtom, input: string): QueryError => {
  const raw = input.slice(atom.start, atom.end);
  return {
    reason: 'bad_value',
    position: atom.start,
    length: atom.end - atom.start,
    token: raw.length > 40 ? `${raw.slice(0, 39)}…` : raw,
  };
};

function scalarValue(
  field: QueryField,
  atom: Exclude<QueryAtom, { kind: 'range' | 'reldate' }>,
): string | number | boolean | null {
  const raw = atom.text;
  switch (field.type) {
    case 'number':
      return NUMBER_RE.test(raw) ? Number(raw) : null;
    case 'date':
      return DATE_RE.test(raw) ? raw : null;
    case 'bool': {
      const f = foldVi(raw);
      if (BOOL_TRUE.includes(f)) return true;
      if (BOOL_FALSE.includes(f)) return false;
      return null;
    }
    case 'enum': {
      const f = foldVi(raw);
      const hit = (field.values ?? []).find(
        (v) => foldVi(v.value) === f || (v.aliases ?? []).some((a) => foldVi(a) === f),
      );
      return hit ? hit.value : null;
    }
    case 'id':
      return parseDisplayId(raw) ? raw : null;
    default:
      return raw;
  }
}

type ValuesResult = { ok: true; values: ResolvedValue[] } | { ok: false; error: QueryError };

function resolveValues(
  field: QueryField,
  clause: Extract<QueryClause, { kind: 'field' }>,
  input: string,
): ValuesResult {
  const comparison = clause.op !== ':' && clause.op !== '=' && clause.op !== '!=';
  if (comparison && clause.values.length > 1) {
    const second = clause.values[1] as QueryAtom;
    return { ok: false, error: atomError(second, input) };
  }
  const out: ResolvedValue[] = [];
  for (const atom of clause.values) {
    if (atom.kind === 'reldate') {
      if (field.type !== 'date') return { ok: false, error: atomError(atom, input) };
      out.push({ kind: 'reldate', ms: atom.amount * UNIT_MS[atom.unit] });
      continue;
    }
    if (atom.kind === 'range') {
      if (comparison || (field.type !== 'number' && field.type !== 'date'))
        return { ok: false, error: atomError(atom, input) };
      if (atom.from.kind === 'reldate' || atom.to.kind === 'reldate')
        return { ok: false, error: atomError(atom, input) };
      const from = scalarValue(field, atom.from);
      const to = scalarValue(field, atom.to);
      if (from === null || to === null || typeof from === 'boolean' || typeof to === 'boolean')
        return { ok: false, error: atomError(atom, input) };
      out.push({ kind: 'range', from, to });
      continue;
    }
    if (field.type === 'text' && atom.kind === 'word' && atom.text.length > 1 && atom.text.endsWith('*')) {
      if (comparison) return { ok: false, error: atomError(atom, input) };
      out.push({ kind: 'prefix', value: atom.text.slice(0, -1) });
      continue;
    }
    const v = scalarValue(field, atom);
    if (v === null) return { ok: false, error: atomError(atom, input) };
    if (comparison && field.type !== 'number' && field.type !== 'date')
      return { ok: false, error: atomError(atom, input) };
    out.push({ kind: 'eq', value: v });
  }
  return { ok: true, values: out };
}

export interface ResolveOptions {
  /** prefix display_id của lưới (vd 'SK'): từ trần `SK-0004` thành điều kiện id thay vì tìm toàn văn */
  idPrefix?: string;
}

/** phân tích + kiểm theo whitelist; lỗi đầu tiên dừng (không chạy truy vấn nửa vời — DATABASE §8.3) */
export function resolveQuery(input: string, fields: readonly QueryField[], opts: ResolveOptions = {}): ResolveResult {
  const parsed: ParseResult = parseQuery(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, clauses: [] };
  const out: ResolvedClause[] = [];
  for (const clause of parsed.clauses) {
    if (clause.kind === 'text') {
      const id = !clause.phrase ? parseDisplayId(clause.text) : null;
      if (id && (opts.idPrefix === undefined || id.prefix === opts.idPrefix)) {
        out.push({ kind: 'id', negated: clause.negated, ids: [clause.text], source: clause });
      } else {
        out.push({ kind: 'text', negated: clause.negated, text: clause.text, source: clause });
      }
      continue;
    }
    const fieldPos = clause.start + (clause.negated ? 1 : 0);
    const field = findField(fields, clause.field);
    if (!field) {
      return {
        ok: false,
        clauses: parsed.clauses,
        error: { reason: 'unknown_field', position: fieldPos, length: clause.field.length, token: clause.field },
      };
    }
    const ops = field.ops ?? DEFAULT_OPS[field.type];
    if (!ops.includes(clause.op)) {
      return {
        ok: false,
        clauses: parsed.clauses,
        error: {
          reason: 'op_not_allowed',
          position: fieldPos + clause.field.length,
          length: clause.op.length,
          token: clause.op,
        },
      };
    }
    if (field.type === 'id') {
      const ids: string[] = [];
      for (const atom of clause.values) {
        const ok = (atom.kind === 'word' || atom.kind === 'phrase') && parseDisplayId(atom.text);
        if (!ok || (opts.idPrefix !== undefined && ok.prefix !== opts.idPrefix)) {
          return { ok: false, clauses: parsed.clauses, error: atomError(atom, input) };
        }
        ids.push(atom.text);
      }
      out.push({ kind: 'id', negated: clause.negated !== (clause.op === '!='), ids, source: clause });
      continue;
    }
    const r = resolveValues(field, clause, input);
    if (!r.ok) return { ok: false, clauses: parsed.clauses, error: r.error };
    out.push({ kind: 'cmp', negated: clause.negated, field, op: clause.op, values: r.values, source: clause });
  }
  return { ok: true, clauses: out };
}

/** trường `id` dựng sẵn cho mọi lưới (DATABASE §8.2 "mọi lưới") */
export const ID_FIELD: QueryField = { name: 'id', aliases: ['ma'], type: 'id' };
