/**
 * panels/filter-panel.ts — 거르기 · 데이터로 꾸미기 (TASK-KL-202 개편 2, 네 번째 이사).
 *
 * 앞선 셋과 다른 점: 이 패널은 **상태를 들고 있다**(무엇을 껐는지, 어떤 규칙을 켰는지).
 * 그 상태를 패널 안에 두면 패널을 닫을 때마다 사라지므로, 위젯이 들고 있는 것을
 * `ctx.filterState` 로 **빌려 와 직접 고친다** — 고친 뒤 `ctx.applyFilter()` 로 알린다.
 */
import type { PanelCtx } from './context';

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
    <h4>🔍 거르기</h4>
    <div class="km-hint">체크를 끄면 그 종류가 <b>화면에서만</b> 빠집니다. 지우는 게 아닙니다.</div>
    <div class="km-field">
      <label>노드 종류</label>
      ${nodeRows.map((k) => `<label class="km-check"><input type="checkbox" data-km="f-node" value="${esc(k.id)}"${
        st.nodeKinds.has(k.id) ? '' : ' checked'
      } /> ${k.icon} ${esc(k.label)} <span class="km-group-count">${nodeCount(k.id)}</span></label>`).join('')}
    </div>
    <div class="km-field">
      <label>관계 종류</label>
      ${edgeRows.map((k) => `<label class="km-check"><input type="checkbox" data-km="f-edge" value="${esc(k.id)}"${
        st.edgeKinds.has(k.id) ? '' : ' checked'
      } /> ${esc(k.label)} <span class="km-group-count">${edgeCount(k.id)}</span></label>`).join('')}
    </div>
    ${tags.length === 0 ? '' : `<div class="km-field">
      <label>꼬리표</label>
      ${tags.map((tg) => `<label class="km-check"><input type="checkbox" data-km="f-tag" value="${esc(tg)}"${
        st.tags.has(tg) ? '' : ' checked'
      } /> ${esc(tg)} <span class="km-group-count">${spec.nodes.filter((n) => (n.tags ?? []).includes(tg)).length}</span></label>`).join('')}
    </div>`}
    ${fieldNames.length === 0 ? '' : `<div class="km-field">
      <label>칸으로 좁히기</label>
      <select data-km="f-field">
        <option value="">— 안 씀 —</option>
        ${fieldNames.map((f) => `<option value="${esc(f)}"${st.fieldName === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}
      </select>
      ${st.fieldName === '' ? '' : `<select data-km="f-fieldval">
        <option value="">이 칸이 있는 것 전부</option>
        ${[...new Set(spec.nodes.map((n) => (n.fields ?? {})[st.fieldName]).filter(Boolean))].sort()
          .map((v) => `<option value="${esc(String(v))}"${st.fieldValue === v ? ' selected' : ''}>${esc(String(v))}</option>`).join('')}
      </select>`}
      <div class="km-hint">「출신 = 마계」처럼 좁힙니다. 값을 안 고르면 <b>그 칸을 적어 둔 것 전부</b>가 남습니다 — 안 적은 쪽을 찾을 때 씁니다.</div>
    </div>`}
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-degree"${st.sizeByDegree ? ' checked' : ''} /> 많이 이어진 것을 크게</label>
      <label class="km-check"><input type="checkbox" data-km="f-colortag"${st.colorByTag ? ' checked' : ''} /> 꼬리표로 색 입히기</label>
      ${fieldNames.length === 0 ? '' : `<label>칸 값으로 물들이기</label>
      <select data-km="f-colorfield">
        <option value="">— 안 씀 —</option>
        ${fieldNames.map((f) => `<option value="${esc(f)}"${st.colorByField === f ? ' selected' : ''}>${esc(f)}별로</option>`).join('')}
      </select>`}
      <div class="km-hint">손으로 키우지 않아도 중심 인물이 눈에 띕니다. 저장본은 그대로예요.</div>
    </div>
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-orphan"${st.hideOrphans ? ' checked' : ''} /> 선이 하나도 안 닿은 노드 숨기기</label>
      <label>선이 <b data-km="f-mindeg-val">${st.minDegree}</b>개 이상인 것만</label>
      <input type="range" data-km="f-mindeg" min="0" max="6" step="1" value="${st.minDegree}" />
      <div class="km-hint">이웃이 빠지면 그 여파로 또 빠집니다 — 한가운데 뭉치만 남습니다.</div>
    </div>
    <div class="km-field">
      <label>꾸미기 규칙 <span class="km-hint">「이런 것은 이렇게」</span></label>
      <div class="km-hint">체크박스로는 「소속이 마왕성이면 빨갛게」를 못 적습니다. 조건과 모양을 직접 씁니다 — <b>아래 규칙이 이깁니다</b>.</div>
      ${(spec.decorRules ?? []).map((r) => `<div class="km-link-row">
        <span class="km-link-name">${esc(r.on === 'tag' ? `꼬리표 ${r.value ?? ''}` : r.on === 'kind' ? `종류 ${ctx.kindLabel(r.value ?? '')}` : `${r.key ?? ''} = ${r.value || '(있으면)'}`)}</span>
        <span class="km-swatch" style="background:${esc(r.color ?? '#94a3b8')}"></span>
        <span class="km-group-count">${r.scale && r.scale !== 1 ? `×${r.scale}` : ''}</span>
        <button class="btn btn-ghost" data-km="rule-del" data-key="${esc(r.id)}" title="지우기">×</button>
      </div>`).join('')}
      <div class="km-link-row">
        <select data-km="rule-on">
          <option value="field">칸</option>
          <option value="tag">꼬리표</option>
          <option value="kind">종류</option>
        </select>
        <input type="text" data-km="rule-key" list="km-fld-suggest2" placeholder="칸 이름" />
        <datalist id="km-fld-suggest2">${fieldNames.map((f) => `<option value="${esc(f)}"></option>`).join('')}</datalist>
        <input type="text" data-km="rule-value" placeholder="값" />
        <input type="color" data-km="rule-color" value="#f472b6" title="색" />
        <button class="btn btn-ghost" data-km="rule-add">규칙 추가</button>
      </div>
    </div>
    <button class="btn btn-ghost" data-km="f-reset">전부 다시 보이기</button>
    <button class="btn btn-ghost" data-km="f-close">닫기</button>`;

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
