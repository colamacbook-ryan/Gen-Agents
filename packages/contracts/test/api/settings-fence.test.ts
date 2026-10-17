import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_SETTING_WRITERS,
  defineSetting,
  isSettingKey,
  requiredAccess,
  routeById,
  SETTING_LOOSENING_KEY_RE,
  SETTINGS,
  settingWritableBy,
} from '../../src/index.ts';

// Review bảo mật PR #7 (H4): quyền ghi `settings`. Quy tắc Gen (fail-closed): NỚI hàng rào = owner. Khoá không khai `writers`
// ⇒ owner. Admin chỉ ghi được khoá thuần giao diện. Quét MỌI khoá có tên thuộc nhóm "nới".

const KEYS = Object.keys(SETTINGS);

describe('settings: quyền ghi fail-closed', () => {
  it('mọi khoá có tên thuộc nhóm nới hàng rào (retention, quota, trần, ngân sách, ₲, egress, allowlist…) là owner-only', () => {
    const loosening = KEYS.filter((k) => SETTING_LOOSENING_KEY_RE.test(k));
    expect(loosening.length).toBeGreaterThanOrEqual(15);
    for (const key of loosening) {
      const writers = SETTINGS[key as keyof typeof SETTINGS].writers as readonly string[];
      expect(writers, `${key} nới hàng rào nhưng admin ghi được`).not.toContain('admin');
      expect(writers, key).toContain('owner');
    }
  });

  it('các khoá reviewer nêu: audit.retention_days, purge.grace_days (và log.retention_days) chỉ owner / system', () => {
    for (const key of ['audit.retention_days', 'purge.grace_days', 'log.retention_days'] as const) {
      expect(SETTINGS[key].writers, key).toEqual(['owner', 'system']);
      expect(settingWritableBy(key, 'admin'), key).toBe(false);
      expect(settingWritableBy(key, 'owner'), key).toBe(true);
    }
  });

  it('admin chỉ ghi được khoá thuần giao diện (golden); mọi khoá khác owner-only', () => {
    const adminWritable = KEYS.filter((k) =>
      (SETTINGS[k as keyof typeof SETTINGS].writers as readonly string[]).includes('admin'),
    );
    expect(adminWritable.sort()).toEqual(['avatar.idle_after_minutes', 'avatar.transient_seconds', 'ui.avatar_motion']);
    for (const k of adminWritable)
      expect(SETTING_LOOSENING_KEY_RE.test(k), `${k} khớp nhóm nới nhưng admin ghi được`).toBe(false);
    for (const k of KEYS) {
      if (adminWritable.includes(k)) continue;
      expect(SETTINGS[k as keyof typeof SETTINGS].writers, k).toEqual(['owner', 'system']);
    }
  });

  it('luật mặc định: khoá không khai writers ⇒ owner + system (fail-closed)', () => {
    const d = defineSetting({ key: 'x.new_key', schema: z.boolean(), default: false, preseeded: false });
    expect(d.writers).toEqual(['owner', 'system']);
    expect(d.writers).toEqual(DEFAULT_SETTING_WRITERS);
    const explicit = defineSetting({
      key: 'x.cosmetic',
      schema: z.boolean(),
      default: false,
      preseeded: false,
      writers: ['owner', 'admin', 'system'],
    });
    expect(explicit.writers).toContain('admin');
  });

  it('bộ quét chạy được: các tên khoá nới giả định đều khớp luật (nên không thể lọt khi thêm khoá mới)', () => {
    for (const k of [
      'defaults.daily_token_quota',
      'proactive.defaults',
      'telegram.default_allowlist',
      'egress.allow_domains',
      'audit.retention_days',
      'purge.grace_days',
      'log.retention_days',
      'chat.attachment_max_bytes',
      'economy.initial_grant_minor',
      'backup.schedule',
    ]) {
      expect(SETTING_LOOSENING_KEY_RE.test(k), k).toBe(true);
    }
    for (const k of ['ui.avatar_motion', 'avatar.transient_seconds', 'avatar.idle_after_minutes']) {
      expect(SETTING_LOOSENING_KEY_RE.test(k), k).toBe(false);
    }
  });

  it('OPS-03: quyền thật theo khoá — owner cho khoá nới, A cho khoá giao diện, O cho khoá lạ', () => {
    const ops03 = routeById('OPS-03');
    expect(ops03).toBeDefined();
    if (!ops03) return;
    for (const key of KEYS) {
      expect(isSettingKey(key)).toBe(true);
      const want = settingWritableBy(key as keyof typeof SETTINGS, 'admin') ? 'A' : 'O';
      expect(requiredAccess(ops03, { params: { settingKey: key } }), key).toBe(want);
    }
    expect(requiredAccess(ops03, { params: { settingKey: 'audit.retention_days' } })).toBe('O');
    expect(requiredAccess(ops03, { params: { settingKey: 'purge.grace_days' } })).toBe('O');
    expect(requiredAccess(ops03, { params: { settingKey: 'ui.avatar_motion' } })).toBe('A');
    expect(requiredAccess(ops03, { params: { settingKey: 'khong.co' } })).toBe('O');
  });
});
