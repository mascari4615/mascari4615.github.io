/**
 * 어제의 나. **고스트는 봇의 한 종류다** (TASK-KL-264 A3)
 *
 * 새 기능으로 안 만든다. 자리 하나를 차지하고 수를 내는 것이면 그건 이미 봇이다 . 
 * 봇으로 만들면 자리, 점수, 결과 화면, 대회 셈이 **전부 그대로** 쓰이고, 게임 파일 51개는
 * 아무것도 몰라도 된다. `bots.ts` 의 세기 씌우기와 같은 자리, 같은 모양이다.
 *
 * 고스트가 내는 수 = 지난번 내 판의 기록(`replay.ts` 의 tape). 커널이 결정적이라 그 수를
 * 그때 그 시각에 다시 내면 **그때의 나**가 옆자리에서 다시 논다.
 *
 * 자리를 안 세는 이유: 기록은 몇 번 자리에서 눌렀나를 담지만 고스트는 다른 자리에 앉는다.
 * 그래서 자리는 버리고 **시각과 수만** 가져다 쓴다. 점수형 놀이(제기, 투호, 두더지)에서는
 * 자리가 서로에게 영향을 안 주므로 그대로 성립한다.
 *
 * 되짚는 자리(cursor)를 안 둔다. 커널은 `bot()` 을 한 판에 수백 번 부르고 그중 무엇이 실제로
 * 두어졌는지 알려 주지 않는다. 세어 두면 어긋난다. 대신 **매번 지금 이후 첫 수를 찾는다**:
 * 늦게 두어졌으면 저절로 다음 수로 넘어가고, 상태를 안 들고 있으니 어긋날 것도 없다.
 */
import type { GameDef, BotMove, GameCtx } from './types';

export interface GhostTape<A> {
  /** 그때 낸 점수. 화면에 어제 12개로 적는다 */
  score: number;
  /** 언제 세운 기록인가 (epoch ms) */
  at: number;
  moves: Array<{ at: number; action: A }>;
}

/** 고스트 자리의 이름. 봇 이름 자리에 그대로 들어간다. */
export const GHOST_NAME = '어제의 나';

/**
 * 한 자리를 고스트로 바꾼다. 나머지 자리는 원래 봇 그대로다.
 *
 * 기록이 다 떨어지면 그 자리는 **가만히 있는다**(null). 아무 수나 지어내면 그건 어제의
 * 내가 아니라 그냥 봇이고, 옆에 두는 뜻이 사라진다.
 */
export function withGhost<S, A>(game: GameDef<S, A>, seat: number, tape: GhostTape<A>): GameDef<S, A> {
  return {
    ...game,
    bot(s: S, at: number, ctx: GameCtx): BotMove<A> | null {
      if (at !== seat) return game.bot(s, at, ctx);
      const next = tape.moves.find((m) => m.at >= ctx.now);
      if (!next) return null;
      return { action: next.action, delayMs: Math.max(0, next.at - ctx.now) };
    }
  };
}
