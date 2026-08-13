/**
 * history.ts — **되돌리기 더미의 크기 규칙** (TASK-KL-271 M4 / C4).
 *
 * 되돌리기는 판을 통째로 찍어 쌓는다(델타가 아니다). 그 대가로 「어떤 편집이든 되돌아간다」가
 * 공짜지만, **판 하나가 커지면 그대로 예순 배**가 된다 — 카드에 사진(그림 글자)이 붙는 순간
 * 판 하나가 수 MB 가 되고, 그때 예순 판이면 브라우저 한 탭이 수백 MB 를 든다.
 *
 * 그래서 **판 수가 아니라 무게로 자른다.** 가벼운 판이면 예순 판을 다 들고, 무거우면 몇 판만
 * 든다 — 어느 쪽이든 더미 전체는 상한 아래다. 되돌리기가 「몇 걸음까지」인지가 판마다 달라지는
 * 대신, 무거운 판에서 탭이 죽는 일이 없다(죽으면 되돌리기가 아니라 작업 전체를 잃는다).
 *
 * 이 규칙만 순수 함수로 떼어 둔다 — 위젯 안 클로저에 있으면 「예순이 맞나」를 눈으로 못 본다.
 */

/** 더미 전체 상한. 한 판이 이보다 크면 그 한 판만 든다(그것마저 못 들면 되돌리기가 없다). */
export const HISTORY_MAX_BYTES = 24 * 1024 * 1024;
/** 무게와 상관없이 이보다 많이 쌓지는 않는다 — 잘게 고치는 판에서 더미가 끝없이 길어지지 않게. */
export const HISTORY_MAX_STEPS = 60;

/** 글자 수를 바이트로 어림한다 — 정확한 UTF-8 계산보다 싸고, 자르는 데는 이 정도면 된다. */
export function roughBytes(s: string): number {
  return s.length * 2;
}

/**
 * 새 판을 얹은 **뒤** 앞쪽에서 몇 판을 버려야 하는지 센다.
 *
 * @param sizes 더미에 든 판들의 무게(오래된 것이 앞)
 * @returns 앞에서 버릴 판 수 (0 이면 그대로 둔다)
 */
export function dropFromFront(sizes: number[]): number {
  let drop = 0;
  let total = sizes.reduce((a, b) => a + b, 0);
  // 수가 넘치면 먼저 수부터 맞춘다.
  while (sizes.length - drop > HISTORY_MAX_STEPS) {
    total -= sizes[drop];
    drop += 1;
  }
  // 그다음 무게. **마지막 한 판은 안 버린다** — 그것까지 버리면 방금 한 일도 못 되돌린다.
  while (total > HISTORY_MAX_BYTES && sizes.length - drop > 1) {
    total -= sizes[drop];
    drop += 1;
  }
  return drop;
}
