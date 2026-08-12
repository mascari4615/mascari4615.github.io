/**
 * 같이 노는 사람들 — 봇에게 이름과 버릇을 준다 (TASK-KL-264)
 *
 * 지금까지 빈 자리는 「봇 1」·「봇 2」였다. 그건 자리를 채운 것이지 **같이 논 것이 아니다.**
 * 사람은 상대가 누구인지 알면 판을 다르게 기억한다 — 「또 걔한테 졌다」가 되려면 걔가 있어야 한다.
 *
 * 두 가지를 여기서 준다:
 *  - **이름**: 연구실 사람들. 한 방에서 같은 이름이 둘 나오지 않는다.
 *  - **손버릇**: 봇마다 손이 빠르거나 굼뜨다(0.7~1.4배). 이름과 함께 판 내내 유지된다 —
 *    「저 친구는 늘 먼저 지른다」가 성립해야 성격이다.
 *
 * 그리고 **세기 3단**. 정직하게 말하면 이건 *손 빠르기*지 머리가 아니다 — 게임 51개의 수읽기를
 * 바깥에서 바꿀 방법은 없고(그건 게임마다 다른 것이다), 있는 척하면 거짓말이 된다. 대신 이
 * 오락실의 절반은 실시간이라 **빠르기가 곧 강함**이다. 화면에도 그렇게 적는다.
 *
 * 게임 파일은 이 파일을 모른다. 규칙 겉에 한 겹 씌우는 것이라 51개가 한꺼번에 얻는다.
 */
import type { GameDef, BotMove, GameCtx } from './types';

/** 연구실 사람들. 이름은 어느 말로 열어도 같다 — 사람 이름이니까. */
const NAMES = [
  '두부', '나비', '깜냥', '토리', '방울', '단추', '쿠키', '바람',
  '초코', '몽이', '별이', '구름', '가지', '노을', '이슬', '까치'
];

export type BotLevel = 'mild' | 'normal' | 'spicy';

/** 세기별 손 빠르기. 1보다 크면 더 오래 뜸 들인다. */
const TEMPO: Record<BotLevel, number> = { mild: 1.7, normal: 1, spicy: 0.55 };

export interface BotPersona {
  name: string;
  /** 이 봇만의 손버릇 — 1보다 크면 굼뜨다 */
  haste: number;
}

/** 한 방에 앉을 봇들을 뽑는다. 이름은 안 겹친다. */
export function pickBots(n: number, rng: () => number = Math.random): BotPersona[] {
  const pool = [...NAMES];
  const out: BotPersona[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const at = Math.floor(rng() * pool.length);
    out.push({ name: pool.splice(at, 1)[0], haste: 0.7 + rng() * 0.7 });
  }
  return out;
}

/**
 * 규칙 겉에 한 겹 씌워 **봇의 뜸 들이는 시간만** 바꾼다. 무엇을 둘지는 안 건드린다 —
 * 그건 게임이 아는 것이고, 바깥에서 아는 척하면 51개 중 어딘가는 반드시 망가진다.
 *
 * 아주 짧은 뜸(50ms 아래)은 그대로 둔다. 그건 「생각하는 척」이 아니라 그 게임의 박자다.
 */
export function withBotLevel<S, A>(
  game: GameDef<S, A>,
  level: BotLevel,
  personas: Record<number, BotPersona>
): GameDef<S, A> {
  const k = TEMPO[level];
  if (k === 1 && !Object.keys(personas).length) return game;
  return {
    ...game,
    bot(s: S, seat: number, ctx: GameCtx): BotMove<A> | null {
      const mv = game.bot(s, seat, ctx);
      if (!mv) return null;
      const wait = mv.delayMs ?? 0;
      if (wait < 50) return mv;
      return { ...mv, delayMs: wait * k * (personas[seat]?.haste ?? 1) };
    }
  };
}
