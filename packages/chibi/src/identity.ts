// Cổng nhận diện KHAI BÁO: hồ sơ nhận diện của mỗi nhân vật (identity.must / identity.extra) là dữ liệu (Check), và đây là
// BỘ ĐÁNH GIÁ CHUNG duy nhất — không có hàm riêng cho từng nhân vật. Chạy được trên chuỗi SVG (Node, không cần DOM)
// hoặc trên DOM thật (trình duyệt) qua cùng giao diện SvgView; hai đường phải cho cùng kết quả (test kiểm).
import { rgb } from './color.ts';
import { EMOTES } from './emotes.ts';
import type { Params } from './params.ts';
import { getChar } from './registry.ts';
import { resolve } from './resolve.ts';
import type { Check, ColorClass } from './schema.ts';

// ---------------------------------------------------------------- nhóm màu (đánh giá trên #RRGGBB)
const hue = (h: string): { r: number; g: number; b: number } => {
  const [r, g, b] = rgb(h);
  return { r, g, b };
};
const COLOR_TESTS: Record<ColorClass, (h: string) => boolean> = {
  red: (h) => {
    const c = hue(h);
    return c.r > 170 && c.g < 110 && c.b < 110;
  },
  white: (h) => {
    const c = hue(h);
    return Math.min(c.r, c.g, c.b) > 225;
  },
  dark: (h) => {
    const c = hue(h);
    return c.r + c.g + c.b < 190;
  },
  green: (h) => {
    const c = hue(h);
    return c.g > c.r + 30 && c.g > c.b + 20;
  },
  gold: (h) => {
    const c = hue(h);
    return c.r > 170 && c.g > 120 && c.b < 90;
  },
  earthYellow: (h) => {
    const c = hue(h);
    return c.r > 160 && c.g > 120 && c.b < 110 && c.r > c.b + 60;
  },
  silver: (h) => {
    const c = hue(h);
    return Math.min(c.r, c.g, c.b) > 190 && Math.abs(c.r - c.b) < 40;
  },
  teal: (h) => {
    const c = hue(h);
    return c.r < 100 && c.g > 110 && c.b > 110;
  },
  pink: (h) => {
    const c = hue(h);
    return c.r > 220 && c.g < 200 && c.b > 150;
  },
  paleBlue: (h) => {
    const c = hue(h);
    return c.b > 190 && c.b > c.r + 20;
  },
  gray: (h) => {
    const c = hue(h);
    return Math.abs(c.r - c.g) < 22 && Math.abs(c.g - c.b) < 26 && c.r > 100 && c.r < 200;
  },
  cobalt: (h) => {
    const c = hue(h);
    return c.b > 160 && c.r < 90 && c.g < 130;
  },
  paleGold: (h) => {
    const c = hue(h);
    return c.r > 200 && c.g > 170 && c.b < 160;
  },
  gHigh: (h) => hue(h).g > 190,
};
const HEX6 = /^#[0-9A-Fa-f]{6}$/;
/** màu có thuộc nhóm không; giá trị không phải #RRGGBB ⇒ false (không bao giờ đoán) */
export const colorIs = (hex: string | null | undefined, cls: ColorClass): boolean =>
  typeof hex === 'string' && HEX6.test(hex) && COLOR_TESTS[cls](hex);

// ---------------------------------------------------------------- hai cách nhìn vào SVG
/** một phần tử đã dựng: đọc thuộc tính data-<tên> */
export interface PartView {
  attr(name: string): string | null;
}
/** tìm phần tử đầu tiên theo data-part (thứ tự tài liệu) */
export interface SvgView {
  part(name: string): PartView | null;
}

/** trên DOM thật */
export function viewOfElement(root: ParentNode): SvgView {
  return {
    part(name) {
      const el = root.querySelector(`[data-part="${CSS.escape(name)}"]`);
      return el ? { attr: (k) => el.getAttribute(`data-${k}`) } : null;
    },
  };
}

