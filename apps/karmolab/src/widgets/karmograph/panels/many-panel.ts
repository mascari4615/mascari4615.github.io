/**
 * panels/many-panel.ts — 여럿 고름 (TASK-KL-202 개편 2, 일곱 번째 이사).
 *
 * 고른 개수를 먼저 말하고(«N개 골랐음»), 지우기는 확인을 받는다 — 한 번에 여럿을 바꾸는
 * 자리에서 되돌릴 수 없는 일은 반드시 한 번 물어야 한다.
 */
import type { PanelCtx } from './context';
import { alignBoxes, spreadBoxes, type AlignHow, type Boxish } from '../tidy';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderManyPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  side.innerHTML = `
    <h4>◫ ${ctx.selectedMany().length}개 골랐음 <button class="btn btn-ghost km-h4btn" data-km="many-close">${esc(t('karmograph.t278'))}</button></h4>
    <div class="km-hint">${t('karmograph.hint05', { em: `<b>${esc(t('karmograph.t280'))}</b>` })}</div>
    <div class="km-field">
      <label>${esc(t('karmograph.t282'))}</label>
      <select data-km="many-group">
        <option value="">${esc(t('karmograph.t283'))}</option>
        ${ctx.spec().groups.map((g) => `<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('')}
        <option value="__new">${esc(t('karmograph.opt.new'))}</option>
      </select>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.t284'))}</label>
      <select data-km="many-kind">
        <option value="">${esc(t('karmograph.t283'))}</option>
        ${ctx.nodeKinds().map((k) => `<option value="${k.id}">${k.icon} ${esc(k.label)}</option>`).join('')}
      </select>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.align.label'))}</label>
      <div class="km-alignbar">
        <button class="btn btn-ghost" data-km="al" data-how="left" title="${esc(t('karmograph.align.left'))}">⇤</button>
        <button class="btn btn-ghost" data-km="al" data-how="hcenter" title="${esc(t('karmograph.align.hcenter'))}">⇹</button>
        <button class="btn btn-ghost" data-km="al" data-how="right" title="${esc(t('karmograph.align.right'))}">⇥</button>
        <span class="km-sep"></span>
        <button class="btn btn-ghost" data-km="al" data-how="top" title="${esc(t('karmograph.align.top'))}">⤒</button>
        <button class="btn btn-ghost" data-km="al" data-how="vcenter" title="${esc(t('karmograph.align.vcenter'))}">⇳</button>
        <button class="btn btn-ghost" data-km="al" data-how="bottom" title="${esc(t('karmograph.align.bottom'))}">⤓</button>
        <span class="km-sep"></span>
        <button class="btn btn-ghost" data-km="sp" data-axis="x" title="${esc(t('karmograph.align.spreadX'))}">⇿</button>
        <button class="btn btn-ghost" data-km="sp" data-axis="y" title="${esc(t('karmograph.align.spreadY'))}">↕</button>
      </div>
      <div class="km-hint">${esc(t('karmograph.align.hint'))}</div>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.t285'))}</label>
      <div class="km-hint">${t('karmograph.hint06', { em: `<b>${esc(t('karmograph.t287'))}</b>` })}</div>
      <div class="km-link-row">
        <input type="text" data-km="stamp-name" placeholder="${esc(t('karmograph.t275'))}" />
        <button class="btn btn-ghost" data-km="stamp-save">${esc(t('karmograph.t289'))}</button>
      </div>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.t290'))}</label>
      <div class="km-table">
        ${ctx.selectedMany().map((id) => {
          const n = ctx.spec().nodes.find((x) => x.id === id);
          if (!n) return '';
          const tags = (n.tags ?? []).join(', ');
          return `<div class="km-trow" data-key="${esc(id)}">
            <input type="text" data-km="many-name" value="${esc(n.label)}" title="${esc(t('karmograph.t276'))}" />
            <span class="km-tcell">${ctx.kindIcon(n.kind)} ${esc(ctx.kindLabel(n.kind))}</span>
            <span class="km-tcell km-tdim" title="${esc(tags)}">${tags ? esc(tags) : '—'}</span>
            <button class="btn btn-ghost" data-km="many-go" title="${esc(t('karmograph.t277'))}">→</button>
          </div>`;
        }).join('')}
      </div>
      <div class="km-hint">${esc(t('karmograph.t291'))}</div>
    </div>
    <button class="btn btn-danger" data-km="many-del">${ctx.selectedMany().length}개 모두 삭제</button>
