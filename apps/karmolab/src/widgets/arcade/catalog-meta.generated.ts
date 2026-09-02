/** **구운 파일이다. 손으로 고치지 마라.** 정본 = `catalog.ts`, 굽는 놈 = `scripts/gen-arcade-catalog.mjs`.
 *
 * 로비가 목록을 그리는 데 필요한 것만 담았다(그림, 갈래, 자리 수, 실시간 여부).
 * 규칙과 화면은 여기 없다. 누를 때 `arcade/games/<chunk>.js` 로 받는다.
 */
import type { Kind } from './meta';

export interface GameCard {
  id: string;
  icon: string;
  kind: Kind;
  seats: [min: number, max: number];
  realtime: boolean;
  /** 이 게임 조각 파일 이름. `arcade/games/<chunk>.js` */
  chunk: string;
  /** 입체 화면이 있나 (`games/<chunk>-view3d.ts` 실재). 있으면 2D/3D 를 사람이 고른다 */
  d3?: boolean;
  /** 로비에 안 보인다. 주소로 들어온 방과 다시보기는 그대로 돈다 */
  hidden?: boolean;
}

/** 감춘 것까지 전부. 이름표를 찾을 때만 쓴다 */
export const ALL_CARDS: GameCard[] = [
  { id: 'reflex', icon: '⚡', kind: 'quick', seats: [2, 8], realtime: true, chunk: 'reflex', hidden: true },
  { id: 'speed', icon: '⚡', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'speed', d3: true },
  { id: 'airhockey', icon: '🏒', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'airhockey', hidden: true },
  { id: 'pong', icon: '🏓', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'pong', hidden: true },
  { id: 'whack', icon: '🐹', kind: 'quick', seats: [1, 4], realtime: true, chunk: 'whack', hidden: true },
  { id: 'tug', icon: '🪢', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'tug', hidden: true },
  { id: 'rps', icon: '✌️', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'rps', hidden: true },
  { id: 'tuho', icon: '🏹', kind: 'sport', seats: [1, 6], realtime: true, chunk: 'tuho', hidden: true },
  { id: 'yut', icon: '🏯', kind: 'board', seats: [2, 4], realtime: false, chunk: 'yut', hidden: true },
  { id: 'fleet', icon: '🚢', kind: 'board', seats: [2, 4], realtime: false, chunk: 'fleet', hidden: true },
  { id: 'auction', icon: '🔨', kind: 'card', seats: [2, 6], realtime: true, chunk: 'auction', d3: true },
  { id: 'jegi', icon: '🥋', kind: 'quick', seats: [1, 6], realtime: true, chunk: 'jegi', hidden: true },
  { id: 'nunchi', icon: '👀', kind: 'quick', seats: [2, 6], realtime: true, chunk: 'nunchi', hidden: true },
  { id: 'wordchain', icon: '🗣️', kind: 'quick', seats: [2, 4], realtime: true, chunk: 'wordchain', hidden: true },
  { id: 'lineup', icon: '👥', kind: 'quick', seats: [2, 6], realtime: true, chunk: 'lineup', hidden: true },
  { id: 'twenty', icon: '❓', kind: 'quick', seats: [2, 4], realtime: false, chunk: 'twenty', hidden: true },
  { id: 'snake', icon: '🐍', kind: 'quick', seats: [1, 4], realtime: true, chunk: 'snake', hidden: true },
  { id: 'shellgame', icon: '🥄', kind: 'quick', seats: [1, 4], realtime: true, chunk: 'shell', hidden: true },
  { id: 'gomoku', icon: '⚫', kind: 'board', seats: [2, 2], realtime: false, chunk: 'gomoku', d3: true },
  { id: 'four', icon: '🔴', kind: 'board', seats: [2, 2], realtime: false, chunk: 'four', hidden: true },
  { id: 'reversi', icon: '⚪', kind: 'board', seats: [2, 2], realtime: false, chunk: 'reversi', d3: true, hidden: true },
  { id: 'dots', icon: '⬜', kind: 'board', seats: [2, 4], realtime: false, chunk: 'dots', hidden: true },
  { id: 'ultimate', icon: '⊞', kind: 'board', seats: [2, 2], realtime: false, chunk: 'ultimate', hidden: true },
  { id: 'checkers', icon: '🔶', kind: 'board', seats: [2, 2], realtime: false, chunk: 'checkers', d3: true, hidden: true },
  { id: 'nim', icon: '⚪', kind: 'board', seats: [2, 2], realtime: false, chunk: 'nim', hidden: true },
  { id: 'minishogi', icon: '将', kind: 'board', seats: [2, 2], realtime: false, chunk: 'minishogi', hidden: true },
  { id: 'mancala', icon: '🪵', kind: 'board', seats: [2, 2], realtime: false, chunk: 'mancala', hidden: true },
  { id: 'foxhounds', icon: '🦊', kind: 'board', seats: [2, 2], realtime: false, chunk: 'foxhounds', hidden: true },
  { id: 'capturego', icon: '⚫', kind: 'board', seats: [2, 2], realtime: false, chunk: 'capturego', d3: true, hidden: true },
  { id: 'blackjack', icon: '♠️', kind: 'card', seats: [1, 4], realtime: false, chunk: 'blackjack', d3: true },
  { id: 'solitaire', icon: '🃏', kind: 'card', seats: [1, 1], realtime: false, chunk: 'solitaire', d3: true },
  { id: 'president', icon: '👑', kind: 'card', seats: [3, 4], realtime: false, chunk: 'president', d3: true },
  { id: 'dominoes', icon: '🀄', kind: 'card', seats: [2, 4], realtime: false, chunk: 'dominoes', d3: true },
  { id: 'yacht', icon: '🎲', kind: 'card', seats: [2, 4], realtime: false, chunk: 'yacht', d3: true },
  { id: 'highlow', icon: '🔺', kind: 'card', seats: [1, 4], realtime: false, chunk: 'highlow', d3: true },
  { id: 'lanterns', icon: '🏮', kind: 'card', seats: [2, 3], realtime: false, chunk: 'lanterns', d3: true },
  { id: 'liars', icon: '🎲', kind: 'card', seats: [2, 4], realtime: true, chunk: 'liars', d3: true },
  { id: 'hanafuda', icon: '🌸', kind: 'card', seats: [2, 4], realtime: false, chunk: 'hanafuda' },
  { id: 'derby', icon: '🐎', kind: 'card', seats: [1, 4], realtime: true, chunk: 'derby', d3: true },
  { id: 'curling', icon: '🥌', kind: 'sport', seats: [2, 4], realtime: true, chunk: 'curling', hidden: true },
  { id: 'bowling', icon: '🎳', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'bowling', hidden: true },
  { id: 'pool', icon: '🎱', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'pool', hidden: true },
  { id: 'darts', icon: '🎯', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'darts', hidden: true },
  { id: 'fishing', icon: '🎣', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'fishing', hidden: true },
  { id: 'tanks', icon: '💥', kind: 'sport', seats: [2, 2], realtime: true, chunk: 'tanks', hidden: true },
  { id: 'memory', icon: '🃏', kind: 'puzzle', seats: [2, 4], realtime: true, chunk: 'memory', d3: true },
  { id: 'hitblow', icon: '🔢', kind: 'puzzle', seats: [2, 4], realtime: false, chunk: 'hitblow', hidden: true },
  { id: 'slide', icon: '🧩', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'slide', hidden: true },
  { id: 'minesweeper', icon: '💣', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'minesweeper', hidden: true },
  { id: 'onestroke', icon: '✏️', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'onestroke', hidden: true },
  { id: 'simon', icon: '🎵', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'simon', hidden: true },
  { id: 'sudoku', icon: '🔢', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'sudoku', hidden: true }
];

/** 로비, 찾기, 오늘의 세 판, 무작위가 보는 목록 */
/** 감춘 판도 검사와 개발에서는 열어 본다. 주소에 all=1 (감사 D8, 2026-09-03). 사람 로비는 그대로 */
export const CARDS: GameCard[] =
  typeof location !== 'undefined' && /[?&]all=1(?:&|$)/.test(location.search) ? ALL_CARDS : ALL_CARDS.filter((c) => !c.hidden);

export const cardById = (id: string): GameCard | undefined => ALL_CARDS.find((c) => c.id === id);
