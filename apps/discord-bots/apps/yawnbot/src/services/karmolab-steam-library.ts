/**
 * 내 스팀 서재 → 표 (TASK-KL-153 C).
 *
 * 왜 따로인가: 우물(`karmolab-wells`)은 **모두에게 같은 표**다 — 그래서 캐시도 순위판도
 * 하나로 묶인다. 서재는 반대다. 사람마다 다르고, 그 사람 것이다. 같은 자리에 끼워 넣으면
 * 한 사람의 서재가 캐시에 눌러앉아 남에게 나간다. 그래서 자리를 나눴다.
 *
 * 열쇠가 필요하다(`STEAM_API_KEY`). 없으면 **이 기능만** 꺼진다 — 우물 다섯은 그대로 돈다.
 * 열쇠는 하나면 된다(우리 것). 사람마다 받는 게 아니라, 공개 프로필을 읽는 열쇠다.
 *
 * 못 읽는 경우가 흔하다: 프로필이 비공개면 스팀은 **빈 목록을 성공으로** 돌려준다.
 * 그걸 「게임이 없다」로 말하면 사람은 자기 계정이 이상한 줄 안다 — 구분해서 말한다.
 */
import type { WellField, WellItem, WellFetcher } from './karmolab-wells';

export interface LibraryPack {
  title: string;
  emoji: string;
  fields: WellField[];
  items: WellItem[];
  fetchedAt: string;
  /** 이 서재의 주인 (steamid64) — 화면이 「누구의 서재인가」를 말할 수 있게. */
  steamId: string;
}

export class LibraryError extends Error {
  constructor(public readonly code: 'no_key' | 'not_found' | 'private' | 'too_few') {
    super(code);
  }
}

interface OwnedGame {
  appid?: number;
  name?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
}

/** `76561198…`(그대로) · `/id/mascari`(별명) · 전체 주소 — 사람이 붙여넣는 모든 모양을 받는다. */
export function parseSteamInput(raw: string): { kind: 'id64' | 'vanity'; value: string } | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d{17}$/.test(text)) return { kind: 'id64', value: text };
  const url = /steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i.exec(text);
  if (url) return url[1].toLowerCase() === 'profiles' ? { kind: 'id64', value: url[2] } : { kind: 'vanity', value: url[2] };
  // 남은 것은 별명 그대로 적은 경우. 주소에 실을 수 없는 글자는 거른다.
  if (/^[A-Za-z0-9_-]{2,64}$/.test(text)) return { kind: 'vanity', value: text };
  return null;
}

/** 분 → 시간(소수 한 자리). 사람은 「1200분」이 아니라 「20시간」으로 읽는다. */
export function hours(minutes: number | undefined): number | null {
  if (typeof minutes !== 'number' || !isFinite(minutes) || minutes <= 0) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

export function libraryFields(): WellField[] {
  return [
    { key: 'played', label: '플레이 시간', kind: 'number', unit: '시간' },
    { key: 'recent', label: '최근 2주', kind: 'number', unit: '시간' },
  ];
}

export function toLibraryItems(games: OwnedGame[]): WellItem[] {
  const seen = new Set<string>();
  const items: WellItem[] = [];
  for (const game of games) {
    const name = (game?.name || '').trim();
    const appid = Number(game?.appid);
    if (!name || seen.has(name) || !Number.isFinite(appid) || appid <= 0) continue;
    seen.add(name);
    const item: WellItem = { name, img: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg` };
    const played = hours(game.playtime_forever);
    if (played !== null) item.played = played;
    const recent = hours(game.playtime_2weeks);
    if (recent !== null) item.recent = recent;
    items.push(item);
  }
  return items;
}

const MIN_ITEMS = 4;

export class SteamLibrary {
  constructor(
    private readonly key: string | undefined = process.env.STEAM_API_KEY,
    private readonly fetcher: WellFetcher = defaultFetcher,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get enabled(): boolean {
    return Boolean(this.key);
  }

  async pack(input: string): Promise<LibraryPack> {
    if (!this.key) throw new LibraryError('no_key');
    const parsed = parseSteamInput(input);
    if (!parsed) throw new LibraryError('not_found');

    const steamId = parsed.kind === 'id64' ? parsed.value : await this.resolveVanity(parsed.value);
    const owned = (await this.fetcher(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${this.key}` +
        `&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1`,
    )) as { response?: { games?: OwnedGame[] } };

    const items = toLibraryItems(owned?.response?.games ?? []);
    /* 비공개 프로필은 **빈 성공**으로 온다. 「게임이 없다」로 말하면 사람은 자기 계정을 의심한다 —
     * 실제로 게임이 넷도 안 되는 계정보다 비공개 쪽이 훨씬 흔하므로 그렇게 안내한다. */
    if (items.length === 0) throw new LibraryError('private');
    if (items.length < MIN_ITEMS) throw new LibraryError('too_few');

    return {
      title: '내 스팀 서재',
      emoji: '🎒',
      fields: libraryFields(),
      items,
      fetchedAt: new Date(this.now()).toISOString(),
      steamId,
    };
  }

  private async resolveVanity(vanity: string): Promise<string> {
    const res = (await this.fetcher(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${this.key}&vanityurl=${encodeURIComponent(vanity)}`,
    )) as { response?: { success?: number; steamid?: string } };
    const id = res?.response?.success === 1 ? res.response.steamid : null;
    if (!id) throw new LibraryError('not_found');
    return id;
  }
}

async function defaultFetcher(url: string): Promise<unknown> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) throw new Error(`steam ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
