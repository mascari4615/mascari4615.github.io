/**
 * panels/sna-panel.ts — 관계망 읽기 (TASK-KL-202 개편 2, 두 번째 이사).
 *
 * 계산은 `sna.ts` 가 이미 따로였고, 남은 건 그리기와 「가기」 버튼뿐이라 옮기기 쉬웠다.
 */
import { computeSna, topBy, structuralGaps } from '../sna';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderSnaPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const live = ctx.canvas()?.getSpec() ?? ctx.spec();
  const sna = computeSna({ nodes: live.nodes, edges: live.edges });
  const nameOf = (id: string): string => live.nodes.find((n) => n.id === id)?.label || t('karmograph.unnamed');

  // 순위만으로는 「그래서 뭘 하지」가 안 나온다 — 이을 자리를 짚어 준다.
  const gaps = structuralGaps({ nodes: live.nodes, edges: live.edges });

  const list = (title: string, hint: string, rows: { id: string; value: number }[], digits: number): string => `
    <div class="km-field">
      <label>${title}</label>
      <div class="km-hint">${hint}</div>
      ${rows.length === 0
        ? t('karmograph.t315')
        : rows.map((r) => `<div class="km-link-row">
            <span class="km-link-name">${esc(nameOf(r.id))}</span>
            <span class="km-group-count">${r.value.toFixed(digits)}</span>
            <button class="btn btn-ghost" data-km="go-link" data-key="${esc(r.id)}">${esc(t('karmograph.t308'))}</button>
          </div>`).join('')}
    </div>`;

  side.innerHTML = `
    <h4>${esc(t('karmograph.t309'))}</h4>
    ${list(t('karmograph.t316'), t('karmograph.t317'), topBy(sna.degree, 5), 0)}
    ${list(t('karmograph.t318'), t('karmograph.t319'), topBy(sna.betweenness, 5), 1)}
    ${list(t('karmograph.t320'), t('karmograph.t321'), topBy(sna.closeness, 5), 3)}
    ${gaps.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.t310'))}</label>
      <div class="km-hint">${esc(t('karmograph.t311'))}</div>
      ${gaps.slice(0, 5).map((g0) => `<div class="km-link-row">
        <span class="km-link-name">${esc(nameOf(g0.a))} ↔ ${esc(nameOf(g0.b))}</span>
        <span class="km-group-count">겹치는 사이 ${g0.shared}</span>
        <button class="btn btn-ghost" data-km="gap-link" data-key="${esc(g0.a)}" data-to="${esc(g0.b)}">${esc(t('karmograph.t312'))}</button>
      </div>`).join('')}
    </div>`}
    <button class="btn btn-ghost" data-km="sna-focus">${esc(t('karmograph.t313'))}</button>
    <button class="btn btn-ghost" data-km="sna-close">${esc(t('karmograph.t314'))}</button>`;

  side.querySelectorAll('[data-km="go-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      if (id) ctx.focusNode(id);
    };
  });
  side.querySelectorAll('[data-km="gap-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const a0 = (el as HTMLElement).dataset.key ?? '';
      const b0 = (el as HTMLElement).dataset.to ?? '';
      if (!a0 || !b0) return;
      ctx.linkWithLabel(a0, b0, '');
      ctx.refresh();
    };
  });
  (side.querySelector('[data-km="sna-close"]') as HTMLButtonElement).onclick = ctx.goNode;
  (side.querySelector('[data-km="sna-focus"]') as HTMLButtonElement).onclick = () => {
    const top = topBy(sna.betweenness, 3).map((r) => r.id);
    if (top.length === 0) return;
    ctx.canvas()?.setFocus(new Set(top));
    ctx.canvas()?.fitToNodes(top, 160);
  };
}
