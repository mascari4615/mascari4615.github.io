/**
 * panels/attach-section.ts — 가리키는 대상 (TASK-KL-202 개편 2, 노드 패널 여섯 번째 조각).
 *
 * 주석이 무엇을 가리키는지 고르는 자리. **노드와 선을 한 목록에** 둔다 — 「이 메모는 저 관계에
 * 대한 것」도 흔하기 때문이다. 고르면 옅은 점선(leader)이 이어진다.
 */
import type { GraphNode } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function attachFieldHtml(ctx: PanelCtx, node: GraphNode): string {
  const esc = ctx.esc;
  const spec = ctx.spec();
  const nodeOpts = spec.nodes
    .filter((n) => n.id !== node.id)
    .map((n) => `<option value="${esc(n.id)}"${n.id === node.attachedTo ? ' selected' : ''}>${ctx.kindIcon(n.kind)} ${esc(n.label || t('karmograph.unnamed'))}</option>`)
    .join('');
  const edgeOpts = spec.edges
    .map((e) => {
      const a = spec.nodes.find((n) => n.id === e.from)?.label ?? e.from;
      const b = spec.nodes.find((n) => n.id === e.to)?.label ?? e.to;
      return `<option value="${esc(e.id)}"${e.id === node.attachedTo ? ' selected' : ''}>― ${esc(a)} ↔ ${esc(b)}</option>`;
    })
    .join('');
  return `
    <div class="km-field">
      <label>${esc(t('karmograph.t387'))}</label>
      <select data-km="edit-attach">
        <option value="">${esc(t('karmograph.t388'))}</option>
        ${nodeOpts}
        ${edgeOpts}
      </select>
      <div class="km-hint">${esc(t('karmograph.t389'))}</div>
    </div>`;
}

export function bindAttachField(ctx: PanelCtx, node: GraphNode, touch: (redrawSide: boolean) => void): void {
  (ctx.side.querySelector('[data-km="edit-attach"]') as HTMLSelectElement).onchange = (ev) => {
    node.attachedTo = (ev.target as HTMLSelectElement).value || undefined;
    touch(false);
  };
}
