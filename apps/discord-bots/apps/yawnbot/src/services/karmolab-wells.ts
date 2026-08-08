/**
 * 표 우물 — 바깥에서 놀이 재료를 길어 오는 **자리 하나** (TASK-KL-153).
 *
 * 왜 이 파일이 따로 있나: 첫 우물(스팀)을 만들 때는 스팀 전용 코드였다. 두 번째 우물을
 * 붙이는 순간 「캐시·동시요청·바깥이 죽었을 때」를 우물 수만큼 베껴 쓰게 된다 — 그때부터
 * 우물마다 성질이 갈린다(하나는 캐시가 있고 하나는 없고). 그래서 **우물이 둘이 되는 자리**에서
 * 공통을 뽑았다: 여기는 「길어 오고 · 쥐고 있고 · 바깥이 죽으면 지난 걸 준다」만 안다.
 * 각 우물은 「어디서 무엇을 어떻게 표로 만드나」만 안다(`build`).
 *
 * 새 우물 = 이 파일에 `build` 하나 추가. 화면·라우트·캐시는 손 안 댄다.
 */
import { STEAM_SOURCES, toPack, type SteamPackField, type SteamPackItem, type SteamSourceId } from './karmolab-steam';

export type WellField = SteamPackField;
export type WellItem = SteamPackItem;

export interface WellPack {
  title: string;
  emoji: string;
  fields: WellField[];
  items: WellItem[];
  /** 언제 길어 온 것인가 (ISO). 화면이 「몇 시 기준」을 말할 수 있게. */
  fetchedAt: string;
  /** 바깥이 죽어서 지난 표를 주는 중인가. */
  stale: boolean;
  /** 어느 우물에서 왔나 — 순위판이 표마다 갈리는 근거가 된다(`well:<id>`). */
  well: string;
}

/** 우물이 바깥을 부르는 유일한 통로. 시험이 여기만 갈아 끼우면 바깥이 전부 흉내가 된다. */
export type WellFetcher = (url: string) => Promise<unknown>;

export interface WellSpec {
  id: string;
  title: string;
  emoji: string;
  desc: string;
  /** 이 우물이 열쇠를 요구하나 (없으면 목록에서 「아직 못 씀」으로 선다). */
  needsKey?: string;
  build: (fetch: WellFetcher) => Promise<{ fields: WellField[]; items: WellItem[] }>;
}

const FETCH_TIMEOUT_MS = 25_000;
const CACHE_MS = 6 * 3600e3;
/** 놀이가 되려면 항목이 넷은 넘어야 한다(브라우저 쪽 표 만들기와 같은 규칙). */
const MIN_ITEMS = 4;

/* ── 우물들 ────────────────────────────────────────────── */

/** 스팀 셋 — 첫 우물. 변환은 `karmolab-steam.ts` 가 그대로 맡는다. */
const steamWells: WellSpec[] = (Object.keys(STEAM_SOURCES) as SteamSourceId[]).map((source) => ({
  id: `steam-${source}`,
  title: STEAM_SOURCES[source].title,
  emoji: STEAM_SOURCES[source].emoji,
  desc: STEAM_SOURCES[source].desc,
  build: async (fetch) => {
    const raw = await fetch(`https://steamspy.com/api.php?request=${STEAM_SOURCES[source].request}`);
    const pack = toPack(source, raw);
    return { fields: pack.fields, items: pack.items };
  },
}));

interface JikanAnime {
  title?: string;
  title_english?: string | null;
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  score?: number | null;
  members?: number | null;
  episodes?: number | null;
  year?: number | null;
  favorites?: number | null;
  studios?: Array<{ name?: string }>;
}

/**
 * 애니 100 (Jikan = MyAnimeList).
 *
 * 한 판에 25개씩만 준다 — 네 번 부른다. **한 번에 몰아 부르면 막힌다**(초당 3회 제한):
 * 실측에서 `limit` 을 붙이면 504 로 돌아왔다. 그래서 그냥 페이지를 차례로 넘긴다.
 */
