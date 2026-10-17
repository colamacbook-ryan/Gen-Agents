// @vitest-environment happy-dom

import { API_ERROR_CODES, DB_ERROR_CODES, i18nKeyFor } from '@ga/contracts';
import { createI18n } from '@ga/i18n';
import { GLOBAL_SHORTCUTS } from '@ga/ui';
import { describe, expect, it } from 'vitest';
import { ALL_SCREEN_KEYS, GO_TO, NAV_GROUPS, pathOf, resolveLocation, screenKey } from '../src/nav.ts';
import { collectScreens } from '../src/screens.ts';

describe('cấu hình điều hướng (FRONTEND-SPEC §2.2)', () => {
  it('6 nhóm lớn: Tổng quan đứng đầu, Hệ thống đứng cuối; số tab đúng đặc tả', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['overview', 'people', 'knowledge', 'ops', 'infra', 'system']);
    expect(Object.fromEntries(NAV_GROUPS.map((g) => [g.id, g.tabs.map((t) => t.id)]))).toEqual({
      overview: [],
      people: ['roles', 'birth', 'training', 'cards', 'characters'],
      knowledge: ['instructions', 'skills', 'base', 'brain'],
      ops: ['tasks', 'wallet', 'proactive', 'leaderboard', 'telegram'],
      infra: ['accounts', 'capabilities', 'system_ai', 'ranking', 'containers'],
      system: ['audit', 'update', 'settings'],
    });
  });

  it('khoá màn và đường dẫn không trùng; mỗi tuyến phân giải ngược về đúng nhóm + tab', () => {
    expect(new Set(ALL_SCREEN_KEYS).size).toBe(ALL_SCREEN_KEYS.length);
    const paths = NAV_GROUPS.flatMap((g) => (g.tabs.length === 0 ? [pathOf(g)] : g.tabs.map((t) => pathOf(g, t))));
    expect(new Set(paths).size).toBe(paths.length);
    for (const g of NAV_GROUPS) {
      for (const t of g.tabs) expect(resolveLocation(pathOf(g, t))).toEqual({ group: g, tab: t });
      expect(screenKey(g, g.tabs[0])).toBe(g.tabs.length ? `${g.id}/${g.tabs[0]?.id}` : g.id);
    }
    expect(resolveLocation('/overview')?.tab).toBeNull();
    expect(resolveLocation('/overview/x')).toBeNull();
    expect(resolveLocation('/people/khong-co')).toBeNull();
    expect(resolveLocation('/')).toBeNull();
    expect(resolveLocation('/people')).toBeNull();
  });

  it('phím tắt G + chữ cái: bảng GO_TO khớp bảng phím tắt hiển thị (O3), mọi đích là tuyến có thật', () => {
    const documented = GLOBAL_SHORTCUTS.flatMap((g) => g.items.map((i) => i.keys))
      .filter((k) => /^g [a-z]$/.test(k))
      .map((k) => k.slice(2))
      .sort();
    expect(Object.keys(GO_TO).sort()).toEqual(documented);
    for (const to of Object.values(GO_TO)) expect(resolveLocation(to), to).not.toBeNull();
  });

  it('mọi nhãn điều hướng có chữ tiếng Việt thật', () => {
    const i18n = createI18n();
    for (const g of NAV_GROUPS) {
      for (const key of [g.label, g.pageTitle, g.description, ...g.tabs.map((t) => t.label)]) {
        expect(i18n.t(key).length, key).toBeGreaterThan(2);
      }
    }
  });
});

describe('registry màn hình', () => {
  const C = () => null;
  it('nhận màn hợp lệ; khoá lạ và khoá trùng bị từ chối rõ ràng', () => {
    expect(collectScreens({ './routes/a/screens.tsx': { screens: { 'people/roles': C } } }).get('people/roles')).toBe(
      C,
    );
    expect(() => collectScreens({ './routes/a/screens.tsx': { screens: { 'khong/co': C } } })).toThrow(
      /không có trong nav\.ts/,
    );
    expect(() =>
      collectScreens({
        './routes/a/screens.tsx': { screens: { overview: C } },
        './routes/b/screens.tsx': { screens: { overview: C } },
      }),
    ).toThrow(/hai lần/);
    expect(collectScreens({ './routes/a/screens.tsx': {} }).size).toBe(0);
  });
});

describe('API trả khoá i18n, giao diện dịch (CNS-179)', () => {
  const i18n = createI18n();

  it('mọi mã lỗi API và DB của @ga/contracts có chuỗi tiếng Việt (errors.<mã>)', () => {
    for (const code of [...API_ERROR_CODES, ...DB_ERROR_CODES]) {
      expect(i18n.has(i18nKeyFor(code)), code).toBe(true);
    }
  });

  it('mỗi lý do mật khẩu yếu của L-SEC có chuỗi riêng; chuỗi không lộ mã nội bộ hay mã lỗi thô', () => {
    for (const reason of ['too_short', 'too_long', 'too_repetitive', 'contains_username', 'same_as_current']) {
      const text = i18n.t(`errors.auth.password.${reason}` as never);
      expect(text.length, reason).toBeGreaterThan(10);
      expect(text).not.toMatch(/auth\.|errors\./);
    }
    for (const code of [...API_ERROR_CODES, ...DB_ERROR_CODES]) {
      expect(i18n.tr(i18nKeyFor(code)), code).not.toMatch(/^errors\./);
    }
  });
});
