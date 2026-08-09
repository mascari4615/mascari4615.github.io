/**
 * lib/graph/canvas-children.ts — **자식 항목이 있는 카드** (TASK-KL-202 방향① 해체 11조각).
 *
 * 「서버 → 서비스 세 개」처럼 카드 안에 목록이 붙는 모양(cockpit 이 주로 쓴다).
 * 머리(이름)와 몸(목록)을 줄 하나로 가르고, 항목은 불릿과 함께 한 줄씩.
 * 폭을 넘는 항목은 `…` — 카드가 옆으로 늘어나면 그림 전체가 흔들린다.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const NODE_HEADER_H = 30;
export const NODE_CHILD_ROW_H = 18;
export const NODE_CHILD_PAD = 6;

export function buildChildCard(
  label: string,
  children: string[],
  width: number,
  kindColor: string,
  theme: { nodeText: string; childText: string },
): SVGElement[] {
  const out: SVGElement[] = [];
  const headerH = NODE_HEADER_H;

  const headerRect = document.createElementNS(SVG_NS, 'rect');
  headerRect.setAttribute('x', '0');
  headerRect.setAttribute('y', '0');
  headerRect.setAttribute('width', String(width));
  headerRect.setAttribute('height', String(headerH));
  headerRect.setAttribute('rx', '4');
  headerRect.setAttribute('fill', `${kindColor}18`);
  headerRect.setAttribute('pointer-events', 'none');
  out.push(headerRect);

  const title = document.createElementNS(SVG_NS, 'text');
  title.setAttribute('x', '12');
  title.setAttribute('y', String(headerH / 2 + 4));
  title.setAttribute('fill', theme.nodeText);
  title.setAttribute('font-size', '11');
  title.setAttribute('font-weight', '600');
  title.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
  title.setAttribute('pointer-events', 'none');
  title.textContent = label;
  out.push(title);

  const sep = document.createElementNS(SVG_NS, 'line');
  sep.setAttribute('x1', '3');
  sep.setAttribute('y1', String(headerH));
  sep.setAttribute('x2', String(width));
  sep.setAttribute('y2', String(headerH));
  sep.setAttribute('stroke', `${kindColor}30`);
  sep.setAttribute('stroke-width', '1');
  out.push(sep);

  const maxChars = Math.max(4, Math.floor((width - 30) / 6.2));
  children.forEach((child, i) => {
    const cy = headerH + NODE_CHILD_PAD + i * NODE_CHILD_ROW_H + NODE_CHILD_ROW_H / 2 + 4;

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', '14');
    dot.setAttribute('cy', String(cy - 3));
    dot.setAttribute('r', '2');
    dot.setAttribute('fill', `${kindColor}80`);
    dot.setAttribute('pointer-events', 'none');
    out.push(dot);

    const row = document.createElementNS(SVG_NS, 'text');
    row.setAttribute('x', '22');
    row.setAttribute('y', String(cy));
    row.setAttribute('fill', theme.childText);
    row.setAttribute('font-size', '10');
    row.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
    row.setAttribute('pointer-events', 'none');
    row.textContent = child.length > maxChars ? `${child.slice(0, maxChars - 1)}…` : child;
    out.push(row);
  });

  return out;
}