const animeWell: WellSpec = {
  id: 'anime-top',
  title: '평점 높은 애니 100',
  emoji: '🌸',
  desc: 'MyAnimeList 평점 상위 — 별점·본 사람 수·화수·제작사',
  build: async (fetch) => {
    const items: WellItem[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 4; page += 1) {
      const raw = (await fetch(`https://api.jikan.moe/v4/top/anime?page=${page}`)) as { data?: JikanAnime[] };
      for (const row of raw?.data ?? []) {
        const name = (row.title_english || row.title || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const item: WellItem = { name };
        const img = row.images?.jpg?.large_image_url || row.images?.jpg?.image_url;
        if (img) item.img = img;
        if (typeof row.score === 'number' && row.score > 0) item.score = row.score;
        if (typeof row.members === 'number' && row.members > 0) item.members = row.members;
        if (typeof row.episodes === 'number' && row.episodes > 0) item.eps = row.episodes;
        if (typeof row.favorites === 'number' && row.favorites > 0) item.fav = row.favorites;
        if (typeof row.year === 'number' && row.year > 1900) item.year = row.year;
        const studio = row.studios?.[0]?.name;
        if (studio) item.studio = studio;
        items.push(item);
      }
    }
    return {
      fields: [
        { key: 'score', label: '별점', kind: 'number', unit: '점' },
        { key: 'members', label: '본 사람', kind: 'number', unit: '명' },
        { key: 'fav', label: '최애로 꼽은 사람', kind: 'number', unit: '명' },
        { key: 'eps', label: '화수', kind: 'number', unit: '화' },
        { key: 'year', label: '나온 해', kind: 'number', unit: '년' },
        { key: 'studio', label: '제작사', kind: 'category' },
      ],
      items,
    };
  },
};

interface MealRow {
  strMeal?: string;
  strMealThumb?: string;
  strArea?: string | null;
  strCategory?: string | null;
  [k: string]: unknown;
}

/**
 * 요리 (TheMealDB).
 *
 * 첫 글자로만 찾을 수 있어서 몇 글자를 훑는다. 견줄 숫자는 **재료 가짓수**뿐이다 —
 * 그래서 이 표는 「높은 쪽 고르기」보다 월드컵·티어표 쪽 재료다(그림이 전부 있다).
 */
const mealWell: WellSpec = {
  id: 'meal',
  title: '세계 요리',
  emoji: '🍳',
  desc: '나라·분류·재료 가짓수 — 그림이 전부 있어 월드컵에 좋다',
  build: async (fetch) => {
    const items: WellItem[] = [];
    const seen = new Set<string>();
    for (const letter of ['a', 'b', 'c', 's']) {
      const raw = (await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`)) as {
        meals?: MealRow[] | null;
      };
      for (const row of raw?.meals ?? []) {
        const name = (row.strMeal || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const item: WellItem = { name };
        if (row.strMealThumb) item.img = row.strMealThumb;
        if (row.strArea) item.area = String(row.strArea);
        if (row.strCategory) item.cat = String(row.strCategory);
        // 재료 칸은 스무 개까지 있고 대개 뒤쪽이 비어 있다 — 실제로 적힌 것만 센다.
        const ing = Object.keys(row).filter((k) => /^strIngredient/.test(k) && String(row[k] ?? '').trim()).length;
        if (ing > 0) item.ing = ing;
        items.push(item);
      }
    }
    return {
      fields: [
        { key: 'ing', label: '재료 가짓수', kind: 'number', unit: '가지' },
        { key: 'area', label: '나라', kind: 'category' },
        { key: 'cat', label: '분류', kind: 'category' },
      ],
      items,
    };
  },
};

export const WELLS: WellSpec[] = [...steamWells, animeWell, mealWell];

export function wellById(id: unknown): WellSpec | null {
  if (typeof id !== 'string') return null;
  return WELLS.filter((w) => w.id === id)[0] ?? null;
}

/* ── 길어 오고 · 쥐고 있기 ─────────────────────────────── */

async function defaultFetcher(url: string): Promise<unknown> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: control.signal,
      headers: { 'User-Agent': 'karmolab/1.0 (+https://mascari4615.github.io)' },
    });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface CacheEntry {
  pack: WellPack;
  at: number;
}

/**
 * 우물마다 표 하나를 쥐고 있는다.
 *
 * 시계와 바깥을 갈아 끼울 수 있게 클래스로 둔다 — 전역 캐시를 쓰면 시험끼리 서로의 표를
 * 물려받아 「혼자 돌리면 초록, 같이 돌리면 빨강」이 된다.
 */
export class WellStore {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<WellPack>>();

  constructor(
    private readonly fetcher: WellFetcher = defaultFetcher,
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs: number = CACHE_MS,
  ) {}

  /** 이미 길어 둔 표. 없으면 null — 목록 화면이 굳이 지금 바깥에 나가지 않게. */
  peek(id: string): WellPack | null {
    return this.cache.get(id)?.pack ?? null;
  }

  async get(well: WellSpec): Promise<WellPack> {
    const hit = this.cache.get(well.id);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.pack;

    // 같은 순간에 열 명이 열어도 바깥으로는 한 번만 나간다.
    const running = this.inflight.get(well.id);
    if (running) return running;

    const task = this.refresh(well).finally(() => this.inflight.delete(well.id));
    this.inflight.set(well.id, task);
    return task;
  }

  private async refresh(well: WellSpec): Promise<WellPack> {
    try {
      const built = await well.build(this.fetcher);
      const pack: WellPack = {
        title: well.title,
        emoji: well.emoji,
        fields: built.fields,
        items: built.items,
        fetchedAt: new Date(this.now()).toISOString(),
        stale: false,
        well: well.id,
      };
      // 놀이가 안 되는 표를 캐시에 넣으면 여섯 시간 동안 못 논다.
      if (pack.items.length < MIN_ITEMS) throw new Error(`${well.id}: 항목 ${pack.items.length}개`);
      this.cache.set(well.id, { pack, at: this.now() });
      return pack;
    } catch (err) {
      const stale = this.cache.get(well.id);
      // 바깥이 죽었다 — 어제 숫자로 노는 건 아무 문제가 없다. 진짜로 아무것도 없을 때만 던진다.
      if (stale) return { ...stale.pack, stale: true };
      throw err;
    }
  }
}

/**
 * 오늘의 표 — 날짜(KST)로 **모두에게 같은** 우물 하나를 고른다.
 *
 * 왜 무작위가 아닌가: 사람마다 다른 표가 뜨면 「오늘 이거 해 봤어?」가 성립하지 않는다.
 * 순위판도 같은 표를 봐야 겨룰 수 있다. 그래서 날짜만 넣으면 누구나 같은 답이 나온다.
 */
export function wellOfTheDay(day: string, wells: WellSpec[] = WELLS): WellSpec {
  let hash = 0;
  for (let i = 0; i < day.length; i += 1) hash = (Math.imul(31, hash) + day.charCodeAt(i)) | 0;
  return wells[Math.abs(hash) % wells.length];
}

/** 오늘(KST) `YYYY-MM-DD`. 서버·화면이 같은 모양을 써야 하루가 안 어긋난다. */
export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}
