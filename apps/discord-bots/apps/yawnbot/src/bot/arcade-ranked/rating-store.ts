import fs from 'node:fs';
import path from 'node:path';
import { PKG_ROOT } from '../../paths';
import type { StoredRating } from './types';

type Store = Record<string, Record<string, StoredRating>>;

const file = (): string =>
  process.env.ARCADE_RATING_FILE?.trim() || path.join(PKG_ROOT, 'data', 'arcade-ratings.json');

let store: Store | null = null;
let saveTimer: NodeJS.Timeout | null = null;

const load = (): Store => {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(file(), 'utf8')) as Store;
  } catch {
    store = {};
  }
  return store;
};

const save = (): void => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const at = file();
      fs.mkdirSync(path.dirname(at), { recursive: true });
      const temporary = at + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(store ?? {}), 'utf8');
      fs.renameSync(temporary, at);
    } catch {
      /* 다음 반영에서 재시도 */
    }
  }, 1000);
  saveTimer.unref?.();
};

export const readStoredRating = (game: string, id: string): StoredRating | null => {
  const value = load()[game]?.[id];
  return value ? { ...value } : null;
};

export const writeStoredRatings = (game: string, values: ReadonlyMap<string, StoredRating>): void => {
  const current = load();
  current[game] = current[game] ?? {};
  for (const [id, value] of values) current[game][id] = { ...value };
  save();
};

export const resetRatingStore = (): void => {
  store = {};
};

export const seedStoredRatingForTest = (game: string, id: string, value: StoredRating): void => {
  store = { [game]: { [id]: { ...value } } };
};
