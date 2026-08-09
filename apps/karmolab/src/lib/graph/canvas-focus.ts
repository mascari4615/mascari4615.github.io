/**
 * lib/graph/canvas-focus.ts — **볼 것만 또렷하게** (TASK-KL-202 방향① 해체 15조각).
 *
 * 포커스는 지우는 게 아니라 **흐리게 하는** 일이다. 규칙 셋을 여기 모았다:
 *  - 고른 것 밖의 카드는 흐려진다.
 *  - 선은 **양끝이 다 또렷할 때만** 또렷하다 — 한쪽만 남은 선은 어디로 가는지 모를 선이라 소음이다.
 *  - 메모 지시선은 포커스 중에는 전부 흐린다(설명 위의 설명이라 두 겹으로 시끄럽다).
 */

export function applyFocusClasses(
  nodeLayer: SVGGElement,
  edgeLayer: SVGGElement,
  focusIds: Set<string> | null,
  edgeEnds: (edgeId: string) => { from: string; to: string } | null,
): void {
  nodeLayer.querySelectorAll('.ck-node').forEach((el) => {
    const g = el as SVGGElement;
    g.classList.toggle('is-dimmed', !!focusIds && !focusIds.has(g.dataset.id ?? ''));
  });

  const bothInFocus = (edgeId: string): boolean => {
    if (!focusIds) return true;
    const ends = edgeEnds(edgeId);
    if (!ends) return true;
    return focusIds.has(ends.from) && focusIds.has(ends.to);
  };
  edgeLayer.querySelectorAll('.ck-edge, .ck-edge-label, .ck-edge-grip, .ck-edge-end').forEach((el) => {
    const node = el as SVGElement & { dataset: DOMStringMap };
    node.classList.toggle('is-dimmed', !!focusIds && !bothInFocus(node.dataset.edgeId ?? ''));
  });
  edgeLayer.querySelectorAll('.ck-leader').forEach((el) => {
    (el as SVGElement).classList.toggle('is-dimmed', !!focusIds);
  });
}
