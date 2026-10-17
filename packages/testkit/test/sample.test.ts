import { ROUTES, requestSchemaOf, routeById } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { type RefField, refFieldsOf, sampleRequest } from '../src/index.ts';

const route = (id: string) => {
  const r = routeById(id);
  if (!r) throw new Error(id);
  return r;
};

const getAt = (v: unknown, path: Array<string | number>): unknown =>
  path.reduce<unknown>((cur, k) => (cur as Record<string | number, unknown>)?.[k], v);

describe('sampleRequest — mẫu HỢP LỆ cho MỌI route của registry', () => {
  it.each(ROUTES.map((r) => [r.id, r] as const))('%s', (_id, r) => {
    const s = sampleRequest(r);
    const parsed = requestSchemaOf(r).safeParse(s);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.[0])).toBe(true);
  });
});

describe('refFieldsOf — mọi trường Ref ở params / query / body', () => {
  it('Ref ở path, body (mảng) và body (trường lẻ)', () => {
    expect(refFieldsOf(route('SYS-34')).map((f) => f.path)).toEqual(['params.roleRef']);
    const sys55 = refFieldsOf(route('SYS-55')).map((f) => `${f.path}:${f.prefixes}`);
    expect(sys55).toContain('body.attachmentRefs[]:AT');
    const wrk17 = refFieldsOf(route('WRK-17')).map((f) => `${f.path}:${f.prefixes}`);
    expect(wrk17.some((p) => p.startsWith('body.toRoleRef') && p.endsWith(':RL'))).toBe(true);
  });

  it('đếm: mọi route có ≥ 1 Ref đều được thấy (không route nào có Ref mà bộ duyệt bỏ sót ở params)', () => {
    for (const r of ROUTES) {
      const params = r.request.params as unknown as { shape?: Record<string, unknown> } | undefined;
      const fields = refFieldsOf(r).filter((f) => f.part === 'params');
      const names = new Set(fields.map((f) => f.path.split('.')[1]));
      for (const k of Object.keys(params?.shape ?? {})) {
        // param không phải Ref (OpaqueId, settingKey…) thì không cần có ở danh sách
        if (k.endsWith('Ref')) expect(names.has(k), `${r.id} params.${k}`).toBe(true);
      }
    }
  });

  it('target: đặt đúng giá trị vào trường đích (kể cả optional / phần tử mảng / union); Ref khác lấy từ refFor', () => {
    let checked = 0;
    for (const r of ROUTES) {
      for (const f of refFieldsOf(r)) {
        const target = 'RL-0777';
        const s = sampleRequest(r, { targetField: f, targetValue: target, refFor: () => 'RL-0001' });
        const json = JSON.stringify(s[f.part as 'params' | 'query' | 'body']);
        expect(json, `${r.id} ${f.path}`).toContain(target);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(80);
  });

  it('đích trong body nằm đúng đường dẫn (SYS-55 attachmentRefs[0])', () => {
    const f = refFieldsOf(route('SYS-55')).find((x) => x.path === 'body.attachmentRefs[]') as RefField;
    const s = sampleRequest(route('SYS-55'), { targetField: f, targetValue: 'AT-0042' });
    expect(getAt(s.body, ['attachmentRefs', 0])).toBe('AT-0042');
  });
});
