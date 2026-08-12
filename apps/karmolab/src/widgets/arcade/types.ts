/**
 * 오락실 커널 — 게임 하나가 지켜야 할 모양 (TASK-KL-242)
 *
 * 미니게임을 51개 만들려면 게임을 51번 짜는 게 아니라 **커널 하나 + 게임 파일 51개**여야 한다.
 * 그래서 이 파일이 정하는 것은 딱 하나다: 「게임이란 무엇인가」.
 *
 * 지키는 것 넷:
 *  ① **게임은 순수하다.** `reduce` 는 화면도 그물망도 모른다 — 상태와 수를 받아 상태를 낸다.
 *     그래야 51개를 전부 vitest 로 돌려 볼 수 있다(사람 손 없이).
 *  ② **혼자와 여럿이 같은 코드다.** 사람이 안 앉은 자리는 봇이 앉는다. 「싱글 모드」라는 갈래가
 *     따로 없다 — 갈래를 두면 51번을 두 번 짜게 된다.
 *  ③ **모든 무작위는 씨앗에서 나온다.** 같은 씨앗 = 같은 판. 그래야 여럿이 같은 문제를 보고,
 *     터진 판을 그대로 되살려 볼 수 있다.
 *  ④ **판정은 한 곳에서만.** 방을 만든 쪽이 `reduce` 를 돌리고 결과만 흘려보낸다. 양쪽이 각자
 *     재면 시계가 달라 승부가 안 갈린다(번개 대결에서 이미 겪었다).
 */

/** 자리에 앉은 사람(또는 봇) 하나. */
export interface Seat {
  /** 이 판에서만 쓰는 자리 번호 (0부터) */
  index: number;
  /** 보여줄 이름 */
  name: string;
  /** 사람이 안 앉은 자리 = 봇이 앉는다 */
  bot: boolean;
  /** 판을 넘어 쌓이는 점수 (라운드제 게임용) */
  score: number;
}

/** 게임이 볼 수 있는 판의 바깥 사정. */
export interface GameCtx {
  seats: readonly Seat[];
  /** 씨앗에서 나온 난수. 게임 안에서 `Math.random` 을 부르면 판이 갈라진다 */
  rng: () => number;
  /** 판이 시작된 뒤 흐른 밀리초 (실제 시계가 아니라 커널이 준 값 — 테스트가 이걸 밀어 준다) */
  now: number;
  /** 몇 번째 판인가 (0부터). 판이 갈수록 어려워지는 게임이 이걸 읽는다 */
  round: number;
}

/** 봇이 두려는 수와, 언제 둘지. 즉시 두면 사람은 늘 진다. */
export interface BotMove<A> {
  action: A;
  /** 지금부터 이만큼 뒤에 둔다 (기본 0) */
  delayMs?: number;
}

/** 화면이 옮겨 적을 한 줄 — 열쇠와 넣을 값. */
export interface Note {
  key: string;
  params?: Record<string, string>;
}

/** 판이 끝났는지, 그리고 이번 판 점수. */
export interface Outcome {
  over: boolean;
  /** 자리별 이번 판 점수. 없으면 점수 변화 없음 */
  scores?: number[];
  /**
   * 화면에 띄울 한 줄. **글자가 아니라 말 묶음 열쇠**다 — 규칙 파일에 한국어가 들어가면
   * 같은 게임이 세 나라 말로 못 돈다.
   */
  note?: Note;
}

/**
 * 게임 하나. 51개가 전부 이 모양이면 커널은 51개를 구분할 필요가 없다.
 *
 * `S` = 판의 상태, `A` = 한 수.
 */
export interface GameDef<S, A> {
  id: string;
  /** 앉을 수 있는 사람 수 [최소, 최대]. 최소보다 적으면 봇으로 채운다 */
  seats: [min: number, max: number];
  /** 몇 판을 하나. 보드류처럼 한 판이면 1 */
  rounds: number;
  /** 이 게임이 시간을 쓰나 — 쓰면 커널이 `tick` 을 계속 불러 준다 */
  realtime?: boolean;

  init(ctx: GameCtx): S;

  /**
   * 한 수. **못 두는 수면 상태를 그대로 돌려준다** (예외를 던지지 X —
   * 그물망 너머에서 이상한 수가 오는 것은 사고가 아니라 정상이다).
   */
  reduce(s: S, action: A, seat: number, ctx: GameCtx): S;

  /** 시간이 흐르기만 해도 바뀌는 게임 (제한시간·낙하 등). `realtime` 일 때만 불린다 */
  tick?(s: S, ctx: GameCtx): S;

  outcome(s: S, ctx: GameCtx): Outcome;

  /** 봇의 수. 아직 둘 때가 아니면 null */
  bot(s: S, seat: number, ctx: GameCtx): BotMove<A> | null;

  /** 지금 이 자리가 둘 차례인가 (동시에 두는 게임이면 늘 true) */
  canAct?(s: S, seat: number): boolean;
}
