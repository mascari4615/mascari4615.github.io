/**
 * 점과 상자 — 선을 그어 칸을 닫는다 (TASK-KL-242)
 *
 * 두는 곳이 **칸도 줄도 아니라 「선」**이다. 커널이 「한 수」의 모양을 안 정한다는 것을
 * 사목(줄)·오목(칸)에 이어 세 번째로 보여 주는 자리.
 *
 * 칸을 닫으면 **한 번 더** 둔다 — 짝 맞추기와 같은 리듬이고, 차례를 게임이 갖기에 그냥 된다.
 */
import type { GameDef, BotMove, Outcome } from '../types';

/** 칸이 몇 줄인가. 4×4 = 선 40개 — 폰에서 손가락으로 짚을 수 있는 크기다. */
export const C = 4;
/** 가로선 개수 (위아래 경계 포함) */
export const HCOUNT = (C + 1) * C;
export const TOTAL = HCOUNT * 2;

export interface DotsState {
  /** 선이 그어졌나 (0 = 아직). 앞쪽 절반이 가로선, 뒤쪽 절반이 세로선 */
  lines: number[];
  /** 칸 임자 (0 = 아직) */
  boxes: number[];
  turn: number;
  last: number;
}

export type DotsAction = { line: number };

/** 이 칸을 둘러싼 선 네 개. */
export function edgesOf(box: number): [number, number, number, number] {
  const r = Math.floor(box / C);
  const c = box % C;
  const top = r * C + c;
  const bottom = (r + 1) * C + c;
  const left = HCOUNT + c * C + r;
  const right = HCOUNT + (c + 1) * C + r;
  return [top, bottom, left, right];
}

const closes = (lines: number[], box: number): boolean => edgesOf(box).every((e) => lines[e] !== 0);

export const dots: GameDef<DotsState, DotsAction> = {
  id: 'dots',
  seats: [2, 4],
  rounds: 1,

  init() {
    return { lines: new Array(TOTAL).fill(0), boxes: new Array(C * C).fill(0), turn: 0, last: -1 };
  },

  canAct(s, seat) {
    return s.turn === seat && s.boxes.some((b) => b === 0);
  },

  reduce(s, a, seat, ctx) {
    if (s.turn !== seat) return s;
    const i = a?.line;
    if (typeof i !== 'number' || i < 0 || i >= TOTAL || s.lines[i] !== 0) return s;

    const lines = s.lines.slice();
    lines[i] = seat + 1;
    const boxes = s.boxes.slice();
    let got = 0;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b] === 0 && closes(lines, b)) { boxes[b] = seat + 1; got++; }
    }
    /* 닫았으면 한 번 더. 아니면 다음 사람. */
    const turn = got ? seat : (seat + 1) % ctx.seats.length;
    return { lines, boxes, turn, last: i };
  },

  outcome(s, ctx): Outcome {
    if (s.boxes.some((b) => b === 0)) return { over: false };
    const scores = ctx.seats.map((_, i) => s.boxes.filter((b) => b === i + 1).length);
    const top = Math.max(...scores);
    const winners = ctx.seats.filter((_, i) => scores[i] === top);
    return {
      over: true,
      scores,
      note:
        winners.length === ctx.seats.length
          ? { key: 'arcade.dots.draw' }
          : { key: 'arcade.dots.win', params: { who: winners.map((w) => w.name).join(', '), n: String(top) } }
    };
  },

  bot(s, seat): BotMove<DotsAction> | null {
    if (s.turn !== seat) return null;
    const free = s.lines.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    if (!free.length) return null;

    const move = (line: number): BotMove<DotsAction> => ({
      action: { line },
      delayMs: 500 + Math.random() * 600
    });

    /* ① 닫을 수 있으면 닫는다 (그리고 한 번 더 둔다). */
    for (const i of free) {
      const t = s.lines.slice();
      t[i] = seat + 1;
      if (s.boxes.some((b, k) => b === 0 && closes(t, k))) return move(i);
    }

    /* ② 아니면 **상대에게 칸을 내주지 않는 선**을 고른다 — 세 변이 그어진 칸을 만들면 바로 뺏긴다. */
    const safe = free.filter((i) => {
      const t = s.lines.slice();
      t[i] = seat + 1;
      return !s.boxes.some((b, k) => {
        if (b !== 0) return false;
        const drawn = edgesOf(k).filter((e) => t[e] !== 0).length;
        return drawn === 3;
      });
    });
    const pool = safe.length ? safe : free;
    return move(pool[Math.floor(Math.random() * pool.length)]);
  }
};
