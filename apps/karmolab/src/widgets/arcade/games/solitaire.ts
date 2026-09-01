/**
 * 솔리테어(클론다이크). 혼자 하는 놀이 (change.arcade-cards)
 *
 * 오락실에서 처음으로 **상대가 아예 없는** 놀이. 자리 하나, 봇 없음. 이기고 지는 것이
 * 남과의 겨룸이 아니라 내가 다 치웠나로 갈림
 *
 * 레퍼런스(`solitr.com` 실측): 좌상 스톡과 웨이스트, 우상 파운데이션 넷, 아래 태블로 일곱 열
 *
 * 카드는 0~51 한 벌. `n % 13` 이 값(0 이 A, 12 가 K), `Math.floor(n / 13)` 이 무늬
 * (0 스페이드, 1 클로버, 2 하트, 3 다이아). 빨강은 무늬 2 와 3
 *
 * **감출 것을 상태에 안 숨김.** 뒤집힌 카드도 상태에는 그대로 있고 앞뒤만 갈림
 * 혼자 하는 놀이라 새는 곳이 없음(블랙잭과 달리 남의 창이 없음)
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 카드 한 벌 쉰두 장. 값은 0(A)~12(K), 무늬는 0~3 */
export const rankOf = (card: number): number => card % 13;
export const suitOf = (card: number): number => Math.floor(card / 13);
export const isRed = (card: number): boolean => suitOf(card) >= 2;

export interface Pile {
  cards: number[];
  /** 앞이 보이는 장수. 뒤에서부터 이만큼이 앞면 */
  up: number;
}

export interface SolitaireState {
  /** 아직 안 뽑은 더미. 뒤가 위 */
  stock: number[];
  /** 뽑아 놓은 자리. 뒤가 위이고 그 한 장만 쓸 수 있다 */
  waste: number[];
  /** 무늬별 쌓는 자리 넷. A 부터 K 까지 */
  foundation: number[][];
  /** 일곱 열 */
  tableau: Pile[];
  /** 스톡을 몇 바퀴 돌렸나. 무한히 돌리면 끝이 안 나므로 센다 */
  passes: number;
  /** 한 번에 몇 장 뽑나. 1 이 쉽고 3 이 정석 */
  draw: number;
  /** 둔 수. 점수와 기록에 쓴다 */
  moves: number;
}

export type SolitaireAction =
  /** 스톡에서 뽑기. 비었으면 웨이스트를 되돌린다 */
  | { kind: 'draw' }
  /** 웨이스트 맨 위를 어디로 */
  | { kind: 'waste'; to: 'foundation' | 'tableau'; at: number }
  /** 태블로 한 열의 `from` 번째부터 끝까지를 어디로 */
  | { kind: 'move'; col: number; from: number; to: 'foundation' | 'tableau'; at: number }
  /** 파운데이션 맨 위를 태블로로 (되돌리기) */
  | { kind: 'unfound'; pile: number; at: number };

/** 파운데이션에 올릴 수 있나. 빈 자리는 A 만, 그 위는 같은 무늬 한 칸 위 */
export function canFound(pile: number[], card: number): boolean {
  if (!pile.length) return rankOf(card) === 0;
  const top = pile[pile.length - 1];
  return suitOf(top) === suitOf(card) && rankOf(card) === rankOf(top) + 1;
}

/** 태블로에 놓을 수 있나. 빈 열은 K 만, 그 위는 다른 색 한 칸 아래 */
export function canStack(pile: Pile, card: number): boolean {
  if (!pile.cards.length) return rankOf(card) === 12;
  const top = pile.cards[pile.cards.length - 1];
  return isRed(top) !== isRed(card) && rankOf(card) === rankOf(top) - 1;
}

/** 그 열에서 `from` 번째부터가 통째로 옮길 수 있는 줄인가 (색이 엇갈리며 한 칸씩 내려가야) */
export function runOk(pile: Pile, from: number): boolean {
  const n = pile.cards.length;
  if (from < 0 || from >= n) return false;
  /* 뒤집힌 카드는 못 든다 */
  if (from < n - pile.up) return false;
  for (let i = from; i < n - 1; i += 1) {
    const a = pile.cards[i];
    const b = pile.cards[i + 1];
    if (isRed(a) === isRed(b) || rankOf(b) !== rankOf(a) - 1) return false;
  }
  return true;
}

