/**
 * panels/help-panel.ts — 「무엇을 할 수 있나」 (TASK-KL-202 개편 2, 첫 이사).
 *
 * 의존이 가장 적은 패널이라 여기부터 옮겼다 — 목록(`help.ts`)과 그릴 자리만 있으면 된다.
 */
import { HELP } from '../help';
import type { PanelCtx } from './context';

export function renderHelpPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);
  side.innerHTML = `
    <h4>? 무엇을 할 수 있나</h4>
    <div class="km-hint">${HELP.reduce((n, s) => n + s.items.length, 0)}가지. <b>?</b> 키로 언제든 다시 엽니다.</div>
    ${HELP.map((sec) => `<div class="km-field">
      <label>${esc(sec.title)}</label>
      ${sec.items.map((it) => `<div class="km-help-row">
        <span class="km-link-name">${esc(it.what)}</span>
        <span class="km-help-how">${esc(it.how)}</span>
      </div>`).join('')}
    </div>`).join('')}
    <button class="btn btn-ghost" data-km="help-close">닫기</button>`;
  (side.querySelector('[data-km="help-close"]') as HTMLButtonElement).onclick = ctx.goNode;
}
