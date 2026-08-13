/**
 * panels/filter-panel.ts — 거르기 · 데이터로 꾸미기 (TASK-KL-202 개편 2, 네 번째 이사).
 *
 * 앞선 셋과 다른 점: 이 패널은 **상태를 들고 있다**(무엇을 껐는지, 어떤 규칙을 켰는지).
 * 그 상태를 패널 안에 두면 패널을 닫을 때마다 사라지므로, 위젯이 들고 있는 것을
 * `ctx.filterState` 로 **빌려 와 직접 고친다** — 고친 뒤 `ctx.applyFilter()` 로 알린다.
 */
import type { PanelCtx } from './context';
import { captureView, applyView, upsertView, isNameUsable } from '../views';
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

  const deg = ctx.focusDegree();
  side.innerHTML = `
    <h4>${esc(t('karmograph.fieldNames.msg'))}</h4>
    <div class="km-hint">${t('karmograph.filterHide', { em: `<b>${esc(t('karmograph.fieldNames.msg2'))}</b>` })}</div>
    <div class="km-secname">${esc(t('karmograph.hideSec.head'))}</div>
    <!-- ★ 「이웃까지만 보기」는 툴바에 따로 있던 고르개다 (TASK-KL-271 P4).
         찾는 건 툴바에서, **덜 보는 건 전부 여기서** — 세 자리로 흩어져 있던 것을 한 자리로. -->
    <div class="km-field">
      <label for="km-f-degree">${esc(t('karmograph.focus.label'))}</label>
      <select id="km-f-degree" data-km="degree">
        <option value=""${deg === '' ? ' selected' : ''}>${esc(t('karmograph.parts.msg'))}</option>
        <option value="0"${deg === '0' ? ' selected' : ''}>${esc(t('karmograph.opt.0'))}</option>
        <option value="1"${deg === '1' ? ' selected' : ''}>${esc(t('karmograph.opt.1'))}</option>
        <option value="2"${deg === '2' ? ' selected' : ''}>${esc(t('karmograph.opt.2'))}</option>
      </select>
      <div class="km-hint">${esc(t('karmograph.focus.hint'))}</div>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.fieldNames.msg3'))}</label>
      ${nodeRows.map((k) => `<label class="km-check"><input type="checkbox" data-km="f-node" value="${esc(k.id)}"${
        st.nodeKinds.has(k.id) ? '' : ' checked'
      } /> ${k.icon} ${esc(k.label)} <span class="km-group-count">${nodeCount(k.id)}</span></label>`).join('')}
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.fieldNames.msg4'))}</label>
      ${edgeRows.map((k) => `<label class="km-check"><input type="checkbox" data-km="f-edge" value="${esc(k.id)}"${
        st.edgeKinds.has(k.id) ? '' : ' checked'
      } /> ${esc(k.label)} <span class="km-group-count">${edgeCount(k.id)}</span></label>`).join('')}
    </div>
    ${tags.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.fieldNames.msg5'))}</label>
      ${tags.map((tg) => `<label class="km-check"><input type="checkbox" data-km="f-tag" value="${esc(tg)}"${
        st.tags.has(tg) ? '' : ' checked'
      } /> ${esc(tg)} <span class="km-group-count">${spec.nodes.filter((n) => (n.tags ?? []).includes(tg)).length}</span></label>`).join('')}
    </div>`}
    ${fieldNames.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.fieldNames.msg6'))}</label>
      <select data-km="f-field">
        <option value="">${esc(t('karmograph.fieldNames.msg7'))}</option>
        ${fieldNames.map((f) => `<option value="${esc(f)}"${st.fieldName === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}
      </select>
      ${st.fieldName === '' ? '' : `<select data-km="f-fieldval">
        <option value="">${esc(t('karmograph.fieldNames.msg8'))}</option>
        ${[...new Set(spec.nodes.map((n) => (n.fields ?? {})[st.fieldName]).filter(Boolean))].sort()
          .map((v) => `<option value="${esc(String(v))}"${st.fieldValue === v ? ' selected' : ''}>${esc(String(v))}</option>`).join('')}
      </select>`}
      <div class="km-hint">${t('karmograph.hint04', { em: `<b>${esc(t('karmograph.fieldNames.msg9'))}</b>` })}</div>
    </div>`}
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-orphan"${st.hideOrphans ? ' checked' : ''} /> ${esc(t('karmograph.fOrphan.label'))}</label>
      <label>${esc(t('karmograph.fieldNames.msg12'))} <b data-km="f-mindeg-val">${st.minDegree}</b>${esc(t('karmograph.fieldNames.msg13'))}</label>
      <input type="range" data-km="f-mindeg" min="0" max="6" step="1" value="${st.minDegree}" />
      <div class="km-hint">${esc(t('karmograph.fieldNames.msg14'))}</div>
    </div>
    <!-- ★ 여기서부터는 **거르기가 아니라 꾸미기**다 (TASK-KL-271 P5).
         색·크기·규칙이 거르기 사이에 섞여 있어서 「거르기」라는 이름과 내용이 안 맞았다 —
         이름과 안 맞는 칸은 두 번 다시 안 열린다(S4). 줄을 긋고 이름을 붙여 갈라 놓는다. -->
    <hr class="km-split" />
    <h4>${esc(t('karmograph.decorate.head'))}</h4>
    <div class="km-hint">${esc(t('karmograph.decorate.hint'))}</div>
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-degree"${st.sizeByDegree ? ' checked' : ''} /> ${esc(t('karmograph.fDegree.label'))}</label>
      <label class="km-check"><input type="checkbox" data-km="f-colortag"${st.colorByTag ? ' checked' : ''} /> ${esc(t('karmograph.fColortag.label'))}</label>
      ${fieldNames.length === 0 ? '' : `<label>${esc(t('karmograph.fieldNames.msg10'))}</label>
      <select data-km="f-colorfield">
        <option value="">${esc(t('karmograph.fieldNames.msg7'))}</option>
        ${fieldNames.map((f) => `<option value="${esc(f)}"${st.colorByField === f ? ' selected' : ''}>${esc(t('karmograph.byField', { field: f }))}</option>`).join('')}
      </select>`}
      <div class="km-hint">${esc(t('karmograph.fieldNames.msg11'))}</div>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.fieldNames.msg15'))} <span class="km-hint">${esc(t('karmograph.fieldNames.msg16'))}</span></label>
      <div class="km-hint">${esc(t('karmograph.fieldNames.msg17'))} <b>${esc(t('karmograph.fieldNames.msg18'))}</b>.</div>
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
        <button class="btn btn-ghost" data-km="rule-del" data-key="${esc(r.id)}" title="${esc(t('karmograph.ruleDel.title'))}">×</button>
      </div>`).join('')}
      <div class="km-link-row">
        <select data-km="rule-on">
          <option value="field">${esc(t('karmograph.opt.field'))}</option>
          <option value="tag">${esc(t('karmograph.fieldNames.msg5'))}</option>
          <option value="kind">${esc(t('karmograph.opt.kind'))}</option>
        </select>
        <input type="text" data-km="rule-key" list="km-fld-suggest2" placeholder="${esc(t('karmograph.ruleKey.ph'))}" />
        <datalist id="km-fld-suggest2">${fieldNames.map((f) => `<option value="${esc(f)}"></option>`).join('')}</datalist>
        <input type="text" data-km="rule-value" placeholder="${esc(t('karmograph.ruleValue.ph'))}" />
        <input type="color" data-km="rule-color" value="#f472b6" title="${esc(t('karmograph.ruleColor.title'))}" />
        <button class="btn btn-ghost" data-km="rule-add">${esc(t('karmograph.ruleAdd.label'))}</button>
      </div>
    </div>
    <!-- ★ **보기 저장** (TASK-KL-271 O2, Kumu 계보). 한 판은 여러 얼굴을 가진다 —
         「1부 시점」 「적대 관계만」. 볼 때마다 거르기를 다시 맞추는 건 매번 같은 일을 손으로
         하는 것이고, 그러다 보면 결국 아무도 안 거른다. 지금 걸러 둔 것을 이름 붙여 재운다. -->
    <div class="km-field">
      <label>${esc(t('karmograph.views.head'))}</label>
      <div class="km-hint">${esc(t('karmograph.views.hint'))}</div>
      ${(spec.views ?? []).map((v) => `<div class="km-link-row">
        <button class="btn btn-ghost km-link-name" data-km="view-go" data-key="${esc(v.id)}">${esc(v.name)}</button>
        <button class="btn btn-ghost" data-km="view-del" data-key="${esc(v.id)}"
          title="${esc(t('karmograph.views.del'))}" aria-label="${esc(t('karmograph.views.del'))}">✕</button>
      </div>`).join('')}
      <div class="km-trow">
        <input type="text" data-km="view-name" placeholder="${esc(t('karmograph.views.ph'))}" />
        <button class="btn btn-ghost" data-km="view-save">${esc(t('karmograph.views.save'))}</button>
      </div>
    </div>
    <button class="btn btn-ghost" data-km="f-reset">${esc(t('karmograph.fReset.label'))}</button>
    <button class="btn btn-ghost" data-km="f-close">${esc(t('karmograph.fClose.label'))}</button>`;

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
  (side.querySelector('[data-km="degree"]') as HTMLSelectElement).onchange = (ev) => {
    ctx.setFocusDegree((ev.target as HTMLSelectElement).value);
  };
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
  /* 보기 저장·되살리기 — 저장하는 것은 「무엇을 보이게 하느냐」뿐이다. 카메라(어디를 보고 있나)는
     일부러 안 담는다: 판을 고치면 자리는 곧 달라지는데 옛 카메라로 끌려가면 「내가 보던 데가
     아니다」가 된다(KL-271 O2). */
  (side.querySelector('[data-km="view-save"]') as HTMLButtonElement).onclick = () => {
    const box = side.querySelector('[data-km="view-name"]') as HTMLInputElement;
    if (!isNameUsable(box.value)) { box.focus(); return; }
    const id = `view-${Date.now().toString(36)}`;
    spec.views = upsertView(spec.views ?? [], captureView(
      box.value, st, ctx.focusDegree(), id, spec._meta?.time ?? ''));
    ctx.persist();
    ctx.refresh();
  };
  side.querySelectorAll('[data-km="view-go"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const hit = (spec.views ?? []).find((v) => v.id === (el as HTMLElement).dataset.key);
      if (!hit) return;
      ctx.setFocusDegree(applyView(hit, st));
      // 「1부 시점 + 인물만」처럼 **언제를 보고 있었나**까지 되살린다 (KL-271 X2).
      if (hit.time && (spec.times ?? []).some((x) => x.id === hit.time)) {
        spec._meta = { ...spec._meta, time: hit.time };
        ctx.canvas()?.render();
        ctx.timesChanged();   // 판 아래 줄도 따라와야 한다 — 안 그러면 화면이 서로 다른 말을 한다
        ctx.persist();        // 되살린 자리는 다시 열어도 그대로여야 한다
      }
      ctx.applyFilter();
      ctx.refresh();
    };
  });
  side.querySelectorAll('[data-km="view-del"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      spec.views = (spec.views ?? []).filter((v) => v.id !== (el as HTMLElement).dataset.key);
      ctx.persist();
      ctx.refresh();
    };
  });
  (side.querySelector('[data-km="f-close"]') as HTMLButtonElement).onclick = ctx.goNode;
}
