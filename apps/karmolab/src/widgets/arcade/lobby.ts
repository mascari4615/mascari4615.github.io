import { cardById } from './catalog-meta.generated';
import { matches } from './pick6';
import type { SoloPlay } from './solo';

const NAME_KEY = 'karmolab.arcade.name';
const RECENT_KEY = 'karmolab.arcade.recent';
const RECENT_MAX = 5;

type LobbyStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): LobbyStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 로비 한 번의 이름, 최근 판과 혼자 놀이 명부를 함께 지킨다. */
export class LobbyRun {
  solo: SoloPlay[] = [];

  constructor(private readonly storage: LobbyStorage | null = browserStorage()) {}

  storedName(): string {
    try {
      return (this.storage?.getItem(NAME_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  rememberName(name: string): void {
    try {
      this.storage?.setItem(NAME_KEY, name.trim());
    } catch {
      /* 못 적어도 로비는 그대로 쓴다 */
    }
  }

  recent(): string[] {
    try {
      const raw = JSON.parse(this.storage?.getItem(RECENT_KEY) || '[]') as unknown;
      return Array.isArray(raw)
        ? raw.filter((id): id is string => typeof id === 'string' && !!cardById(id)).slice(0, RECENT_MAX)
        : [];
    } catch {
      return [];
    }
  }

  noteRecent(id: string): void {
    if (!cardById(id)) return;
    try {
      const next = [id, ...this.recent().filter((past) => past !== id)].slice(0, RECENT_MAX);
      this.storage?.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* 못 적어도 로비는 그대로 쓴다 */
    }
  }

  setSolo(rows: SoloPlay[]): void {
    this.solo = rows;
  }

  shownSolo(query: string): SoloPlay[] {
    return query.trim()
      ? this.solo.filter((game) => matches([game.id, game.title, game.lead], query))
      : this.solo;
  }
}
