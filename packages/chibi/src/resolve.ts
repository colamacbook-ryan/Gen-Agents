// resolve(id, state, variant): gộp mặc định của trạng thái + TRAITS theo bộ phận của nhân vật → dữ liệu thuần JSON-hoá được
// (token chuyển động, các pha mặt, emote, keyframes tư thế). Không có closure, không phụ thuộc DOM.
import type { HeroName } from './emotes.ts';
import { getChar } from './registry.ts';
import type { AvatarState } from './state-keys.ts';
import { type Face, IDLE_VARIANTS, type IdleVariant, type Phase, ST } from './states.ts';
import { TOK, type TokenName } from './tokens.ts';
import { traitsOf } from './traits.ts';

export interface Resolved {
  id: string;
  state: AvatarState;
  variant: IdleVariant | null;
  T: number;
  m: TokenName[];
  ph: Phase[];
  peak: Face;
  frac: number;
  pose: string[];
  hero: HeroName | null;
  /** true nếu nhân vật có hành vi riêng nhờ TRAITS ở trạng thái này */
  own: boolean;
  emotes: string[];
  traits: string[];
}

const isVariant = (v: unknown): v is IdleVariant => (IDLE_VARIANTS as readonly unknown[]).includes(v);

export function resolve(id: string, state: AvatarState, variant?: string | null): Resolved {
  const C = getChar(id);
  const S = ST[state];
  let base = { T: S.T, frac: S.frac, hero: S.hero, m: S.m ?? [], ph: S.ph, peak: S.peak };
  let vOut: IdleVariant | null = null;
  if (S.variants) {
    const v: IdleVariant = isVariant(variant) ? variant : IDLE_VARIANTS[0];
    const V = S.variants[v];
    base = { T: V.T, frac: V.frac, hero: V.hero, m: V.m, ph: V.ph, peak: V.peak };
    vOut = v;
  }
  const traits = traitsOf(C.P);
  const srcs = traits.map((t) => t.over[state]).filter((o): o is NonNullable<typeof o> => !!o);
  const own: TokenName[] = [];
  const taken = new Set<string>();
  const drop: TokenName[] = [];
  let ph: Phase[] | null = null;
  let T: number | null = null;
  let frac: number | null = null;
  let peak: Face | null = null;
  const emx: string[] = [];
  for (const O of srcs) {
    for (const d of O.drop ?? []) drop.push(d);
    for (const t of O.m ?? []) {
      const sl = TOK[t].slots;
      if (!sl.some((x) => taken.has(x)) && !own.includes(t)) {
        own.push(t);
        for (const x of sl) taken.add(x);
      }
    }
    if (O.ph && !ph) {
      ph = O.ph;
      peak = O.peak ?? null;
    }
    if (O.T && !T) T = O.T;
    if (O.frac && !frac) frac = O.frac;
    if (O.peak && !peak) peak = O.peak;
    if (O.em) emx.push(O.em);
  }
  const def = base.m.filter((t) => !drop.includes(t) && !TOK[t].slots.some((x) => taken.has(x)));
  const m = def.concat(own);
  let phases = ph ?? base.ph;
  if (emx.length) {
    const add = emx.join(' ');
    phases = phases.map(([t, q]): Phase => [t, q.em ? Object.assign({}, q, { em: `${q.em} ${add}`.trim() }) : q]);
  }
  const kf = S.pose.concat(...m.map((t) => TOK[t].kf));
  const emotes: string[] = [];
  for (const [, q] of phases) {
    for (const t of q.em.split(' ').filter(Boolean)) if (!emotes.includes(t)) emotes.push(t);
  }
  return {
    id,
    state,
    variant: vOut,
    T: T || base.T,
    m,
    ph: phases,
    peak: peak || base.peak,
    frac: frac || base.frac,
    pose: kf,
    hero: base.hero,
    own: srcs.length > 0,
    emotes,
    traits: traits.filter((t) => t.over[state]).map((t) => t.id),
  };
}
