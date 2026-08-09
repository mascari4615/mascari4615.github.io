/**
 * panels/edge-panel.ts — 관계 하나 (TASK-KL-202 개편 2, 아홉 번째 이사 = 마지막).
 *
 * 「언제부터 라이벌인가」는 어느 한쪽 인물의 설명이 아니라 **그 선의 것**이다.
 * 종류·선 위에 쓸 말·긴 이야기·꼬리표·화살표 방향을 여기서 고친다.
 */
import type { PanelCtx } from './context';
import { docFieldHtml, bindDocField, EDGE_DOC_SKIN } from './doc-section';

/**
 * 선 패널 — 관계 자체에 붙는 이야기 (격차 Z).
 * 「언제부터 라이벌인가」는 어느 한쪽 인물의 설명이 아니다. 노드에만 적을 곳을 두면 갈 데가 없다.
 */
export function renderEdgePanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  const edge = ctx.selectedEdge();
  if (!edge) {
    ctx.goNode();
    return;
  }
  const nameOf = (id: string): string => ctx.spec().nodes.find((n) => n.id === id)?.label || '(이름 없음)';
  side.classList.remove('hidden');
  side.innerHTML = `
    <h4>― 관계</h4>
    <div class="km-hint">${esc(nameOf(edge.from))} → ${esc(nameOf(edge.to))}</div>
    <div class="km-field">
      <label>무슨 관계</label>
      <select data-km="ed-kind">${ctx.edgeKindOptionsHtml(edge.kind)}</select>
    </div>
    <div class="km-field">
      <label>선 위에 쓸 말</label>
      <input type="text" data-km="ed-label" value="${esc(edge.label ?? '')}" placeholder="비우면 안 보임" />
    </div>
    ${docFieldHtml(ctx, edge, EDGE_DOC_SKIN)}
    <div class="km-field">
      <label>꼬리표 <span class="km-hint">쉼표로 여러 개</span></label>
      <input type="text" data-km="ed-tags" value="${esc((edge.tags ?? []).join(', '))}" />
    </div>
    <button class="btn btn-ghost" data-km="ed-both">${edge.arrowStart ? '양쪽 화살표 ↔' : '한쪽 화살표 →'}</button>
    <button class="btn btn-danger" data-km="ed-del">이 선 지우기</button>
    <button class="btn btn-ghost" data-km="ed-close">닫기</button>`;

  const save = (): void => {
    ctx.canvas()?.render();
    ctx.persist();
  };
  (side.querySelector('[data-km="ed-kind"]') as HTMLSelectElement).onchange = (ev) => {
    const old = ctx.edgeLabel(edge.kind);
    edge.kind = (ev.target as HTMLSelectElement).value;
    if (!edge.label || edge.label === old) edge.label = ctx.edgeLabel(edge.kind);
    save();
    ctx.refresh();
  };
  (side.querySelector('[data-km="ed-label"]') as HTMLInputElement).oninput = (ev) => {
    edge.label = (ev.target as HTMLInputElement).value;
    save();
  };
  // 글의 집이 둘(제자리·공용)이라 노드 패널과 **같은 조각**을 쓴다 — 규칙이 갈리면 한쪽만 고쳐진다.
  bindDocField(ctx, edge, (redrawSide) => {
    ctx.persist();
    if (redrawSide) ctx.refresh();
  }, () => {}, EDGE_DOC_SKIN);
  (side.querySelector('[data-km="ed-tags"]') as HTMLInputElement).onchange = (ev) => {
    const list = (ev.target as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean);
    edge.tags = list.length > 0 ? [...new Set(list)] : undefined;
    ctx.persist();
  };
  (side.querySelector('[data-km="ed-both"]') as HTMLButtonElement).onclick = (ev) => {
    edge.arrowStart = edge.arrowStart ? undefined : true;
    (ev.currentTarget as HTMLButtonElement).textContent = edge.arrowStart ? '양쪽 화살표 ↔' : '한쪽 화살표 →';
    save();
  };
  (side.querySelector('[data-km="ed-del"]') as HTMLButtonElement).onclick = () => {
    // 지우기는 위젯이 한다 — ctx.spec() 은 읽기용이라 여기서 배열을 갈아 끼워도 안 먹는다.
    ctx.removeEdge(edge.id);
    ctx.applySpec();
    ctx.persist();
    ctx.goNode();
  };
  (side.querySelector('[data-km="ed-close"]') as HTMLButtonElement).onclick = () => {
    ctx.goNode();
  };
}

