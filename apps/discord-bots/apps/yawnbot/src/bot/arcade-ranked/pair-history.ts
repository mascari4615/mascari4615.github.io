import fs from 'node:fs';
import path from 'node:path';
import { PKG_ROOT } from '../../paths';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const FULL_GAMES = 5;
const HALF_GAMES = 10;

type Pairs = Record<string, number[]>;
const file = (): string =>
  process.env.ARCADE_PAIR_FILE?.trim() || path.join(PKG_ROOT, 'data', 'arcade-pairs.json');

let pairs: Pairs | null = null;

const load = (): Pairs => {
  if (pairs) return pairs;
  try {
    pairs = JSON.parse(fs.readFileSync(file(), 'utf8')) as Pairs;
  } catch {
    pairs = {};
  }
  return pairs;
};

const keyOf = (game: string, ids: readonly string[]): string =>
  game + '|' + [...ids].sort().join('|');

const recentGames = (game: string, ids: readonly string[]): number => {
  if (ids.length < 2) return 0;
  const cut = Date.now() - WINDOW_MS;
  return (load()[keyOf(game, ids)] ?? []).filter((time) => time >= cut).length;
};

export const pairFactor = (game: string, ids: readonly string[]): number => {
  const games = recentGames(game, ids);
  if (games < FULL_GAMES) return 1;
  if (games < HALF_GAMES) return 0.5;
  return 0.2;
};

export const notePair = (game: string, ids: readonly string[]): void => {
  if (ids.length < 2) return;
  const key = keyOf(game, ids);
  const cut = Date.now() - WINDOW_MS;
  const current = load();
  current[key] = [...(current[key] ?? []).filter((time) => time >= cut), Date.now()];
  try {
    const at = file();
    fs.mkdirSync(path.dirname(at), { recursive: true });
    const temporary = at + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(current), 'utf8');
    fs.renameSync(temporary, at);
  } catch {
    /* 다음 판에서 재시도 */
  }
};

export const resetPairHistory = (): void => {
  pairs = {};
};
