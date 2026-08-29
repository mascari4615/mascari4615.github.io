/**
 * 판을 되살린다. 씨앗 하나와 누른 것 몇 줄 (TASK-KL-264 코어)
 *
 * 커널이 결정적이 되고 나서야 가능해진 것이다. 화면도 그물망도 안 쓰고, 시계는 커널이 제
 * 칸으로 옮기며, 봇의 난수는 씨앗에서 나온다. 그래서 **판을 저장할 필요가 없다.**
 * 씨앗과 누가 언제 무엇을 눌렀나만 있으면 판 전체가 다시 만들어진다.
 *
 * 한 판의 크기: 오목 서른 수 = 30줄 남짓. 판 자체를 프레임마다 저장하면 수백 KB다.
 *
 * 이 받침 위에 서는 것들:
 *  - **고스트**. 어제의 나와 나란히 (A3)
 *  - **버그 재현**. 이 판에서 이랬다를 글자 몇 줄로 주고받는다
 *  - **되감기 관전**. 구경꾼이 판을 앞뒤로 옮긴다
 *  - **비동기 턴제**. 방 없이 수 목록만 주고받으면 된다 (D5)
 *
 * 봇의 수는 **안 적는다.** 적으면 두 벌이 되고, 두 벌은 언젠가 갈린다. 커널이 같은 씨앗에서
 * 똑같이 만들어 내는 것을 굳이 받아 적을 이유가 없다.
 */
import { Match, type SeatSpec } from './kernel';
import type { GameDef } from './types';

/** 한 판을 되살리는 데 필요한 전부. */
export interface Tape<A> {
  /** 어느 놀이인가 */
  game: string;
  seed: number;
  seats: SeatSpec[];
  /** 사람이 누른 것 (커널 시계 기준) */
  moves: Array<{ at: number; seat: number; action: A }>;
  /** 판이 끝난 시각 */
  end: number;
}

export function record<S, A>(game: GameDef<S, A>, match: Match<S, A>, seats: SeatSpec[], seed: number): Tape<A> {
  return { game: game.id, seed, seats, moves: [...match.tape], end: match.clock() };
}

/**
 * 되살린다. 커널을 처음부터 다시 굴리되, 적어 둔 시각에 그 수를 다시 넣는다.
 *
 * `onFrame` 을 주면 칸마다 부른다. 고스트나 되감기는 그 사이 판을 봐야 한다.
 * 안 주면 끝까지 한 번에 굴린다(재현, 검사용).
 */
export function playback<S, A>(
  game: GameDef<S, A>,
  tape: Tape<A>,
  onFrame?: (m: Match<S, A>) => void
): Match<S, A> {
  const m = new Match(game, tape.seed, tape.seats);
  /**
   * **커널의 시계에 맞춰 넣는다.** 이 시각 이하로 넣으면 한 칸씩 어긋난 판이 나온다 . 
   * 적을 때의 시각은 *그 직전 칸*의 값이라, 재생 쪽이 칸을 먼저 옮기면 수가 한 칸 늦게 들어간다.
   * 실제로 셋(반응 측정, 경매, 기억 순서)이 그렇게 어긋났다. 시계가 그 값일 때 넣으면 어긋남이 없다.
   */
  let i = 0;
  const STEP = 16;
  for (let guard = 0; guard < 200000; guard++) {
    while (i < tape.moves.length && tape.moves[i].at <= m.clock()) {
      const mv = tape.moves[i++];
      m.dispatch(mv.seat, mv.action);
    }
    m.step(m.clock() + STEP);
    onFrame?.(m);
    if (m.view().finished) break;
    if (m.clock() > tape.end + STEP && i >= tape.moves.length) break;
  }
  return m;
}

/** 되살린 판이 원래 판과 같은가. 검사와 이 판 이상하다 신고에 쓴다. */
export function sameAs<S, A>(a: Match<S, A>, b: Match<S, A>): boolean {
  const strip = (m: Match<S, A>): string =>
    JSON.stringify({ state: m.view().state, scores: m.view().seats.map((s) => s.score), fin: m.view().finished });
  return strip(a) === strip(b);
}