`;

  /* 나란히 놓기 · 고르게 벌리기 — 셈은 `tidy.ts` 가 하고 여기서는 결과를 얹기만 한다.
     좌표를 바꾸면 캔버스가 들고 있던 자리(nodeCoords)도 같이 갈려야 하므로 통째로 다시 그린다. */
  const applyMove = (moved: Map<string, { x: number; y: number }>): void => {
    if (moved.size === 0) return;
    for (const [id, p] of moved) {
      const n = ctx.spec().nodes.find((x) => x.id === id);
      if (n) { n.x = p.x; n.y = p.y; }
    }
    ctx.canvas()?.setSpec(ctx.spec());
    ctx.canvas()?.render();
    ctx.persist();
  };
  const pickedBoxes = (): Boxish[] => ctx.selectedMany()
    .map((id) => ctx.spec().nodes.find((n) => n.id === id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));

  side.querySelectorAll('[data-km="al"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      applyMove(alignBoxes(pickedBoxes(), (el as HTMLElement).dataset.how as AlignHow));
    };
  });
  side.querySelectorAll('[data-km="sp"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      applyMove(spreadBoxes(pickedBoxes(), (el as HTMLElement).dataset.axis === 'y' ? 'y' : 'x'));
    };
  });

  // 표 = 「이 무리가 뭐였지」에 즉답. 이름은 그 자리에서 고친다(yEd 의 tabular view 자리).
  side.querySelectorAll('.km-trow').forEach((rowEl) => {
    const row = rowEl as HTMLElement;
    const id = row.dataset.key ?? '';
    const nameEl = row.querySelector('[data-km="many-name"]') as HTMLInputElement;
    nameEl.oninput = () => {
      const n = ctx.spec().nodes.find((x) => x.id === id);
      if (!n) return;
      n.label = nameEl.value;
      ctx.resizeNode(n);
      ctx.canvas()?.render();
      ctx.persist();
    };
    (row.querySelector('[data-km="many-go"]') as HTMLButtonElement).onclick = () => ctx.focusNode(id);
  });

  (side.querySelector('[data-km="many-group"]') as HTMLSelectElement).onchange = (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (!v) return;
    const gid = v === '__new' ? ctx.createGroup().id : v;
    for (const id of ctx.selectedMany()) {
      const n = ctx.spec().nodes.find((x) => x.id === id);
      if (n) ctx.setMembership(n, [...new Set([...ctx.memberOf(n), gid])]);
    }
    ctx.applySpec();
    ctx.persist();
    ctx.refresh();
  };

  (side.querySelector('[data-km="many-kind"]') as HTMLSelectElement).onchange = (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (!v) return;
    for (const id of ctx.selectedMany()) {
      const n = ctx.spec().nodes.find((x) => x.id === id);
      if (n) n.kind = v;
    }
    ctx.applySpec();
    ctx.persist();
    ctx.refresh();
  };

  (side.querySelector('[data-km="many-del"]') as HTMLButtonElement).onclick = () => {
    if (!confirm(t('karmograph.confirmDeleteMany', { n: ctx.selectedMany().length }))) return;
    // 지우기는 위젯에게 맡긴다 — ctx.spec() 은 읽기용이라 여기서 배열을 갈아 끼워도 안 먹는다.
    ctx.removeNodes(ctx.selectedMany());
    ctx.clearMany();
    ctx.applySpec();
    ctx.persist();
    ctx.goNode();
  };

  (side.querySelector('[data-km="stamp-save"]') as HTMLButtonElement).onclick = () => {
    const nameEl = side.querySelector('[data-km="stamp-name"]') as HTMLInputElement | null;
    ctx.saveStamp(nameEl?.value ?? '');
  };
  (side.querySelector('[data-km="many-close"]') as HTMLButtonElement).onclick = () => {
    ctx.clearMany();
    ctx.canvas()?.setSelectedNodes([]);
    ctx.goNode();
  };
}

