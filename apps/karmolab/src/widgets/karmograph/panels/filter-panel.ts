/**
 * panels/filter-panel.ts — 거르기 · 데이터로 꾸미기 (TASK-KL-202 개편 2, 네 번째 이사).
 *
 * 앞선 셋과 다른 점: 이 패널은 **상태를 들고 있다**(무엇을 껐는지, 어떤 규칙을 켰는지).
 * 그 상태를 패널 안에 두면 패널을 닫을 때마다 사라지므로, 위젯이 들고 있는 것을
 * `ctx.filterState` 로 **빌려 와 직접 고친다** — 고친 뒤 `ctx.applyFilter()` 로 알린다.
 */
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderFilterPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  const spec = ctx.spec();
  const st = ctx.filterState;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const nodeCount = (id: string): number => spec.nodes.filter((n) => n.kind === id).length;
  const edgeCount = (id: string): number => spec.edges.filter((e) => e.kind === id).length;

  // ★ 목록 = **이 맵에 실제로 쓰인 종류만**. 종류가 스물여섯인데 안 쓴 것까지 늘어놓으면
  //   「끌 게 없는 스위치」가 대부분이 된다 — 거르기는 있는 것만 거르면 된다.
  const nodeRows = [...new Set(spec.nodes.map((n) => n.kind))]
    .map((id) => ({ id, label: ctx.kindLabel(id), icon: ctx.kindIcon(id) }));
  const edgeRows = [...new Set(spec.edges.map((e) => e.kind))]
    .map((id) => ({ id, label: ctx.edgeLabel(id) }));
  const tags = [...new Set(spec.nodes.flatMap((n) => n.tags ?? []))].sort();
  // 이 맵에서 실제로 쓰인 칸 이름들 — 안 쓴 칸을 늘어놓으면 고를 게 없는 목록이 된다.
  const fieldNames = [...new Set(spec.nodes.flatMap((n) => Object.keys(n.fields ?? {})))].sort();

  side.innerHTML = `
    <h4>${esc(t('karmograph.t233'))}</h4>
    <div class="km-hint">${t('karmograph.filterHide', { em: `<b>${esc(t('karmograph.t235'))}</b>` })}</div>
    <div class="km-field">
      <label>${esc(t('karmograph.t237'))}</label>
      ${nodeRows.map((k) => `<label class="km-check"><input type="checkbox" data-km="f-node" value="${esc(k.id)}"${
        st.nodeKinds.has(k.id) ? '' : ' checked'
      } /> ${k.icon} ${esc(k.label)} <span class="km-group-count">${nodeCount(k.id)}</span></label>`).join('')}
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.t238'))}</label>
      ${edgeRows.map((k) => `<label class="km-check"><input type="checkbox" data-km="f-edge" value="${esc(k.id)}"${
        st.edgeKinds.has(k.id) ? '' : ' checked'
      } /> ${esc(k.label)} <span class="km-group-count">${edgeCount(k.id)}</span></label>`).join('')}
    </div>
    ${tags.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.t239'))}</label>
      ${tags.map((tg) => `<label class="km-check"><input type="checkbox" data-km="f-tag" value="${esc(tg)}"${
        st.tags.has(tg) ? '' : ' checked'
      } /> ${esc(tg)} <span class="km-group-count">${spec.nodes.filter((n) => (n.tags ?? []).includes(tg)).length}</span></label>`).join('')}
    </div>`}
    ${fieldNames.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.t240'))}</label>
      <select data-km="f-field">
        <option value="">${esc(t('karmograph.t241'))}</option>
        ${fieldNames.map((f) => `<option value="${esc(f)}"${st.fieldName === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}
      </select>
      ${st.fieldName === '' ? '' : `<select data-km="f-fieldval">
        <option value="">${esc(t('karmograph.t242'))}</option>
        ${[...new Set(spec.nodes.map((n) => (n.fields ?? {})[st.fieldName]).filter(Boolean))].sort()
          .map((v) => `<option value="${esc(String(v))}"${st.fieldValue === v ? ' selected' : ''}>${esc(String(v))}</option>`).join('')}
      </select>`}
      <div class="km-hint">${t('karmograph.hint04', { em: `<b>${esc(t('karmograph.t244'))}</b>` })}</div>
    </div>`}
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-degree"${st.sizeByDegree ? ' checked' : ''} /> ${esc(t('karmograph.t246'))}</label>
      <label class="km-check"><input type="checkbox" data-km="f-colortag"${st.colorByTag ? ' checked' : ''} /> ${esc(t('karmograph.t247'))}</label>
      ${fieldNames.length === 0 ? '' : `<label>${esc(t('karmograph.t248'))}</label>
      <select data-km="f-colorfield">
        <option value="">${esc(t('karmograph.t241'))}</option>
        ${fieldNames.map((f) => `<option value="${esc(f)}"${st.colorByField === f ? ' selected' : ''}>${esc(t('karmograph.byField', { field: f }))}</option>`).join('')}
      </select>`}
      <div class="km-hint">${esc(t('karmograph.t249'))}</div>
    </div>
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-orphan"${st.hideOrphans ? ' checked' : ''} /> ${esc(t('karmograph.t250'))}</label>
      <label>${esc(t('karmograph.t251'))} <b data-km="f-mindeg-val">${st.minDegree}</b>${esc(t('karmograph.t252'))}</label>
      <input type="range" data-km="f-mindeg" min="0" max="6" step="1" value="${st.minDegree}" />
      <div class="km-hint">${esc(t('karmograph.t253'))}</div>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.t254'))} <span class="km-hint">${esc(t('karmograph.t255'))}</span></label>
      <div class="km-hint">${esc(t('karmograph.t256'))} <b>${esc(t('karmograph.t257'))}</b>.</div>
      ${(spec.decorRules ?? []).map((r) => `<div class="km-link-row">
        <span class="km-link-name">${esc(
          r.on === 'tag'
            ? t('karmograph.ruleTag', { value: r.value ?? '' })
            : r.on === 'kind'
              ? t('karmograph.ruleKind', { value: ctx.kindLabel(r.value ?? '') })
              : `${r.key ?? ''} = ${r.value || t('karmograph.ruleAny')}`
        )}</span>
        <span class="km-swatch" style="background:${esc(r.color ?? '#94a3b8')}"></span>
        <span class="km-group-count">${r.scale && r.scale !== 1 ? `×${r.scale}` : ''}</span>
        <button class="btn btn-ghost" data-km="rule-del" data-key="${esc(r.id)}" title="${esc(t('karmograph.t229'))}">×</button>
      </div>`).join('')}
      <div class="km-link-row">
        <select data-km="rule-on">
          <option value="field">${esc(t('karmograph.opt.field'))}</option>
          <option value="tag">${esc(t('karmograph.t239'))}</option>
          <option value="kind">${esc(t('karmograph.opt.kind'))}</option>
        </select>
        <input type="text" data-km="rule-key" list="km-fld-suggest2" placeholder="${esc(t('karmograph.t230'))}" />
        <datalist id="km-fld-suggest2">${fieldNames.map((f) => `<option value="${esc(f)}"></option>`).join('')}</datalist>
        <input type="text" data-km="rule-value" placeholder="${esc(t('karmograph.t231'))}" />
        <input type="color" data-km="rule-color" value="#f472b6" title="${esc(t('karmograph.t232'))}" />
        <button class="btn btn-ghost" data-km="rule-add">${esc(t('karmograph.t258'))}</button>
      </div>
    </div>
    <button class="btn btn-ghost" data-km="f-reset">${esc(t('karmograph.t259'))}</button>
    <button class="btn btn-ghost" data-km="f-close">${esc(t('karmograph.t260'))}</button>`;

  const toggleInto = (set: Set<string>, sel: string): void => {
    side.querySelectorAll(sel).forEach((el) => {
      (el as HTMLInputElement).onchange = (ev) => {
        const box = ev.target as HTMLInputElement;
        if (box.checked) set.delete(box.value);
        else set.add(box.value);
        ctx.applyFilter();
      };
    });
  };
  toggleInto(st.nodeKinds, '[data-km="f-node"]');
  toggleInto(st.edgeKinds, '[data-km="f-edge"]');
  toggleInto(st.tags, '[data-km="f-tag"]');

  (side.querySelector('[data-km="f-orphan"]') as HTMLInputElement).onchange = (ev) => {
    st.hideOrphans = (ev.target as HTMLInputElement).checked;
    ctx.applyFilter();
  };
  const minDegEl = side.querySelector('[data-km="f-mindeg"]') as HTMLInputElement | null;
  if (minDegEl) {
    minDegEl.oninput = () => {
      st.minDegree = Number(minDegEl.value);
      const out = side.querySelector('[data-km="f-mindeg-val"]');
      if (out) out.textContent = String(st.minDegree);
      ctx.applyFilter();
    };
  }
  (side.querySelector('[data-km="f-degree"]') as HTMLInputElement).onchange = (ev) => {
    st.sizeByDegree = (ev.target as HTMLInputElement).checked;
    ctx.applyDecorate();
  };
  const colorFieldSel = side.querySelector('[data-km="f-colorfield"]') as HTMLSelectElement | null;
  if (colorFieldSel) {
    colorFieldSel.onchange = () => {
      st.colorByField = colorFieldSel.value;
      ctx.applyDecorate();
    };
  }
  (side.querySelector('[data-km="f-colortag"]') as HTMLInputElement).onchange = (ev) => {
    st.colorByTag = (ev.target as HTMLInputElement).checked;
    ctx.applyDecorate();
  };
  (side.querySelector('[data-km="rule-add"]') as HTMLButtonElement).onclick = () => {
    const on = (side.querySelector('[data-km="rule-on"]') as HTMLSelectElement).value as 'tag' | 'field' | 'kind';
    const key = (side.querySelector('[data-km="rule-key"]') as HTMLInputElement).value.trim();
    const value = (side.querySelector('[data-km="rule-value"]') as HTMLInputElement).value.trim();
    const color = (side.querySelector('[data-km="rule-color"]') as HTMLInputElement).value;
    if (on === 'field' && !key) return;         // 칸 규칙은 칸 이름이 있어야 뜻이 선다
    if (on !== 'field' && !value) return;       // 꼬리표·종류 규칙은 값이 곧 조건이다
    const spec0 = ctx.spec();
    spec0.decorRules = [...(spec0.decorRules ?? []), {
      id: `rule-${Date.now().toString(36)}`, on, key: on === 'field' ? key : undefined, value: value || undefined, color,
    }];
    ctx.applySpec();
    ctx.persist();
    ctx.refresh();
  };
  side.querySelectorAll('[data-km="rule-del"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      const spec0 = ctx.spec();
      spec0.decorRules = (spec0.decorRules ?? []).filter((r) => r.id !== id);
      ctx.applySpec();
      ctx.persist();
      ctx.refresh();
    };
  });
  const fieldSel = side.querySelector('[data-km="f-field"]') as HTMLSelectElement | null;
  if (fieldSel) {
    fieldSel.onchange = () => {
      st.fieldName = fieldSel.value;
      st.fieldValue = '';   // 칸을 바꾸면 옛 값은 뜻이 없다
      ctx.applyFilter();
      ctx.refresh();        // 값 목록이 그 칸 것으로 바뀌어야 한다
    };
  }
  const fieldValSel = side.querySelector('[data-km="f-fieldval"]') as HTMLSelectElement | null;
  if (fieldValSel) {
    fieldValSel.onchange = () => {
      st.fieldValue = fieldValSel.value;
      ctx.applyFilter();
    };
  }
  (side.querySelector('[data-km="f-reset"]') as HTMLButtonElement).onclick = () => {
    st.nodeKinds.clear();
    st.edgeKinds.clear();
    st.tags.clear();
    st.hideOrphans = false;
    st.minDegree = 0;
    st.sizeByDegree = false;
    st.colorByTag = false;
    st.fieldName = '';
    st.fieldValue = '';
    st.colorByField = '';
    ctx.applyFilter();
    ctx.applyDecorate();
    ctx.refresh();
  };
  (side.querySelector('[data-km="f-close"]') as HTMLButtonElement).onclick = ctx.goNode;
}
