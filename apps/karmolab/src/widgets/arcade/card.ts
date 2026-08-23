/**
 * 카드 한 벌 — 카드 놀이가 함께 쓰는 **부품** (change.arcade-redesign)
 *
 * 같은 「카드」가 판마다 일곱 가지 치수였다(64×88·64×90·52×72·44×62·38×52·34×48·34×46).
 * 종이는 한 종류다 — 치수·모서리·뒷면은 `arcade.ts` 의 `--ac-card-*` 가 정하고,
 * 여기서는 **그 종이에 무엇을 적을지**만 만든다.
 *
 * 무늬(♠♥♦♣)는 글자로 그린다: 우리 글꼴에 있고, 어느 크기에서도 또렷하고, 색만 바꾸면
 * 빨강/검정이 갈린다. 주사위 눈(⚀⚁)처럼 두부(□)로 빠지는 글자가 아니다 — 그건 점으로 그린다.
 */

/** 무늬 넷. 순서는 브리지 관례(♣♦♥♠)가 아니라 **읽는 순서**다 — 검정 둘, 빨강 둘. */
export const SUITS = ['♠', '♣', '♥', '♦'] as const;
export type Suit = (typeof SUITS)[number];

export const isRed = (s: string): boolean => s === '♥' || s === '♦';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface CardOpts {
  /** 낼 수 있나 — 뜨고, 손가락이 닿는다 */
  can?: boolean;
  /** 골라 둔 카드 — 위로 떠서 금테 */
  pick?: boolean;
  /** 못 내는 카드 — 흐리게 */
  dim?: boolean;
  /** 이 카드가 무엇인지 (읽는 기계·검사가 본다) */
  label?: string;
  /** 단추에 붙일 표 (`data-c="3"` 처럼) */
  data?: Record<string, string | number>;
  /** 부채꼴에서 기울이기 */
  tilt?: number;
}

const attrs = (o: CardOpts): string => {
  const d = Object.entries(o.data ?? {})
    .map(([k, v]) => ' data-' + k + '="' + esc(String(v)) + '"')
    .join('');
  const cls =
    'ac-pc' + (o.can ? ' ac-can' : '') + (o.pick ? ' ac-pick' : '') + (o.dim ? ' ac-dim' : '');
  const style = o.tilt ? ' style="transform:rotate(' + o.tilt + 'deg)"' : '';
  const label = o.label ? ' aria-label="' + esc(o.label) + '"' : '';
  return ' class="' + cls + '"' + style + label + d + (o.can ? '' : ' disabled');
};

/**
 * 앞면 — 모서리 두 곳에 끗수·무늬, 가운데 큰 무늬.
 * `rank` 는 글자 그대로다(`A`·`10`·`K`) — 숫자로 받으면 판마다 A/1 을 다르게 적는다.
 */
export function cardFace(rank: string, suit: string, o: CardOpts = {}): string {
  const red = isRed(suit) ? ' ac-red' : '';
  const corner = esc(rank) + '<span class="ac-pcs">' + esc(suit) + '</span>';
  return (
    '<button' + attrs({ ...o, label: o.label ?? rank + suit }).replace('ac-pc', 'ac-pc' + red) + '>' +
    '<span class="ac-pcc">' + corner + '</span>' +
    '<span class="ac-pcm">' + esc(suit) + '</span>' +
    '<span class="ac-pcc ac-br">' + corner + '</span>' +
    '</button>'
  );
}

/** 뒷면 — 남의 패, 아직 안 뒤집은 것. */
export function cardBack(o: CardOpts = {}): string {
  return '<button' + attrs({ ...o, label: o.label ?? '뒤집힌 카드' }).replace('ac-pc', 'ac-pc ac-back') + '></button>';
}

/**
 * 글자 하나만 적힌 패 — 짝 맞추기·스피드처럼 무늬 없이 **기호 하나**로 노는 판.
 * 같은 종이를 쓰되 가운데 글자만 바뀐다.
 */
export function cardMark(mark: string, o: CardOpts & { note?: string } = {}): string {
  return (
    '<button' + attrs({ ...o, label: o.label ?? mark }) + '>' +
    '<span class="ac-pcm">' + esc(mark) + '</span>' +
    /* 「몇 장 겹쳐 들었나」 같은 곁말 — 가운데 큰 글자와 **겹치지 않는 제 줄**에 둔다. */
    (o.note ? '<span class="ac-pcn">' + esc(o.note) + '</span>' : '') +
    '</button>'
  );
}
