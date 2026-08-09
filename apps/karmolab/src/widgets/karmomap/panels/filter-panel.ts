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

  // 목록 = 지금 팩의 종류 + **이 맵에 실제로 쓰인 종류**. 팩을 바꾼 뒤에는 화면에 보이는
  // 종류가 팩 목록에 없을 수 있는데, 그러면 「보이는데 끌 수가 없는」 종류가 생긴다.
  const packNodeKinds = ctx.nodeKinds();
  const packEdgeKinds = ctx.edgeKinds();
  const nodeRows = [
    ...packNodeKinds,
    ...[...new Set(spec.nodes.map((n) => n.kind))]
      .filter((id) => !packNodeKinds.some((k) => k.id === id))
      .map((id) => ({ id, label: ctx.kindLabel(id), icon: ctx.kindIcon(id) })),
  ];
  const edgeRows = [
    ...packEdgeKinds,
    ...[...new Set(spec.edges.map((e) => e.kind))]
      .filter((id) => !packEdgeKinds.some((k) => k.id === id))
      .map((id) => ({ id, label: ctx.edgeLabel(id) })),
  ];
  const tags = [...new Set(spec.nodes.flatMap((n) => n.tags ?? []))].sort();

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
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-degree"${st.sizeByDegree ? ' checked' : ''} /> 많이 이어진 것을 크게</label>
      <label class="km-check"><input type="checkbox" data-km="f-colortag"${st.colorByTag ? ' checked' : ''} /> 꼬리표로 색 입히기</label>
      <div class="km-hint">손으로 키우지 않아도 중심 인물이 눈에 띕니다. 저장본은 그대로예요.</div>
    </div>
    <div class="km-field">
      <label class="km-check"><input type="checkbox" data-km="f-orphan"${st.hideOrphans ? ' checked' : ''} /> 선이 하나도 안 닿은 노드 숨기기</label>
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
  (side.querySelector('[data-km="f-degree"]') as HTMLInputElement).onchange = (ev) => {
    st.sizeByDegree = (ev.target as HTMLInputElement).checked;
    ctx.applyDecorate();
  };
  (side.querySelector('[data-km="f-colortag"]') as HTMLInputElement).onchange = (ev) => {
    st.colorByTag = (ev.target as HTMLInputElement).checked;
    ctx.applyDecorate();
  };
  (side.querySelector('[data-km="f-reset"]') as HTMLButtonElement).onclick = () => {
    st.nodeKinds.clear();
    st.edgeKinds.clear();
    st.tags.clear();
    st.hideOrphans = false;
    st.sizeByDegree = false;
    st.colorByTag = false;
    ctx.applyFilter();
    ctx.applyDecorate();
    ctx.refresh();
  };
  (side.querySelector('[data-km="f-close"]') as HTMLButtonElement).onclick = ctx.goNode;
}
