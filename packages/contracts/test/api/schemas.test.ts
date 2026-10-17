import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defOf } from '../../src/api/introspect.ts';
import { Anchor, ROUTES, type Route, requestSchemaOf, responseSchemaOf, routeById } from '../../src/index.ts';
import { mutationsOf, type Overrides, sampleOf } from './sample.ts';

// Mỗi route có ≥ 1 ca DƯƠNG và ≥ 1 ca ÂM cho schema request và (nếu có) response JSON. Mẫu dương sinh từ schema (chỉ khoá bắt
// buộc); ca âm = mọi biến thể của `mutationsOf` (khoá thừa, thiếu khoá, chuỗi / mảng vượt trần, enum / literal sai, số vượt biên).

/** Kiểu M0 đóng băng không có `.meta({ example })`: cấp mẫu ở đây. */
const OVERRIDES: Overrides = new Map<z.ZodType, unknown>([[Anchor, 'role:RL-0001']]);

/** Route có ràng buộc chéo trường (refine) mà mẫu tối thiểu không thoả: bổ sung phần còn thiếu. */
const PATCH: Record<string, (sample: Record<string, Record<string, unknown>>) => void> = {
  // WRK-25: "ít nhất một bằng chứng".
  'WRK-25': (s) => {
    if (s.body) s.body.taskRef = 'TK-0001';
  },
};

function issuesOf(schema: z.ZodType, value: unknown): string {
  const r = schema.safeParse(value);
  return r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3));
}

function check(
  label: string,
  schema: z.ZodType,
  route: Route,
  kind: 'request' | 'response',
): { positive: number; negative: number } {
  const sample = sampleOf(schema, OVERRIDES, `${route.id}.${kind}`);
  if (kind === 'request') PATCH[route.id]?.(sample as Record<string, Record<string, unknown>>);
  expect(issuesOf(schema, sample), `${label}: mẫu dương phải hợp lệ`).toBe('');
  const muts = mutationsOf(schema, sample);
  expect(muts.length, `${label}: phải có ít nhất một ca âm`).toBeGreaterThan(0);
  for (const m of muts) {
    const mutated = m.apply(sample);
    expect(schema.safeParse(mutated).success, `${label}: ca âm "${m.desc}" lại hợp lệ`).toBe(false);
  }
  return { positive: 1, negative: muts.length };
}

describe('schema từng route — ca dương + ca âm', () => {
  it.each(ROUTES.map((r) => [r.id, r] as const))('%s request', (_id, route) => {
    const out = check(`${route.id} request`, requestSchemaOf(route), route, 'request');
    expect(out.positive).toBe(1);
    expect(out.negative).toBeGreaterThan(0);
  });

  it.each(ROUTES.filter((r) => responseSchemaOf(r) !== null).map((r) => [r.id, r] as const))(
    '%s response',
    (_id, route) => {
      const schema = responseSchemaOf(route) as z.ZodType;
      check(`${route.id} response`, schema, route, 'response');
    },
  );

  it('tổng kết: mọi route có ít nhất 1 ca dương + 1 ca âm ở request; ≥ 150 route có response JSON kiểm thêm', () => {
    let withResponse = 0;
    for (const r of ROUTES) {
      const sample = sampleOf(requestSchemaOf(r), OVERRIDES);
      PATCH[r.id]?.(sample as Record<string, Record<string, unknown>>);
      expect(requestSchemaOf(r).safeParse(sample).success, r.id).toBe(true);
      expect(mutationsOf(requestSchemaOf(r), sample).length, r.id).toBeGreaterThan(0);
      if (responseSchemaOf(r)) withResponse++;
    }
    expect(withResponse).toBeGreaterThanOrEqual(150);
  });
});

