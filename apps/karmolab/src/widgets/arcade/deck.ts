/**
 * 카드 한 벌의 정본. 무늬, 끗수, 색, 스킨 (2026-09-01)
 *
 * 왜 새로 있나. 같은 카드를 세 곳이 따로 정하고 있었음
 * 평면은 `card.ts` 의 `SUITS`, 입체 무대는 `card-stage.ts` 의 `suitOf`,
 * 질감은 `texture.ts` 의 `marks` 배열. 셋이 따로라 평면에 무늬가 없었음
 *
 * 여기서 정하는 것 넷.
 *  1. 무늬 넷의 차례와 색
 *  2. 끗수 1~13 을 사람이 읽는 글자로 (A, 2..10, J, Q, K)
 *  3. 카드 하나를 숫자 하나로 (0~51). 무늬가 규칙에 안 드는 판도 같은 셈법
 *  4. **스킨**. 무늬 글자, 색, 종이, 뒷면을 값으로 갈아끼움
 *
 * 규칙 파일은 이 파일을 안 읽어도 된다. 무늬가 판정에 드는 놀이(포커)와 안 드는
 * 놀이(블랙잭)가 같이 있는 탓. 안 드는 놀이는 `suitOf` 로 자리마다 정해진 무늬를 받음
 */

/** 무늬 넷. 차례는 검정 둘, 빨강 둘 */
export const SUIT_COUNT = 4;
export type SuitIndex = 0 | 1 | 2 | 3;

/** 빨강인가. 차례가 스페이드, 클로버, 하트, 다이아라 2 부터 빨강 */
export const isRedSuit = (i: number): boolean => (((i % 4) + 4) % 4) >= 2;

/** 끗수 1~13 을 읽는 글자로. A, 2..10, J, Q, K */
export const rankLabel = (rank: number): string =>
  rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);

/** 그림 카드인가 (J, Q, K) */
export const isCourt = (rank: number): boolean => rank >= 11;

/**
 * 카드 하나를 숫자 하나로. 0~51. 무늬가 `Math.floor(code / 13)`, 끗수가 `code % 13 + 1`.
 * 한 벌을 넘는 슈에서는 `code % 52` 로 내림
 */
export const cardCode = (rank: number, suit: number): number =>
  (((suit % 4) + 4) % 4) * 13 + (rank - 1);
export const codeRank = (code: number): number => (((code % 52) + 52) % 52) % 13 + 1;
export const codeSuit = (code: number): SuitIndex =>
  (Math.floor((((code % 52) + 52) % 52) / 13) as SuitIndex);

/**
 * 무늬가 규칙에 안 드는 판이 쓸 무늬. 값과 자리로 정해져 같은 카드는 늘 같은 무늬
 * 여기 있던 셈법이 `card-stage.ts` 안에만 있어 평면이 같은 무늬를 못 골랐음
 */
export const suitOf = (rank: number, seat: number, i: number): SuitIndex =>
  (((rank * 7 + seat * 3 + i * 5) % 4) as SuitIndex);

/**
 * 카드 한 벌의 겉모습. 무늬 글자와 색과 종이와 뒷면.
 * 평면(HTML)과 입체(canvas 질감)가 같은 값을 읽음
 */
export interface DeckSkin {
  id: string;
  /** 이름 열쇠. 화면에 고르는 자리를 두면 이걸로 옮겨 적음 */
  nameKey: string;
  /** 무늬 넷. 차례는 검정 둘, 빨강 둘 */
  marks: readonly [string, string, string, string];
  /** 검정 쪽 잉크 */
  ink: string;
  /** 빨강 쪽 잉크 */
  red: string;
  /** 종이. 가운데가 밝은 쪽부터 */
  paper: readonly [string, string, string];
  /** 인쇄 테두리 */
  edge: string;
  /** 뒷면 바탕 두 빛 */
  back: readonly [string, string];
  /** 뒷면 빗금 */
  backLine: string;
}

const CLASSIC: DeckSkin = {
  id: 'classic',
  nameKey: 'arcade.deck.classic',
  marks: ['♠', '♣', '♥', '♦'],
  ink: '#1b1714',
  red: '#b3242c',
  paper: ['#ffffff', '#fbf8f2', '#f0ebe0'],
  edge: 'rgba(30,26,20,.14)',
  back: ['#2f6f5e', '#245647'],
  backLine: 'rgba(255,255,255,.13)'
};

