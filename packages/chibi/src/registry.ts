// Kho nhân vật trong bộ nhớ: register(spec) kiểm schema rồi gộp tham số mặc định của khung. Engine KHÔNG kèm nhân vật nào sẵn:
// nhân vật đến từ gói skin (skins/<gói>/<phiên bản>/characters/<mã>.json) hoặc từ DB (skin_assets.params_json).
import { DEF, type Params } from './params.ts';
import { type ChibiParams, type ValidationIssue, validate } from './schema.ts';

/** lỗi nhập nhân vật: mang danh sách lỗi theo đường dẫn */
export class ChibiSpecError extends Error {
  readonly issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(
      issues.length ? `${message}: ${issues.map((i) => `${i.path || '(gốc)'} — ${i.message}`).join('; ')}` : message,
    );
    this.name = 'ChibiSpecError';
    this.issues = issues;
  }
}

export interface Character {
  spec: ChibiParams;
  /** tham số đầy đủ (mặc định của khung + `spec.p` + id) */
  P: Params;
}

const chars = new Map<string, Character>();

/** nhân vật đã đăng ký; ném lỗi rõ nếu không có (id lạ không được âm thầm vẽ ra nhân vật khác) */
export function getChar(id: string): Character {
  const c = chars.get(id);
  if (!c) throw new Error(`Chibi: không có nhân vật "${id}"`);
  return c;
}
export const hasChar = (id: string): boolean => chars.has(id);

const same = (a: ChibiParams, b: ChibiParams): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Đăng ký một nhân vật. Ném ChibiSpecError nếu spec sai schema (gồm `over` riêng) hoặc id đã có với nội dung KHÁC
 * (đăng ký lại đúng nội dung cũ là no-op; muốn thay thì unregister trước).
 */
export function register(spec: unknown): ChibiParams {
  const r = validate(spec);
  if (!r.ok) throw new ChibiSpecError('bộ tham số nhân vật không hợp lệ', r.errors);
  const v = r.value;
  const old = chars.get(v.id);
  if (old) {
    if (same(old.spec, v)) return old.spec;
    throw new ChibiSpecError(`nhân vật "${v.id}" đã đăng ký với nội dung khác (gọi unregister trước khi thay)`);
  }
  chars.set(v.id, { spec: v, P: Object.assign({}, DEF, v.p, { id: v.id }) as Params });
  return v;
}

/** Đăng ký cả gói: kiểm tất cả trước, có lỗi thì không đăng ký cái nào. */
export function registerAll(specs: readonly unknown[]): ChibiParams[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  specs.forEach((s, i) => {
    const r = validate(s);
    if (!r.ok)
      issues.push(...r.errors.map((e) => ({ path: `[${i}]${e.path ? `.${e.path}` : ''}`, message: e.message })));
    else if (seen.has(r.value.id)) issues.push({ path: `[${i}].id`, message: `id "${r.value.id}" trùng trong gói` });
    else seen.add(r.value.id);
  });
  if (issues.length) throw new ChibiSpecError('gói nhân vật không hợp lệ', issues);
  return specs.map((s) => register(s));
}

export function unregister(id: string): boolean {
  return chars.delete(id);
}

/** thông tin tóm tắt các nhân vật đang đăng ký (theo thứ tự đăng ký) */
export interface CastEntry {
  id: string;
  name: string;
  han: string | undefined;
  faction: string;
  kind: ChibiParams['kind'];
  gender: ChibiParams['gender'];
  role: string;
  color: string;
}
export const cast = (): CastEntry[] =>
  [...chars.values()].map(({ spec: s }) => ({
    id: s.id,
    name: s.name,
    han: s.han,
    faction: s.faction,
    kind: s.kind,
    gender: s.gender,
    role: s.role,
    color: s.own,
  }));
