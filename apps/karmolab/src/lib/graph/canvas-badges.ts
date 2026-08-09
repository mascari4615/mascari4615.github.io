/**
 * lib/graph/canvas-badges.ts — 카드 모서리의 **작은 표식들** (TASK-KL-202 방향① 해체 8조각).
 *
 * 카드만 보고 알아야 하는 세 가지:
 *  - 📄 여기 적어 둔 글이 있다 (없으면 「어디에 써 뒀더라」가 된다)
 *  - 🔗N **남과 나눠 쓰는 글**이다 → 여기서 고치면 저기도 바뀐다(모르고 고치는 사고 방지)
 *  - 💬N 말이 오갔다 (함께 보는 판에서 말이 묻히지 않게)
 *
 * 표식이 늘 때마다 카드 그리기 본문이 길어지던 자리라, 한 파일로 모았다.
 */
import type { GraphNode, GraphSpec } from './spec';

const SVG_NS = 'http://www.w3.org/2000/svg';

function badge(x: number, y: number, text: string, opacity: string): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('font-size', '9');
  el.setAttribute('opacity', opacity);
  el.setAttribute('pointer-events', 'none');
  el.textContent = text;
  return el;
}

/** 카드에 붙일 표식들. 붙일 게 없으면 빈 배열. */
export function nodeBadges(spec: GraphSpec | null, node: GraphNode, effH: number): SVGTextElement[] {
  const out: SVGTextElement[] = [];

  const sharedUsers = node.docRef && spec
    ? spec.nodes.filter((x) => x.docRef === node.docRef).length
      + spec.edges.filter((x) => x.docRef === node.docRef).length
    : 0;
  if ((node.doc ?? '').trim() || node.docRef) {
    const mark = sharedUsers > 1 ? `🔗${sharedUsers}` : node.docRef ? '🔗' : '📄';
    out.push(badge(node.w - (sharedUsers > 1 ? 14 : 9), 12, mark, '0.75'));
  }

  const comments = (spec?.comments ?? []).filter((c) => c.on === node.id).length;
  if (comments > 0) out.push(badge(node.w - 12, effH - 6, `💬${comments}`, '0.8'));

  return out;
}