/** 먹. 빨강 없이 먹빛 하나로. 흑백 화면과 눈이 편한 쪽 */
const INK: DeckSkin = {
  id: 'ink',
  nameKey: 'arcade.deck.ink',
  marks: ['♠', '♣', '♥', '♦'],
  ink: '#20211f',
  red: '#5d6560',
  paper: ['#fdfcf7', '#f6f3ea', '#e9e4d6'],
  edge: 'rgba(20,22,20,.18)',
  back: ['#3b4340', '#282e2c'],
  backLine: 'rgba(255,255,255,.1)'
};

/** 밤. 어두운 종이에 밝은 잉크 */
const NIGHT: DeckSkin = {
  id: 'night',
  nameKey: 'arcade.deck.night',
  marks: ['♠', '♣', '♥', '♦'],
  ink: '#e8e2d2',
  red: '#ff8a7a',
  paper: ['#2a2723', '#211f1c', '#171512'],
  edge: 'rgba(240,235,220,.22)',
  back: ['#4a3a6b', '#2c2244'],
  backLine: 'rgba(255,255,255,.16)'
};

export const DECK_SKINS: readonly DeckSkin[] = [CLASSIC, INK, NIGHT];

const SKIN_KEY = 'karmolab.arcade.deck';
let picked: DeckSkin | null = null;

/** 지금 쓰는 한 벌. 안 고르면 classic */
export function deckSkin(): DeckSkin {
  if (picked) return picked;
  let id = '';
  try {
    id = localStorage.getItem(SKIN_KEY) || '';
  } catch {
    id = '';
  }
  picked = DECK_SKINS.find((s) => s.id === id) ?? CLASSIC;
  return picked;
}

/** 한 벌 갈아끼우기. 굽어 둔 질감은 부르는 쪽이 버림 */
export function setDeckSkin(id: string): DeckSkin {
  picked = DECK_SKINS.find((s) => s.id === id) ?? CLASSIC;
  try {
    localStorage.setItem(SKIN_KEY, picked.id);
  } catch {
    /* 저장 못 해도 이 창에서는 바뀜 */
  }
  return picked;
}

/** 무늬 글자 하나. 스킨을 따름 */
export const suitMark = (suit: number, skin: DeckSkin = deckSkin()): string =>
  skin.marks[(((suit % 4) + 4) % 4)];

/** 그 무늬의 잉크 */
export const suitInk = (suit: number, skin: DeckSkin = deckSkin()): string =>
  (isRedSuit(suit) ? skin.red : skin.ink);

/**
 * 슈. 몇 벌을 섞어 쌓음. 카지노는 6~8벌
 * 돌려주는 것은 뽑는 차례대로 늘어놓은 카드 번호(0~51 이 벌마다 되풀이)
 */
export function makeShoe(decks: number, rng: () => number): number[] {
  const out: number[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) out.push(c);
  /* 피셔예이츠. 뒤에서부터 하나씩 뽑아 자리를 바꿈 */
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * 이 한 벌을 평면 화면에 입히는 CSS 값. `arcade.ts` 가 `.ac-root` 에 박아 둔
 * `--ac-card-face`, `--ac-card-back`, `--ac-black`, `--ac-red` 를 덮어씀
 *
 * 입체는 `texture.ts` 가 같은 `DeckSkin` 을 읽어 캔버스에 굽는다. 값이 한 곳에서 나오므로
 * 평면과 입체가 안 갈라짐
 */
export function applyDeckSkin(el: HTMLElement, skin: DeckSkin = deckSkin()): void {
  const [p0, p1, p2] = skin.paper;
  el.style.setProperty(
    '--ac-card-face',
    'linear-gradient(168deg,' + p0 + ' 0%,' + p1 + ' 62%,' + p2 + ' 100%)'
  );
  el.style.setProperty(
    '--ac-card-back',
    'repeating-linear-gradient(45deg,' + skin.backLine + ' 0 4px,rgba(255,255,255,0) 4px 8px),' +
      'linear-gradient(150deg,' + skin.back[0] + ' 0%,' + skin.back[1] + ' 100%)'
  );
  el.style.setProperty('--ac-black', skin.ink);
  el.style.setProperty('--ac-red', skin.red);
  el.dataset.deck = skin.id;
}