/** 뒤집힌 카드가 맨 위로 올라오면 앞을 보인다 */
function flip(pile: Pile): Pile {
  if (pile.cards.length && pile.up === 0) return { cards: pile.cards, up: 1 };
  return pile;
}

const MAX_PASS = 3;

export const solitaire: GameDef<SolitaireState, SolitaireAction> = {
  id: 'solitaire',
  seats: [1, 1],
  rounds: 1,

  init(ctx) {
    /* 한 벌을 섞는다. 커널의 씨앗을 쓰므로 같은 방이면 같은 판이다 */
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(ctx.rng() * (i + 1));
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    /* 일곱 열에 1, 2, ... 7 장. 각 열 마지막 한 장만 앞면 */
    const tableau: Pile[] = [];
    let at = 0;
    for (let c = 0; c < 7; c += 1) {
      tableau.push({ cards: deck.slice(at, at + c + 1), up: 1 });
      at += c + 1;
    }
    return {
      stock: deck.slice(at),
      waste: [],
      foundation: [[], [], [], []],
      tableau,
      passes: 0,
      draw: ctx.opts.draw === 3 ? 3 : 1,
      moves: 0
    };
  },

  reduce(s, a, seat) {
    if (seat !== 0) return s;
    const kind = a?.kind;

    if (kind === 'draw') {
      if (s.stock.length) {
        const n = Math.min(s.draw, s.stock.length);
        return {
          ...s,
          stock: s.stock.slice(0, s.stock.length - n),
          waste: s.waste.concat(s.stock.slice(s.stock.length - n).reverse()),
          moves: s.moves + 1
        };
      }
      /* 더미가 비면 웨이스트를 뒤집어 되돌린다. 정해진 바퀴까지만 */
      if (!s.waste.length || s.passes >= MAX_PASS) return s;
      return { ...s, stock: s.waste.slice().reverse(), waste: [], passes: s.passes + 1, moves: s.moves + 1 };
    }

    if (kind === 'waste') {
      if (!s.waste.length) return s;
      const card = s.waste[s.waste.length - 1];
      if (a.to === 'foundation') {
        if (!canFound(s.foundation[a.at] ?? [], card)) return s;
        return {
          ...s,
          waste: s.waste.slice(0, -1),
          foundation: s.foundation.map((f, i) => (i === a.at ? f.concat(card) : f)),
          moves: s.moves + 1
        };
      }
      const pile = s.tableau[a.at];
      if (!pile || !canStack(pile, card)) return s;
      return {
        ...s,
        waste: s.waste.slice(0, -1),
        tableau: s.tableau.map((p, i) => (i === a.at ? { cards: p.cards.concat(card), up: p.up + 1 } : p)),
        moves: s.moves + 1
      };
    }

    if (kind === 'move') {
      const src = s.tableau[a.col];
      if (!src || !runOk(src, a.from)) return s;
      const run = src.cards.slice(a.from);
      if (a.to === 'foundation') {
        /* 파운데이션에는 한 장씩만 */
        if (run.length !== 1 || !canFound(s.foundation[a.at] ?? [], run[0])) return s;
        return {
          ...s,
          foundation: s.foundation.map((f, i) => (i === a.at ? f.concat(run[0]) : f)),
          tableau: s.tableau.map((p, i) =>
            i === a.col ? flip({ cards: p.cards.slice(0, a.from), up: Math.max(0, p.up - 1) }) : p
          ),
          moves: s.moves + 1
        };
      }
      if (a.at === a.col) return s;
      const dst = s.tableau[a.at];
      if (!dst || !canStack(dst, run[0])) return s;
      return {
        ...s,
        tableau: s.tableau.map((p, i) => {
          if (i === a.col) return flip({ cards: p.cards.slice(0, a.from), up: Math.max(0, p.up - run.length) });
          if (i === a.at) return { cards: p.cards.concat(run), up: p.up + run.length };
          return p;
        }),
        moves: s.moves + 1
      };
    }

    if (kind === 'unfound') {
      const f = s.foundation[a.pile];
      if (!f || !f.length) return s;
      const card = f[f.length - 1];
      const dst = s.tableau[a.at];
      if (!dst || !canStack(dst, card)) return s;
      return {
        ...s,
        foundation: s.foundation.map((x, i) => (i === a.pile ? x.slice(0, -1) : x)),
        tableau: s.tableau.map((p, i) => (i === a.at ? { cards: p.cards.concat(card), up: p.up + 1 } : p)),
        moves: s.moves + 1
      };
    }

    return s;
  },

  outcome(s, ctx): Outcome {
    const done = s.foundation.reduce((a, f) => a + f.length, 0);
    if (done === 52) {
      /* 점수는 적게 둘수록 높다. 쉰두 장을 옮기는 데 최소 쉰두 수 */
      const score = Math.max(1, 1000 - Math.max(0, s.moves - 52) * 3);
      return { over: true, scores: [score], note: { key: 'arcade.solitaire.win', params: { n: String(s.moves) } } };
    }
    /* 더 둘 수 있는 수가 하나라도 있으면 계속. 없으면 막힌 것 */
    if (anyMove(s)) return { over: false };
    return { over: true, scores: [done * 4], note: { key: 'arcade.solitaire.stuck', params: { n: String(done) } } };
  },

  bot(): BotMove<SolitaireAction> | null {
    /* 혼자 하는 놀이. 대신 둘 사람이 없다 */
    return null;
  },

  hint(s): SolitaireAction | null {
    return bestMove(s);
  }
};

