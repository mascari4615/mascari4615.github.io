/**
 * TASK-KL-148 — 놀이 기록 원장 시험.
 *
 * 여기서 틀리면 조용히 틀린다: 순위판은 언제나 **뭔가 그럴듯한 줄**을 보여 주기 때문이다.
 * 방향이 뒤집혀도(느린 사람이 1등) 화면은 똑같이 예쁘다. 그래서 이 시험은 「돌아가나」가 아니라
 * **누가 위인가**와 **안 깼을 때 안 바뀌나**를 본다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabPlayStore, PLAY_GAMES, isValidScore, playGame } from './karmolab-plays';

let tmpRoot: string;
let statePath: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kl148-plays-'));
  statePath = path.join(tmpRoot, 'data', 'karmolab-plays-state.json');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function store(): KarmolabPlayStore {
  return new KarmolabPlayStore(statePath);
}

/** KST 로 그날이 되는 시각 (12:00 KST — 자정 근처 흔들림에 걸리지 않게). */
function at(day: string): Date {
  return new Date(`${day}T03:00:00.000Z`);
}

describe('점수 받아들이기', () => {
  it('사람이 낼 수 없는 값은 안 받는다 — 순위판에 0ms 한 줄이면 그 판은 죽는다', () => {
    const reaction = playGame('reaction')!;
    expect(isValidScore(reaction, 0)).toBe(false);
    expect(isValidScore(reaction, 12)).toBe(false);
    expect(isValidScore(reaction, Number.NaN)).toBe(false);
    expect(isValidScore(reaction, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidScore(reaction, 210)).toBe(true);
  });

  it('표에 없는 놀이는 통째로 거절한다', () => {
    expect(playGame('없는놀이')).toBeNull();
    expect(store().record('없는놀이', 'yon', 100)).toBeNull();
  });

  it('범위 밖 점수는 기록이 안 남는다', () => {
    const s = store();
    expect(s.record('reaction', 'yon', 5)).toBeNull();
    expect(s.board('reaction')).toHaveLength(0);
  });
});

describe('순위 방향 — 놀이마다 반대다', () => {
  it('반응속도는 **작은 쪽**이 1등이다', () => {
    const s = store();
    s.record('reaction', 'yon', 320, at('2026-08-08'));
    s.record('reaction', 'ring', 180, at('2026-08-08'));
    const board = s.board('reaction');
    expect(board.map((e) => e.handle)).toEqual(['ring', 'yon']);
    expect(board[0].rank).toBe(1);
  });

  it('연승은 **큰 쪽**이 1등이다', () => {
    const s = store();
    s.record('higher', 'yon', 3, at('2026-08-08'), 'pokemon');
    s.record('higher', 'ring', 11, at('2026-08-08'), 'pokemon');
    expect(s.board('higher', 'all', 20, at('2026-08-08'), 'pokemon').map((e) => e.handle)).toEqual(['ring', 'yon']);
  });

  it('같은 점수면 먼저 낸 사람이 위다 — 뒤에 온 사람이 밀어내면 「깼다」가 거짓이 된다', () => {
    const s = store();
    s.record('reaction', 'yon', 200, at('2026-08-08'));
    s.record('reaction', 'ring', 200, at('2026-08-09'));
    expect(s.board('reaction').map((e) => e.handle)).toEqual(['yon', 'ring']);
  });
});

describe('최고 기록', () => {
  it('더 나쁜 판은 최고를 안 덮는다 (한 판 못했다고 기록이 깎이면 아무도 다시 안 한다)', () => {
    const s = store();
    s.record('reaction', 'yon', 180, at('2026-08-08'));
    const worse = s.record('reaction', 'yon', 400, at('2026-08-08'))!;
    expect(worse.improved).toBe(false);
    expect(worse.best).toBe(180);
    expect(worse.previousBest).toBe(180);
    expect(worse.plays).toBe(2);
  });

  it('깨면 최고와 시각이 같이 바뀐다', () => {
    const s = store();
    s.record('reaction', 'yon', 300, at('2026-08-08'));
    const better = s.record('reaction', 'yon', 190, at('2026-08-09'))!;
    expect(better.improved).toBe(true);
    expect(better.best).toBe(190);
    expect(s.board('reaction')[0].at).toBe(at('2026-08-09').toISOString());
  });

  it('첫 판은 previousBest 가 없다 (0 으로 꾸며 내지 않는다)', () => {
    const first = store().record('speed', 'yon', 9.5, at('2026-08-08'))!;
    expect(first.previousBest).toBeNull();
    expect(first.improved).toBe(true);
  });
});

describe('어제의 나', () => {
  it('어제 최고를 그대로 돌려준다', () => {
    const s = store();
    s.record('reaction', 'yon', 260, at('2026-08-08'));
    const today = s.record('reaction', 'yon', 240, at('2026-08-09'))!;
    expect(today.yesterdayBest).toBe(260);
    expect(today.todayBest).toBe(240);
  });

  it('어제 안 놀았으면 없다고 한다 (역대 최고를 어제 것처럼 보여 주지 않는다)', () => {
    const s = store();
    s.record('reaction', 'yon', 260, at('2026-08-01'));
    const today = s.record('reaction', 'yon', 240, at('2026-08-09'))!;
    expect(today.yesterdayBest).toBeNull();
  });

  it('오늘 순위는 오늘 논 사람만 센다', () => {
    const s = store();
    s.record('reaction', 'ring', 150, at('2026-08-01')); // 옛날에 아주 잘한 사람
    const mine = s.record('reaction', 'yon', 300, at('2026-08-09'))!;
    expect(mine.todayRank).toBe(1);
    expect(mine.todayTotal).toBe(1);
    expect(mine.rank).toBe(2); // 역대로는 뒤
    expect(mine.total).toBe(2);
  });
});

describe('원장이 무한히 안 는다', () => {
  it('날짜별 최고는 30일까지만 남는다', () => {
    const s = store();
    for (let i = 0; i < 40; i++) {
      const day = new Date(at('2026-06-01').getTime() + i * 86400000).toISOString().slice(0, 10);
      s.record('reaction', 'yon', 300 - i, at(day));
    }
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(Object.keys(saved.games.reaction.yon.days)).toHaveLength(30);
  });

  it('최근 판은 200개에서 끊긴다', () => {
    const s = store();
    for (let i = 0; i < 230; i++) s.record('speed', `p${i}`, 1 + i / 100, at('2026-08-08'));
    expect(s.recent(999)).toHaveLength(200);
    expect(s.recent(3)).toHaveLength(3);
  });
});

describe('저장', () => {
  it('한 판마다 바로 쓴다 — 봇이 죽어도 방금 깬 기록이 남는다', () => {
    store().record('reaction', 'yon', 200, at('2026-08-08'));
    expect(fs.existsSync(statePath)).toBe(true);
    expect(store().board('reaction')[0].score).toBe(200);
  });

  it('상태 파일이 깨져 있어도 놀이는 돈다 (빈 원장으로 시작)', () => {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{깨진 json', 'utf-8');
    const s = store();
    expect(s.board('reaction')).toHaveLength(0);
    expect(s.record('reaction', 'yon', 200, at('2026-08-08'))!.best).toBe(200);
  });
});

describe('요약', () => {
  it('아무도 안 논 놀이는 사람 수 0 으로 나오고 순위판은 빈다', () => {
    const s = store();
    s.record('reaction', 'yon', 200, at('2026-08-08'));
    const stats = s.stats();
    expect(stats).toHaveLength(PLAY_GAMES.length);
    expect(stats.find((x) => x.game === 'reaction')).toMatchObject({ players: 1, plays: 1 });
    expect(stats.find((x) => x.game === 'higher')).toMatchObject({ players: 0, plays: 0 });
    expect(s.board('higher')).toHaveLength(0);
  });

  it('내 기록은 논 종목만 돌려준다', () => {
    const s = store();
    s.record('reaction', 'yon', 200, at('2026-08-08'));
    const mine = s.me('yon', at('2026-08-08'));
    expect(mine.map((m) => m.game)).toEqual(['reaction']);
    expect(mine[0]).toMatchObject({ best: 200, rank: 1, total: 1, better: 'low', unit: 'ms' });
  });
});

/**
 * 표(변형)마다 갈리는 순위판.
 *
 * 이게 없으면 조용히 불공정해진다 — 쉬운 표를 고른 사람이 어려운 표 1등을 밀어낸다.
 * 사람이 만든 표(UGC)도 같은 자리로 들어오므로, 표가 늘 때마다 서버를 고치지 않아도 된다.
 */
describe('표마다 순위판이 갈린다', () => {
  it('같은 놀이라도 표가 다르면 서로 안 섞인다', () => {
    const s = store();
    s.record('higher', 'yon', 12, at('2026-08-08'), 'pokemon');
    s.record('higher', 'ring', 3, at('2026-08-08'), 'lol');
    expect(s.board('higher', 'all', 20, at('2026-08-08'), 'pokemon').map((e) => e.handle)).toEqual(['yon']);
    expect(s.board('higher', 'all', 20, at('2026-08-08'), 'lol').map((e) => e.handle)).toEqual(['ring']);
  });

  it('표가 갈리는 놀이는 표 없이 못 적는다 (섞이면 순위가 거짓이 된다)', () => {
    const s = store();
    expect(s.record('higher', 'yon', 5, at('2026-08-08'))).toBeNull();
    expect(s.record('higher', 'yon', 5, at('2026-08-08'), '표 이름!')).toBeNull();
  });

  it('표가 없는 놀이는 표를 보내와도 무시한다 (순위판이 쪼개지면 안 된다)', () => {
    const s = store();
    const first = s.record('reaction', 'yon', 200, at('2026-08-08'), 'pokemon')!;
    expect(first.variant).toBeNull();
    expect(s.board('reaction', 'all', 20, at('2026-08-08')).map((e) => e.handle)).toEqual(['yon']);
  });

  it('사람이 만든 표도 그대로 순위판이 된다 (서버를 안 고쳐도 는다)', () => {
    const s = store();
    const made = s.record('higher', 'yon', 7, at('2026-08-08'), 'pack:p1a2b3')!;
    expect(made.variant).toBe('pack:p1a2b3');
    expect(made.rank).toBe(1);
  });

  it('내 기록은 표마다 한 줄이다', () => {
    const s = store();
    s.record('higher', 'yon', 12, at('2026-08-08'), 'pokemon');
    s.record('higher', 'yon', 3, at('2026-08-08'), 'lol');
    s.record('reaction', 'yon', 200, at('2026-08-08'));
    const mine = s.me('yon', at('2026-08-08'));
    expect(mine.map((m) => `${m.game}:${m.variant ?? '-'}`).sort()).toEqual([
      'higher:lol',
      'higher:pokemon',
      'reaction:-',
    ]);
  });

  it('요약은 표를 합쳐 「이 놀이를 몇 명이 하나」를 센다', () => {
    const s = store();
    s.record('higher', 'yon', 12, at('2026-08-08'), 'pokemon');
    s.record('higher', 'yon', 3, at('2026-08-08'), 'lol');
    s.record('higher', 'ring', 5, at('2026-08-08'), 'lol');
    const found = s.stats().find((x) => x.game === 'higher')!;
    expect(found).toMatchObject({ players: 2, plays: 3, variants: true });
  });
});
