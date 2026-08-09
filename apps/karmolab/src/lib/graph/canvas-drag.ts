/**
 * lib/graph/canvas-drag.ts — **끌면 어디로 가나** (TASK-KL-202 방향① 입력 조각 4).
 *
 * 화면에서 손이 100px 움직여도 판이 두 배로 확대돼 있으면 판 위에서는 50 만 움직여야 한다.
 * 그리고 격자에 붙일 때 **무엇을 붙이느냐가 규칙이다**:
 *   - 카드 하나 = 그 카드를 붙인다.
 *   - 묶음 = **묶음의 기준점을 붙이고, 거기서 나온 이동량을 멤버 전원에게 그대로 얹는다.**
 *     멤버를 각자 붙이면 서로의 간격이 매번 조금씩 달라져 **모양이 뭉개진다** — 이게 이 파일의 핵심이다.
 */

export interface Delta {
  dx: number;
  dy: number;
}

/** 화면에서 움직인 거리를 판 위 거리로. 확대돼 있을수록 적게 움직인다. */
export function worldDelta(
  start: { x: number; y: number },
  now: { x: number; y: number },
  scale: number,
): Delta {
  const s = scale || 1;
  return { dx: (now.x - start.x) / s, dy: (now.y - start.y) / s };
}

/** 카드 하나를 끌 때 — 새 자리를 격자에 붙인다. */
export function snappedPoint(
  startX: number,
  startY: number,
  d: Delta,
  snap: (v: number) => number,
): { x: number; y: number } {
  return { x: snap(startX + d.dx), y: snap(startY + d.dy) };
}

/**
 * 묶음을 끌 때 — **기준점만** 격자에 붙이고 그 차이를 이동량으로 쓴다.
 * 그래서 멤버끼리의 간격은 끄는 내내 한 픽셀도 안 변한다(모양이 안 뭉개진다).
 */
export function groupDelta(
  startGroupX: number,
  startGroupY: number,
  raw: Delta,
  snap: (v: number) => number,
): { d: Delta; origin: { x: number; y: number } } {
  const gx = snap(startGroupX + raw.dx);
  const gy = snap(startGroupY + raw.dy);
  return { d: { dx: gx - startGroupX, dy: gy - startGroupY }, origin: { x: gx, y: gy } };
}

/** 카드 최소 크기 — 이보다 작으면 글자도 손잡이도 안 들어가 「지운 것」처럼 보인다. */
export const MIN_NODE_W = 60;
export const MIN_NODE_H = 32;

export function resizedBox(
  startW: number,
  startH: number,
  d: Delta,
): { w: number; h: number } {
  return {
    w: Math.max(MIN_NODE_W, Math.round(startW + d.dx)),
    h: Math.max(MIN_NODE_H, Math.round(startH + d.dy)),
  };
}
