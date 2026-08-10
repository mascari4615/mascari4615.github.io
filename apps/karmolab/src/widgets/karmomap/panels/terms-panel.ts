/**
 * panels/terms-panel.ts — 내 용어 (TASK-KL-202 개편 2, 다섯 번째 이사).
 *
 * 팩에 없는 노드·관계 종류를 사람이 직접 만드는 자리. 저장은 맵이 아니라 **사람** 단위라
 * (`terms.ts`), 이 패널은 그 덩이를 ctx 로 빌려 고치고 `applyTerms()` 로 알린다.
 */
import { newTermId } from '../terms';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

/** 화살표 상태 글자 — 없음 / 한쪽 / 양쪽. */
function arrowGlyph(e: { arrow: boolean; arrowStart?: boolean }): string {
  if (e.arrow && e.arrowStart) return '↔';
  return e.arrow ? '→' : '—';
}

export function renderTermsPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);
  const EDGE_STYLES: { id: string; label: string }[] = [
    { id: 'solid', label: t('karmomap.t372') }, { id: 'dashed', label: t('karmomap.t373') }, { id: 'dotted', label: t('karmomap.t374') },
    { id: 'wavy', label: t('karmomap.t375') }, { id: 'crack', label: t('karmomap.t376') },
  ];
  side.innerHTML = `
    <h4>${esc(t('karmomap.t365'))}</h4>
    <div class="km-hint">${t('karmomap.hint03', { em: `<b>${esc(t('karmomap.t367'))}</b>` })}</div>
    <div class="km-field">
      <label>내 노드 종류 ${ctx.terms.nodeKinds.length}개</label>
      ${ctx.terms.nodeKinds
        .map(
          (k) => `<div class="km-group-row" data-term-node="${esc(k.id)}">
            <input type="text" data-km="t-icon" maxlength="4" value="${esc(k.icon)}" title="${esc(t('karmomap.t362'))}" />
            <input type="text" data-km="t-label" value="${esc(k.label)}" />
            <input type="color" data-km="t-color" value="${esc(k.color)}" />
            <button class="btn btn-ghost" data-km="t-del" title="${esc(t('karmomap.t363'))}">×</button>
          </div>`
        )
        .join('') || `<div class="km-hint">${t('karmomap.nothingYet')}</div>`}
      <button class="btn btn-ghost" data-km="t-add-node">${esc(t('karmomap.t369'))}</button>
    </div>
    <div class="km-field">
      <label>내 관계 종류 ${ctx.terms.edgeKinds.length}개</label>
      ${ctx.terms.edgeKinds
        .map(
          (e) => `<div class="km-group-row" data-term-edge="${esc(e.id)}">
            <input type="text" data-km="t-label" value="${esc(e.label)}" />
            <input type="color" data-km="t-color" value="${esc(e.color)}" />
            <select data-km="t-style">
              ${EDGE_STYLES.map((s) => `<option value="${s.id}"${s.id === e.style ? ' selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <button class="btn btn-ghost" data-km="t-arrow" title="${esc(t('karmomap.t364'))}">${arrowGlyph(e)}</button>
            <button class="btn btn-ghost" data-km="t-del" title="${esc(t('karmomap.t363'))}">×</button>
          </div>`
        )
        .join('') || `<div class="km-hint">${t('karmomap.nothingYet')}</div>`}
      <button class="btn btn-ghost" data-km="t-add-edge">${esc(t('karmomap.t370'))}</button>
    </div>
    <button class="btn btn-ghost" data-km="t-close">${esc(t('karmomap.t371'))}</button>`;

  (side.querySelector('[data-km="t-close"]') as HTMLButtonElement).onclick = () => {
    ctx.goNode();
  };

  (side.querySelector('[data-km="t-add-node"]') as HTMLButtonElement).onclick = () => {
    const taken = new Set([...ctx.terms.nodeKinds, ...ctx.terms.edgeKinds].map((k) => k.id));
    ctx.terms.nodeKinds.push({ id: newTermId('n', taken), label: t('karmomap.t377'), icon: '🔖', color: '#38bdf8' });
    ctx.applyTerms();
    ctx.refresh();
  };

  (side.querySelector('[data-km="t-add-edge"]') as HTMLButtonElement).onclick = () => {
    const taken = new Set([...ctx.terms.nodeKinds, ...ctx.terms.edgeKinds].map((k) => k.id));
    ctx.terms.edgeKinds.push({ id: newTermId('e', taken), label: t('karmomap.t378'), color: '#38bdf8', style: 'solid', arrow: true });
    ctx.applyTerms();
    ctx.refresh();
  };

  side.querySelectorAll('[data-term-node]').forEach((rowEl) => {
    const row = rowEl as HTMLElement;
    const id = row.dataset.termNode ?? '';
    const find = () => ctx.terms.nodeKinds.find((k) => k.id === id);
    (row.querySelector('[data-km="t-icon"]') as HTMLInputElement).oninput = (ev) => {
      const k = find(); if (!k) return;
      k.icon = (ev.target as HTMLInputElement).value || '🔖';
      ctx.applyTerms();
    };
    (row.querySelector('[data-km="t-label"]') as HTMLInputElement).oninput = (ev) => {
      const k = find(); if (!k) return;
      k.label = (ev.target as HTMLInputElement).value;
      ctx.applyTerms();
    };
    (row.querySelector('[data-km="t-color"]') as HTMLInputElement).oninput = (ev) => {
      const k = find(); if (!k) return;
      k.color = (ev.target as HTMLInputElement).value;
      ctx.applyTerms();
    };
    (row.querySelector('[data-km="t-del"]') as HTMLButtonElement).onclick = () => {
      // 이미 그 종류로 놓아둔 노드는 건드리지 않는다 — 이름·색만 잃고 그림은 남는다.
      ctx.terms.nodeKinds = ctx.terms.nodeKinds.filter((k) => k.id !== id);
      ctx.applyTerms();
    ctx.refresh();
    };
  });

  side.querySelectorAll('[data-term-edge]').forEach((rowEl) => {
    const row = rowEl as HTMLElement;
    const id = row.dataset.termEdge ?? '';
    const find = () => ctx.terms.edgeKinds.find((k) => k.id === id);
    (row.querySelector('[data-km="t-label"]') as HTMLInputElement).oninput = (ev) => {
      const e = find(); if (!e) return;
      e.label = (ev.target as HTMLInputElement).value;
      ctx.applyTerms();
    };
    (row.querySelector('[data-km="t-color"]') as HTMLInputElement).oninput = (ev) => {
      const e = find(); if (!e) return;
      e.color = (ev.target as HTMLInputElement).value;
      ctx.applyTerms();
      ctx.canvas()?.render();
    };
    (row.querySelector('[data-km="t-style"]') as HTMLSelectElement).onchange = (ev) => {
      const e = find(); if (!e) return;
      e.style = (ev.target as HTMLSelectElement).value as typeof e.style;
      ctx.applyTerms();
      ctx.canvas()?.render();
    };
    (row.querySelector('[data-km="t-arrow"]') as HTMLButtonElement).onclick = (ev) => {
      const e = find(); if (!e) return;
      // 없음 → 한쪽 → 양쪽 → 없음. 세 상태를 버튼 하나로 돈다.
      if (!e.arrow && !e.arrowStart) { e.arrow = true; }
      else if (e.arrow && !e.arrowStart) { e.arrowStart = true; }
      else { e.arrow = false; e.arrowStart = false; }
      (ev.currentTarget as HTMLButtonElement).textContent = arrowGlyph(e);
      ctx.applyTerms();
      ctx.canvas()?.render();
    };
    (row.querySelector('[data-km="t-del"]') as HTMLButtonElement).onclick = () => {
      ctx.terms.edgeKinds = ctx.terms.edgeKinds.filter((k) => k.id !== id);
      ctx.applyTerms();
    ctx.refresh();
    };
  });
}

