/**
 * lib/graph/canvas-pick.ts — **겹쳐 있는 선 중에서 고르기** (TASK-KL-202 C-3-c).
 *
 * 같은 두 카드 사이에 선이 여럿이거나 선들이 한 자리를 지나가면, 누르는 자리에 선이 두세 개 겹친다.
 * 그때 위에 있는 선만 계속 잡히면 **아래 선은 영영 못 고른다** — 지울 수도, 이름을 고칠 수도 없다.
 * 그래서 Shift+클릭은 「같은 자리에서 **다음 선**」이다(포토샵·일러스트레이터의 겹친 개체 순환과 같은 몸짓).
 *
 * 규칙 하나가 중요하다: 마지막 선 다음은 **처음으로 돌아온다.** 끝에서 멈추면 사람은 그것이 끝인지
 * 고장인지 모른다.
 */

/**
 * 같은 자리에 겹친 것들 중 다음 것. 지금 고른 것이 그 자리에 없으면 맨 위(첫 번째)를 준다.
 */
export function nextOverlapping(idsUnderCursor: string[], currentId: string | null): string | null {
  const ids = idsUnderCursor.filter((v, i) => v && idsUnderCursor.indexOf(v) === i);
  if (ids.length === 0) return null;
  const at = currentId ? ids.indexOf(currentId) : -1;
  if (at < 0) return ids[0];
  return ids[(at + 1) % ids.length];
}
