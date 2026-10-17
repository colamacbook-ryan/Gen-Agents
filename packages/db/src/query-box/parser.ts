// Ô truy vấn (DATABASE §8.1, STD-07 §1) — parser tay, tuyến tính, không regex lồng:
//   query   := clause (WS clause)*                 -- nối bằng AND
//   clause  := ['-'] ( field op value | '"' phrase '"' | word )
//   op      := ':' | '=' | '!=' | '>' | '>=' | '<' | '<='
//   value   := atom (',' atom)*                    -- nhiều giá trị → IN (…)
//   atom    := word | '"' phrase '"' | range | reldate
//   range   := atom '..' atom
//   reldate := '-' digits ('h'|'d'|'w')
// Từ trần dạng display_id (MM-0041) ⇒ mệnh đề id. Chặn kích thước trước khi phân tích. Lỗi ⇒ QueryBoxError có vị trí +
// mã (UI hiện chip đỏ "không hiểu `abc:`"), không bao giờ chạy truy vấn nửa vời.

export const QUERY_MAX_CHARS = 1000;
export const QUERY_MAX_CLAUSES = 32;
export const QUERY_MAX_VALUES = 50;

export type QueryOp = ':' | '=' | '!=' | '>' | '>=' | '<' | '<=';

export type Atom =
  | { kind: 'word'; value: string }
  | { kind: 'phrase'; value: string }
  | { kind: 'reldate'; amount: number; unit: 'h' | 'd' | 'w' }
  | { kind: 'range'; from: Atom; to: Atom };

export type Clause =
  | { kind: 'field'; negate: boolean; field: string; op: QueryOp; values: Atom[]; start: number; raw: string }
  | { kind: 'text'; negate: boolean; text: string; phrase: boolean; start: number; raw: string }
  | { kind: 'id'; negate: boolean; prefix: string; seq: number; displayId: string; start: number; raw: string };

export type QueryBoxErrorCode =
  | 'too_long'
  | 'too_many_clauses'
  | 'too_many_values'
  | 'unterminated_quote'
  | 'empty_value'
  | 'unknown_field'
  | 'bad_operator'
  | 'bad_value'
  | 'wrong_prefix';

/** Lỗi ô truy vấn: mã ổn định (khoá i18n `query.<code>`) + đoạn gây lỗi + vị trí — cho chip đỏ. */
export class QueryBoxError extends Error {
  readonly code: QueryBoxErrorCode;
  readonly token: string;
  readonly position: number;
  constructor(code: QueryBoxErrorCode, token: string, position: number, detail?: string) {
    super(`${code}: \`${token.slice(0, 60)}\`${detail ? ` — ${detail}` : ''}`);
    this.name = 'QueryBoxError';
    this.code = code;
    this.token = token;
    this.position = position;
  }
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
// tên trường không phân biệt hoa thường (findField hạ chữ) ⇒ nhận cả A–Z
const isIdentChar = (c: string) =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-' || c === '.';
const isDigit = (c: string) => c >= '0' && c <= '9';

/** Tách mệnh đề theo khoảng trắng ngoài dấu nháy. */
function splitClauses(input: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && isSpace(input[i] as string)) i++;
    if (i >= input.length) break;
    const start = i;
    let inQuote = false;
    while (i < input.length && (inQuote || !isSpace(input[i] as string))) {
      if (input[i] === '"') inQuote = !inQuote;
      i++;
    }
    if (inQuote) throw new QueryBoxError('unterminated_quote', input.slice(start), start);
    out.push({ text: input.slice(start, i), start });
  }
  return out;
}

/** Tách theo dấu phẩy ngoài dấu nháy. */
function splitValues(s: string, at: number): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let inQuote = false;
  let from = 0;
  for (let i = 0; i <= s.length; i++) {
    const c = s[i];
    if (c === '"') inQuote = !inQuote;
    if (i === s.length || (c === ',' && !inQuote)) {
      out.push({ text: s.slice(from, i), start: at + from });
      from = i + 1;
    }
  }
  return out;
}

function parseReldate(s: string): Atom | null {
  if (s.length < 3 || s[0] !== '-') return null;
  const unit = s[s.length - 1];
  if (unit !== 'h' && unit !== 'd' && unit !== 'w') return null;
  const digits = s.slice(1, -1);
  if (digits.length === 0 || digits.length > 6) return null;
  for (const c of digits) if (!isDigit(c)) return null;
  return { kind: 'reldate', amount: Number(digits), unit };
}