/** 지금 둘 수 있는 수가 하나라도 있나 */
export function anyMove(s: SolitaireState): boolean {
  if (s.stock.length) return true;
  if (s.waste.length && s.passes < MAX_PASS) return true;
  return bestMove(s) !== null;
}

/**
 * 지금 둘 만한 수 하나. 힌트와 막힘 판정이 같이 씀
 * 고르는 차례: 파운데이션에 올리기, 뒤집힌 카드를 여는 이동, 웨이스트 내려놓기, 그 밖의 이동
 */
export function bestMove(s: SolitaireState): SolitaireAction | null {
  /* 1. 파운데이션. 태블로 맨 위와 웨이스트 맨 위 */
  for (let c = 0; c < s.tableau.length; c += 1) {
    const p = s.tableau[c];
    if (!p.cards.length || !p.up) continue;
    const card = p.cards[p.cards.length - 1];
    for (let f = 0; f < 4; f += 1) {
      if (canFound(s.foundation[f], card)) return { kind: 'move', col: c, from: p.cards.length - 1, to: 'foundation', at: f };
    }
  }
  if (s.waste.length) {
    const card = s.waste[s.waste.length - 1];
    for (let f = 0; f < 4; f += 1) if (canFound(s.foundation[f], card)) return { kind: 'waste', to: 'foundation', at: f };
  }
  /* 2. 뒤집힌 카드를 여는 이동. 줄을 통째로 옮겨 그 아래가 열리면 이득 */
  for (let c = 0; c < s.tableau.length; c += 1) {
    const p = s.tableau[c];
    const from = p.cards.length - p.up;
    if (!p.up || from <= 0) continue;
    if (!runOk(p, from)) continue;
    for (let d = 0; d < s.tableau.length; d += 1) {
      if (d === c) continue;
      if (canStack(s.tableau[d], p.cards[from])) return { kind: 'move', col: c, from, to: 'tableau', at: d };
    }
  }
  /* 3. 웨이스트를 태블로로 */
  if (s.waste.length) {
    const card = s.waste[s.waste.length - 1];
    for (let d = 0; d < s.tableau.length; d += 1) {
      if (canStack(s.tableau[d], card)) return { kind: 'waste', to: 'tableau', at: d };
    }
  }
  /* 4. 빈 열로 K 옮기기. 줄 맨 앞이 K 이고 그 열이 K 로 시작하지 않을 때만(제자리 도로 금지) */
  for (let c = 0; c < s.tableau.length; c += 1) {
    const p = s.tableau[c];
    const from = p.cards.length - p.up;
    if (!p.up || from === 0) continue;
    if (rankOf(p.cards[from]) !== 12 || !runOk(p, from)) continue;
    for (let d = 0; d < s.tableau.length; d += 1) {
      if (d !== c && !s.tableau[d].cards.length) return { kind: 'move', col: c, from, to: 'tableau', at: d };
    }
  }
  return null;
}

/** 파운데이션에 올라간 장수. 화면이 진도를 보여 준다 */
export const doneCount = (s: SolitaireState): number => s.foundation.reduce((a, f) => a + f.length, 0);
