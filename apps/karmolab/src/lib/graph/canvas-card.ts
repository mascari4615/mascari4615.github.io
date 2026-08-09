/**
 * lib/graph/canvas-card.ts — **보통 카드의 속**: 이름 + 한마디 + 칸 줄 (TASK-KL-202 방향① 해체 12조각).
 *
 * 자리 규칙 두 개가 여기 산다:
 *  - 얼굴이 있으면 글은 그 오른쪽에서 시작한다(동그라미 카드는 가운데 정렬).
 *  - 한마디가 있으면 이름을 살짝 **위로 올리고** 그 밑에 한 줄 더 — 안 올리면 둘이 겹쳐 읽힌다.
 */
import type { GraphNode } from './spec';
import { buildFieldRows } from './canvas-fields';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildCardText(
  node: GraphNode,
  effH: number,
  centered: boolean,
  theme: { nodeText: string; childText: string },
): SVGElement[] {
  const out: SVGElement[] = [];
  const hasNote = Boolean(node.note && node.note.trim());
  const textX = centered ? node.w / 2 : node.avatar ? 40 : 12;
  const baseY = centered && node.avatar ? effH / 2 + 18 : effH / 2 + 4;
  const labelY = hasNote ? baseY - 6 : baseY;

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(textX));
  text.setAttribute('y', String(labelY));
  if (centered) text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', theme.nodeText);
  text.setAttribute('font-size', '11');
  text.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
  text.setAttribute('pointer-events', 'none');
  text.textContent = node.label;
  out.push(text);

  // 동그라미 카드에는 칸 줄을 안 넣는다 — 둥근 안쪽은 글 두 줄이 한계다.
  if (!centered) {
    out.push(...buildFieldRows(node.fields, {
      x: textX,
      y: labelY + (hasNote ? 26 : 15),
      width: node.w,
      color: theme.childText,
    }));
  }

  if (hasNote) {
    const note = document.createElementNS(SVG_NS, 'text');
    note.setAttribute('x', String(textX));
    note.setAttribute('y', String(labelY + 13));
    if (centered) note.setAttribute('text-anchor', 'middle');
    note.setAttribute('fill', theme.childText);
    note.setAttribute('font-size', '9.5');
    note.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    note.setAttribute('pointer-events', 'none');
    const room = centered ? node.w - 16 : node.w - textX - 10;
    const maxChars = Math.max(4, Math.floor(room / 5.4));
    const raw = node.note ?? '';
    note.textContent = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
    out.push(note);
  }
  return out;
}