/** trên chuỗi SVG do svg() sinh (Node, không cần DOM). Chỉ đọc thẻ có data-part; thuộc tính không chứa ký tự < > nên regex tuyến tính. */
export function viewOfString(markup: string): SvgView {
  const parts = new Map<string, Map<string, string>>();
  const tag = /<[A-Za-z][^<>]*?\sdata-part="([^"<>]{1,60})"[^<>]*>/g;
  for (const m of markup.matchAll(tag)) {
    const name = m[1] as string;
    if (parts.has(name)) continue; // phần tử đầu tiên thắng, như querySelector
    const attrs = new Map<string, string>();
    for (const a of m[0].matchAll(/\sdata-([a-z][a-z0-9-]*)="([^"]*)"/g)) attrs.set(a[1] as string, a[2] as string);
    parts.set(name, attrs);
  }
  return {
    part(name) {
      const a = parts.get(name);
      return a ? { attr: (k) => a.get(k) ?? null } : null;
    },
  };
}

// ---------------------------------------------------------------- bộ đánh giá
export interface CheckContext {
  id: string;
  P: Params;
  view: SvgView;
}

/** Đánh giá một Check. Thiếu phần tử / thiếu thuộc tính ⇒ false (kể cả với màu); `not` đảo kết quả cuối. */
export function evaluate(check: Check, ctx: CheckContext): boolean {
  if ('all' in check) return check.all.every((c) => evaluate(c, ctx));
  if ('any' in check) return check.any.some((c) => evaluate(c, ctx));
  if ('not' in check) return !evaluate(check.not, ctx);
  if ('part' in check) {
    const el = ctx.view.part(check.part);
    if (!el) return false;
    return Object.entries(check.attr ?? {}).every(([k, v]) => el.attr(k) === v);
  }
  if ('fill' in check) return colorIs(ctx.view.part(check.fill)?.attr('fill'), check.is);
  if ('trim' in check) return colorIs(ctx.view.part(check.trim)?.attr('trim'), check.is);
  if ('band' in check) return colorIs(ctx.view.part(check.band)?.attr('band'), check.is);
  if ('param' in check) return (ctx.P as unknown as Record<string, unknown>)[check.param] === check.is;
  if ('phase' in check) {
    const { state, variant, where } = check.phase;
    return resolve(ctx.id, state, variant).ph.some(
      ([, q]) =>
        (where.eyes === undefined || q.eyes === where.eyes) &&
        (where.mouth === undefined || q.mouth === where.mouth) &&
        (where.brow === undefined || q.brow === where.brow) &&
        (where.emote === undefined || q.em.split(' ').includes(where.emote)),
    );
  }
  if ('token' in check) {
    const { state, variant, has } = check.token;
    return resolve(ctx.id, state, variant).m.includes(has);
  }
  // noEmote: thư viện emote của engine không có tên chứa từ khoá cấm (không máu, không cảnh chết chóc — STD-09 §2)
  const forbid = check.noEmote.map((w) => w.toLowerCase());
  return EMOTES.every((e) => !forbid.some((w) => e.toLowerCase().includes(w)));
}

export interface IdentityReport {
  id: string;
  /** phần tử phải đọc được ở 32 px (kiểm kích thước cần layout: làm ở trình duyệt) */
  p1: string;
  must: { p: number; label: string; ok: boolean }[];
  extra: { label: string; ok: boolean }[];
  /** mọi must và extra đều đạt */
  pass: boolean;
}

/** Chấm hồ sơ nhận diện của một nhân vật đã đăng ký trên một SVG đã dựng. */
export function evaluateIdentity(id: string, view: SvgView): IdentityReport {
  const C = getChar(id);
  const ctx: CheckContext = { id, P: C.P, view };
  const must = C.spec.identity.must.map((m) => ({ p: m.p, label: m.label, ok: evaluate(m.check, ctx) }));
  const extra = C.spec.identity.extra.map((m) => ({ label: m.label, ok: evaluate(m.check, ctx) }));
  return { id, p1: C.spec.identity.p1, must, extra, pass: must.every((x) => x.ok) && extra.every((x) => x.ok) };
}
