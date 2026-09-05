/**
 * 반응속도. 초록으로 바뀌는 순간 누른다 (change.arcade-absorbs-play 단계 2)
 *
 * 놀이터의 반응속도(혼자, 최고 기록)를 오락실 판으로. 판마다 초록이 켜지는 시각은 씨앗에서 나와
 * 같은 방의 모두가 같은 순간을 기다림. 먼저 누른 자리가 그 판을 가짐. 초록 전에 누르면 그 판은 실격.
 * 다섯 판. 오락실의 반사(`reflex`)는 4지선다 순발력이라 다른 놀이
 *
 * 시계는 커널 것. 화면이 제 시계를 보면 판정과 어긋남
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';

export interface ReactionState {
  startedAt: number;
  /** 초록이 켜지는 커널 시각 */
  greenAt: number;
  /** 이 시각까지 안 누르면 판이 끝남 */
  endsAt: number;
  /** 자리별 결과. null 은 아직, 양수는 반응 ms, -1 은 초록 전에 누름 */
  picks: Array<number | null>;
}

export type ReactionAction = { kind: 'tap' };

const WAIT_MIN = 1000;
const WAIT_SPAN = 3000;
const GRACE_MS = 2500;
export const EARLY = -1;

export const reaction: GameDef<ReactionState, ReactionAction> = {
  id: 'reaction',
  seats: [1, 4],
  rounds: 5,
  realtime: true,

  init(ctx: GameCtx): ReactionState {
    const greenAt = ctx.now + WAIT_MIN + Math.floor(ctx.rng() * WAIT_SPAN);
    return { startedAt: ctx.now, greenAt, endsAt: greenAt + GRACE_MS, picks: ctx.seats.map(() => null) };
  },

  reduce(s, a, seat, ctx) {
    if (!a || typeof a !== 'object' || a.kind !== 'tap') return s;
    if (s.picks[seat] !== null && s.picks[seat] !== undefined) return s;
    if (seat < 0 || seat >= s.picks.length) return s;
    if (ctx.now >= s.endsAt) return s;
    const picks = s.picks.slice();
    picks[seat] = ctx.now < s.greenAt ? EARLY : Math.max(1, ctx.now - s.greenAt);
    return { ...s, picks };
  },

  tick(s) {
    return s;
  },

  outcome(s, ctx): Outcome {
    const everyone = s.picks.every((p) => p !== null);
    if (!everyone && ctx.now < s.endsAt) return { over: false };
    let best = -1;
    let bestMs = Infinity;
    s.picks.forEach((p, i) => {
      if (p !== null && p > 0 && p < bestMs) {
        best = i;
        bestMs = p;
      }
    });
    const scores = s.picks.map((_, i) => (i === best ? 1 : 0));
    if (best < 0) return { over: true, scores, note: { key: 'arcade.reaction.none', sound: 'bad' } };
    return {
      over: true,
      scores,
      note: { key: 'arcade.reaction.fastest', params: { who: ctx.seats[best]?.name ?? '', ms: String(bestMs) }, sound: 'good' }
    };
  },

  /** 봇은 초록 뒤 180~400ms. 사람 평균(250ms 안팎)과 겨룰 만한 손 */
  bot(s, seat, ctx): BotMove<ReactionAction> | null {
    if (s.picks[seat] !== null) return null;
    const wait = Math.max(0, s.greenAt - ctx.now);
    return { action: { kind: 'tap' }, delayMs: wait + 180 + ctx.rng() * 220 };
  }
};
