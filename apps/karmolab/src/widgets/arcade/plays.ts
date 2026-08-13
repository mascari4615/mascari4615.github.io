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
const KEY = 'karmolab.arcade.plays';

export interface Play {
  /** 몇 번 했나 */
  n: number;
  /** 마지막으로 한 때 (epoch ms) */
  at: number;
}

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
