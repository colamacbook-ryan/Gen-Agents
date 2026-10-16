// Bảng trạng thái MẶC ĐỊNH của khung xương (mọi nhân vật dùng chung): nhịp T, đỉnh pose, huy hiệu, token chuyển động, các pha mặt.
// KHÔNG chứa nhãn / mô tả hiển thị: engine chỉ biết khoá; chữ lấy từ i18n (PS §4.7, xem i18n-keys.ts).

import type { HeroName } from './emotes.ts';
import type { AvatarState } from './state-keys.ts';
import type { TokenName } from './tokens.ts';

export const EYE_LAYERS = [
  'n',
  'bulge',
  'xx',
  'coin',
  'dog',
  'spiral',
  'closed',
  'happy',
  'sideL',
  'sideR',
  'tired',
  'sob',
  'peek',
  'smug',
  'fire',
  'spring',
] as const;
export const MOUTH_LAYERS = [
  'n',
  'gape',
  'shout',
  'wavy',
  'tongue',
  'laugh',
  'clench',
  'chatter',
  'o',
  'cry',
  'grin',
  'wail',
  'drool',
  'grovel',
  'hehe',
  'wry',
  'agape',
] as const;
export const BROW_LAYERS = ['n', 'up', 'sad', 'angry', 'knit'] as const;
export type EyeLayer = (typeof EYE_LAYERS)[number];
export type MouthLayer = (typeof MOUTH_LAYERS)[number];
export type BrowLayer = (typeof BROW_LAYERS)[number];

/** một khung biểu cảm: mắt, miệng, mày, lớp mặt (từ khoá cách nhau bởi dấu cách), emote (tên cách nhau bởi dấu cách) */
export interface Face {
  eyes: EyeLayer;
  mouth: MouthLayer;
  brow: BrowLayer;
  face: string;
  em: string;
}
export type Phase = [number, Face];

export const BASEF: Face = { eyes: 'n', mouth: 'n', brow: 'n', face: '', em: '' };
export const F = (o?: Partial<Face>): Face => Object.assign({}, BASEF, o);

export const IDLE_VARIANTS = ['nap', 'drunk', 'game'] as const;
export type IdleVariant = (typeof IDLE_VARIANTS)[number];

export interface VariantDef {
  T: number;
  frac: number;
  hero: HeroName;
  m: TokenName[];
  ph: Phase[];
  peak: Face;
}

export interface StateDef {
  T: number;
  frac: number;
  hero: HeroName | null;
  /** keyframes tư thế riêng của trạng thái (ngoài token) */
  pose: string[];
  m?: TokenName[];
  ph: Phase[];
  peak: Face;
  variants?: Record<IdleVariant, VariantDef>;
}

