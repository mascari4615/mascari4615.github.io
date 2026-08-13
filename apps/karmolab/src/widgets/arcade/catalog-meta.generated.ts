/** **구운 파일이다 — 손으로 고치지 마라.** 정본 = `catalog.ts`, 굽는 놈 = `scripts/gen-arcade-catalog.mjs`.
 *
 * 로비가 목록을 그리는 데 필요한 것만 담았다(그림·갈래·자리 수·실시간 여부).
 * 규칙과 화면은 여기 없다 — 누를 때 `arcade/games/<chunk>.js` 로 받는다.
 */
import type { Kind } from './meta';

export interface GameCard {
  id: string;
  icon: string;
  kind: Kind;
  seats: [min: number, max: number];
  realtime: boolean;
  /** 이 게임 조각 파일 이름 — `arcade/games/<chunk>.js` */
  chunk: string;
}

export const CARDS: GameCard[] = [
  { id: 'reflex', icon: '⚡', kind: 'quick', seats: [2, 8], realtime: true, chunk: 'reflex' },
  { id: 'speed', icon: '⚡', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'speed' },
  { id: 'airhockey', icon: '🏒', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'airhockey' },
  { id: 'pong', icon: '🏓', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'pong' },
  { id: 'whack', icon: '🐹', kind: 'quick', seats: [1, 4], realtime: true, chunk: 'whack' },
  { id: 'tug', icon: '🪢', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'tug' },
  { id: 'rps', icon: '✌️', kind: 'quick', seats: [2, 2], realtime: true, chunk: 'rps' },
  { id: 'tuho', icon: '🏹', kind: 'sport', seats: [1, 6], realtime: true, chunk: 'tuho' },
  { id: 'yut', icon: '🏯', kind: 'board', seats: [2, 4], realtime: false, chunk: 'yut' },
  { id: 'fleet', icon: '🚢', kind: 'board', seats: [2, 4], realtime: false, chunk: 'fleet' },
  { id: 'auction', icon: '🔨', kind: 'card', seats: [2, 6], realtime: true, chunk: 'auction' },
  { id: 'jegi', icon: '🥋', kind: 'quick', seats: [1, 6], realtime: true, chunk: 'jegi' },
  { id: 'nunchi', icon: '👀', kind: 'quick', seats: [2, 6], realtime: true, chunk: 'nunchi' },
  { id: 'wordchain', icon: '🗣️', kind: 'quick', seats: [2, 4], realtime: true, chunk: 'wordchain' },
  { id: 'lineup', icon: '👥', kind: 'quick', seats: [2, 6], realtime: true, chunk: 'lineup' },
  { id: 'twenty', icon: '❓', kind: 'quick', seats: [2, 4], realtime: false, chunk: 'twenty' },
  { id: 'snake', icon: '🐍', kind: 'quick', seats: [1, 4], realtime: true, chunk: 'snake' },
  { id: 'shellgame', icon: '🥄', kind: 'quick', seats: [1, 4], realtime: true, chunk: 'shell' },
  { id: 'gomoku', icon: '⚫', kind: 'board', seats: [2, 2], realtime: false, chunk: 'gomoku' },
  { id: 'four', icon: '🔴', kind: 'board', seats: [2, 2], realtime: false, chunk: 'four' },
  { id: 'reversi', icon: '⚪', kind: 'board', seats: [2, 2], realtime: false, chunk: 'reversi' },
  { id: 'dots', icon: '⬜', kind: 'board', seats: [2, 4], realtime: false, chunk: 'dots' },
  { id: 'ultimate', icon: '⊞', kind: 'board', seats: [2, 2], realtime: false, chunk: 'ultimate' },
  { id: 'checkers', icon: '🔶', kind: 'board', seats: [2, 2], realtime: false, chunk: 'checkers' },
  { id: 'nim', icon: '⚪', kind: 'board', seats: [2, 2], realtime: false, chunk: 'nim' },
  { id: 'minishogi', icon: '将', kind: 'board', seats: [2, 2], realtime: false, chunk: 'minishogi' },
  { id: 'mancala', icon: '🪵', kind: 'board', seats: [2, 2], realtime: false, chunk: 'mancala' },
  { id: 'foxhounds', icon: '🦊', kind: 'board', seats: [2, 2], realtime: false, chunk: 'foxhounds' },
  { id: 'capturego', icon: '⚫', kind: 'board', seats: [2, 2], realtime: false, chunk: 'capturego' },
  { id: 'blackjack', icon: '♠️', kind: 'card', seats: [1, 4], realtime: false, chunk: 'blackjack' },
  { id: 'president', icon: '👑', kind: 'card', seats: [3, 4], realtime: false, chunk: 'president' },
  { id: 'dominoes', icon: '🀄', kind: 'card', seats: [2, 4], realtime: false, chunk: 'dominoes' },
  { id: 'yacht', icon: '🎲', kind: 'card', seats: [2, 4], realtime: false, chunk: 'yacht' },
  { id: 'highlow', icon: '🔺', kind: 'card', seats: [1, 4], realtime: false, chunk: 'highlow' },
  { id: 'lanterns', icon: '🏮', kind: 'card', seats: [2, 3], realtime: false, chunk: 'lanterns' },
  { id: 'liars', icon: '🎲', kind: 'card', seats: [2, 4], realtime: true, chunk: 'liars' },
  { id: 'hanafuda', icon: '🌸', kind: 'card', seats: [2, 4], realtime: false, chunk: 'hanafuda' },
  { id: 'derby', icon: '🐎', kind: 'card', seats: [1, 4], realtime: true, chunk: 'derby' },
  { id: 'curling', icon: '🥌', kind: 'sport', seats: [2, 4], realtime: true, chunk: 'curling' },
  { id: 'bowling', icon: '🎳', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'bowling' },
  { id: 'pool', icon: '🎱', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'pool' },
  { id: 'darts', icon: '🎯', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'darts' },
  { id: 'fishing', icon: '🎣', kind: 'sport', seats: [1, 4], realtime: true, chunk: 'fishing' },
  { id: 'tanks', icon: '💥', kind: 'sport', seats: [2, 2], realtime: true, chunk: 'tanks' },
  { id: 'memory', icon: '🃏', kind: 'puzzle', seats: [2, 4], realtime: true, chunk: 'memory' },
  { id: 'hitblow', icon: '🔢', kind: 'puzzle', seats: [2, 4], realtime: false, chunk: 'hitblow' },
  { id: 'slide', icon: '🧩', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'slide' },
  { id: 'minesweeper', icon: '💣', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'minesweeper' },
  { id: 'onestroke', icon: '✏️', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'onestroke' },
  { id: 'simon', icon: '🎵', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'simon' },
  { id: 'sudoku', icon: '🔢', kind: 'puzzle', seats: [1, 4], realtime: true, chunk: 'sudoku' }
];

export const cardById = (id: string): GameCard | undefined => CARDS.find((c) => c.id === id);
