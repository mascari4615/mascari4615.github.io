/**
 * 내가 뭘 얼마나 놀았나 — 이 브라우저에만 (TASK-KL-264 F4)
 *
 * 「추천」이 근거 없이 아무거나 고르면 그건 추천이 아니라 또 다른 나열이다. 근거는 하나뿐이다:
 * **내가 아직 안 해 본 것**, 그리고 **해 봤지만 오래된 것**.
 *
 * 이미 있는 것을 안 쓰는 이유: `KarmoStat` 은 밖으로 보내기만 하는 통로라 되읽을 수 없고,
 * `daily.ts` 의 기록은 오늘 것만 남긴다. 그래서 여기 따로 둔다 — 대신 **한 곳**이다.
 * 일일 기록판(A2)·고스트(A3)도 여기서 읽는다.
 *
 * 밖으로 안 보낸다. 무엇을 놀았나는 남이 알 일이 아니다.
 */
import type { GhostTape } from './ghost';

const KEY = 'karmolab.arcade.plays';

export interface Play {
  /** 몇 번 했나 */
  n: number;
  /** 마지막으로 한 때 (epoch ms) */
  at: number;
  /** 여태 가장 잘한 판 — 다음 판에 이 사람이 옆자리에 앉는다 (`ghost.ts`) */
  best?: GhostTape<unknown>;
}

/**
 * 기록 하나에 담을 수 있는 수의 최대.
 *
 * 브라우저가 주는 자리(localStorage)는 5MB 남짓이고 그건 **이 사이트 전부의 몫**이다.
 * 51개 놀이가 각자 기록을 하나씩 쌓으므로 한 판이 커지면 남의 자리를 먹는다. 400수면
 * 제기 200번·두더지 300번을 담고도 남는다 — 그보다 긴 판은 앞부분만 남긴다.
 */
const MAX_MOVES = 400;

export type Plays = Record<string, Play>;

export function readPlays(): Plays {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Plays | null;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function notePlay(id: string, now = Date.now()): Plays {
  const all = readPlays();
  const was = all[id];
  all[id] = { n: (was?.n ?? 0) + 1, at: now };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 못 적어도 이 판은 돌아간다 */
  }
  return all;
}

/**
 * 이 판이 여태 가장 잘한 판이면 기록을 갈아 끼운다.
 *
 * **이긴 판이 아니라 잘한 판**이다 — 봇을 순한맛으로 낮춰 이긴 판을 기록으로 남기면 다음에
 * 옆에 앉는 「어제의 나」가 실제보다 약해진다. 점수만 본다.
 */
export function noteBest<A>(id: string, score: number, moves: Array<{ at: number; action: A }>): boolean {
  const all = readPlays();
  const was = all[id];
  if (was?.best && was.best.score >= score) return false;
  all[id] = {
    n: was?.n ?? 0,
    at: was?.at ?? Date.now(),
    best: { score, at: Date.now(), moves: moves.slice(0, MAX_MOVES) as Array<{ at: number; action: unknown }> }
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 자리가 모자라면 기록은 포기한다 — 판은 그대로 돌아간다. */
    return false;
  }
  return true;
}

/** 이 놀이의 「어제의 나」. 없으면 null. */
export function bestOf(id: string): GhostTape<unknown> | null {
  return readPlays()[id]?.best ?? null;
}
