/**
 * lib/graph/canvas-card.ts — **보통 카드의 속**: 이름 + 한마디 + 칸 줄 (TASK-KL-202 방향① 해체 12조각).
 *
 * 자리 규칙 두 개가 여기 산다:
 *  - 얼굴이 있으면 글은 그 오른쪽에서 시작한다(동그라미 카드는 가운데 정렬).
 *    ★ 「얼굴이 있나」는 `canvas-avatar.ts` 만 안다 — 얼굴을 안 정한 노드에도 이름 첫 글자 원이
 *    그려지기 때문이다. 그래서 자리를 여기서 다시 세지 않고 `cardTextX()` 를 받아 쓴다.
 *  - 한마디가 있으면 이름을 살짝 **위로 올리고** 그 밑에 한 줄 더 — 안 올리면 둘이 겹쳐 읽힌다.
 */
import type { GraphNode } from './spec';
import { buildFieldRows } from './canvas-fields';
import { cardTextX, faceGeometry } from './canvas-avatar';
import { TYPE } from './canvas-type';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildCardText(
  node: GraphNode,
  effH: number,
  centered: boolean,
  theme: { nodeText: string; childText: string },
): SVGElement[] {
  const out: SVGElement[] = [];
  const hasNote = Boolean(node.note && node.note.trim());
  const textX = cardTextX(node, effH, centered);
  const baseY = centered && faceGeometry(node, effH, centered) ? effH / 2 + 18 : effH / 2 + 5;
  const labelY = hasNote ? baseY - 6 : baseY;

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(textX));
  text.setAttribute('y', String(labelY));
  if (centered) text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', theme.nodeText);
  // 카드 이름은 **1:1 에서 읽히는 크기**여야 한다. 「전체 보기」가 100% 를 안 넘게 된 뒤로
  // 11px 은 부제와 함께 뭉개져 보였다(실측 2026-08-12). 13px = 본문 한 줄로 읽히는 최소.
  text.setAttribute('font-size', String(TYPE.title));
  text.setAttribute('font-weight', '600');
  text.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
  text.setAttribute('pointer-events', 'none');
  text.textContent = node.label;
  out.push(text);

  // 동그라미 카드에는 칸 줄을 안 넣는다 — 둥근 안쪽은 글 두 줄이 한계다.
  if (!centered) {
    out.push(...buildFieldRows(node.fields, {
      x: textX,
      y: labelY + (hasNote ? 29 : 17),
      width: node.w,
      color: theme.childText,
    }));
  }

  if (hasNote) {
    const note = document.createElementNS(SVG_NS, 'text');
    note.setAttribute('x', String(textX));
    note.setAttribute('y', String(labelY + 15));
    if (centered) note.setAttribute('text-anchor', 'middle');
    note.setAttribute('fill', theme.childText);
    note.setAttribute('font-size', String(TYPE.body));
    note.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    note.setAttribute('pointer-events', 'none');
    const room = centered ? node.w - 16 : node.w - textX - 10;
    const maxChars = Math.max(4, Math.floor(room / 6.2));
    const raw = node.note ?? '';
    note.textContent = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
    out.push(note);
  }
  return out;
}
