/**
 * 카드 한 벌. 카드 놀이가 함께 쓰는 **부품** (change.arcade-redesign)
 *
 * 같은 카드가 판마다 일곱 가지 치수였다(64x88, 64x90, 52x72, 44x62, 38x52, 34x48, 34x46).
 * 종이는 한 종류다. 치수, 모서리, 뒷면은 `arcade.ts` 의 `--ac-card-*` 가 정하고,
 * 여기서는 **그 종이에 무엇을 적을지**만 만든다.
 *
 * 무늬와 끗수와 색은 이 파일이 안 정한다. 정본은 `deck.ts` 다 (2026-09-01).
 * 전에는 무늬가 세 곳에 흩어져 있었다. 여기 `SUITS`, `card-stage.ts` 의 `suitOf`,
 * `texture.ts` 의 `marks`. 그래서 평면 블랙잭에 무늬가 아예 없었음
 * **평면과 입체가 같은 `DeckSkin` 하나를 읽음**
 *
 * 무늬는 글자로 그린다. 우리 글꼴에 있고, 어느 크기에서도 또렷하고, 색만 바꾸면
 * 빨강과 검정이 갈림. 주사위 눈(⚀⚁)처럼 두부(□)로 빠지는 글자가 아님
 */
import { deckSkin, isRedSuit, rankLabel, suitMark, type DeckSkin } from './deck';

export { isRedSuit, rankLabel, suitMark, deckSkin, applyDeckSkin, suitOf, DECK_SKINS, setDeckSkin } from './deck';
export type { DeckSkin, SuitIndex } from './deck';

/** 무늬 넷. 차례는 브리지 관례(♣♦♥♠)가 아니라 **읽는 순서**다. 검정 둘, 빨강 둘 */
export const suits = (skin: DeckSkin = deckSkin()): readonly string[] => skin.marks;

/** 글자로 받은 무늬가 빨강인가. 옛 부름말이라 남겨 둠 */
export const isRed = (s: string): boolean => s === '♥' || s === '♦';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface CardOpts {
  /** 낼 수 있나. 뜨고, 손가락이 닿는다 */
  can?: boolean;
  /** 골라 둔 카드. 위로 떠서 금테 */
  pick?: boolean;
  /** 못 내는 카드. 흐리게 */
  dim?: boolean;
  /** 이 카드가 무엇인지 (읽는 기계, 검사가 본다) */
  label?: string;
  /** 단추에 붙일 표 (`data-c="3"` 처럼) */
  data?: Record<string, string | number>;
  /** 부채꼴에서 기울이기 */
  tilt?: number;
  /**
   * 이 패 고유의 색. 화투 열두 달, 등불 세 빛깔처럼 **색이 곧 규칙**인 판.
   * 글자와 안쪽 테가 함께 물든다(판마다 인라인 `color`, `border-color` 를 따로 적던 것).
   */
  hue?: string;
}

const attrs = (o: CardOpts): string => {
  const d = Object.entries(o.data ?? {})
    .map(([k, v]) => ' data-' + k + '="' + esc(String(v)) + '"')
    .join('');
  const cls =
    'ac-pc' + (o.can ? ' ac-can' : '') + (o.pick ? ' ac-pick' : '') + (o.dim ? ' ac-dim' : '');
  const css =
    (o.tilt ? 'transform:rotate(' + o.tilt + 'deg);' : '') +
    (o.hue ? '--hue:' + esc(o.hue) + ';' : '');
  const style = css ? ' style="' + css + '"' : '';
  const label = o.label ? ' aria-label="' + esc(o.label) + '"' : '';
  return ' class="' + cls + '"' + style + label + d + (o.can ? '' : ' disabled');
};

/**
 * 앞면. 모서리 두 곳에 끗수와 무늬, 가운데 큰 무늬.
 * `rank` 는 글자 그대로(`A`, `10`, `K`). 숫자로 받으면 판마다 A 와 1 이 갈림
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

/**
 * 끗수와 무늬를 **숫자로** 받는 앞면. `deck.ts` 의 셈법 그대로다 (끗수 1~13, 무늬 0~3).
 * 카드 번호 하나로 들고 있는 판(솔리테어, 블랙잭)이 씀
 * 스킨이 바뀌면 무늬 글자와 색이 같이 바뀜
 */
export function cardOf(rank: number, suit: number, o: CardOpts = {}): string {
  const skin = deckSkin();
  const mark = suitMark(suit, skin);
  const label = rankLabel(rank);
  const red = isRedSuit(suit) ? ' ac-red' : '';
  const corner = esc(label) + '<span class="ac-pcs">' + esc(mark) + '</span>';
  return (
    '<button' +
    attrs({ ...o, label: o.label ?? label + mark }).replace('ac-pc', 'ac-pc' + red) +
    '>' +
    '<span class="ac-pcc">' + corner + '</span>' +
    '<span class="ac-pcm">' + esc(mark) + '</span>' +
    '<span class="ac-pcc ac-br">' + corner + '</span>' +
    '</button>'
  );
}

/** 뒷면. 남의 패, 아직 안 뒤집은 것 */
export function cardBack(o: CardOpts = {}): string {
  return '<button' + attrs({ ...o, label: o.label ?? '뒤집힌 카드' }).replace('ac-pc', 'ac-pc ac-back') + '></button>';
}

/**
 * 글자 하나만 적힌 패. 짝 맞추기, 스피드처럼 무늬 없이 **기호 하나**로 노는 판.
 * 같은 종이를 쓰되 가운데 글자만 바뀐다.
 */
export function cardMark(mark: string, o: CardOpts & { note?: string } = {}): string {
  return (
    '<button' + attrs({ ...o, label: o.label ?? mark }) + '>' +
    '<span class="ac-pcm">' + esc(mark) + '</span>' +
    /* 몇 장 겹쳐 들었나 같은 곁말. 가운데 큰 글자와 **겹치지 않는 제 줄**에 둔다. */
    (o.note ? '<span class="ac-pcn">' + esc(o.note) + '</span>' : '') +
    '</button>'
  );
}
