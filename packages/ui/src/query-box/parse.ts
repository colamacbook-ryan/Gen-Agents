// Bộ phân tích ô truy vấn phía client (DATABASE §8.1) — để vẽ chip điều kiện và báo lỗi cú pháp TRƯỚC khi gửi.
// Máy chủ (L-DB, packages/db/query-box) vẫn là nơi biên dịch + kiểm lại; client không bao giờ dựng SQL.
//
//   query   := clause (WS clause)*
//   clause  := ['-'] ( field op value | '"' phrase '"' | word )
//   op      := ':' | '=' | '!=' | '>' | '>=' | '<' | '<='
//   value   := atom (',' atom)*
//   atom    := word | '"' phrase '"' | range | reldate
//   range   := atom '..' atom
//   reldate := '-' digits ('h'|'d'|'w')
//
// Quét tay từng ký tự (không regex) ⇒ tuyến tính, không có nguy cơ ReDoS. Có trần: độ dài, số mệnh đề, số giá trị.

export const QUERY_MAX_CHARS = 500;
export const QUERY_MAX_CLAUSES = 32;
export const QUERY_MAX_VALUES = 50;
export const QUERY_MAX_FIELD_CHARS = 40;

export const QUERY_OPS = [':', '=', '!=', '>', '>=', '<', '<='] as const;
export type QueryOp = (typeof QUERY_OPS)[number];

export type RelUnit = 'h' | 'd' | 'w';

/** atom của giá trị; [start, end) là vị trí trong chuỗi gốc (phrase gồm cả dấu nháy) */
export type QueryAtom =
  | { kind: 'word'; text: string; start: number; end: number }
  | { kind: 'phrase'; text: string; start: number; end: number }
  | { kind: 'reldate'; amount: number; unit: RelUnit; text: string; start: number; end: number }
  | { kind: 'range'; from: QueryScalar; to: QueryScalar; text: string; start: number; end: number };
export type QueryScalar = Exclude<QueryAtom, { kind: 'range' }>;

export type QueryClause =
  | {
      kind: 'field';
      negated: boolean;
      field: string;
      op: QueryOp;
      values: QueryAtom[];
      /** vị trí trong chuỗi gốc: [start, end) gồm cả dấu '-' phủ định */
      start: number;
      end: number;
    }
  | { kind: 'text'; negated: boolean; text: string; phrase: boolean; start: number; end: number };

/** Cùng tập lý do với `detail.reason` của lỗi `query.invalid` ở hợp đồng API (DATABASE §8.3). */
export type QueryErrorReason = 'syntax' | 'unknown_field' | 'op_not_allowed' | 'bad_value' | 'too_complex';

export interface QueryError {
  reason: QueryErrorReason;
  /** vị trí ký tự (từ 0) của đoạn lỗi — để vẽ chip đỏ đúng chỗ */
  position: number;
  length: number;
  /** đoạn văn bản gây lỗi (đã cắt ≤ 40 ký tự) */
  token: string;
  /** khoá phụ (máy đọc): vd 'missing_value', 'unclosed_quote' */
  detail?: string;
}

export type ParseResult = { ok: true; clauses: QueryClause[] } | { ok: false; error: QueryError };

const isSpace = (c: string | undefined): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '\u00a0';
const isAsciiLetter = (c: string | undefined): boolean =>
  c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isIdentChar = (c: string | undefined): boolean => isAsciiLetter(c) || isDigit(c) || c === '_' || c === '-';

class Fail extends Error {
  readonly error: QueryError;
  constructor(error: QueryError) {
    super(error.reason);
    this.error = error;
  }
}

const cut = (s: string): string => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