export const ST: Record<AvatarState, StateDef> = {
  normal: { T: 7, frac: 0.6, hero: null, pose: [], ph: [[0, F()]], peak: F() },
  run: {
    T: 0.8,
    frac: 0.2,
    hero: 'speed',
    pose: ['k-bd-run', 'k-ar-run'],
    ph: [[0, F({ eyes: 'fire', mouth: 'clench', brow: 'angry', em: 'fly speed blur vein' })]],
    peak: F({ eyes: 'fire', mouth: 'clench', brow: 'angry' }),
  },
  wait: {
    T: 3.2,
    frac: 0.3,
    hero: 'beg',
    pose: [],
    m: ['kneelBob', 'nodBeg', 'palmsPump'],
    ph: [
      [0, F({ eyes: 'dog', mouth: 'grovel', brow: 'sad', face: 'blush', em: 'plead' })],
      [0.5, F({ eyes: 'dog', mouth: 'grovel', brow: 'sad', face: 'blush', em: 'plead sweat' })],
    ],
    peak: F({ eyes: 'dog', mouth: 'grovel', brow: 'sad', face: 'blush' }),
  },
  reward: {
    T: 3.2,
    frac: 0.27,
    hero: 'coinp',
    pose: [],
    m: ['hopGreed', 'rubHands'],
    ph: [
      [0, F({ eyes: 'coin', mouth: 'drool', brow: 'up', face: 'blush', em: 'bag' })],
      [0.1, F({ eyes: 'coin', mouth: 'drool', brow: 'up', face: 'blush', em: 'bag gold sparkR' })],
      [0.45, F({ eyes: 'coin', mouth: 'drool', brow: 'up', face: 'blush', em: 'bag coinRain plus' })],
      [0.85, F({ eyes: 'coin', mouth: 'drool', brow: 'up', face: 'blush', em: 'bag gold' })],
    ],
    peak: F({ eyes: 'coin', mouth: 'drool', brow: 'up', face: 'blush' }),
  },
  penalty: {
    T: 4.2,
    frac: 0.3,
    hero: 'coinm',
    pose: [],
    m: ['quakeWail', 'headWail', 'poundGround'],
    ph: [
      [0, F({ eyes: 'bulge', mouth: 'gape', brow: 'up', em: 'excl' })],
      [0.07, F({ eyes: 'sob', mouth: 'wail', brow: 'sad', em: 'minus snotCry fly' })],
      [0.34, F({ eyes: 'sob', mouth: 'wail', brow: 'sad', em: 'snotCry fly pour' })],
    ],
    peak: F({ eyes: 'sob', mouth: 'wail', brow: 'sad' }),
  },
  rank1: {
    T: 4.4,
    frac: 0.55,
    hero: 'crown',
    pose: ['k-bd-rank1', 'k-hd-rank1', 'k-ar-rank1'],
    m: ['shoulderShake', 'glanceSmug', 'coverMouthL', 'armsSmug'],
    ph: [
      [0, F()],
      [0.1, F({ eyes: 'smug', mouth: 'hehe', face: 'blush', em: 'sparkS' })],
      [0.26, F({ eyes: 'smug', mouth: 'hehe', face: 'blush', em: 'hehe hash1 confetti' })],
      [0.9, F({ eyes: 'smug', mouth: 'hehe', face: 'blush', em: 'hehe hash1' })],
      [0.96, F()],
    ],
    peak: F({ eyes: 'smug', mouth: 'hehe', face: 'blush' }),
  },
  quota: {
    T: 3.6,
    frac: 0.5,
    hero: 'bowl',
    pose: [],
    m: ['crawlWorm', 'lookUpBeg', 'reachGrab'],
    ph: [
      [0, F({ eyes: 'dog', mouth: 'wavy', brow: 'sad', em: 'bowl' })],
      [0.3, F({ eyes: 'dog', mouth: 'wavy', brow: 'sad', em: 'bowl pour' })],
    ],
    peak: F({ eyes: 'dog', mouth: 'wavy', brow: 'sad' }),
  },
  failover: {
    T: 3.6,
    frac: 0.3,
    hero: 'cli',
    pose: [],
    m: ['circleRun', 'panicArms', 'headPanic', 'shoesRun'],
    ph: [
      [0, F({ eyes: 'bulge', mouth: 'shout', brow: 'up', em: 'excl fly' })],
      [0.1, F({ eyes: 'bulge', mouth: 'shout', brow: 'up', em: 'fly cliA' })],
      [0.45, F({ eyes: 'spiral', mouth: 'shout', brow: 'up', em: 'fly cliB stars' })],
      [0.8, F({ eyes: 'bulge', mouth: 'shout', brow: 'up', em: 'fly cliB' })],
    ],
    peak: F({ eyes: 'bulge', mouth: 'shout', brow: 'up' }),
  },
  error: {
    T: 3.2,
    frac: 0.5,
    hero: 'anger',
    pose: [],
    m: ['stomp', 'furyHead', 'fistsShake'],
    ph: [
      [0, F({ eyes: 'bulge', mouth: 'clench', brow: 'angry', face: 'red', em: 'vein' })],
      [0.14, F({ eyes: 'xx', mouth: 'shout', brow: 'angry', face: 'red puff tangle', em: 'vein smoke bristle shout' })],
      [
        0.7,
        F({ eyes: 'xx', mouth: 'shout', brow: 'angry', face: 'red puff tangle', em: 'vein smoke bristle steamEar' }),
      ],
    ],
    peak: F({ eyes: 'xx', mouth: 'shout', brow: 'angry', face: 'red puff tangle' }),
  },
  rest: {
    T: 5,
    frac: 0.12,
    hero: 'tear',
    pose: ['k-bd-rest', 'k-hd-rest', 'k-ar-rest'],
    ph: [[0, F({ eyes: 'sob', mouth: 'cry', brow: 'sad', em: 'scroll' })]],
    peak: F({ eyes: 'sob', mouth: 'cry', brow: 'sad' }),
  },
  sleep: {
    T: 5,
    frac: 0.3,
    hero: 'zzz',
    pose: ['k-bd-sleep', 'k-hd-sleep', 'k-ar-sleep'],
    ph: [[0, F({ eyes: 'closed', mouth: 'o', em: 'zzz snot' })]],
    peak: F({ eyes: 'closed', mouth: 'o' }),
  },
  commit: {
    T: 3.4,
    frac: 0.4,
    hero: 'fire',
    pose: [],
    m: ['resolveBody', 'resolveFist', 'resolveNod'],
    ph: [
      [0, F({ eyes: 'fire', mouth: 'clench', brow: 'angry', em: 'rays band' })],
      [0.16, F({ eyes: 'fire', mouth: 'shout', brow: 'angry', em: 'rays band resolve' })],
      [0.5, F({ eyes: 'fire', mouth: 'clench', brow: 'angry', em: 'rays band resolve sparkR' })],
      [0.8, F({ eyes: 'fire', mouth: 'shout', brow: 'angry', em: 'rays band resolve' })],
    ],
    peak: F({ eyes: 'fire', mouth: 'shout', brow: 'angry' }),
  },
  think: {
    T: 6,
    frac: 0.45,
    hero: 'think',
    pose: [],
    m: ['paceSlow', 'stepShoes', 'hunchThink', 'chinStroke', 'armBackL'],
    ph: [
      [0, F({ eyes: 'tired', brow: 'knit', em: 'glasses dots' })],
      [0.33, F({ eyes: 'sideL', mouth: 'o', brow: 'knit', em: 'glasses dots' })],
      [0.66, F({ eyes: 'tired', mouth: 'wavy', brow: 'knit', em: 'glasses dots' })],
    ],
    peak: F({ eyes: 'tired', mouth: 'o', brow: 'knit' }),
  },
  unsure: {
    T: 3.6,
    frac: 0.35,
    hero: 'ques',
    pose: [],
    m: ['shyShift', 'unsureHead', 'unsureArms'],
    ph: [
      [0, F({ eyes: 'sideL', mouth: 'wry', brow: 'sad', face: 'blush', em: 'qwob sweatL' })],
      [0.28, F({ eyes: 'sideR', mouth: 'wry', brow: 'sad', face: 'blush', em: 'qwob sweatL' })],
      [0.55, F({ eyes: 'sideL', mouth: 'wry', brow: 'sad', face: 'blush', em: 'qwob sweatL sparkS' })],
      [0.8, F({ eyes: 'sideR', mouth: 'wry', brow: 'sad', face: 'blush', em: 'qwob sweatL' })],
    ],
    peak: F({ eyes: 'sideL', mouth: 'wry', brow: 'sad', face: 'blush' }),
  },
  idle: {
    T: 6,
    frac: 0.4,
    hero: 'zzz',
    pose: [],
    m: [],
    ph: [[0, F()]],
    peak: F(),
    variants: {
      nap: {
        T: 7,
        frac: 0.38,
        hero: 'zzz',
        m: ['napSlump', 'napNod', 'limpArms'],
        ph: [
          [0, F({ eyes: 'closed', mouth: 'drool', brow: 'sad', em: 'zzz snot' })],
          [0.5, F({ eyes: 'peek', mouth: 'drool', em: 'zzz snot' })],
          [0.58, F({ eyes: 'bulge', mouth: 'o', brow: 'up', em: 'excl' })],
          [0.68, F({ eyes: 'closed', mouth: 'drool', brow: 'sad', em: 'zzz snot' })],
        ],
        peak: F({ eyes: 'closed', mouth: 'drool', brow: 'sad' }),
      },
      drunk: {
        T: 4.4,
        frac: 0.5,
        hero: 'gourd',
        m: ['stumble', 'wobbleHead', 'gourdArm'],
        ph: [
          [0, F({ eyes: 'spiral', mouth: 'grin', face: 'blush', em: 'gourd stars' })],
          [0.4, F({ eyes: 'spiral', mouth: 'laugh', face: 'blush', em: 'gourd stars hic' })],
          [0.72, F({ eyes: 'spiral', mouth: 'grin', face: 'blush', em: 'gourd stars' })],
        ],
        peak: F({ eyes: 'spiral', mouth: 'grin', face: 'blush' }),
      },
      game: {
        T: 4,
        frac: 0.4,
        hero: 'pad',
        m: ['gameHunch', 'gameHead', 'thumbMash'],
        ph: [
          [0, F({ eyes: 'tired', mouth: 'tongue', brow: 'knit', em: 'pad' })],
          [0.5, F({ eyes: 'tired', mouth: 'tongue', brow: 'knit', face: 'blush', em: 'pad' })],
        ],
        peak: F({ eyes: 'tired', mouth: 'tongue', brow: 'knit' }),
      },
    },
  },
  discover: {
    T: 3.8,
    frac: 0.4,
    hero: 'wow',
    pose: [],
    m: ['discoverBody', 'discoverHead', 'discoverArms', 'capFly'],
    ph: [
      [0, F()],
      [0.13, F({ eyes: 'bulge', mouth: 'o', brow: 'up', em: 'sweat' })],
      [0.19, F({ eyes: 'spring', mouth: 'agape', brow: 'up', em: 'rays bang3 bristle shout scope' })],
      [0.62, F({ eyes: 'spring', mouth: 'agape', brow: 'up', em: 'rays bang3 bristle scope' })],
      [0.69, F({ eyes: 'bulge', mouth: 'gape', brow: 'up', em: 'rays scope' })],
      [0.8, F({ eyes: 'closed', mouth: 'gape', brow: 'up', em: 'scope' })],
      [0.84, F({ eyes: 'bulge', mouth: 'gape', brow: 'up', em: 'scope' })],
      [0.93, F()],
    ],
    peak: F({ eyes: 'spring', mouth: 'agape', brow: 'up' }),
  },
};
