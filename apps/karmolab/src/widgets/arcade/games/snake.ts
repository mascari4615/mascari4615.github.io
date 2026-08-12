/**
 * 뱀 경주 — 남이 지나간 자리가 벽이 된다 (TASK-KL-242)
 *
 * 에어하키에 이어 **동시 실시간** 두 번째. 다른 점은 액션이 자리도 아니고 누름도 아닌 **방향**이라는 것 —
 * 한 번 정하면 바꿀 때까지 유지된다. 그래서 소식이 하나 늦어도 뱀이 멈추지 않는다(늦게 온
 * 방향은 그때부터 적용될 뿐이다).
 *
 * 혼자 하던 뱀을 여럿이 하게 만드는 법: **서로의 몸이 벽**이다. 먹이를 다투는 게 아니라
 * 자리를 다툰다 — 앞서 나가면 유리한 게 아니라 길을 더 많이 막아 놓은 쪽이 유리하다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

export const W = 21;
export const H = 21;
/** 한 칸 가는 데 걸리는 시간 — 프레임이 아니라 이 값이 빠르기를 정한다. */
const STEP_MS = 140;
const START_LEN = 3;

export interface Snake {
  /** 머리부터 꼬리까지 칸 번호 */
  body: number[];
  /** 0 위 1 오른쪽 2 아래 3 왼쪽 */
  dir: number;
  alive: boolean;
  /** 먹은 수 */
  ate: number;
}

export interface SnakeState {
  snakes: Snake[];
  /** 먹이 자리들 */
  food: number[];
  /** 다음 한 칸을 갈 시각 */
  nextAt: number;
  over: boolean;
}

/** 「이 방향으로」 — 누름이 아니라 방향이다. 늦게 와도 그때부터 돌면 그만이다. */
export type SnakeAction = { dir: number };

const xy = (c: number): [number, number] => [c % W, Math.floor(c / W)];
const idx = (x: number, y: number): number => ((y + H) % H) * W + ((x + W) % W);

const DIRS: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function spawnFood(taken: Set<number>, rng: () => number): number {
  for (let n = 0; n < 200; n++) {
    const c = Math.floor(rng() * W * H);
    if (!taken.has(c)) return c;
  }
  return 0;
}

export const snake: GameDef<SnakeState, SnakeAction> = {
  id: 'snake',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    const n = ctx.seats.length;
    const snakes: Snake[] = ctx.seats.map((_, i) => {
      /* 자리마다 다른 구석에서 시작해 서로 안 겹치게. */
      const x = 3 + (i % 2) * (W - 7);
      const y = 3 + Math.floor(i / 2) * (H - 7);
      const dir = i % 2 === 0 ? 1 : 3;
      const body = Array.from({ length: START_LEN }, (_, k) =>
        idx(x - DIRS[dir][0] * k, y - DIRS[dir][1] * k)
      );
      return { body, dir, alive: true, ate: 0 };
    });
    const taken = new Set(snakes.flatMap((s) => s.body));
    const food = Array.from({ length: Math.max(2, n) }, () => spawnFood(taken, ctx.rng));
    return { snakes, food, nextAt: ctx.now + STEP_MS, over: false };
  },

  canAct(s, seat) {
    return !s.over && !!s.snakes[seat]?.alive;
  },

  reduce(s, a, seat) {
    if (s.over) return s;
    const me = s.snakes[seat];
    if (!me?.alive) return s;
    const dir = a?.dir;
    if (!Number.isInteger(dir) || dir < 0 || dir > 3) return s;
    /* 제 몸으로 바로 되돌아가는 방향은 안 받는다 — 손가락이 미끄러져 자멸하는 일이 잦다. */
    if ((dir + 2) % 4 === me.dir) return s;
    return { ...s, snakes: s.snakes.map((sn, i) => (i === seat ? { ...sn, dir } : sn)) };
  },

  tick(s, ctx) {
    if (s.over || ctx.now < s.nextAt) return s;

    /* **모두 한 칸씩 동시에** 간다 — 차례로 옮기면 먼저 옮긴 쪽이 유리해진다. */
    const heads = s.snakes.map((sn) => {
      if (!sn.alive) return -1;
      const [hx, hy] = xy(sn.body[0]);
      const [dx, dy] = DIRS[sn.dir];
      return idx(hx + dx, hy + dy);
    });

    /* 벽(몸)은 이번 걸음 **전**의 자리로 판단한다. 꼬리는 비켜 준다(바로 뒤따라가는 건 된다). */
    const walls = new Set<number>();
    s.snakes.forEach((sn) => {
      if (!sn.alive) return;
      sn.body.slice(0, -1).forEach((c) => walls.add(c));
    });

    const food = s.food.slice();
    const snakes = s.snakes.map((sn, i) => {
      if (!sn.alive) return sn;
      const head = heads[i];
      /* 같은 칸에 둘이 들어오면 둘 다 죽는다 — 먼저 계산된 쪽이 이기면 순서가 승부를 정한다. */
      const crash = walls.has(head) || heads.filter((h) => h === head).length > 1;
      if (crash) return { ...sn, alive: false };

      const k = food.indexOf(head);
      const grew = k >= 0;
      if (grew) food.splice(k, 1);
      const body = [head, ...(grew ? sn.body : sn.body.slice(0, -1))];
      return { ...sn, body, ate: sn.ate + (grew ? 1 : 0) };
    });

    /* 먹은 만큼 다시 뿌린다 — 판에 먹이가 없으면 아무 일도 안 일어난다. */
    const taken = new Set(snakes.flatMap((sn) => (sn.alive ? sn.body : [])));
    while (food.length < Math.max(2, s.snakes.length)) food.push(spawnFood(taken, ctx.rng));

    const alive = snakes.filter((sn) => sn.alive).length;
    /* 혼자 하는 판이면 죽으면 끝, 여럿이면 하나 남으면 끝. */
    const over = s.snakes.length === 1 ? alive === 0 : alive <= 1;
    return { snakes, food, nextAt: ctx.now + STEP_MS, over };
  },

  outcome(s, ctx): Outcome {
    if (!s.over) return { over: false };
    const scores = s.snakes.map((sn) => sn.ate);
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note: { key: 'arcade.snake.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<SnakeAction> | null {
    if (s.over) return null;
    const me = s.snakes[seat];
    if (!me?.alive) return null;
    const [hx, hy] = xy(me.body[0]);

    const blocked = new Set(s.snakes.flatMap((sn) => (sn.alive ? sn.body.slice(0, -1) : [])));
    const safe = [0, 1, 2, 3].filter((d) => {
      if ((d + 2) % 4 === me.dir) return false;
      const [dx, dy] = DIRS[d];
      return !blocked.has(idx(hx + dx, hy + dy));
    });
    if (!safe.length) return null;

    /* 안전한 방향 중 먹이에 가까워지는 쪽. 가끔 엉뚱하게 가야 사람이 이긴다. */
    if (Math.random() < 0.15) {
      return { action: { dir: safe[Math.floor(Math.random() * safe.length)] }, delayMs: STEP_MS };
    }
    const target = s.food[0] ?? 0;
    const [fx, fy] = xy(target);
    const best = safe.reduce((a, d) => {
      const [dx, dy] = DIRS[d];
      const da = Math.abs(hx + DIRS[a][0] - fx) + Math.abs(hy + DIRS[a][1] - fy);
      const db = Math.abs(hx + dx - fx) + Math.abs(hy + dy - fy);
      return db < da ? d : a;
    }, safe[0]);
    return { action: { dir: best }, delayMs: STEP_MS };
  }
};
