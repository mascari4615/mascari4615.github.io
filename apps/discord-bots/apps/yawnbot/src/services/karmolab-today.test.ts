/**
 * TASK-KL-194 — 오늘의 판 원장 시험.
 *
 * 여기서 제일 중요한 것: **연속일이 거짓으로 늘지 않는 것**과 **아침부터 0일로 끊기지 않는 것**.
 * 전자는 새로고침 한 번에 도장이 두 번 찍히면 일어나고, 후자는 「오늘 아직 안 놂」을
 * 「끊김」으로 세면 일어난다 — 둘 다 사람이 다시 안 오게 만드는 방향이다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabTodayStore, COURSE_GAMES, runOf, kstDay } from './karmolab-today';

let file: string;
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl194-'));
  file = path.join(tmp, 'today.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** KST 로 그 날짜 정오 — 시간대 경계에서 흔들리지 않게. */
const at = (day: string): Date => new Date(`${day}T03:00:00.000Z`);

const finish = (store: KarmolabTodayStore, handle: string, day: string): void => {
  for (const game of COURSE_GAMES) store.record(handle, game, at(day));
};

describe('연속일 셈', () => {
  it('오늘 안 놀았어도 어제까지 이어졌으면 안 끊긴다', () => {
    expect(runOf(['2026-08-06', '2026-08-07'], '2026-08-08')).toBe(2);
  });

  it('그제까지만 놀았으면 0 — 하루를 통째로 건너뛰면 끊긴다', () => {
    expect(runOf(['2026-08-05', '2026-08-06'], '2026-08-08')).toBe(0);
  });

  it('오늘 것이 있으면 오늘부터 센다', () => {
    expect(runOf(['2026-08-07', '2026-08-08'], '2026-08-08')).toBe(2);
  });

  it('기록이 없으면 0', () => {
    expect(runOf([], '2026-08-08')).toBe(0);
  });
});

describe('도장', () => {
  it('다섯 칸을 다 해야 하루가 찍힌다', () => {
    const store = new KarmolabTodayStore(file);
    for (const game of COURSE_GAMES.slice(0, COURSE_GAMES.length - 1)) store.record('yon', game, at('2026-08-08'));
    expect(store.of('yon', at('2026-08-08')).days).toEqual([]);
    store.record('yon', COURSE_GAMES[COURSE_GAMES.length - 1], at('2026-08-08'));
    expect(store.of('yon', at('2026-08-08')).days).toEqual(['2026-08-08']);
  });

  it('같은 칸을 여러 번 보내도 완주가 안 된다', () => {
    const store = new KarmolabTodayStore(file);
    for (let i = 0; i < COURSE_GAMES.length + 3; i++) store.record('yon', COURSE_GAMES[0], at('2026-08-08'));
    expect(store.of('yon', at('2026-08-08')).slots).toEqual([COURSE_GAMES[0]]);
    expect(store.of('yon', at('2026-08-08')).days).toEqual([]);
  });

  it('완주한 뒤 또 보내도 그날이 두 번 안 적힌다', () => {
    const store = new KarmolabTodayStore(file);
    finish(store, 'yon', '2026-08-08');
    finish(store, 'yon', '2026-08-08');
    expect(store.of('yon', at('2026-08-08')).days).toEqual(['2026-08-08']);
  });

  it('모르는 놀이 이름은 아무 일도 안 일으킨다', () => {
    const store = new KarmolabTodayStore(file);
    store.record('yon', 'not-a-game', at('2026-08-08'));
    expect(store.of('yon', at('2026-08-08')).slots).toEqual([]);
  });

  it('날이 바뀌면 오늘 칸은 비지만 지난 날짜는 남는다', () => {
    const store = new KarmolabTodayStore(file);
    finish(store, 'yon', '2026-08-07');
    const next = store.of('yon', at('2026-08-08'));
    expect(next.slots).toEqual([]);
    expect(next.days).toEqual(['2026-08-07']);
  });
});

describe('원장', () => {
  it('최고 연속일은 날짜가 끊겨도 남는다', () => {
    const store = new KarmolabTodayStore(file);
    finish(store, 'yon', '2026-08-05');
    finish(store, 'yon', '2026-08-06');
    finish(store, 'yon', '2026-08-07');
    expect(store.of('yon', at('2026-08-07')).best).toBe(3);
    finish(store, 'yon', '2026-08-20'); // 한참 쉬었다 돌아옴
    const row = store.of('yon', at('2026-08-20'));
    expect(row.best).toBe(3);
    expect(runOf(row.days, '2026-08-20')).toBe(1);
  });

  it('오늘 완주한 사람만 센다', () => {
    const store = new KarmolabTodayStore(file);
    finish(store, 'yon', '2026-08-08');
    finish(store, 'ring', '2026-08-07');
    store.record('alisa', COURSE_GAMES[0], at('2026-08-08')); // 한 칸만
    expect(store.finishedOn('2026-08-08')).toBe(1);
  });

  it('순위는 지금 살아 있는 연속만 — 옛 기록은 안 올라온다', () => {
    const store = new KarmolabTodayStore(file);
    finish(store, 'yon', '2026-08-07');
    finish(store, 'yon', '2026-08-08');
    finish(store, 'ring', '2026-08-08');
    finish(store, 'ghost', '2026-01-01');
    const ranking = store.ranking(10, at('2026-08-08'));
    expect(ranking.map((r) => r.handle)).toEqual(['yon', 'ring']);
    expect(ranking[0].run).toBe(2);
  });

  it('파일로 이어진다 — 서버가 재시작해도 연속일이 안 사라진다', () => {
    finish(new KarmolabTodayStore(file), 'yon', '2026-08-08');
    expect(new KarmolabTodayStore(file).of('yon', at('2026-08-08')).days).toEqual(['2026-08-08']);
  });
});

describe('날짜', () => {
  it('KST 자정 직후는 이미 다음 날이다 (UTC 15시)', () => {
    expect(kstDay(new Date('2026-08-08T15:30:00.000Z'))).toBe('2026-08-09');
  });
});
