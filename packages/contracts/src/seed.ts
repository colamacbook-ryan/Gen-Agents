import { z } from 'zod';
import { ACTOR_SYSTEM_KEYS } from './actors.ts';
import { BOUNDS } from './bounds.ts';

// Định dạng MÁY ĐỌC ĐƯỢC của seed tham chiếu (DATABASE §11.1–11.2; BUILD-PLAN §D.4; CNS-170).
// Nguồn: bộ sinh của lane DB chạy trên nguồn DB đã kiểm (tệp `db/spec/seed_reference.json`, có sha256) — KHÔNG viết tay ở
// lane code. @ga/db kiểm sha + schema rồi áp bằng conn.bootstrap() (actor system của chính workspace được seed).
//
// Hai phần:
//   - `global`: chạy MỘT lần mỗi bản cài (workspace hệ thống, actor hệ thống của nó, danh mục engines, dna_field_defs…);
//     giá trị là hằng — KHÔNG có tham chiếu `$ref`.
//   - `perWorkspace`: chạy khi tạo MỖI workspace tenant (actor hệ thống của tenant, tools built-in, ví, PS-0001, CT-0001,
//     system_agents, settings…); giá trị phụ thuộc workspace dùng `$ref` (workspace / actor / id ổn định).
// Chạy lại không nhân đôi: mỗi bảng khai `conflictKey` (ĐÚNG bộ cột của một PK / UNIQUE) ⇒ INSERT … WHERE NOT EXISTS
// (không dùng ON CONFLICT: trigger "chống REPLACE" của DB chặn ghi trùng khoá trước khi ON CONFLICT kịp chạy).
// `created_by` KHÔNG ghi trong seed: bên áp điền bằng actor của giao dịch (app_actor()) — seed không giả danh được người ghi.
//
// sha256 = sha256(UTF-8 của canonicalJson(seed bỏ trường sha256)). canonicalJson = RFC 8785 (JCS) thu hẹp cho miền giá trị
// này (chuỗi, số nguyên an toàn, null, mảng, object): khoá sắp theo code unit, không khoảng trắng. Tương đương Python:
// `json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)` (khoá chỉ ASCII).

export const SEED_REFERENCE_FORMAT = 'ga.seed-reference.v1' as const;

/** Tên bảng / cột: định danh SQL thường (bên áp còn đối chiếu với sqlite_master / PRAGMA table_info). */
export const SQL_IDENT_RE = /^[a-z][a-z0-9_]{0,62}$/;
const SqlIdent = z.string().regex(SQL_IDENT_RE);

/** Giá trị cột: kiểu lưu của SQLite trong seed (boolean = 0/1, JSON = chuỗi đã chuẩn hoá). */
export const SeedScalar = z.union([z.string().max(65_536), z.number().int().refine(Number.isSafeInteger), z.null()]);
export type SeedScalar = z.infer<typeof SeedScalar>;

/** Tham chiếu chỉ dùng trong `perWorkspace`: id workspace đang seed / actor hệ thống của nó / id ổn định theo khoá. */
export const SeedRef = z.discriminatedUnion('$ref', [
  z.strictObject({ $ref: z.literal('workspace') }),
  z.strictObject({ $ref: z.literal('actor'), key: z.enum(ACTOR_SYSTEM_KEYS) }),
  /** id ổn định của hàng seed (vd `tools:recall`) — bên áp suy ra ULID tất định theo (workspace, key). */
  z.strictObject({ $ref: z.literal('id'), key: z.string().regex(/^[a-z][a-z0-9_.:-]{0,95}$/) }),
]);
export type SeedRef = z.infer<typeof SeedRef>;

export const SeedRow = z.record(SqlIdent, z.union([SeedScalar, SeedRef]));
export type SeedRow = z.infer<typeof SeedRow>;

export const SeedTable = z
  .strictObject({
    table: SqlIdent,
    conflictKey: z.array(SqlIdent).min(1).max(8),
    rows: z.array(SeedRow).min(1).max(100_000),
  })
  .superRefine((t, ctx) => {
    t.rows.forEach((row, i) => {
      if (Object.hasOwn(row, 'created_by')) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i, 'created_by'],
          message: 'created_by do bên áp điền (app_actor())',
        });
      }
      for (const k of t.conflictKey) {
        if (!Object.hasOwn(row, k)) ctx.addIssue({ code: 'custom', path: ['rows', i], message: `thiếu cột khoá ${k}` });
      }
    });
  });
export type SeedTable = z.infer<typeof SeedTable>;

export const SeedReference = z
  .strictObject({
    format: z.literal(SEED_REFERENCE_FORMAT),
    databaseVersion: z.string().regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/),
    source: z.strictObject({
      /** Nơi bộ sinh chạy (repo code từ DB v2.3.4; trước đó Second-Brain). */
      repo: z.string().min(1).max(255),
      rev: z.string().regex(/^[0-9a-f]{40}$/),
      generator: z.string().min(1).max(255),
    }),
    global: z.array(SeedTable).max(BOUNDS.mediumList),
    perWorkspace: z.array(SeedTable).max(BOUNDS.mediumList),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .superRefine((s, ctx) => {
    s.global.forEach((t, ti) => {
      t.rows.forEach((row, ri) => {
        for (const [col, v] of Object.entries(row)) {
          if (v !== null && typeof v === 'object') {
            ctx.addIssue({
              code: 'custom',
              path: ['global', ti, 'rows', ri, col],
              message: 'seed global không dùng $ref',
            });
          }
        }
      });
    });
  });
export type SeedReference = z.infer<typeof SeedReference>;

/** JSON chuẩn hoá (JCS thu hẹp): khoá sắp xếp, không khoảng trắng; số phải hữu hạn. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: số không hữu hạn');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: kiểu không hỗ trợ (${typeof value})`);
}

/** Chuỗi được băm cho trường sha256: seed bỏ `sha256`. */
export function seedReferenceDigestInput(seed: Omit<SeedReference, 'sha256'> & { sha256?: string }): string {
  const { sha256: _omit, ...rest } = seed;
  return canonicalJson(rest);
}
