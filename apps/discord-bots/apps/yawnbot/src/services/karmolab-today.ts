/**
 * 오늘의 판 원장 (TASK-KL-194) — **연속일을 계정에 붙인다**.
 *
 * 왜 있나: 「오늘의 코스」(KL-089)는 이미 돌고 있었다. 놀이 다섯 중 오늘 뭘 했는지 세고,
 * 다 하면 며칠 연속인지도 말한다. 그런데 그 셈이 **이 브라우저 안에만** 있었다 —
 * 폰으로 열면 0일, 브라우저 기록을 지우면 0일. 「내가 쌓은 것」이 한 번의 청소로 사라지는
 * 자리는 아무도 안 쌓는다. 그래서 연속일이 돌아올 이유가 되지 못했다.
 *
 * 여기는 그 셈을 **계정에** 옮긴다. 새 판정 기준은 만들지 않는다 — 「오늘 완주했나」는
 * 여전히 브라우저가 판정하고(각 놀이의 저장을 읽는 쪽이 정본), 서버는 그 날짜만 받아 적는다.
 * 판정을 서버로 옮기려면 놀이 다섯의 저장 모양을 서버가 다 알아야 하고, 그 순간 같은 규칙이
 * 두 벌이 된다.
 *
 * 못 믿을 값이 들어오면? 이 원장은 **순위가 아니다** — 연속일은 나에게만 보이는 수고,
 * 순위·기록은 이미 놀이 기록 원장(`karmolab-plays`)이 따로 지킨다. 그래서 여기서는
 * 「하루에 한 번」과 「사람이 보냈나」만 본다.
 *
 * 저장 = `data/karmolab-today-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

const STATE_FILE = 'karmolab-today-state.json';

/** 며칠치 날짜를 들고 있나. 연속일은 이보다 길어질 수 있지만 그때는 최고 기록으로 남는다. */
export const KEEP_DAYS = 400;

/**
 * 코스가 셀 줄 아는 놀이 — **판정은 브라우저가 한다**. 여기 있는 목록은 「아무 글자나 받지
 * 않는다」는 문지기일 뿐이다. 브라우저 쪽 정본은 `play-course.ts` 의 `COUNTED`.
 * 둘이 갈리면 어떻게 되나: 여기 없는 id 는 조용히 버려지고 완주가 안 찍힌다 —
 * 그래서 새 놀이를 코스에 넣는 날은 이 줄도 같이 는다.
 */
export const COURSE_GAMES = ['daily', 'higher', 'quest', 'twenty', 'worldcup'];

export interface TodayRecord {
  /** 완주한 날 (`YYYY-MM-DD`, KST). 오래된 것부터. */
  days: string[];
  /** 역대 최고 연속일. 날짜를 버려도 이 수는 남는다. */
  best: number;
  /** 오늘 어느 칸을 끝냈나 — 날이 바뀌면 비운다. 「몇 개 남았나」를 기기 사이에서 잇는 자리. */
  day: string | null;
  slots: string[];
}

interface TodayState {
  version: 1;
  /** 핸들 → 기록. */
  people: Record<string, TodayRecord>;
}

/** 오늘(KST). 놀이 원장·우물과 같은 모양을 쓴다 — 여기서 갈리면 하루가 어긋난다. */
export function kstDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * 오늘 기준 연속일. **어제까지 이어졌으면 아직 안 끊긴 것**으로 본다 —
 * 오늘 아직 안 논 사람에게 아침부터 「0일」이라고 하면, 그 사람은 이미 잃은 줄 알고 안 온다.
 * 오늘 것이 없고 어제 것도 없으면 0.
 */
export function runOf(days: string[], today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : dayBefore(today);
  if (!set.has(cursor)) return 0;
  let run = 0;
  while (set.has(cursor)) {
    run++;
    cursor = dayBefore(cursor);
  }
  return run;
}

function emptyRecord(): TodayRecord {
  return { days: [], best: 0, day: null, slots: [] };
}

export class KarmolabTodayStore {
  private state: TodayState;

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): TodayState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<TodayState>;
        return { version: 1, people: parsed.people ?? {} };
      }
    } catch (error) {
      console.error('[karmolab-today] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return { version: 1, people: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state), 'utf-8');
    } catch (error) {
      console.error('[karmolab-today] 상태 파일을 못 썼다:', error);
    }
  }

  /** 오늘 칸 하나를 끝냈다. 이미 적힌 칸이면 아무 일도 안 일어난다(새로고침으로 안 는다). */
  record(handle: string, slot: string, at: Date = new Date()): TodayRecord {
    if (COURSE_GAMES.indexOf(slot) < 0) return this.of(handle, at);
    const today = kstDay(at);
    const row = this.state.people[handle] ?? emptyRecord();
    if (row.day !== today) {
      row.day = today;
      row.slots = [];
    }
    if (row.slots.indexOf(slot) < 0) row.slots.push(slot);

    /* 완주 도장은 **여기서만** 찍는다. 브라우저가 「완주했다」고 말해 주는 길을 두면,
       한 칸만 하고 완주를 보내는 것과 구분할 방법이 없다. */
    if (row.slots.length >= COURSE_GAMES.length && row.days[row.days.length - 1] !== today) {
      row.days.push(today);
      if (row.days.length > KEEP_DAYS) row.days.splice(0, row.days.length - KEEP_DAYS);
    }
    row.best = Math.max(row.best, runOf(row.days, today));
    this.state.people[handle] = row;
    this.save();
    return row;
  }

  /** 내 기록. 없으면 빈 기록 — 「아직 없다」와 「못 읽었다」를 화면이 구분할 필요가 없게. */
  of(handle: string, at: Date = new Date()): TodayRecord {
    const today = kstDay(at);
    const row = this.state.people[handle] ?? emptyRecord();
    return row.day === today ? row : { ...row, day: today, slots: [] };
  }

  /** 오늘 완주한 사람 수. 아무도 없으면 0 — 화면은 0이면 그 줄을 안 그린다. */
  finishedOn(day: string): number {
    let count = 0;
    for (const row of Object.values(this.state.people)) if (row.days.indexOf(day) >= 0) count++;
    return count;
  }

  /**
   * 연속일 순위. **오늘 기준으로 살아 있는 줄만** — 3년 전에 40일 하고 떠난 사람이 맨 위에
   * 박혀 있으면 그 순위판은 아무도 안 본다.
   */
  ranking(limit = 10, at: Date = new Date()): Array<{ handle: string; run: number; best: number }> {
    const today = kstDay(at);
    return Object.entries(this.state.people)
      .map(([handle, row]) => ({ handle, run: runOf(row.days, today), best: row.best }))
      .filter((row) => row.run > 0)
      .sort((a, b) => b.run - a.run || b.best - a.best || a.handle.localeCompare(b.handle))
      .slice(0, limit);
  }
}

let singleton: KarmolabTodayStore | null = null;

export function getKarmolabTodayStore(): KarmolabTodayStore {
  if (!singleton) singleton = new KarmolabTodayStore();
  return singleton;
}
