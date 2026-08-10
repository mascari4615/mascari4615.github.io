/**
 * panels/stamps-panel.ts — 떠 둔 「본」 목록 (TASK-KL-202 방향⑤).
 *
 * 본은 **맵보다 오래 산다**(사람 창고에 있다). 그래서 목록은 「이 맵에 무엇이 있나」가 아니라
 * 「내가 자주 쓰는 덩어리가 무엇인가」다 — 어느 맵에서 열어도 같은 목록이 보인다.
 */
import { loadStamps } from '../stamps';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderStampsPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);
  const list = loadStamps().sort((a, b) => b.at - a.at);

  side.innerHTML = `
    <h4>${esc(t('karmomap.t380'))}</h4>
    <div class="km-hint">${t('karmomap.stampsWhat', { em: `<b>${esc(t('karmomap.t382'))}</b>` })}</div>
    ${list.length === 0
      ? t('karmomap.t386')
      : list.map((st) => `<div class="km-link-row">
          <span class="km-link-name">${esc(st.name)}</span>
          <span class="km-group-count">${st.nodes.length}개</span>
          <button class="btn btn-ghost" data-km="stamp-put" data-key="${esc(st.id)}">${esc(t('karmomap.t384'))}</button>
          <button class="btn btn-ghost" data-km="stamp-del" data-key="${esc(st.id)}" title="${esc(t('karmomap.t379'))}">×</button>
        </div>
        <div class="km-hint" style="margin:-4px 0 8px">${esc(st.nodes.slice(0, 5).map((n) => n.label || t('karmomap.unnamed')).join(' · '))}${st.nodes.length > 5 ? ' ' + t('karmomap.andMore', { n: st.nodes.length - 5 }) : ''}</div>`).join('')}
    <button class="btn btn-ghost" data-km="stamp-close">${esc(t('karmomap.t385'))}</button>`;

  side.querySelectorAll('[data-km="stamp-put"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => ctx.putStamp((el as HTMLElement).dataset.key ?? '');
  });
  side.querySelectorAll('[data-km="stamp-del"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => ctx.removeStamp((el as HTMLElement).dataset.key ?? '');
  });
  (side.querySelector('[data-km="stamp-close"]') as HTMLButtonElement).onclick = ctx.goNode;
}
