import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  collectNodes,
  defOf,
  isStrictObject,
  type SchemaNode,
  schemaViolations,
  secretFieldsOf,
} from '../../src/api/introspect.ts';
import { Json, ROUTES, routeById, SecretInput, SseEvent, secretKindOf, str } from '../../src/index.ts';

// Contract test bảo mật (BACKEND-TRIAL §3.1 test 2; rà soát bảo mật 2026-10-17):
//   - secret chỉ nằm trong BODY, không route GET nào nhận secret, mọi field secret có kiểu SecretInput;
//   - route chạm credential / mở PTY (`touchesCredential`) = owner, không ngoại lệ;
//   - mọi chuỗi có trần, mọi object strict, không any / unknown / z.json().

type Part = 'params' | 'query' | 'headers' | 'body';
const PARTS: Part[] = ['params', 'query', 'headers', 'body'];

describe('secret chỉ trong body', () => {
  it('không route nào nhận SecretInput qua path / query / header; route GET / WS không nhận secret', () => {
    for (const r of ROUTES) {
      for (const part of ['params', 'query', 'headers'] as const) {
        const schema = r.request[part];
        if (schema) expect(secretFieldsOf(schema, part), `${r.id} ${part}`).toEqual([]);
      }
      if ((r.method === 'GET' || r.method === 'WS') && r.request.body) {
        expect(secretFieldsOf(r.request.body, 'body'), r.id).toEqual([]);
      }
    }
  });

  it('đúng các route nhận secret, đúng loại (golden)', () => {
    const got: Record<string, string[]> = {};
    for (const r of ROUTES) {
      if (!r.request.body) continue;
      const fields = secretFieldsOf(r.request.body, 'body').map((f) => f.kind);
      if (fields.length > 0) got[r.id] = fields;
    }
    expect(got).toEqual({
      'EXT-01': ['password'],
      'EXT-04': ['password', 'password'],
      'GW-12': ['api_key'],
      'WRK-02': ['bot_token'],
      'OPS-10': ['anchor_token'],
    });
  });

  it('không response nào chứa SecretInput; không trường response tên là secret trần', () => {
    const SECRET_LEAF = /^(?:password|apiKey|token|accessToken|refreshToken|botToken|anchorToken|secretValue)$/i;
    for (const r of ROUTES) {
      const res = r.response;
      const schemas: z.ZodType[] =
        res.kind === 'json' ? [res.schema] : res.kind === 'ws' ? [res.client, res.server] : [];
      for (const s of schemas) {
        expect(secretFieldsOf(s), `${r.id} response`).toEqual([]);
        for (const n of collectNodes(s)) {
          if (n.key !== null && ['string', 'number', 'boolean'].includes(n.type)) {
            expect(SECRET_LEAF.test(n.key), `${r.id}: response có trường ${n.key}`).toBe(false);
          }
        }
      }
    }
  });

  it('header riêng của route chỉ gồm idempotency-key / last-event-id', () => {
    const allowed = new Set(['idempotency-key', 'last-event-id']);
    for (const r of ROUTES) {
      if (!r.request.headers) continue;
      for (const k of Object.keys((r.request.headers as unknown as { shape: object }).shape))
        expect(allowed.has(k), `${r.id}: ${k}`).toBe(true);
    }
  });

  it('tên trường request khớp /token|password|secret|apiKey/i phải là SecretInput (miễn: số `dailyTokenQuota`)', () => {
    const NAME = /token|password|secret|apiKey/i;
    // Ngoại lệ có lý do: `dailyTokenQuota` là hạn mức token (số nguyên) của Position (SYS-45), không phải secret.
    const EXEMPT = new Map([['dailyTokenQuota', 'SYS-45']]);
    const seenExempt: string[] = [];
    for (const r of ROUTES) {
      for (const part of PARTS) {
        const schema = r.request[part];
        if (!schema) continue;
        for (const n of collectNodes(schema, part)) {
          if (n.key === null || !NAME.test(n.key)) continue;
          if (!['string', 'number', 'boolean', 'enum', 'literal'].includes(n.type)) continue;
          if (secretKindOf(n.schema)) continue;
          expect(EXEMPT.get(n.key), `${r.id} ${part}.${n.key}: tên giống secret mà không phải SecretInput`).toBe(r.id);
          expect(n.type, `${r.id} ${n.key}`).toBe('number');
          seenExempt.push(`${r.id}.${n.key}`);
        }
      }
    }
    expect(seenExempt).toEqual(['SYS-45.dailyTokenQuota']);
  });

  it('SecretInput: không rỗng, có trần theo loại; nhận diện được qua optional()', () => {
    const s = SecretInput('api_key');
    expect(s.safeParse('').success).toBe(false);
    expect(s.safeParse('a'.repeat(512)).success).toBe(true);
    expect(s.safeParse('a'.repeat(513)).success).toBe(false);
    expect(SecretInput('bot_token').safeParse('a'.repeat(129)).success).toBe(false);
    expect(secretKindOf(s)).toBe('api_key');
    expect(secretKindOf(str(10))).toBeUndefined();
    const optional = routeById('OPS-10')?.request.body;
    expect(optional && secretFieldsOf(optional).map((f) => f.kind)).toEqual(['anchor_token']);
  });
});

