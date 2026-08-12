/**
 * lib/graph/canvas-shape.ts — 카드의 **바탕 모양** (TASK-KL-202 방향① 해체 5조각).
 *
 * 네모·동그라미·말풍선·쪽지·사진 카드. 여기서 중요한 규약 하나: 모양이 달라도 바깥에서 보는
 * 상자 크기는 같다. 선을 잇는 셈법이 상자 크기만 보고 있기 때문이다.
 */
import type { GraphNode, NodeShape } from './spec';
import { TYPE } from './canvas-type';

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


/** 쪽지 본문 줄 간격·최대 줄 수 — 카드가 소설이 되면 그림이 안 읽힌다. */
export const NOTE_BODY_LINE_H = 12;
export const NOTE_BODY_MAX_LINES = 6;

/**
 * 글을 카드 폭에 맞춰 **접는다**. 넘치면 마지막 줄 끝을 `…` 로 바꾼다 —
 * 잘린 줄을 그대로 두면 「글이 저기까지인 줄」 알고 옆 패널을 안 연다.
 */
export function foldNoteBody(text: string, width: number): string[] {
  const perLine = Math.max(6, Math.floor((width - 20) / 5.6));
  const lines: string[] = [];
  const LINE_SPLIT = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');
  for (const para of text.split(LINE_SPLIT)) {
    if (lines.length >= NOTE_BODY_MAX_LINES) break;
    let rest = para.trim();
    if (!rest) continue;
    while (rest.length > 0 && lines.length < NOTE_BODY_MAX_LINES) {
      lines.push(rest.slice(0, perLine));
      rest = rest.slice(perLine);
    }
  }
  if (lines.length > 0 && text.replace(/\s/g, '').length > lines.join('').replace(/\s/g, '').length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  }
  return lines;
}

/** 쪽지 카드의 속(제목 + 접은 본문). 붙일 게 없으면 빈 배열. */
export function buildNoteCardBody(
  label: string,
  body: string,
  width: number,
  theme: { nodeText: string; childText: string },
): SVGTextElement[] {
  const lines = foldNoteBody(body, width);
  if (lines.length === 0) return [];
  const out: SVGTextElement[] = [];

  const title = document.createElementNS(SVG_NS, 'text');
  title.setAttribute('x', '10');
  title.setAttribute('y', '16');
  title.setAttribute('fill', theme.nodeText);
  title.setAttribute('font-size', String(TYPE.body));
  title.setAttribute('font-weight', '600');
  title.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
  title.setAttribute('pointer-events', 'none');
  title.textContent = label;
  out.push(title);

  lines.forEach((ln, i) => {
    const row = document.createElementNS(SVG_NS, 'text');
    row.setAttribute('x', '10');
    row.setAttribute('y', String(30 + i * NOTE_BODY_LINE_H));
    row.setAttribute('fill', theme.childText);
    row.setAttribute('font-size', String(TYPE.meta));
    row.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    row.setAttribute('pointer-events', 'none');
    row.textContent = ln;
    out.push(row);
  });
  return out;
}