export function parseQuery(input: string): ParseResult {
  if (input.length > QUERY_MAX_CHARS) {
    return {
      ok: false,
      error: {
        reason: 'too_complex',
        position: QUERY_MAX_CHARS,
        length: input.length - QUERY_MAX_CHARS,
        token: '',
        detail: 'too_long',
      },
    };
  }
  const s = input;
  const n = s.length;
  let i = 0;
  const clauses: QueryClause[] = [];
  const fail = (reason: QueryErrorReason, position: number, length: number, detail?: string): never => {
    const err: QueryError = { reason, position, length, token: cut(s.slice(position, position + length)) };
    if (detail !== undefined) err.detail = detail;
    throw new Fail(err);
  };
  /** điểm kết thúc của một mệnh đề phải là khoảng trắng hoặc hết chuỗi */
  const expectEnd = (start: number): void => {
    if (i < n && !isSpace(s[i])) {
      let j = i;
      while (j < n && !isSpace(s[j])) j++;
      fail('syntax', start, j - start, 'unexpected_char');
    }
  };
  const readPhrase = (): string => {
    const open = i;
    i++; // "
    const startText = i;
    while (i < n && s[i] !== '"') i++;
    if (i >= n) fail('syntax', open, n - open, 'unclosed_quote');
    const text = s.slice(startText, i);
    i++; // "
    return text;
  };
  /** một atom không phải range; null nếu đang đứng ở chỗ không có giá trị */
  const readScalar = (): QueryScalar | null => {
    const c = s[i];
    if (i >= n || isSpace(c) || c === ',') return null;
    const start = i;
    if (c === '"') {
      const text = readPhrase();
      return { kind: 'phrase', text, start, end: i };
    }
    if (c === '-' && isDigit(s[i + 1])) {
      let j = i + 1;
      while (j < n && isDigit(s[j])) j++;
      const unit = s[j];
      const after = s[j + 1];
      const terminated = j + 1 >= n || isSpace(after) || after === ',' || (after === '.' && s[j + 2] === '.');
      if ((unit === 'h' || unit === 'd' || unit === 'w') && terminated && j - (i + 1) <= 6) {
        const text = s.slice(i, j + 1);
        const amount = Number(s.slice(i + 1, j));
        i = j + 1;
        return { kind: 'reldate', amount, unit, text, start, end: i };
      }
    }
    while (i < n) {
      const ch = s[i];
      if (isSpace(ch) || ch === ',' || (ch === '.' && s[i + 1] === '.')) break;
      if (ch === '"') fail('syntax', i, 1, 'stray_quote');
      i++;
    }
    if (i === start) return null;
    return { kind: 'word', text: s.slice(start, i), start, end: i };
  };
  const readValues = (clauseStart: number): QueryAtom[] => {
    const values: QueryAtom[] = [];
    for (;;) {
      const atomStart = i;
      const from = readScalar();
      if (!from) fail('syntax', clauseStart, i - clauseStart, 'missing_value');
      let atom: QueryAtom = from as QueryScalar;
      if (s[i] === '.' && s[i + 1] === '.') {
        i += 2;
        const to = readScalar();
        if (!to) fail('syntax', atomStart, i - atomStart, 'missing_range_end');
        atom = {
          kind: 'range',
          from: from as QueryScalar,
          to: to as QueryScalar,
          text: s.slice(atomStart, i),
          start: atomStart,
          end: i,
        };
      }
      values.push(atom);
      if (values.length > QUERY_MAX_VALUES) fail('too_complex', atomStart, i - atomStart, 'too_many_values');
      if (s[i] === ',') {
        i++;
        continue;
      }
      return values;
    }
  };

  try {
    while (i < n) {
      while (i < n && isSpace(s[i])) i++;
      if (i >= n) break;
      const start = i;
      let negated = false;
      if (s[i] === '-' && i + 1 < n && !isSpace(s[i + 1])) {
        negated = true;
        i++;
      }
      if (clauses.length >= QUERY_MAX_CLAUSES) {
        let j = i;
        while (j < n && !isSpace(s[j])) j++;
        fail('too_complex', start, j - start, 'too_many_clauses');
      }
      if (s[i] === '"') {
        const text = readPhrase();
        if (text.trim() === '') fail('syntax', start, i - start, 'empty_phrase');
        expectEnd(start);
        clauses.push({ kind: 'text', negated, text, phrase: true, start, end: i });
        continue;
      }
      // field op value?
      let j = i;
      if (isAsciiLetter(s[j])) {
        while (j < n && isIdentChar(s[j])) j++;
      }
      let op: QueryOp | null = null;
      if (j > i) {
        const c0 = s[j];
        const c1 = s[j + 1];
        if (c0 === ':') op = ':';
        else if (c0 === '=') op = '=';
        else if (c0 === '!' && c1 === '=') op = '!=';
        else if (c0 === '>') op = c1 === '=' ? '>=' : '>';
        else if (c0 === '<') op = c1 === '=' ? '<=' : '<';
      }
      if (op) {
        const field = s.slice(i, j);
        if (field.length > QUERY_MAX_FIELD_CHARS) fail('unknown_field', i, field.length, 'field_too_long');
        i = j + op.length;
        const values = readValues(start);
        expectEnd(start);
        clauses.push({ kind: 'field', negated, field, op, values, start, end: i });
        continue;
      }
      // từ trần
      const wStart = i;
      while (i < n && !isSpace(s[i])) {
        if (s[i] === '"') fail('syntax', i, 1, 'stray_quote');
        i++;
      }
      clauses.push({ kind: 'text', negated, text: s.slice(wStart, i), phrase: false, start, end: i });
    }
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.error };
    throw e;
  }
  return { ok: true, clauses };
}

/** văn bản gốc của một mệnh đề (dùng làm nhãn chip) */
export const clauseText = (input: string, c: QueryClause): string => input.slice(c.start, c.end);

/** bỏ mệnh đề thứ `index` khỏi truy vấn (nút × của chip); trả truy vấn đã gọn khoảng trắng */
export function removeClause(input: string, clauses: readonly QueryClause[], index: number): string {
  const c = clauses[index];
  if (!c) return input;
  return joinClauses(clauses.filter((_, k) => k !== index).map((x) => clauseText(input, x)));
}

/** nối các mệnh đề (đã là văn bản hợp lệ) thành một truy vấn */
export const joinClauses = (parts: readonly string[]): string =>
  parts
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join(' ');
