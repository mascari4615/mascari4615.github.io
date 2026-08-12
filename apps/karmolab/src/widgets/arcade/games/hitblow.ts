/**
 * 숫자 야구 — 감춘 수를 맞힌다 (TASK-KL-242)
 *
 * 커널에 **숨은 정보**가 들어오는 첫 게임이다. 판에 정답이 들어 있는데 그 판을 손님에게
 * 통째로 보내면 화면이 안 그려도 값은 이미 건너간다 — 그래서 `redact` 가 있다.
 * 카드 게임 전부가 이 자리를 쓴다(남의 패는 남의 것이다).
 *
 * 서로 **다른 정답**을 하나씩 받고 같은 수의 기회를 쓴다. 먼저 맞힌 사람이 이기고,
 * 아무도 못 맞히면 더 가까이 간 사람이 이긴다. 차례가 없다 — 동시에 푼다.
 */
import type { GameDef, GameCtx, BotMove, Outcome } from '../types';
import { shuffle } from '../rng';

/** 자릿수. 3자리 = 열 번이면 사람이 풀 수 있고, 봇도 억지스럽지 않다. */
const DIGITS = 3;
const TRIES = 10;

export interface Try {
  guess: string;
  /** 자리·숫자 다 맞음 */
  hit: number;
  /** 숫자는 있는데 자리가 다름 */
  blow: number;
}

export interface HitBlowState {
  /** 자리별 정답. **남의 것은 `redact` 가 지운다** */
  secrets: string[];
  /** 자리별로 지금까지 던진 것 */
  tries: Try[][];
  /** 맞힌 자리 (아직이면 -1) */
  solved: number;
}

export type HitBlowAction = { guess: string };

/** 서로 다른 숫자 세 개. 같은 숫자가 겹치면 hit/blow 셈이 헷갈린다. */
function makeSecret(ctx: GameCtx): string {
  return shuffle(ctx.rng, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    .slice(0, DIGITS)
    .join('');
}

export function judge(secret: string, guess: string): Try {
  let hit = 0;
  let blow = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) hit++;
    else if (secret.includes(guess[i])) blow++;
  }
  return { guess, hit, blow };
}

const valid = (g: string): boolean =>
  typeof g === 'string' && g.length === DIGITS && /^[0-9]+$/.test(g) && new Set(g).size === DIGITS;

export const hitblow: GameDef<HitBlowState, HitBlowAction> = {
  id: 'hitblow',
  seats: [2, 4],
  rounds: 1,

  init(ctx) {
    return {
      secrets: ctx.seats.map(() => makeSecret(ctx)),
      tries: ctx.seats.map(() => []),
      solved: -1
    };
  },

  /** 남의 정답은 안 보낸다. 내 것도 안 보낸다 — 내가 맞혀야 하는 수다. */
  redact(s) {
    return { ...s, secrets: s.secrets.map(() => '') };
  },

  canAct(s, seat) {
    return s.solved === -1 && (s.tries[seat]?.length ?? 0) < TRIES;
  },

  reduce(s, a, seat) {
    if (s.solved !== -1) return s;
    if (!s.tries[seat] || s.tries[seat].length >= TRIES) return s;
    if (!valid(a?.guess)) return s;
    /* 같은 수를 두 번 던지는 것은 기회 낭비지 반칙이 아니다 — 막지 않는다. */
    const r = judge(s.secrets[seat], a.guess);
    const tries = s.tries.map((t, i) => (i === seat ? [...t, r] : t));
    return { ...s, tries, solved: r.hit === DIGITS ? seat : -1 };
  },

  outcome(s, ctx): Outcome {
    const allDone = s.tries.every((t) => t.length >= TRIES);
    if (s.solved === -1 && !allDone) return { over: false };

    if (s.solved !== -1) {
      return {
        over: true,
        scores: ctx.seats.map((_, i) => (i === s.solved ? 1 : 0)),
        note: {
          key: 'arcade.hitblow.solved',
          params: { who: ctx.seats[s.solved]?.name ?? '', n: String(s.tries[s.solved].length) }
        }
      };
    }

    /* 아무도 못 맞혔다 — 마지막에 제일 가까이 간 사람. 그것도 같으면 아무도 못 가져간다. */
    const best = s.tries.map((t) => Math.max(0, ...t.map((r) => r.hit * 2 + r.blow)));
    const top = Math.max(...best);
    const winners = best.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
    if (winners.length === ctx.seats.length) {
      return { over: true, scores: ctx.seats.map(() => 0), note: { key: 'arcade.hitblow.none' } };
    }
    return {
      over: true,
      scores: ctx.seats.map((_, i) => (winners.includes(i) ? 1 : 0)),
      note: {
        key: 'arcade.hitblow.closest',
        params: { who: winners.map((i) => ctx.seats[i]?.name ?? '').join(', ') }
      }
    };
  },

  bot(s, seat): BotMove<HitBlowAction> | null {
    if (s.solved !== -1) return null;
    const mine = s.tries[seat] ?? [];
    if (mine.length >= TRIES) return null;

    /* 봇은 정답을 안 본다 — 자기가 던진 것의 답만 보고 좁힌다(사람과 같은 조건).
     * 후보를 전부 세지 않고 **지금까지의 답과 어긋나지 않는 수**를 몇 번 뽑아 본다. */
    const fits = (cand: string): boolean =>
      mine.every((r) => {
        const j = judge(cand, r.guess);
        return j.hit === r.hit && j.blow === r.blow;
      });

    let pick = '';
    for (let n = 0; n < 400 && !pick; n++) {
      const c = shuffle(Math.random, ['0','1','2','3','4','5','6','7','8','9']).slice(0, DIGITS).join('');
      if (new Set(c).size === DIGITS && fits(c)) pick = c;
    }
    if (!pick) return null;
    return { action: { guess: pick }, delayMs: 1200 + Math.random() * 1400 };
  }
};
