/**
 * lib/graph/canvas-edge.ts — 선 하나를 그리는 일 (TASK-KL-202 방향① 해체 6조각).
 *
 * 「무슨 색·굵기·모양인가」는 **이미 정해져서** 여기로 온다(선 자체 > 종류 정의 > 테마 순서로
 * 고르는 일은 캔버스가 한다). 여기서는 그 값으로 path 하나를 만들 뿐이다.
 *
 * 이 갈라놓기가 값을 하는 자리: 새 선 모양(물결·금 간 선 …)을 더할 때 고칠 곳이 한 군데다.
 */
import type { EdgeStyle } from './spec';
import { wobblePath } from './canvas-math';
import type { Pt } from './canvas-math';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface EdgeLook {
  style: EdgeStyle;
  color: string;
  width: number;
  arrowEnd: boolean;
  arrowStart: boolean;
}

export function buildEdgePath(
  edgeId: string,
  g: { p1: Pt; c1: Pt; c2: Pt; p2: Pt },
  look: EdgeLook,
): SVGPathElement {
  const { p1, c1, c2, p2 } = g;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'ck-edge');
  path.dataset.edgeId = edgeId;

  const wobbly = look.style === 'wavy' || look.style === 'crack';
  // 흔들림의 잘기는 **선 길이**에 맞춘다 — 짧은 선을 촘촘히 흔들면 뭉개진다.
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const steps = Math.max(12, Math.min(120, Math.round(dist / (look.style === 'wavy' ? 6 : 12))));
  path.setAttribute(
    'd',
    wobbly
      ? wobblePath(g, look.style as 'wavy' | 'crack', { steps, amp: look.style === 'wavy' ? 3.5 : 5 })
      : `M ${p1.x},${p1.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`,
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', look.color);
  path.setAttribute('stroke-width', String(look.width));
  path.setAttribute('stroke-opacity', '0.7');
  if (look.style === 'crack') path.setAttribute('stroke-linejoin', 'miter');
  if (look.style === 'dashed') path.setAttribute('stroke-dasharray', '6 3');
  else if (look.style === 'dotted') path.setAttribute('stroke-dasharray', '2 3');
  if (look.arrowEnd) path.setAttribute('marker-end', 'url(#ck-arrow)');
  if (look.arrowStart) path.setAttribute('marker-start', 'url(#ck-arrow-start)');
  return path;
}