describe('bộ sinh ca âm tự kiểm (mồi)', () => {
  it('schema lỏng bị lộ: object không strict nhận khoá thừa; chuỗi không trần nhận chuỗi dài', () => {
    const loose = z.object({ a: z.string().max(3) });
    const muts = mutationsOf(loose, { a: 'x' });
    const extra = muts.find((m) => m.desc.includes('khoá thừa'));
    expect(extra && loose.safeParse(extra.apply({ a: 'x' })).success).toBe(true);
    const strict = z.strictObject({ a: z.string().max(3), b: z.array(z.enum(['p', 'q'])).max(2) });
    const sample = sampleOf(strict) as unknown;
    const all = mutationsOf(strict, sample);
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const m of all) expect(strict.safeParse(m.apply(sample)).success, m.desc).toBe(false);
  });

  it('khối lượng: hàng nghìn ca âm trên toàn registry (không phải kiểm hình thức)', () => {
    let total = 0;
    for (const r of ROUTES) {
      const sample = sampleOf(requestSchemaOf(r), OVERRIDES);
      PATCH[r.id]?.(sample as Record<string, Record<string, unknown>>);
      total += mutationsOf(requestSchemaOf(r), sample).length;
      const res = responseSchemaOf(r);
      if (res) total += mutationsOf(res, sampleOf(res, OVERRIDES)).length;
    }
    expect(total).toBeGreaterThan(3000);
  });
});

describe('body nhiều nhánh (union / discriminatedUnion): mỗi nhánh được kiểm', () => {
  const UNION_BODIES = ROUTES.filter((r) => r.request.body && defOf(r.request.body).type === 'union');

  it('các route body union đúng danh sách', () => {
    expect(UNION_BODIES.map((r) => r.id).sort()).toEqual(['SYS-39', 'SYS-68', 'SYS-84', 'WRK-23']);
  });

  it.each(UNION_BODIES.map((r) => [r.id, r] as const))('%s: từng nhánh dương, nhánh âm bị loại', (_id, route) => {
    const body = route.request.body as z.ZodType;
    const options = defOf(body).options as z.ZodType[];
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const [i, opt] of options.entries()) {
      const sample = sampleOf(opt, OVERRIDES);
      expect(issuesOf(body, sample), `${route.id} nhánh ${i}`).toBe('');
      const muts = mutationsOf(opt, sample);
      expect(muts.length).toBeGreaterThan(0);
      for (const m of muts)
        expect(body.safeParse(m.apply(sample)).success, `${route.id} nhánh ${i}: ${m.desc}`).toBe(false);
    }
    // hai nhánh không trộn lẫn khoá
    const s0 = sampleOf(options[0] as z.ZodType, OVERRIDES) as Record<string, unknown>;
    const s1 = sampleOf(options[1] as z.ZodType, OVERRIDES) as Record<string, unknown>;
    expect(body.safeParse({ ...s0, ...s1 }).success, `${route.id}: trộn hai nhánh`).toBe(false);
  });
});