describe('route chạm credential = owner (touchesCredential, không ngoại lệ)', () => {
  const FLAGGED = [
    // Core agent: tài khoản + binding + container + đồng ý Clause 6
    'SYS-04',
    'SYS-05',
    'SYS-11',
    // tài khoản engine, đồng ý, khoá API, PTY đăng nhập (+ WS /term)
    'GW-07',
    'GW-08',
    'GW-11',
    'GW-12',
    'GW-13',
    'GW-14',
    'EXT-05',
    // token bot Telegram, đổi chủ Telegram
    'WRK-02',
    'WRK-07',
    'WRK-08',
    // token neo audit ngoài máy
    'OPS-10',
    'OPS-11',
  ];

  it('tập route có cờ = danh sách đã rà (golden); thêm / bớt phải sửa test có chủ đích', () => {
    expect(
      ROUTES.filter((r) => r.touchesCredential)
        .map((r) => r.id)
        .sort(),
    ).toEqual([...FLAGGED].sort());
  });

  it('route có cờ ⇒ auth = O, không ownerWhen (không ngoại lệ cho admin)', () => {
    for (const r of ROUTES) {
      if (!r.touchesCredential) continue;
      expect(r.auth, `${r.id} chạm credential nhưng quyền ${r.auth}`).toBe('O');
      expect(r.ownerWhen, r.id).toEqual([]);
    }
  });

  it('body có SecretInput ⇒ phải khai touchesCredential hoặc userPassword; mở PTY (WS) ⇒ touchesCredential', () => {
    for (const r of ROUTES) {
      const hasSecret = r.request.body ? secretFieldsOf(r.request.body).length > 0 : false;
      if (hasSecret) expect(r.touchesCredential || r.userPassword, r.id).toBe(true);
      if (r.response.kind === 'ws') expect(r.touchesCredential, r.id).toBe(true);
    }
  });

  it('userPassword (đăng nhập, đổi mật khẩu của chính mình): public hoặc V — và không đồng thời chạm credential hệ thống', () => {
    expect(
      ROUTES.filter((r) => r.userPassword)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['EXT-01', 'EXT-04']);
    for (const r of ROUTES) {
      if (!r.userPassword) continue;
      expect(['public', 'V'], r.id).toContain(r.auth);
      expect(r.touchesCredential, r.id).toBe(false);
    }
  });

  it('vé PTY / CSRF không bị cache: GW-14, EXT-01, EXT-03 trả no-store', () => {
    for (const id of ['GW-14', 'EXT-01', 'EXT-03']) {
      const res = routeById(id)?.response;
      expect(res?.kind === 'json' && res.noStore, id).toBe(true);
    }
    expect(
      ROUTES.filter((r) => r.response.kind === 'json' && r.response.noStore)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['EXT-01', 'EXT-03', 'GW-14']);
  });

  it('GW-08: gỡ tài khoản engine (kèm /auth) chỉ owner — lỗi bảo mật MEDIUM đã sửa', () => {
    const r = routeById('GW-08');
    expect(r?.method).toBe('DELETE');
    expect(r?.auth).toBe('O');
    expect(r?.touchesCredential).toBe(true);
  });

  it('backup không chứa /auth; danh sách secret chỉ có mask', () => {
    const backups = routeById('OPS-17')?.response;
    expect(backups?.kind === 'json' && JSON.stringify(collectNodes(backups.schema).map((n) => n.path))).toContain(
      'includesAuth',
    );
    const node =
      backups?.kind === 'json'
        ? collectNodes(backups.schema).find((n) => n.key === 'includesAuth' && n.type === 'literal')
        : undefined;
    expect(node && (defOf(node.schema).values as unknown[])[0]).toBe(false);
    const secrets = routeById('OPS-05')?.response;
    const keys = secrets?.kind === 'json' ? collectNodes(secrets.schema).map((n) => n.key) : [];
    expect(keys).toContain('last4');
    for (const k of keys)
      expect(/^(?:value|secret|token|apiKey|password|plaintext)$/i.test(k ?? ''), String(k)).toBe(false);
  });
});

