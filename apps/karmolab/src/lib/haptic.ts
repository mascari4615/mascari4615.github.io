/**
 * 손끝의 신호. 짧게 떨린다 (TASK-KL-264 C4)
 *
 * 폰에서는 소리를 끄고 노는 사람이 많다(지하철, 회의 중). 그때 눌렸다, 맞혔다, 졌다를 알려 줄
 * 길이 화면뿐이면, 눈이 판에 가 있는 순간의 알림은 통째로 사라진다. 진동은 눈을 안 뺏는다.
 *
 * 규율:
 *  ① **짧게.** 20~40ms. 길면 알림이 아니라 방해다.
 *  ② **소리 스위치를 따라간다**. 두 개의 스위치를 두면 아무도 안 쓴다. 알림 끄기는 하나다.
 *  ③ **안 되면 조용히 넘어간다.** iOS 사파리는 `vibrate` 가 없다. 부르는 쪽이 신경 쓸 일이 아니다.
 */
import { soundOn } from './blip';

/** 소리와 같은 말을 쓴다. 부르는 쪽이 두 벌을 외우지 않게. */
export type Buzz = 'tap' | 'good' | 'bad' | 'win' | 'lose';

/* 이긴 것만 두 번 떤다. 나머지는 한 번. 진동은 길이가 아니라 **횟수**로 구분된다. */
const SHAPES: Record<Buzz, number | number[]> = {
  tap: 12,
  good: 22,
  bad: [18, 40, 18],
  win: [26, 60, 26],
  lose: 45
};

export function buzz(kind: Buzz): void {
  if (!soundOn()) return;
  try {
    navigator.vibrate?.(SHAPES[kind]);
  } catch {
    /* 못 떨어도 판은 돈다 */
  }
}
