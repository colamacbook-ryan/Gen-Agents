// TRAITS: hành vi gắn theo BỘ PHẬN (khung chung), không gắn theo tên nhân vật.
// if = { tham-số-ngoại-hình: [giá trị] } (giá trị '*' = "có đặt"); over = { trạng thái: { T, frac, m, drop, em, ph, peak } }.
// Nhân vật nào có bộ phận đó thì tự có hành vi đó. Thứ tự ưu tiên khi tranh slot: TRAITS (theo thứ tự khai báo) > mặc định của trạng thái.
// Nhân vật KHÔNG có `over` riêng (STD-09 §4): muốn hành vi mới thì thêm token + một mục TRAITS ở đây.

import type { Params } from './params.ts';
import type { AvatarState } from './state-keys.ts';
import { F, type Face, type Phase } from './states.ts';
import type { TokenName } from './tokens.ts';

export interface Over {
  T?: number;
  frac?: number;
  m?: TokenName[];
  drop?: TokenName[];
  /** emote thêm vào mọi pha */
  em?: string;
  ph?: Phase[];
  peak?: Face;
}

export interface Trait {
  id: string;
  note: string;
  if: Partial<Record<keyof Params, string[]>>;
  over: Partial<Record<AvatarState, Over>>;
}

export const TRAITS: Trait[] = [
  {
    id: 'beard-long',
    note: 'râu dài ba chòm ⇒ vuốt râu, râu lấp lánh',
    if: { beard: ['long'] },
    over: {
      normal: {
        T: 7.6,
        frac: 0.62,
        m: ['chestPuff', 'beardStroke'],
        ph: [
          [0, F()],
          [0.4, F({ eyes: 'happy', em: 'sparkB' })],
          [0.86, F()],
        ],
        peak: F({ eyes: 'happy' }),
      },
      wait: { m: ['beardStrokeLoop'] },
      reward: { m: ['beardSway'] },
      penalty: { m: ['beardSway'] },
      rank1: { m: ['beardStrokeLoop'], drop: ['coverMouthL'] },
      think: { m: ['beardStrokeLoop'] },
      rest: { m: ['beardStrokeLoop'] },
    },
  },
  {
    id: 'beard-long2',
    note: 'râu dài (kiểu hai chòm) ⇒ râu đung đưa, vuốt cằm',
    if: { beard: ['long2'] },
    over: {
      reward: { m: ['beardSway'] },
      penalty: { m: ['beardSway'] },
      error: { m: ['beardSway'] },
    },
  },
  {
    id: 'beard-tiger',
    note: 'râu hổ ⇒ râu rung mạnh khi tức',
    if: { beard: ['tiger'] },
    over: { error: { m: ['beardSway'] }, commit: { m: ['beardSway'] } },
  },
  {
    id: 'prop-fan',
    note: 'quạt lông vũ ⇒ che nửa mặt cười, phe phẩy, đánh rơi khi bị phạt',
    if: { prop: ['fan'] },
    over: {
      normal: {
        T: 7,
        frac: 0.76,
        m: ['coverFaceR'],
        ph: [
          [0, F()],
          [0.62, F({ eyes: 'happy', em: 'sweat' })],
          [0.72, F({ eyes: 'happy', em: 'sweat bulb' })],
          [0.9, F()],
        ],
        peak: F({ eyes: 'happy' }),
      },
      wait: { m: ['propFlutter'] },
      reward: { m: ['propFlutter'] },
      error: { m: ['propFlutter'] },
      unsure: { m: ['propFlutter'] },
      penalty: { m: ['dropA'] },
      rank1: { m: ['coverFaceR'], drop: ['coverMouthL'] },
    },
  },
  {
    id: 'prop-chopsticks',
    note: 'đũa ⇒ nghe sấm rơi đũa (TQDN-021), lau nước mắt',
    if: { prop: ['chopsticks'] },
    over: {
      normal: {
        T: 7,
        frac: 0.42,
        m: ['thunder', 'dropB'],
        ph: [
          [0, F()],
          [0.38, F({ eyes: 'bulge', mouth: 'gape', brow: 'up', em: 'thunder flash excl' })],
          [0.46, F({ eyes: 'bulge', mouth: 'o', brow: 'up', em: 'thunder sweat' })],
          [0.52, F({ eyes: 'closed', mouth: 'o', em: 'sweat' })],
          [0.7, F({ eyes: 'closed', mouth: 'o', em: 'sweat' })],
          [0.74, F({ eyes: 'happy', em: 'sweat sparkS' })],
          [0.9, F()],
        ],
        peak: F({ eyes: 'bulge', mouth: 'gape', brow: 'up' }),
      },
      wait: { m: ['wipeEyes'] },
      reward: { m: ['dropB'] },
    },
  },
  {
    id: 'ears-long',
    note: 'tai to dài ⇒ mít ướt, lau nước mắt bằng tay áo khi nghỉ dưỡng thương',
    if: { ears: ['long'] },
    over: { rest: { m: ['wipeEyes'] } },
  },
  {
    id: 'cap-knot',
    note: 'khăn buộc nơ to ⇒ hét làm rung mũ',
    if: { cap: ['knot'] },
    over: {
      normal: {
        T: 6,
        frac: 0.58,
        m: ['shoutRecoil', 'hatShake'],
        ph: [
          [0, F()],
          [0.34, F({ eyes: 'bulge', mouth: 'o', brow: 'up' })],
          [0.44, F({ eyes: 'bulge', mouth: 'o', brow: 'up', em: 'vein' })],
          [0.47, F({ eyes: 'xx', mouth: 'shout', brow: 'angry', em: 'shout vein' })],
          [0.72, F({ eyes: 'closed', mouth: 'o', em: 'sweat' })],
          [0.86, F()],
        ],
        peak: F({ eyes: 'xx', mouth: 'shout', brow: 'angry' }),
      },
      reward: { m: ['hatShakeLoop'] },
      error: { m: ['hatShakeLoop'] },
      commit: { m: ['hatShakeLoop'] },
    },
  },
  {
    id: 'front-baby',
    note: 'bế em bé ⇒ em bé nhún theo, "cả người là gan"',
    if: { front: ['baby'] },
    over: {
      normal: {
        T: 6.8,
        frac: 0.6,
        m: ['babyBounce', 'chestPuff'],
        ph: [
          [0, F()],
          [0.4, F({ eyes: 'sideL' })],
          [0.52, F({ eyes: 'happy', mouth: 'laugh', em: 'gall' })],
          [0.66, F({ eyes: 'happy', mouth: 'laugh', em: 'gall sparkB' })],
          [0.86, F()],
        ],
        peak: F({ eyes: 'happy', mouth: 'laugh' }),
      },
      wait: { m: ['babyBounce'] },
      reward: { m: ['babyBounce'] },
      penalty: { m: ['babyBounce'] },
      sleep: { m: ['babyBounce'] },
      commit: { m: ['babyBounce'] },
      rank1: { m: ['coverMouthF'], drop: ['coverMouthL'] },
    },
  },
  {
    id: 'ribbon',
    note: 'tay áo nước ⇒ múa xoay, tay áo bay trong mọi trạng thái',
    if: { ribbon: ['*'] },
    over: {
      normal: {
        T: 7,
        frac: 0.5,
        m: ['twirl', 'ribbonWave'],
        ph: [
          [0, F()],
          [0.28, F({ eyes: 'sideL' })],
          [0.35, F({ eyes: 'sideR' })],
          [0.42, F({ eyes: 'happy', em: 'petals' })],
          [0.66, F({ eyes: 'sideL', em: 'petals sparkS' })],
          [0.86, F()],
        ],
        peak: F({ eyes: 'happy' }),
      },
      wait: { m: ['ribbonWave'] },
      reward: { m: ['ribbonWave'], em: 'petals' },
      penalty: { m: ['ribbonWave'] },
      rank1: { m: ['ribbonWave'] },
      commit: { m: ['ribbonWave'] },
      discover: { m: ['ribbonWave'] },
    },
  },
  {
    id: 'stance-wide',
    note: 'dáng vuông chân rộng ⇒ quát chỉ tay, cằm hếch',
    if: { stance: ['wide'] },
    over: {
      normal: {
        T: 6,
        frac: 0.5,
        m: ['pointScold', 'chinUp'],
        ph: [
          [0, F()],
          [0.26, F({ brow: 'angry', mouth: 'shout', em: 'shout' })],
          [0.62, F({ brow: 'angry', mouth: 'shout', em: 'shout' })],
          [0.78, F({ eyes: 'happy', mouth: 'grin' })],
          [0.92, F()],
        ],
        peak: F({ brow: 'angry', mouth: 'shout' }),
      },
    },
  },
  {
    id: 'prop-swordT',
    note: 'kiếm có tua ⇒ múa kiếm khi mừng / giận (tua tự đung đưa trễ pha)',
    if: { prop: ['swordT'] },
    over: { reward: { m: ['propSwing'] }, error: { m: ['propSwing'] }, commit: { m: ['propSwing'] } },
  },
  {
    id: 'cap-helm',
    note: 'mũ trụ to ⇒ trượt lệch phải đỡ, bay lên rơi lại, sụp che mặt',
    if: { cap: ['helm'] },
    over: {
      normal: {
        T: 6.5,
        frac: 0.5,
        m: ['helmSlip'],
        ph: [
          [0, F()],
          [0.34, F({ eyes: 'bulge', mouth: 'o', brow: 'up', em: 'excl' })],
          [0.5, F({ eyes: 'sideR', mouth: 'wavy', brow: 'sad', em: 'sweat' })],
          [0.66, F({ eyes: 'happy', em: 'sweat sparkS' })],
          [0.86, F()],
        ],
        peak: F({ eyes: 'sideR', mouth: 'wavy', brow: 'sad' }),
      },
      penalty: { m: ['capToss'] },
      error: { m: ['helmDrop'] },
      reward: { m: ['capBounce'] },
    },
  },
  {
    id: 'front-bag',
    note: 'túi thuốc xanh ⇒ bắt mạch, ngũ cầm hí (hạc, hổ)',
    if: { front: ['bag'] },
    over: {
      normal: {
        T: 7,
        frac: 0.5,
        m: ['takePulse'],
        ph: [
          [0, F()],
          [0.28, F({ eyes: 'sideL', mouth: 'o', brow: 'up', em: 'patient pulse' })],
          [0.74, F({ eyes: 'happy', em: 'patient pulse' })],
          [0.88, F()],
        ],
        peak: F({ eyes: 'sideL', mouth: 'o', brow: 'up' }),
      },
      reward: { em: 'crane' },
      rank1: { em: 'crane' },
      sleep: { em: 'tiger' },
    },
  },
  {
    id: 'mask-white',
    note: 'mặt nạ bạch kiểm ⇒ liếc nghi ngờ, che miệng cười khà khà',
    if: { mask: ['white'] },
    over: {
      normal: {
        T: 6.4,
        frac: 0.58,
        m: ['coverMouthL', 'capeSwish', 'bodyChuckle'],
        ph: [
          [0, F()],
          [0.28, F({ eyes: 'sideL' })],
          [0.37, F({ eyes: 'sideR' })],
          [0.46, F({ eyes: 'sideL' })],
          [0.5, F({ eyes: 'happy', mouth: 'grin', em: 'sparkS kha' })],
          [0.8, F({ em: 'sparkS' })],
          [0.92, F()],
        ],
        peak: F({ eyes: 'sideR' }),
      },
      rank1: { m: ['capeSwish'] },
      error: { m: ['capeSwish'] },
    },
  },
  {
    id: 'prop-sword',
    note: 'kiếm ⇒ ngủ giả, ai tới gần thì giật mình quơ kiếm (không máu)',
    if: { prop: ['sword'] },
    over: {
      sleep: {
        T: 6.4,
        frac: 0.56,
        m: ['startle'],
        ph: [
          [0, F({ eyes: 'closed', mouth: 'o', em: 'zzz snot' })],
          [0.38, F({ eyes: 'peek', em: 'zzz ques2' })],
          [0.5, F({ eyes: 'bulge', mouth: 'gape', brow: 'up', em: 'excl' })],
          [0.56, F({ eyes: 'xx', mouth: 'clench', brow: 'angry', em: 'excl' })],
          [0.74, F({ eyes: 'peek', em: 'ques2' })],
          [0.86, F({ eyes: 'closed', mouth: 'o', em: 'zzz snot' })],
        ],
      },
    },
  },
];

/** các TRAITS mà nhân vật có (theo tham số bộ phận) */
export const traitsOf = (P: Params): Trait[] =>
  TRAITS.filter((t) =>
    (Object.keys(t.if) as (keyof Params)[]).every((k) => {
      const want = t.if[k] ?? [];
      const v = P[k];
      return want.includes('*') ? !!v : typeof v === 'string' && want.includes(v);
    }),
  );
