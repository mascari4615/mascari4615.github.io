/**
 * panels/links-section.ts — 설명 속 [[이름]] 묶음 (TASK-KL-202 개편 2, 마지막 조각의 첫 걸음).
 *
 * 노드 패널은 위젯 상태와 가장 깊게 얽혀 있어 통째로 옮기기 어렵다. 그래서 **독립적인 조각부터**
 * 떼어낸다 — 이 부분은 설명 글과 노드 목록만 있으면 되므로 가장 먼저 나올 수 있었다.
 */
import type { GraphNode } from '../../../lib/graph/spec';
import { outgoingLinks, backlinks, unlinkedMentions, linkFirstMention } from '../links';
import { resolveDoc, setDocText } from '../../../lib/graph/notes';
import type { PanelCtx } from './context';

/**
 * 설명 속 연결 — 가리키는 것 / 나를 가리키는 것 / 이름만 나온 곳 (격차 Q).
 * 마지막 것이 이 도구의 값이다: 사람이 링크 문법을 몰라도 그물이 자란다.
 */
export function renderLinkSections(ctx: PanelCtx, node: GraphNode): string {
  // 글이 공용 글(`docRef`)에 살면 `node.doc` 은 비어 있다 — **보이는 글**로 훑지 않으면
  // 공용 글 안의 [[이름]] 은 영영 안 보인다. 그래서 훑기 전에 한 번 풀어 둔다.
  const spec = ctx.spec();
  const view = (n: GraphNode): { id: string; label: string; doc: string } =>
    ({ id: n.id, label: n.label, doc: resolveDoc(spec, n) });
  const all = spec.nodes.map(view);
  const me = view(node);
  const out = outgoingLinks(me, all);
  const back = backlinks(me, all);
  const loose = unlinkedMentions(me, all);
  if (out.length === 0 && back.length === 0 && loose.length === 0) return '';
  const row = (label: string, action: string, key: string, extra = ''): string =>
    `<div class="km-link-row"><span class="km-link-name">${ctx.esc(label)}</span>
      <button class="btn btn-ghost" data-km="${action}" data-key="${ctx.esc(key)}">${extra}</button></div>`;
  return `
    ${out.length === 0 ? '' : `<div class="km-field"><label>가리키는 것 ${out.length}</label>
      ${out.map((o) => (o.node
        ? row(o.name, 'go-link', o.node.id, '가기')
        : row(o.name, 'make-link', o.name, '만들기'))).join('')}</div>`}
    ${back.length === 0 ? '' : `<div class="km-field"><label>나를 가리키는 것 ${back.length}</label>
      ${back.map((b) => row(b.label, 'go-link', b.id, '가기')).join('')}</div>`}
    ${loose.length === 0 ? '' : `<div class="km-field"><label>이름만 나온 곳 ${loose.length}</label>
      ${loose.map((m) => row(m.label, 'link-mention', m.id, '이어 주기')).join('')}
      <div class="km-hint">글에 이름이 적혀 있는데 아직 [[ ]] 로 안 이어진 자리입니다.</div></div>`}`;
}

/** 링크 목록의 버튼들. renderSide 가 다시 그릴 때마다 새로 매단다. */
export function bindLinkSections(ctx: PanelCtx, selectedId: string | null): void {
  ctx.side.querySelectorAll('[data-km="go-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      if (!ctx.spec().nodes.some((n) => n.id === id)) return;
      ctx.focusNode(id);
    };
  });
  ctx.side.querySelectorAll('[data-km="make-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const name = (el as HTMLElement).dataset.key ?? '';
      if (!name) return;
      const center = ctx.canvas()?.viewCenterWorld() ?? { x: 0, y: 0 };
      ctx.spawnNodeAt(center.x + 160, center.y + 120, name);
    };
  });
  ctx.side.querySelectorAll('[data-km="link-mention"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      const other = ctx.spec().nodes.find((n) => n.id === id);
      const me = ctx.spec().nodes.find((n) => n.id === selectedId);
      if (!other || !me) return;
      // 공용 글이면 공용 글에 써야 한다 — `other.doc` 에 쓰면 아무도 안 보는 자리에 남는다.
      setDocText(ctx.spec(), other, linkFirstMention(resolveDoc(ctx.spec(), other), me.label));
      ctx.canvas()?.render();
      ctx.canvas()?.setSelectedNode(me.id);
      ctx.persist();
      ctx.refresh();
    };
  });
}

