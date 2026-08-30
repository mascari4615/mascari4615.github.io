/**
 * 등급 점수. 방식을 갈아 끼운다 (change.arcade-online 2번)
 *
 * - 오목 같은 2인 승부는 ELO, 야추 같은 3~4인 순위전은 작혼식 순위점
 * - 놀이마다 기본 방식을 가름. 한 방식으로 박으면 야추가 못 탐 (야추 세션 지적)
 * - 서버가 셋 다 셈 (사용자 결정). 이긴 횟수는 자리표로 같이 셈
 *
 * 수치 근거:
 * - ELO K값은 FIDE 관례. 20판 미만 40, 2200 이상 24, 그 외 32
 * - 순위점은 `memo/projects/karmolab/reference/mahjong-soul.md` 실측 (금탁 작걸3: 1위 +120, 2위 0, 3위 -135)
 *   - 우리 방 둘은 그 절반 폭. 초심 방은 꼴찌 감점 없음 (작혼 초심 강등 없음과 같은 뜻)
 * - 시작 1500, 바닥 100 (음수 점수는 방 나누기를 망침)
 */
import fs from 'node:fs';
import path from 'node:path';
import { PKG_ROOT } from '../paths';

export type Method = 'elo' | 'place' | 'wins';
export type RoomName = 'beginner' | 'upper';

const START = 1500;
const FLOOR = 100;

/** 놀이마다 기본 방식. 없으면 자리 수로 고름 */
const BY_GAME: Record<string, Method> = {
  gomoku: 'elo',
  yacht: 'place'
};

export function methodFor(game: string, seats = 2): Method {
  return BY_GAME[game] ?? (seats > 2 ? 'place' : 'elo');
}

export interface Record_ {
  rating: number;
  games: number;
  wins: number;
}

const empty = (): Record_ => ({ rating: START, games: 0, wins: 0 });

/* ── 저장 ────────────────────────────────────────────────────────
 *
 * - 대기열과 달리 점수는 배포를 넘겨 살아야 함
 * - 파일 하나에 사람 전부. 몇 백 명까지 이 꼴로 충분
 * - 쓰기는 임시 파일에 적고 갈아 끼움. 중간에 죽어도 반쪽 파일이 안 남음 */
/* 자리는 부를 때 정함. 검사가 임시 파일로 돌릴 수 있어야 함 */
const file = (): string => process.env.ARCADE_RATING_FILE?.trim() || path.join(PKG_ROOT, 'data', 'arcade-ratings.json');

type Store = Record<string, Record<string, Record_>>;
let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(file(), 'utf8')) as Store;
  } catch {
    /* 첫 실행이거나 깨진 파일. 빈 장부로 시작 */
    store = {};
  }
  return store;
}

let saveTimer: NodeJS.Timeout | null = null;
function save(): void {
  if (saveTimer) return;
  /* 판 하나에 여러 번 바뀜. 1초 모아 한 번만 적음 */
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const f = file();
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store ?? {}), 'utf8');
      fs.renameSync(tmp, f);
    } catch {
      /* 못 적어도 판은 이미 끝났음. 다음 판에 다시 시도 */
    }
  }, 1000);
  saveTimer.unref?.();
}

/** 놀이마다 따로. 오목 점수로 야추 방을 정하면 안 됨 */
export function recordOf(game: string, id: string): Record_ {
  const s = load();
  return s[game]?.[id] ? { ...s[game][id] } : empty();
}

export function ratingOf(game: string, id: string): number {
  return recordOf(game, id).rating;
}

function put(game: string, id: string, rec: Record_): void {
  const s = load();
  s[game] = s[game] ?? {};
  s[game][id] = { ...rec, rating: Math.max(FLOOR, Math.round(rec.rating)) };
  save();
}

/** 검사용 뒷문. 파일은 안 건드림 */
export function resetRatings(): void {
  store = {};
}

/* ── 방 ──────────────────────────────────────────────────────── */
const UPPER_FROM = 1600;
export function roomOf(rating: number): RoomName {
  return rating >= UPPER_FROM ? 'upper' : 'beginner';
}

/* ── 셈법 ────────────────────────────────────────────────────── */

/** FIDE 관례. 판이 적으면 크게 움직이고, 높으면 덜 움직임 */
function kOf(rec: Record_): number {
  if (rec.games < 20) return 40;
  if (rec.rating >= 2200) return 24;
  return 32;
}

/** 순위점 표. 작혼 실측의 절반 폭, 초심 방은 꼴찌 감점 없음 */
const PLACE_POINTS: Record<RoomName, Record<number, number[]>> = {
  beginner: { 2: [30, 0], 3: [40, 10, 0], 4: [50, 20, 5, 0] },
  upper: { 2: [30, -30], 3: [45, 0, -45], 4: [60, 20, -20, -60] }
};

function placePoints(room: RoomName, seats: number, place: number): number {
  const table = PLACE_POINTS[room][seats] ?? PLACE_POINTS[room][4];
  return table[Math.min(place, table.length - 1)] ?? 0;
}

export interface Applied {
  id: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * 한 판 반영. `ranks` 는 잘한 순서 (첫째가 1위)
 * - 무승부는 같은 자리에 둘을 넣은 배열로 표현하지 않음. `draw` 로 따로 받음
 */
export function applyResult(game: string, ranks: string[], draw = false): Applied[] {
  const method = methodFor(game, ranks.length);
  const before = new Map(ranks.map((id) => [id, recordOf(game, id)]));
  const out: Applied[] = [];

  if (method === 'elo' && ranks.length === 2) {
    const [a, b] = ranks;
    const ra = before.get(a) as Record_;
    const rb = before.get(b) as Record_;
    const expA = 1 / (1 + 10 ** ((rb.rating - ra.rating) / 400));
    const scoreA = draw ? 0.5 : 1;
    const nextA = ra.rating + kOf(ra) * (scoreA - expA);
    const nextB = rb.rating + kOf(rb) * (1 - scoreA - (1 - expA));
    put(game, a, { rating: nextA, games: ra.games + 1, wins: ra.wins + (draw ? 0 : 1) });
    put(game, b, { rating: nextB, games: rb.games + 1, wins: rb.wins });
    out.push({ id: a, before: ra.rating, after: ratingOf(game, a), delta: ratingOf(game, a) - ra.rating });
    out.push({ id: b, before: rb.rating, after: ratingOf(game, b), delta: ratingOf(game, b) - rb.rating });
    return out;
  }

  if (method === 'place') {
    /* 방은 1위의 방으로 하나만 씀. 사람마다 다른 표를 쓰면 준 만큼 안 깎임 */
    const room = roomOf((before.get(ranks[0]) as Record_).rating);
    ranks.forEach((id, i) => {
      const rec = before.get(id) as Record_;
      const next = rec.rating + placePoints(room, ranks.length, i);
      put(game, id, { rating: next, games: rec.games + 1, wins: rec.wins + (i === 0 && !draw ? 1 : 0) });
      out.push({ id, before: rec.rating, after: ratingOf(game, id), delta: ratingOf(game, id) - rec.rating });
    });
    return out;
  }

  /* wins. 점수는 안 움직이고 판과 이김만 셈 */
  ranks.forEach((id, i) => {
    const rec = before.get(id) as Record_;
    put(game, id, { ...rec, games: rec.games + 1, wins: rec.wins + (i === 0 && !draw ? 1 : 0) });
    out.push({ id, before: rec.rating, after: rec.rating, delta: 0 });
  });
  return out;
}
