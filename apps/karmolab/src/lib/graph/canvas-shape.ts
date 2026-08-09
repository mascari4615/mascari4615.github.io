/**
 * lib/graph/canvas-shape.ts — 카드의 **바탕 모양** (TASK-KL-202 방향① 해체 5조각).
 *
 * 네모·동그라미·말풍선·쪽지·사진 카드. 여기서 중요한 규약 하나: 모양이 달라도 바깥에서 보는
 * 상자 크기는 같다. 선을 잇는 셈법이 상자 크기만 보고 있기 때문이다.
 */
import type { GraphNode, NodeShape } from './spec';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 노드 배경 도형. 모양이 달라도 **바깥에서 보는 상자 크기(w × effH)는 같다** —
 * 선 연결 계산이 모양마다 흔들리면 「동그라미로 바꿨더니 선이 빗나간다」가 된다.
 */
export function buildNodeBackground(
node: GraphNode,
effH: number,
kindColor: string,
shape: NodeShape,
fill: string,
): SVGElement {
  const stroke = kindColor + '60';

  if (shape === 'circle') {
    const el = document.createElementNS(SVG_NS, 'ellipse');
    el.setAttribute('cx', String(node.w / 2));
    el.setAttribute('cy', String(effH / 2));
    el.setAttribute('rx', String(node.w / 2));
    el.setAttribute('ry', String(effH / 2));
    el.setAttribute('fill', fill);
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', '1.5');
    return el;
  }

  if (shape === 'photo') {
    // 사진이 그 위를 덮으므로 배경은 테두리 역할만 한다.
    const el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('width', String(node.w));
    el.setAttribute('height', String(effH));
    el.setAttribute('rx', '6');
    el.setAttribute('fill', fill);
    el.setAttribute('stroke', kindColor + '90');
    el.setAttribute('stroke-width', '2');
    return el;
  }

  if (shape === 'note') {
    // 메모 = 종이쪽지. 테두리 대신 아주 옅은 바탕 + 왼쪽 짧은 색 자국만 남긴다.
    const el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('width', String(node.w));
    el.setAttribute('height', String(effH));
    el.setAttribute('rx', '3');
    el.setAttribute('fill', kindColor + '14');
    el.setAttribute('stroke', kindColor + '20');
    el.setAttribute('stroke-width', '1');
    el.setAttribute('stroke-dasharray', '3 3');
    return el;
  }

  if (shape === 'bubble') {
    // 둥근 사각 + 왼쪽 아래 꼬리. 꼬리는 상자 *안쪽* 으로 그려 바깥 크기를 안 늘린다.
    const r = 12;
    const w = node.w;
    const h = effH;
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute(
      'd',
      `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r - 6} A ${r} ${r} 0 0 1 ${w - r} ${h - 6}` +
        ` H ${Math.min(34, w - r)} L ${Math.min(20, w - r - 6)} ${h} L ${Math.min(24, w - r - 4)} ${h - 6}` +
        ` H ${r} A ${r} ${r} 0 0 1 0 ${h - r - 6} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
    );
    el.setAttribute('fill', fill);
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', '1.5');
    return el;
  }

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', String(node.w));
  rect.setAttribute('height', String(effH));
  rect.setAttribute('rx', '4');
  rect.setAttribute('fill', fill);
  rect.setAttribute('stroke', stroke);
  rect.setAttribute('stroke-width', '1.5');
  return rect;
}
