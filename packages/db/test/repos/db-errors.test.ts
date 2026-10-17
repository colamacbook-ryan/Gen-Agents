// Bảng ánh xạ lỗi DB → mã ổn định (G-03, R4): phủ MỌI chuỗi RAISE của schema đang migrate (R__triggers.sql), không luật chết,
// `code` = mapDbError của contracts (một nguồn — vi phân), lỗi không phải SQLite giữ nguyên, không bao giờ nuốt.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapDbError } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import {
  DB_RULE_MATCHERS,
  DB_RULES,
  type DbRule,
  DbRuleError,
  dbRuleOf,
  toDbRuleError,
  withDbErrors,
} from '../../src/repos/errors.ts';
import { SQLITE_MIGRATIONS_DIR } from '../../src/runner/index.ts';

const TRIGGERS = readFileSync(join(SQLITE_MIGRATIONS_DIR, 'R__triggers.sql'), 'utf8');
const RAISE_RE = /RAISE\(ABORT, '([^']*)'\)/g;
const messages = [...new Set([...TRIGGERS.matchAll(RAISE_RE)].map((m) => m[1] as string))];

/** Luật không có chuỗi trong trigger: lỗi dựng sẵn của SQLite / hợp đồng kết nối / lỗi repo phát hiện. */
const NON_TRIGGER: ReadonlySet<DbRule> = new Set([
  'sqlite.foreign_key',
  'sqlite.unique',
  'sqlite.check',
  'sqlite.not_null',
  'sqlite.readonly',
  'connection.missing_function',
  'repo.not_found',
  'repo.version_conflict',
  'repo.invalid_input',
  'repo.unknown_actor',
  'repo.not_implemented',
  'unknown',
]);

describe('bảng ánh xạ lỗi DB (G-03)', () => {
  it('đọc được toàn bộ RAISE của R__triggers.sql (mọi RAISE là chuỗi hằng)', () => {
    expect(messages.length).toBeGreaterThan(400);
    expect((TRIGGERS.match(/RAISE\(/g) ?? []).length).toBe([...TRIGGERS.matchAll(RAISE_RE)].length);
  });

  it("MỌI chuỗi RAISE của schema khớp một luật cụ thể (không rơi về 'unknown')", () => {
    const unmapped = messages.filter((m) => dbRuleOf(m) === 'unknown');
    expect(unmapped).toEqual([]);
  });

  it('không luật chết: mỗi luật trigger có ít nhất một chuỗi RAISE thật khớp', () => {
    const hit = new Set(messages.map(dbRuleOf));
    const dead = DB_RULES.filter((r) => !NON_TRIGGER.has(r) && !hit.has(r));
    expect(dead).toEqual([]);
  });

  it('mỗi matcher (từng tiền tố / regex) đều thắng ít nhất một chuỗi — không có mẫu thừa', () => {
    const unused: string[] = [];
    for (const r of DB_RULE_MATCHERS) {
      if (NON_TRIGGER.has(r.rule)) continue;
      for (const p of r.match) {
        const won = messages.some(
          (m) => (typeof p === 'string' ? m.startsWith(p) : p.test(m)) && dbRuleOf(m) === r.rule,
        );
        if (!won) unused.push(`${r.rule}: ${String(p)}`);
      }
    }
    expect(unused).toEqual([]);
  });

  it('code của DbRuleError = mapDbError của contracts cho MỌI chuỗi (vi phân, một nguồn)', () => {
    for (const m of messages) {
      const err = toDbRuleError(Object.assign(new Error(m), { name: 'SqliteError' })) as DbRuleError;
      expect(err).toBeInstanceOf(DbRuleError);
      expect(err.code, m).toBe(mapDbError(m));
      expect(err.dbMessage).toBe(m);
    }
  });

  it('lỗi dựng sẵn của SQLite + hợp đồng kết nối có mã riêng', () => {
    const cases: [string, DbRule][] = [
      ['FOREIGN KEY constraint failed', 'sqlite.foreign_key'],
      ['UNIQUE constraint failed: roles.id', 'sqlite.unique'],
      ['CHECK constraint failed: amount_minor > 0', 'sqlite.check'],
      ['NOT NULL constraint failed: roles.name', 'sqlite.not_null'],
      ['attempt to write a readonly database', 'sqlite.readonly'],
      ['no such function: app_actor', 'connection.missing_function'],
      ['chuỗi lạ chưa từng thấy', 'unknown'],
    ];
    for (const [m, rule] of cases) expect(dbRuleOf(m), m).toBe(rule);
    // chuỗi lạ vẫn là LỖI (fail-closed), code = fallback của contracts
    const e = toDbRuleError(Object.assign(new Error('chuỗi lạ'), { name: 'SqliteError' })) as DbRuleError;
    expect(e.rule).toBe('unknown');
    expect(e.code).toBe('db.rule_violation');
  });

  it('withDbErrors đổi SqliteError rồi THROW lại; lỗi khác giữ nguyên; không nuốt', () => {
    const sqlite = Object.assign(new Error('ledger: ví không cho âm (sàn ví Role = 0)'), { name: 'SqliteError' });
    expect(() =>
      withDbErrors(() => {
        throw sqlite;
      }),
    ).toThrow(DbRuleError);
    try {
      withDbErrors(() => {
        throw sqlite;
      });
    } catch (e) {
      expect((e as DbRuleError).rule).toBe('ledger.insufficient_funds');
      expect((e as DbRuleError).cause).toBe(sqlite);
    }
    const plain = new TypeError('khác');
    expect(() =>
      withDbErrors(() => {
        throw plain;
      }),
    ).toThrow(plain);
    expect(withDbErrors(() => 7)).toBe(7);
  });

  it('lỗi repo có mã API (không có chuỗi DB)', () => {
    expect(new DbRuleError('repo.not_found', 'x').code).toBe('not_found');
    expect(new DbRuleError('repo.version_conflict', 'x').code).toBe('conflict');
    expect(new DbRuleError('repo.invalid_input', 'x').code).toBe('validation.failed');
  });
});
