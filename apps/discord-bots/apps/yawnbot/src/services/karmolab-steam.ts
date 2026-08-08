/**
 * 스팀 우물 — 바깥 숫자를 표로 옮기는 규칙 (TASK-KL-153).
 *
 * 이 파일은 **변환만** 안다. 길어 오기·캐시·바깥이 죽었을 때는 `karmolab-wells.ts` 가
 * 우물 전부를 대신 진다 — 두 번째 우물이 생기는 순간 그 셋을 베껴 쓰게 되기 때문이다.
 *
 * 왜 서버를 거치나: 스팀 쪽 주소들은 **CORS 헤더를 안 준다**(실측 2026-08-08 —
 * steamspy.com/api.php · store.steampowered.com 둘 다 `access-control-allow-origin` 없음).
 * 브라우저에서 직접 부르면 무조건 막힌다.
 *
 * 열쇠(Steam Web API key)는 **안 쓴다**. 여기 쓰는 곳은 열쇠 없이 열린다.
 */

/** 브라우저 쪽 `pack-store.ts` 와 **같은 모양**. 새 모양을 만들면 그날부터 갈라진다. */
export interface SteamPackField {
  key: string;
  label: string;
  kind: 'number' | 'set' | 'category';
  unit?: string;
}
export interface SteamPackItem {
  name: string;
  img?: string;
  [k: string]: string | string[] | number | undefined;
}
export interface SteamPack {
  title: string;
  emoji: string;
  fields: SteamPackField[];
  items: SteamPackItem[];
  /** 이 표가 언제 길어 온 것인가 (ISO). 화면이 「몇 시 기준」을 말할 수 있게. */
  fetchedAt: string;
  /** 바깥이 죽어서 지난 표를 주는 중인가. */
  stale: boolean;
}

/** 길어 올 수 있는 우물. id 는 주소에 그대로 실린다. */
export const STEAM_SOURCES = {
  hot: {
    request: 'top100in2weeks',
    title: '지금 하는 스팀 게임 100',
    emoji: '🔥',
    desc: '최근 2주 동안 실제로 많이 플레이된 게임',
  },
  owned: {
    request: 'top100owned',
    title: '많이 가진 스팀 게임 100',
    emoji: '📚',
    desc: '가진 사람이 제일 많은 게임',
  },
  forever: {
    request: 'top100forever',
    title: '역대 많이 한 스팀 게임 100',
    emoji: '🏛',
    desc: '누적 플레이시간이 제일 긴 게임',
  },
} as const;

export type SteamSourceId = keyof typeof STEAM_SOURCES;

export function isSteamSourceId(v: unknown): v is SteamSourceId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(STEAM_SOURCES, v);
}

/** SteamSpy 가 돌려주는 한 줄. 우리가 쓰는 칸만 적는다. */
interface SteamSpyRow {
  appid?: number;
  name?: string;
  developer?: string;
  publisher?: string;
  positive?: number;
  negative?: number;
  owners?: string;
  price?: string | number;
  ccu?: number;
  average_forever?: number;
}

const CACHE_MS = 6 * 3600e3;
const FETCH_TIMEOUT_MS = 20_000;
/** 놀이가 되려면 항목이 넷은 넘어야 한다(브라우저 쪽 규칙과 같다). */
const MIN_ITEMS = 4;

/**
 * 「100,000,000 .. 200,000,000」 → 100000000.
 *
 * 왜 하한인가: SteamSpy 의 보유자 수는 **구간 추정**이다. 가운데 값을 쓰면 우리가 만들어 낸
 * 숫자가 되고, 상한을 쓰면 없는 사실을 말한다. 「최소 이만큼」은 근거가 있는 말이다.
 */
export function ownersFloor(raw: string | undefined): number | null {
  if (!raw) return null;
  const first = String(raw).split('..')[0].replace(/[^\d]/g, '');
  if (!first) return null;
  const n = Number(first);
  return Number.isFinite(n) ? n : null;
}

/** 좋아요 비율 %. 표가 너무 적으면(=흔들림) 아예 안 적는다 — 100% 짜리 표본 3개가 1등이 된다. */
export function likeRatio(positive: number | undefined, negative: number | undefined): number | null {
  const up = Number(positive ?? 0);
  const down = Number(negative ?? 0);
  const total = up + down;
  if (!Number.isFinite(total) || total < 100) return null;
  return Math.round((up / total) * 1000) / 10;
}

/** SteamSpy 의 가격은 **미국 센트를 담은 글자**다("1999"). 0 은 무료고, 없으면 모르는 것이다. */
export function priceUsd(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n) / 100;
}

/** 스팀이 게임마다 갖고 있는 가로 그림. 표에 그림이 있고 없고가 놀이 재미를 가른다. */
export function headerImage(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

/**
 * SteamSpy 응답 한 덩어리 → 표.
 *
 * 순수 함수다 — 바깥을 안 부른다. 그래야 「이상한 응답이 오면 어떻게 되나」를 시험이 직접 물어볼
 * 수 있다(빈 이름·구간 없는 보유자·표본 3개짜리 평점 전부 여기서 걸린다).
 */
export function toPack(source: SteamSourceId, raw: unknown, fetchedAt = new Date()): SteamPack {
  const spec = STEAM_SOURCES[source];
  const rows: SteamSpyRow[] =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.values(raw as Record<string, SteamSpyRow>) : [];

  const seen = new Set<string>();
  const items: SteamPackItem[] = [];
  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    const appid = Number(row?.appid);
    // 이름이 없거나 겹치면 놀이가 두 항목을 못 가른다 — 브라우저 쪽 표 만들기와 같은 규칙이다.
    if (!name || seen.has(name) || !Number.isFinite(appid) || appid <= 0) continue;
    seen.add(name);

    const item: SteamPackItem = { name, img: headerImage(appid) };
    const ccu = Number(row?.ccu);
    if (Number.isFinite(ccu) && ccu > 0) item.ccu = ccu;
    const ratio = likeRatio(row?.positive, row?.negative);
    if (ratio !== null) item.rating = ratio;
    const owners = ownersFloor(row?.owners);
    if (owners !== null) item.owners = owners;
    const price = priceUsd(row?.price);
    if (price !== null) item.price = price;
    const dev = typeof row?.developer === 'string' ? row.developer.trim() : '';
    if (dev) item.dev = dev;
    items.push(item);
  }

  return {
    title: spec.title,
    emoji: spec.emoji,
    fields: [
      { key: 'ccu', label: '지금 접속자', kind: 'number', unit: '명' },
      { key: 'rating', label: '좋아요 비율', kind: 'number', unit: '%' },
      { key: 'owners', label: '가진 사람(최소)', kind: 'number', unit: '명' },
      { key: 'price', label: '가격', kind: 'number', unit: '$' },
      { key: 'dev', label: '만든 곳', kind: 'category' },
    ],
    items,
    fetchedAt: fetchedAt.toISOString(),
    stale: false,
  };
}
