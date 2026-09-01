/**
 * 어제의 나. **고스트는 봇의 한 종류다** (TASK-KL-264 A3)
 *
 * 새 기능으로 안 만든다. 자리 하나를 차지하고 수를 내는 것이면 그건 이미 봇이다 .
 * 봇으로 만들면 자리, 점수, 결과 화면, 대회 셈이 **전부 그대로** 쓰이고, 게임 파일 51개는
 * 아무것도 몰라도 된다. `bots.ts` 의 세기 씌우기와 같은 자리, 같은 모양이다.
 *
 * 고스트가 내는 수 = 지난번 내 판의 기록(`replay.ts` 의 tape). 커널이 결정적이라 그 수를
 * 다시 내면 **그때의 나**가 옆자리에서 다시 놈
 *
 * 자리를 안 세는 이유: 기록은 몇 번 자리에서 눌렀나를 담지만 고스트는 다른 자리에 앉는다.
 * 그래서 자리는 버리고 **수만** 가져다 씀
 *
 * ## 무엇으로 다음 수를 고르나. 놀이 종류가 가른다 (2026-09-01)
 *
 * - **점수형**(`realtime`, `clocked`. 제기, 투호, 두더지): **시각으로**. 언제 눌렀나가 곧
 *   그 사람의 실력이라, 그 시각에 그 수가 나와야 어제의 나. 자리끼리 영향을 안 주므로
 *   기록이 떨어지면 그 자리는 가만히
 * - **차례제**(야추, 오목): **순서로**. 시각으로 고르면 두 판째부터 어긋난다. 봇 배속과
 *   사람 속도가 달라 커널 시계가 기록의 시계와 안 맞고, 그러면 아직 안 둔 수가 이미 지난
 *   것으로 취급돼 기록이 일찍 바닥남. 그때부터 이름은 어제의 나인데 두는 건 봇
 *   (사용자에게 하는 거짓말. 2026-08-31 야추 실측)
 *
 * ## 차례제에서 소비를 어떻게 아나
 *
 * 커널은 `bot()` 을 한 판에 수백 번 부르고 그중 무엇이 실제로 두어졌는지 안 알려 줌.
 * 그래서 부른 횟수로 세면 어긋난다. 대신 **내가 두겠다고 말한 시각이 지났는지**로 안다:
 * 커널은 `delayMs` 뒤에 그 수를 넣으므로, 그 시각을 지나 다시 물어 왔다면 앞의 수는 이미
 * 두어진 것. 안 두어졌다면 커널이 다시 물어 올 이유가 없음
 *
 * 되감기(복기의 Try Play)로 시계가 뒤로 가면 커서도 되돌림. 안 되돌리면 되감은 판에서
 * 고스트가 앞선 수부터 두어 딴 판이 됨
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
 * 차례제에서 한 수와 다음 수 사이. 기록의 간격을 쓰되 상한을 둠
 * - 어제 한참 뜸을 들인 자리에서 오늘도 그만큼 기다리면 판이 지루해짐
 * - 0 으로 두면 고스트만 순식간에 두어 사람이 따라 못 읽음
 */
const TURN_MIN_MS = 300;
const TURN_MAX_MS = 1500;

/**
 * 한 자리를 고스트로 바꾼다. 나머지 자리는 원래 봇 그대로다.
 *
 * 기록이 다 떨어지면 점수형 놀이에서는 그 자리가 **가만히**(null). 아무 수나 지어내면
 * 그건 어제의 내가 아니라 그냥 봇. 옆에 두는 뜻이 사라짐
 *
 * 차례를 주고받는 놀이는 다름. 그 자리가 멈추면 차례가 거기서 멈춰 **판이 안 끝남**.
 * 2026-08-31 야추 실측: 한 판 더로 들어간 두 판째가 고스트 자리에서 굳어, 남은 자리들이
 * 240초 동안 굴리기만 반복. 그래서 차례제 놀이는 기록이 떨어지면 원래 봇이 이어 앉음
 */
export function withGhost<S, A>(game: GameDef<S, A>, seat: number, tape: GhostTape<A>): GameDef<S, A> {
  const byClock = game.realtime === true || game.clocked === true;

  /* 차례제가 쓰는 자리. 몇 째 수까지 두었나와, 그 수를 두겠다고 말한 시각 */
  let cursor = 0;
  let playAt: number | null = null;
  /* 시계가 뒤로 가면 되감긴 판이다. 커서를 처음으로 */
  let lastNow = -1;

  return {
    ...game,
    bot(s: S, at: number, ctx: GameCtx): BotMove<A> | null {
      if (at !== seat) return game.bot(s, at, ctx);
      if (!byClock) {
        /* 차례제. 순서로 소비 */
        if (ctx.now < lastNow) {
          cursor = 0;
          playAt = null;
        }
        lastNow = ctx.now;
        if (playAt !== null && ctx.now >= playAt) {
          cursor += 1;
          playAt = null;
        }
        const next = tape.moves[cursor];
        if (!next) return game.bot(s, at, ctx);
        const prev = cursor > 0 ? tape.moves[cursor - 1].at : 0;
        const gap = Math.min(TURN_MAX_MS, Math.max(TURN_MIN_MS, next.at - prev));
        playAt = ctx.now + gap;
        return { action: next.action, delayMs: gap };
      }
      /* 점수형. 시각으로. 언제 눌렀나가 곧 그 사람 */
      const next = tape.moves.find((m) => m.at >= ctx.now);
      if (!next) return null;
      return { action: next.action, delayMs: Math.max(0, next.at - ctx.now) };
    }
  };
}