describe('trần độ dài, strict, không any / unknown', () => {
  it('mọi request: chuỗi / mảng có trần, object strict, không any / unknown / lazy', () => {
    for (const r of ROUTES) {
      for (const part of PARTS) {
        const schema = r.request[part];
        if (schema) expect(schemaViolations(schema, `${r.id}.${part}`), `${r.id} ${part}`).toEqual([]);
      }
    }
  });

  it('mọi response JSON: cùng luật, KHÔNG ngoại lệ (kể cả schema M0 dùng lại)', () => {
    for (const r of ROUTES) {
      const res = r.response;
      if (res.kind === 'json') expect(schemaViolations(res.schema, r.id), `${r.id} response`).toEqual([]);
      if (res.kind === 'ws') {
        expect(schemaViolations(res.client, r.id), `${r.id} ws client`).toEqual([]);
        expect(schemaViolations(res.server, r.id), `${r.id} ws server`).toEqual([]);
      }
    }
  });

  it('bộ phát hiện chạy được: schema mồi vi phạm bị bắt', () => {
    expect(schemaViolations(z.strictObject({ a: z.string() })).length).toBe(1);
    expect(schemaViolations(z.strictObject({ a: z.string().max(5) }))).toEqual([]);
    expect(schemaViolations(z.strictObject({ a: z.array(z.string().max(5)) })).length).toBe(1);
    expect(schemaViolations(z.object({ a: z.string().max(5) })).length).toBe(1);
    expect(schemaViolations(z.strictObject({ a: z.any() })).length).toBe(1);
    expect(schemaViolations(z.strictObject({ a: z.unknown() })).length).toBe(1);
    expect(schemaViolations(z.strictObject({ a: z.json() })).length).toBeGreaterThan(0);
    expect(schemaViolations(z.strictObject({ a: Json })).length).toBe(0);
    expect(isStrictObject(z.strictObject({}))).toBe(true);
    expect(isStrictObject(z.looseObject({}))).toBe(false);
  });

  it('Json tự do có trần: chuỗi, độ sâu, số khoá', () => {
    expect(Json.safeParse('a'.repeat(16_384)).success).toBe(true);
    expect(Json.safeParse('a'.repeat(16_385)).success).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i < 8; i++) deep = [deep];
    expect(Json.safeParse(deep).success).toBe(true);
    deep = [deep];
    expect(Json.safeParse(deep).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`k${i}`, i]));
    expect(Json.safeParse(many).success).toBe(false);
    expect(Json.safeParse({ ok: [1, 'x', null, true, { a: 1 }] }).success).toBe(true);
  });

  it('sự kiện SSE không mang token / vé / secret (mọi khoá của 26 loại)', () => {
    const NAME = /token|ticket|password|secret|apikey|credential(?!\.blocked)/i;
    const nodes: SchemaNode[] = [];
    for (const o of SseEvent.options) nodes.push(...collectNodes(o));
    for (const n of nodes) {
      if (n.key === null) continue;
      expect(NAME.test(n.key), `SSE khoá ${n.key}`).toBe(false);
    }
  });
});
