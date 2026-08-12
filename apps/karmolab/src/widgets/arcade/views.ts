/**
 * 화면 쪽 약속 (TASK-KL-242)
 *
 * 게임은 화면을 모르고, 화면은 규칙을 모른다. 둘을 잇는 것은 이 좁은 구멍 하나다 —
 * **상태를 받아 그리고, 수를 밖으로 던진다.** 게임을 51개로 늘려도 이 구멍은 안 넓어진다.
 *
 * `mount` 가 그리기 함수를 돌려주는 모양인 이유: 화면 조각(버튼·격자)을 한 번만 만들어 두고
 * 그 뒤로는 값만 바꾸기 위해서다. 상태가 바뀔 때마다 통째로 다시 그리면 누르던 버튼이 사라진다.
 */
import type { MatchView } from './kernel';

export interface GameView<S, A> {
  id: string;
  mount(el: HTMLElement, act: (a: A) => void): Render<S>;
}

/**
 * `now` = **커널 시계**다(판이 시작된 뒤 흐른 ms). 화면이 `performance.now()` 를 따로 부르면
 * 커널과 화면이 서로 다른 시각을 믿게 되어 제한시간 막대가 판정과 어긋난다 — 시계는 하나다.
 */
export type Render<S> = (v: MatchView<S>, mySeat: number, now: number) => void;
