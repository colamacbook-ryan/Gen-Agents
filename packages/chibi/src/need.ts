// Những lớp mặt / emote mà một trạng thái đã gộp thực sự dùng, và chọn biến thể idle.
import { HERO, type HeroName } from './emotes.ts';
import type { Need } from './face.ts';
import type { Resolved } from './resolve.ts';
import { IDLE_VARIANTS, type IdleVariant } from './states.ts';

const VARIANTS: readonly IdleVariant[] = IDLE_VARIANTS;

export const heroMarkup = (h: HeroName | null): string => (h ? HERO[h] : '');

/** những lớp mặt / emote mà trạng thái đã gộp thực sự dùng */
export function needOf(R: Resolved): Need {
  const eyes = new Set<string>(['n']);
  const mouths = new Set<string>(['n']);
  for (const [, q] of R.ph) {
    eyes.add(q.eyes);
    mouths.add(q.mouth);
  }
  eyes.add(R.peak.eyes);
  mouths.add(R.peak.mouth);
  return { em: R.emotes, eyes, mouths };
}

/** biến thể idle: giá trị hợp lệ thì dùng, không thì xoay theo đồng hồ (~9 giây một biến thể) */
export function pickVariant(v?: unknown): IdleVariant {
  const hit = VARIANTS.find((x) => x === v);
  return hit ?? (VARIANTS[Math.floor(Date.now() / 9000) % VARIANTS.length] as IdleVariant);
}