describe('ràng buộc nghiệp vụ trong schema (ca tay)', () => {
  const body = (id: string) => routeById(id)?.request.body as z.ZodType;
  const params = (id: string) => routeById(id)?.request.params as z.ZodType;
  const query = (id: string) => routeById(id)?.request.query as z.ZodType;

  it('Ref: ULID hoặc display_id đúng hình dạng; rác bị loại (400); sai prefix qua classifyRef ⇒ 404 ở tầng route', () => {
    const p = params('SYS-32');
    expect(p.safeParse({ roleRef: 'RL-0001' }).success).toBe(true);
    expect(p.safeParse({ roleRef: '01JABCDEFGHJKMNPQRSTVWXYZ0' }).success).toBe(true);
    expect(p.safeParse({ roleRef: 'not a ref' }).success).toBe(false);
    expect(p.safeParse({ roleRef: 'ZZ-0001' }).success).toBe(false);
    expect(p.safeParse({ roleRef: 'RL-1' }).success).toBe(false);
    expect(p.safeParse({ roleRef: `RL-${'1'.repeat(30)}` }).success).toBe(false);
  });

  it('WRK-23: đúng một trong pctBp / amountMinor; WRK-25: cần ít nhất một bằng chứng', () => {
    const b = body('WRK-23');
    const base = { evidenceRef: 'TK-0001', class: 'self_reported', reason: 'x' };
    expect(b.safeParse({ ...base, pctBp: 500 }).success).toBe(true);
    expect(b.safeParse({ ...base, amountMinor: 100 }).success).toBe(true);
    expect(b.safeParse({ ...base }).success).toBe(false);
    expect(b.safeParse({ ...base, pctBp: 500, amountMinor: 100 }).success).toBe(false);
    expect(b.safeParse({ ...base, pctBp: 0 }).success).toBe(false);
    expect(b.safeParse({ ...base, pctBp: 10_001 }).success).toBe(false);
    expect(b.safeParse({ ...base, evidenceRef: 'RL-0001', pctBp: 500 }).success).toBe(true);
    const r = body('WRK-25');
    const reward = { kind: 'reward', amountMinor: 100, reason: 'ok' };
    expect(r.safeParse(reward).success).toBe(false);
    expect(r.safeParse({ ...reward, taskRef: 'TK-0001' }).success).toBe(true);
    expect(r.safeParse({ ...reward, auditRef: 'AU-00001' }).success).toBe(true);
    expect(r.safeParse({ ...reward, commitmentRef: 'CM-0001' }).success).toBe(true);
    expect(r.safeParse({ ...reward, taskRef: 'TK-0001', amountMinor: 0 }).success).toBe(false);
  });

  it('WRK-24 / WRK-26: số tiền > 0, lý do 1–500', () => {
    expect(body('WRK-24').safeParse({ amountMinor: 1, reason: 'x' }).success).toBe(true);
    expect(body('WRK-24').safeParse({ amountMinor: 0, reason: 'x' }).success).toBe(false);
    expect(body('WRK-24').safeParse({ amountMinor: 1, reason: '' }).success).toBe(false);
    expect(body('WRK-24').safeParse({ amountMinor: 1, reason: 'x'.repeat(501) }).success).toBe(false);
    expect(body('WRK-26').safeParse({ reason: 'x'.repeat(500) }).success).toBe(true);
  });

  it('SYS-19: text 1–20000, anchors ≤ 20 đúng ngữ pháp, attachmentRefs ≤ 10; header Idempotency-Key bắt buộc', () => {
    const b = body('SYS-19');
    const ok = { text: 'xin chào', anchors: ['role:RL-0001'], attachmentRefs: [], screen: { route: '/a1' } };
    expect(b.safeParse(ok).success).toBe(true);
    expect(b.safeParse({ ...ok, text: '' }).success).toBe(false);
    expect(b.safeParse({ ...ok, text: 'x'.repeat(20_001) }).success).toBe(false);
    expect(b.safeParse({ ...ok, anchors: Array(21).fill('role:RL-0001') }).success).toBe(false);
    expect(b.safeParse({ ...ok, anchors: ['tuỳ ý'] }).success).toBe(false);
    expect(b.safeParse({ ...ok, attachmentRefs: Array(11).fill('AT-0001') }).success).toBe(false);
    const h = routeById('SYS-19')?.request.headers as z.ZodType;
    expect(h.safeParse({ 'idempotency-key': 'abcdefgh' }).success).toBe(true);
    expect(h.safeParse({}).success).toBe(false);
    expect(h.safeParse({ 'idempotency-key': 'short' }).success).toBe(false);
    expect(h.safeParse({ 'idempotency-key': 'có dấu cách không được' }).success).toBe(false);
  });

  it('xoá nguy hiểm cần ConfirmName (SYS-36, SYS-79, GW-08, OPS-28, OPS-30); OPS-15 cần confirmVersion', () => {
    expect(body('SYS-36').safeParse({ confirmName: 'Mai' }).success).toBe(true);
    expect(body('SYS-36').safeParse({}).success).toBe(false);
    expect(body('SYS-36').safeParse({ confirmName: '' }).success).toBe(false);
    expect(body('SYS-79').safeParse({ confirmName: 'Mai' }).success).toBe(true);
    expect(body('GW-08').safeParse({ confirmLabel: 'work' }).success).toBe(true);
    expect(body('OPS-28').safeParse({ confirmName: 'Mai' }).success).toBe(true);
    expect(body('OPS-30').safeParse({ confirmName: 'Mai' }).success).toBe(true);
    expect(body('OPS-15').safeParse({ confirmVersion: '0.1.0' }).success).toBe(true);
    expect(body('OPS-15').safeParse({}).success).toBe(false);
  });

  it('OPS-10: url chỉ https, không userinfo; token tuỳ chọn (bắt buộc khi đổi host do dịch vụ kiểm)', () => {
    const b = body('OPS-10');
    expect(b.safeParse({ url: 'https://example.org/anchor.git' }).success).toBe(true);
    expect(b.safeParse({ url: 'https://example.org/anchor.git', token: 'x'.repeat(512) }).success).toBe(true);
    expect(b.safeParse({ url: 'http://example.org/anchor.git' }).success).toBe(false);
    expect(b.safeParse({ url: 'https://user:pw@example.org/a.git' }).success).toBe(false);
    expect(b.safeParse({ url: 'https://example.org/anchor.git', token: 'x'.repeat(513) }).success).toBe(false);
  });

  it('WRK-07: mã 6 chữ số; WRK-11: maxPerDay 0–20, giờ im lặng theo phút trong ngày', () => {
    expect(body('WRK-07').safeParse({ code: '123456' }).success).toBe(true);
    expect(body('WRK-07').safeParse({ code: '12345' }).success).toBe(false);
    expect(body('WRK-07').safeParse({ code: '12345a' }).success).toBe(false);
    const policy = {
      enabled: true,
      maxPerDay: 5,
      quietHours: { start: 1320, end: 450, weekend: null },
      triggers: {
        commitment_reminder: true,
        task_done: true,
        opportunity: false,
        incident: true,
        heartbeat_digest: true,
      },
      breakQuiet: 'urgent_only',
    };
    expect(body('WRK-11').safeParse(policy).success).toBe(true);
    expect(body('WRK-11').safeParse({ ...policy, maxPerDay: 21 }).success).toBe(false);
    expect(body('WRK-11').safeParse({ ...policy, quietHours: { start: 1440, end: 0, weekend: null } }).success).toBe(
      false,
    );
    expect(body('WRK-11').safeParse({ ...policy, breakQuiet: 'urgent' }).success).toBe(false);
    expect(body('WRK-11').safeParse({ ...policy, breakQuiet: 'high_and_above' }).success).toBe(true);
  });

  it('SYS-84 / SYS-39: một trong {refs} hoặc {all: true}', () => {
    expect(body('SYS-84').safeParse({ refs: ['NT-0001'] }).success).toBe(true);
    expect(body('SYS-84').safeParse({ all: true }).success).toBe(true);
    expect(body('SYS-84').safeParse({ all: false }).success).toBe(false);
    expect(body('SYS-84').safeParse({ refs: [] }).success).toBe(false);
    expect(body('SYS-84').safeParse({ refs: Array(201).fill('NT-0001') }).success).toBe(false);
    expect(body('SYS-39').safeParse({ refs: Array(65).fill('DN-0001') }).success).toBe(false);
    expect(body('SYS-39').safeParse({ refs: ['DN-0001'], all: true }).success).toBe(false);
  });

  it('SYS-31 / SYS-68: ảnh đại diện một trong 4 nguồn; màu thuộc 12 màu của DB', () => {
    const b = body('SYS-31');
    const role = { name: 'Mai', gender: 'female', description: '' };
    expect(b.safeParse(role).success).toBe(true);
    for (const avatar of [
      { source: 'library', skinAssetRef: 'SN-0001' },
      { source: 'upload', attachmentRef: 'AT-0001', crop: { x: 0.5, y: 0.5, zoom: 1.5 } },
      { source: 'monogram' },
      { source: 'generated' },
    ]) {
      expect(b.safeParse({ ...role, avatar }).success, JSON.stringify(avatar)).toBe(true);
    }
    expect(b.safeParse({ ...role, avatar: { source: 'library' } }).success).toBe(false);
    expect(b.safeParse({ ...role, avatar: { source: 'monogram', skinAssetRef: 'SN-0001' } }).success).toBe(false);
    expect(
      b.safeParse({ ...role, avatar: { source: 'upload', attachmentRef: 'AT-0001', crop: { x: 0, y: 0, zoom: 4 } } })
        .success,
    ).toBe(false);
    expect(b.safeParse({ ...role, color: 'teal' }).success).toBe(true);
    expect(b.safeParse({ ...role, color: 'pink' }).success).toBe(false);
    expect(b.safeParse({ ...role, name: 'x'.repeat(61) }).success).toBe(false);
    expect(b.safeParse({ ...role, description: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('query: boolean, số nguyên, danh sách CSV được chuyển kiểu và chặn giá trị lạ', () => {
    const q = query('WRK-15');
    const parsed = q.parse({ status: 'running,queued', limit: '50' }) as { status: string[]; limit: number };
    expect(parsed.status).toEqual(['running', 'queued']);
    expect(parsed.limit).toBe(50);
    expect(q.safeParse({ status: 'running,bogus' }).success).toBe(false);
    expect(q.safeParse({ limit: '201' }).success).toBe(false);
    expect(q.safeParse({ limit: '0' }).success).toBe(false);
    expect(q.safeParse({ limit: '1.5' }).success).toBe(false);
    expect(q.safeParse({ unknown: 'x' }).success).toBe(false);
    const n = query('SYS-83');
    expect((n.parse({ unread: 'true' }) as { unread: boolean }).unread).toBe(true);
    expect((n.parse({ unread: 'false' }) as { unread: boolean }).unread).toBe(false);
    expect(n.safeParse({ unread: 'yes' }).success).toBe(false);
    expect(query('WRK-32').safeParse({ days: '91' }).success).toBe(false);
    expect(query('OPS-36').safeParse({ q: 'x', limit: '51' }).success).toBe(false);
    expect(query('OPS-36').safeParse({ q: '' }).success).toBe(false);
  });

  it('SYS-02: timezone phải là IANA thật; lang vi | en', () => {
    const b = body('SYS-02');
    const ok = { ownerName: 'A', workspaceName: 'W', lang: 'vi', timezone: 'Asia/Ho_Chi_Minh', instanceName: 'I' };
    expect(b.safeParse(ok).success).toBe(true);
    expect(b.safeParse({ ...ok, timezone: 'Mars/Phobos' }).success).toBe(false);
    expect(b.safeParse({ ...ok, lang: 'fr' }).success).toBe(false);
    expect(b.safeParse({ ...ok, ownerName: '' }).success).toBe(false);
    expect(b.safeParse({ ...ok, workspaceSlug: 'Bad Slug' }).success).toBe(false);
  });

  it('GW-14: vé PTY dùng hằng của contracts (wsPath /term, protocol ga-term.v1, 600 giây)', () => {
    const res = routeById('GW-14')?.response;
    expect(res?.kind).toBe('json');
    const schema = (res as { schema: z.ZodType }).schema;
    const good = {
      ticket: 'eyJ2IjoyfQ.c2lnbmF0dXJl',
      wsPath: '/term',
      protocol: 'ga-term.v1',
      expiresAt: '2026-10-17T00:00:00.000Z',
      maxDurationSeconds: 600,
      container: { id: '01JABCDEFGHJKMNPQRSTVWXYZ0', displayId: 'CT-0001' },
    };
    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse({ ...good, wsPath: '/other' }).success).toBe(false);
    expect(schema.safeParse({ ...good, maxDurationSeconds: 601 }).success).toBe(false);
    expect(schema.safeParse({ ...good, ticket: 'khong hop le' }).success).toBe(false);
  });

  it('SYS-21: multipart với `purpose` thuộc 4 mục đích', () => {
    const r = routeById('SYS-21');
    expect(r?.request.bodyKind).toBe('multipart');
    const b = r?.request.body as z.ZodType;
    for (const purpose of ['chat', 'knowledge', 'avatar', 'skill_import'])
      expect(b.safeParse({ purpose }).success).toBe(true);
    expect(b.safeParse({ purpose: 'other' }).success).toBe(false);
  });
});
