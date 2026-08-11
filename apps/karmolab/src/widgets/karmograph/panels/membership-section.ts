/**
 * panels/membership-section.ts — 묶음 소속 칸 (TASK-KL-202 개편 2, 노드 패널 네 번째 조각).
 *
 * 한 노드가 **여러 묶음에 동시에** 들 수 있으므로 고르기가 아니라 **체크 목록**이다
 * (세로로 늘어놓는 게 훑기 쉽다는 관행 그대로). 여기서 바로 새 묶음도 만든다.
 */
import type { GraphNode } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function membershipFieldHtml(ctx: PanelCtx, node: GraphNode): string {
  const esc = ctx.esc;
  const groups = ctx.spec().groups;
  return `
    <div class="km-field">
      <label>${esc(t('karmograph.t422'))}</label>
      ${groups.length === 0
        ? t('karmograph.t424')
        : groups.map((g) => `<label class="km-check"><input type="checkbox" data-km="in-group" value="${esc(g.id)}"${
            ctx.memberOf(node).includes(g.id) ? ' checked' : ''
          } /> <span class="km-swatch" style="background:${esc(g.color)}"></span>${esc(g.label)}</label>`).join('')}
      <button class="btn btn-ghost" data-km="group-new-here">${esc(t('karmograph.t423'))}</button>
    </div>`;
}

export function bindMembershipField(ctx: PanelCtx, node: GraphNode): void {
  const side = ctx.side;
  side.querySelectorAll('[data-km="in-group"]').forEach((el) => {
    (el as HTMLInputElement).onchange = (ev) => {
      const box = ev.target as HTMLInputElement;
      const cur = new Set(ctx.memberOf(node));
      if (box.checked) cur.add(box.value);
      else cur.delete(box.value);
      ctx.setMembership(node, [...cur]);
      ctx.applySpec();
      ctx.persist();
    };
  });
  (side.querySelector('[data-km="group-new-here"]') as HTMLButtonElement).onclick = () => {
    ctx.setMembership(node, [...ctx.memberOf(node), ctx.createGroup().id]);
    ctx.applySpec();
    ctx.persist();
    ctx.refresh();
  };
}
