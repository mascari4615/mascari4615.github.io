/**
 * big-board.ts — **판이 커졌을 때 덜 보자고 권하는 자리** (TASK-KL-271 L1).
 *
 * 관계도는 어느 선을 넘으면 털뭉치가 된다. Obsidian 그래프 뷰를 두고 오래 오간 논쟁의 결론이
 * 그것이었다 — 200개 넘으면 전체 그림은 아무 말도 안 하고, 실제로 쓰이는 건 **지금 것의 이웃만**
 * 보는 화면(local graph)이다.
 *
 * ★ 그렇다고 **말없이 감추지는 않는다.** 적어 둔 카드가 소리 없이 사라지면 「내 것이 없어졌다」가
 *   된다 — 도구가 저지를 수 있는 가장 나쁜 짓이다. 그래서 기본값을 바꾸는 대신 **한 줄로 권한다**:
 *   누르면 둘레만 보이고, 그 자리에서 되돌릴 수 있다(거르기 칸에 그대로 남는다).
 *
 * 언제 권할지는 눈으로 못 재는 셈이라 여기 순수 함수로 둔다.
 */

/**
 * 이 수를 넘으면 「전부 보기」가 더는 쓸모 있는 화면이 아니다.
 * 50 = 1440px 화면에서 카드가 서로 겹치기 시작하는 언저리(실측 아닌 어림 — 넘으면 권하기만 한다).
 */
export const CROWD_AT = 50;

/**
 * 지금 「둘레만 보기」를 권할 자리인가.
 *
 * @param nodeCount 판에 있는 카드 수
 * @param focusOn 이미 둘레만 보는 중인가(그렇다면 또 권하면 잔소리다)
 * @param hasSelection 고른 카드가 있나 — 「무엇의 둘레」인지 없으면 권해도 할 수 있는 게 없다
 */
export function shouldOfferFocus(nodeCount: number, focusOn: boolean, hasSelection: boolean): boolean {
  return nodeCount > CROWD_AT && !focusOn && hasSelection;
}
