/**
 * 오늘의 세 판. 51개 중 오늘은 이 셋 (TASK-KL-264)
 *
 * 51개를 늘어놓으면 사람은 **고르다가 지친다.** 그리고 고를 것이 늘 같으면 어제 온 사람이
 * 오늘 또 올 이유가 없다. 그래서 매일 셋을 뽑는다. 오는 이유를 만드는 것이 이 파일의 일이다.
 *
 * 규율:
 *  ① **모두가 같은 셋**을 본다. 날짜에서 뽑으므로 내 브라우저가 정하지 않는다 . 
 *     오늘 그거 했어?가 성립해야 한다(각자 다른 셋이면 그 말이 안 된다).
 *  ② **갈래를 섞는다**(빠른 것, 판 놀이, 그 밖). 셋 다 보드면 그날은 아무도 안 한다.
 *  ③ 날짜는 `play-course.ts` 가 쓰는 그 모양을 그대로 가져다 쓴다. 날짜 셈이 두 벌이면
 *     자정 언저리에 어제 것을 오늘로 세는 날이 온다.
 *  ④ 연속일은 **어제까지 이어졌을 때만** 잇는다. 하루 건너뛰면 1부터. 그게 연속의 뜻이다.
 */
import { courseDay } from '../play-course';
import type { Kind } from './meta';

const KEY = 'karmolab.arcade.daily';
/** 하루에 몇 판 */
export const PICKS = 3;

export interface DailyState {
  /** 이 기록이 어느 날 것인가 */
  day: string;
  /** 오늘 끝낸 게임 */
  done: string[];
  /** 며칠 이어졌나 */
  streak: number;
  /** 마지막으로 셋을 다 채운 날 */
  lastFull: string;
}

const empty = (day: string): DailyState => ({ day, done: [], streak: 0, lastFull: '' });

function read(): DailyState {
  const day = courseDay();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as DailyState | null;
    if (!raw || typeof raw.day !== 'string') return empty(day);
    /* 날이 바뀌었으면 오늘 것만 비운다. 연속일과 마지막으로 채운 날은 살려 둔다. */
    if (raw.day !== day) return { day, done: [], streak: raw.streak || 0, lastFull: raw.lastFull || '' };
    return { day, done: Array.isArray(raw.done) ? raw.done : [], streak: raw.streak || 0, lastFull: raw.lastFull || '' };
  } catch {
    return empty(day);
  }
}

function write(s: DailyState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 못 적어도 오늘 판은 돌아간다 */
  }
}

/** 날짜 글자에서 수 하나. 같은 날이면 어느 기계에서든 같은 값이다. */
function seedOf(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 오늘의 셋. **갈래를 섞어** 뽑는다. 빠른 것 하나, 판 놀이 하나, 나머지에서 하나.
 * 그 갈래가 비어 있으면 남은 데서 채운다(게임을 지워도 안 깨진다).
 */
export function todayPicks(all: Array<{ id: string; kind: Kind }>): string[] {
  const day = courseDay();
  let seed = seedOf(day);
  const next = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const want: Kind[][] = [['quick'], ['board', 'card'], ['sport', 'puzzle']];
  const out: string[] = [];
  for (const kinds of want) {
    const pool = all.filter((g) => kinds.includes(g.kind) && !out.includes(g.id));
    const from = pool.length ? pool : all.filter((g) => !out.includes(g.id));
    if (!from.length) break;
    out.push(from[next(from.length)].id);
  }
  return out.slice(0, PICKS);
}

export function dailyState(): DailyState {
  return read();
}

/**
 * 한 판을 끝냈다. 오늘의 셋에 든 게임이면 표시하고, 셋을 다 채웠으면 연속일을 잇는다.
 * 이긴 판만 세지 않는다. 이겨야 세면 봇 세기를 순한맛으로 낮추는 놀이가 된다.
 */
export function markPlayed(id: string, picks: string[]): DailyState {
  const s = read();
  if (!picks.includes(id) || s.done.includes(id)) return s;
  s.done = [...s.done, id];
  if (s.done.length >= picks.length && s.lastFull !== s.day) {
    const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3);
    const yday = `${yesterday.getUTCFullYear()}. ${yesterday.getUTCMonth() + 1}. ${yesterday.getUTCDate()}.`;
    s.streak = s.lastFull === yday ? s.streak + 1 : 1;
    s.lastFull = s.day;
  }
  write(s);
  return s;
}