function parseSimpleAtom(s: string, at: number): Atom {
  if (s.length === 0) throw new QueryBoxError('empty_value', s, at);
  if (s[0] === '"') {
    if (s.length < 2 || s[s.length - 1] !== '"') throw new QueryBoxError('unterminated_quote', s, at);
    const inner = s.slice(1, -1);
    if (inner.includes('"')) throw new QueryBoxError('bad_value', s, at, 'dấu nháy lồng');
    return { kind: 'phrase', value: inner };
  }
  if (s.includes('"')) throw new QueryBoxError('bad_value', s, at, 'dấu nháy giữa từ');
  return parseReldate(s) ?? { kind: 'word', value: s };
}

function parseAtom(s: string, at: number): Atom {
  const dots = s.indexOf('..');
  if (dots > 0 && s[0] !== '"') {
    const from = parseSimpleAtom(s.slice(0, dots), at);
    const to = parseSimpleAtom(s.slice(dots + 2), at + dots + 2);
    return { kind: 'range', from, to };
  }
  return parseSimpleAtom(s, at);
}

/** display_id: 2–3 chữ hoa, '-', ≥ 4 chữ số (kiểm định dạng chuẩn ở tầng biên dịch theo bảng của lưới). */
function asDisplayId(s: string): { prefix: string; seq: number } | null {
  const dash = s.indexOf('-');
  if (dash < 2 || dash > 3) return null;
  const prefix = s.slice(0, dash);
  const digits = s.slice(dash + 1);
  for (const c of prefix) if (c < 'A' || c > 'Z') return null;
  if (digits.length < 4 || digits.length > 9) return null;
  for (const c of digits) if (!isDigit(c)) return null;
  const seq = Number(digits);
  return seq > 0 ? { prefix, seq } : null;
}

const OPS: readonly QueryOp[] = ['!=', '>=', '<=', ':', '=', '>', '<'];

function parseClause(text: string, start: number): Clause {
  let negate = false;
  let body = text;
  let at = start;
  if (body.length > 1 && body[0] === '-') {
    negate = true;
    body = body.slice(1);
    at++;
  }
  if (body[0] === '"') {
    const a = parseSimpleAtom(body, at);
    return { kind: 'text', negate, text: a.kind === 'phrase' ? a.value : body, phrase: true, start, raw: text };
  }
  let i = 0;
  while (i < body.length && isIdentChar(body[i] as string)) i++;
  const op = i > 0 ? OPS.find((o) => body.startsWith(o, i)) : undefined;
  if (op !== undefined) {
    const field = body.slice(0, i);
    const rest = body.slice(i + op.length);
    if (rest.length === 0) throw new QueryBoxError('empty_value', text, start);
    const parts = splitValues(rest, at + i + op.length);
    if (parts.length > QUERY_MAX_VALUES) throw new QueryBoxError('too_many_values', text, start);
    return { kind: 'field', negate, field, op, values: parts.map((p) => parseAtom(p.text, p.start)), start, raw: text };
  }
  const id = asDisplayId(body);
  if (id !== null) return { kind: 'id', negate, prefix: id.prefix, seq: id.seq, displayId: body, start, raw: text };
  // từ có toán tử lạ (vd "abc:" thiếu tên trường hoặc "=x") ⇒ lỗi rõ, không coi là text
  if (body.includes(':') || body.startsWith('=') || body.startsWith('>') || body.startsWith('<')) {
    throw new QueryBoxError('bad_operator', text, start);
  }
  return { kind: 'text', negate, text: body, phrase: false, start, raw: text };
}

/** Phân tích chuỗi ô truy vấn → danh sách mệnh đề (AND). Chuỗi rỗng ⇒ []. */
export function parseQuery(input: string): Clause[] {
  if (input.length > QUERY_MAX_CHARS) throw new QueryBoxError('too_long', input.slice(0, 40), 0);
  const parts = splitClauses(input);
  if (parts.length > QUERY_MAX_CLAUSES) throw new QueryBoxError('too_many_clauses', input.slice(0, 40), 0);
  return parts.map((p) => parseClause(p.text, p.start));
}
