/**
 * lib/graph/canvas-release.ts — **손을 떼면 무슨 뜻인가** (TASK-KL-202 방향① 해체: 입력 조각 2).
 *
 * 누를 때의 뜻은 `canvas-press` 가 정한다. 뗄 때 남는 판단은 세 가지다:
 *   ① 끈 것인가 그냥 누른 것인가 (= 클릭) — **손가락은 마우스보다 훨씬 흔들린다**
 *   ② 선 끝을 옮겨 놓은 자리가 쓸 만한가 (자기 자신·반대편과 같으면 선이 사라진 것처럼 보인다)
 *   ③ 카드를 다른 카드 **위에** 떨어뜨렸나 (그러면 잇는다)
 *
 * 셋 다 좌표와 숫자만 있으면 정해진다 — 브라우저 없이 시험할 수 있다는 뜻이다.
 */

/** 마우스는 4px 만 흔들려도 사람이 「끌었다」고 느끼지만, **손가락은 그 정도로 늘 흔들린다**. */
export const CLICK_SLOP_MOUSE = 4;
export const CLICK_SLOP_TOUCH = 12;

export function clickSlopFor(pointerType?: string): number {
  return pointerType === 'touch' || pointerType === 'pen' ? CLICK_SLOP_TOUCH : CLICK_SLOP_MOUSE;
}

export interface PressOrigin {
  x: number;
  y: number;
  nodeId: string | null;
}

export type ReleaseIntent =
  | { kind: 'click-node'; nodeId: string }
  | { kind: 'click-edge'; edgeId: string }
  | { kind: 'click-background' }
  | { kind: 'drag-end' };

/**
 * 뗀 자리가 누른 자리에서 얼마 안 움직였으면 **클릭**이다. 카드 > 선 > 배경 순으로 읽는다 —
 * 카드 위에서 손을 뗐는데 그 밑을 지나는 선이 골라지면 「엉뚱한 게 열린다」가 된다.
 */
export function releaseIntent(
  origin: PressOrigin | null,
  up: { x: number; y: number; pointerType?: string },
  ctx: { pressEdgeId?: string | null; panning?: boolean },
): ReleaseIntent {
  if (!origin) return { kind: 'drag-end' };
  const moved = Math.hypot(up.x - origin.x, up.y - origin.y);
  if (moved >= clickSlopFor(up.pointerType)) return { kind: 'drag-end' };
  if (origin.nodeId) return { kind: 'click-node', nodeId: origin.nodeId };
  if (ctx.pressEdgeId) return { kind: 'click-edge', edgeId: ctx.pressEdgeId };
  // 배경 클릭은 **밀기로 잡고 있었을 때만**. 묶음·범위 고르기 뒤에 고른 것이 풀리면 억울하다.
  if (ctx.panning) return { kind: 'click-background' };
  return { kind: 'drag-end' };
}

/** 선 끝을 여기에 놓아도 되나 — 빈 자리 / 반대편과 같은 카드면 되돌린다(선이 증발한 것처럼 보인다). */
export function canRewireTo(dropId: string, otherEndId: string): boolean {
  return !!dropId && dropId !== otherEndId;
}

/** 카드를 카드 위에 떨어뜨린 것인가 — 자기 자신 위, 그리고 「누른 것뿐」이면 아니다. */
export function isDropOnNode(
  draggedId: string,
  overId: string,
  movedPx: number,
  pointerType?: string,
): boolean {
  if (movedPx < clickSlopFor(pointerType)) return false;
  return !!overId && overId !== draggedId;
}
