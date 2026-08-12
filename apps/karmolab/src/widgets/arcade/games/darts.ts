/**
 * 다트 — 흔들리는 조준을 멈춰서 던진다 (TASK-KL-242)
 *
 * 앞의 스포츠 셋(컬링·볼링·당구)은 **던진 뒤**가 재미였다. 이건 반대로 **던지기 전**이 전부다 —
 * 겨눔이 스스로 흔들리고, 사람이 하는 일은 「지금」을 고르는 것뿐이다. 그래서 물리가 없다.
 *
 * 흔들림은 **시계에서 나온다**(커널이 준 `now`). 손 떨림을 난수로 만들면 화면마다 다른 자리를
 * 찍게 되고, 그러면 여럿이 할 때 「내가 본 자리」와 「맞은 자리」가 갈린다.
 *
 * 셈은 501 다운을 줄인 **101 다운**. 딱 0 으로 떨어뜨리는 쪽이 이기고, 넘치면 그 판은 무효다
 * (원래 놀이의 「버스트」). 세 번씩 던진다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 과녁 반지름 (판 좌표) */
export const R = 50;
/** 20등분 판의 숫자 차례 — 실제 다트판 그대로 */
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const START = 101;
const THROWS = 3;
/** 겨눔이 한 바퀴 도는 데 걸리는 시간 — 짧을수록 어렵다 */
const SWING_MS = 1500;

export interface DartsState {
  /** 자리별 남은 점수 */
  left: number[];
  /** 이번 차례에 몇 번 던졌나 */
  thrown: number;
  turn: number;
  /** 이번 차례 시작 시각 (흔들림의 기준) */
  since: number;
  /** 방금 꽂힌 자리들 — 화면이 보여 준다 */
  marks: Array<{ x: number; y: number; score: number; seat: number }>;
  won: number;
}

export type DartsAction = { kind: 'throw' };

/** 지금 겨눔이 어디인가. **시각만으로 정해진다** — 누가 보든 같은 자리다. */
export function aimAt(now: number, since: number): { x: number; y: number } {
  const t = (now - since) / SWING_MS;
  /* 두 방향이 서로 다른 빠르기로 흔들려 매번 다른 자리를 지난다(리사주 곡선). */
  return {
    x: Math.sin(t * Math.PI * 2) * R * 0.72,
    y: Math.sin(t * Math.PI * 2 * 1.6 + 0.7) * R * 0.72
  };
}

/** 그 자리의 점수. 한가운데 50, 그 둘레 25, 바깥은 구역 숫자(두 배·세 배 띠 포함). */
export function scoreAt(x: number, y: number): number {
  const d = Math.hypot(x, y);
  if (d > R) return 0;
  if (d < R * 0.05) return 50;
  if (d < R * 0.11) return 25;
  const ang = Math.atan2(x, -y);
  const idx = Math.floor(((ang + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / 20) + 0.5) % 20;
  const base = SECTORS[idx];
  if (d > R * 0.62 && d < R * 0.70) return base * 3;
  if (d > R * 0.92) return base * 2;
  return base;
}

export const darts: GameDef<DartsState, DartsAction> = {
  id: 'darts',
  seats: [1, 4],
  rounds: 1,
  realtime: true,

  init(ctx) {
    return {
      left: ctx.seats.map(() => START),
      thrown: 0,
      turn: 0,
      since: ctx.now,
      marks: [],
      won: -1
    };
  },

  canAct(s, seat) {
    return s.won === -1 && s.turn === seat;
  },

  reduce(s, a, seat, ctx) {
    if (s.won !== -1 || s.turn !== seat) return s;
    if (a?.kind !== 'throw') return s;

    const at = aimAt(ctx.now, s.since);
    const got = scoreAt(at.x, at.y);
    const marks = [...s.marks.slice(-8), { x: at.x, y: at.y, score: got, seat }];

    const rest = s.left[seat] - got;
    /* 넘치면 없던 일 — 원래 놀이의 버스트. 딱 0 이어야 이긴다. */
    const left = s.left.map((v, i) => (i === seat ? (rest < 0 ? v : rest) : v));
    if (rest === 0) return { ...s, left, marks, won: seat };

    const thrown = s.thrown + 1;
    if (thrown < THROWS) return { ...s, left, marks, thrown, since: ctx.now };

    const seats = ctx.seats.length;
    return { ...s, left, marks, thrown: 0, turn: (seat + 1) % seats, since: ctx.now };
  },

  tick(s) {
    /* 흔들림은 화면이 `now` 로 계산한다 — 여기서 상태를 바꿀 것이 없다.
       그래도 `realtime` 인 이유: 커널이 시계를 계속 밀어 줘야 화면이 다시 그려진다. */
    return s;
  },

  outcome(s, ctx): Outcome {
    if (s.won === -1) return { over: false };
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (i === s.won ? 1 : 0)),
      note: { key: 'arcade.darts.win', params: { who: ctx.seats[s.won]?.name ?? '' } }
    };
  },

  bot(s, seat, ctx): BotMove<DartsAction> | null {
    if (s.won !== -1 || s.turn !== seat) return null;
    /* 봇도 사람과 같은 조건 — 흔들리는 겨눔을 「지금」으로 끊는다. 좋은 때를 노리되 자주 놓친다. */
    const wait = 200 + Math.random() * 900;
    void ctx;
    return { action: { kind: 'throw' }, delayMs: wait };
  }
};
