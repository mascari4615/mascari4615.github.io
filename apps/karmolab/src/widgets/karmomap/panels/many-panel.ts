/**
 * panels/many-panel.ts — 여럿 고름 (TASK-KL-202 개편 2, 일곱 번째 이사).
 *
 * 고른 개수를 먼저 말하고(«N개 골랐음»), 지우기는 확인을 받는다 — 한 번에 여럿을 바꾸는
 * 자리에서 되돌릴 수 없는 일은 반드시 한 번 물어야 한다.
 */
import type { PanelCtx } from './context';

export function renderManyPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  side.innerHTML = `
    <h4>◫ ${ctx.selectedMany().length}개 골랐음 <button class="btn btn-ghost km-h4btn" data-km="many-close">해제</button></h4>
    <div class="km-hint">캔버스에서 <b>Shift+드래그</b>로 범위를 칠하면 여럿이 골라집니다. 고른 것 중 하나를 끌면 함께 움직입니다.</div>
    <div class="km-field">
      <label>한꺼번에 묶음에 넣기</label>
      <select data-km="many-group">
        <option value="">— 고르세요 —</option>
        ${ctx.spec().groups.map((g) => `<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('')}
        <option value="__new">+ 새 묶음</option>
      </select>
    </div>
    <div class="km-field">
      <label>한꺼번에 종류 바꾸기</label>
      <select data-km="many-kind">
        <option value="">— 고르세요 —</option>
        ${ctx.nodeKinds().map((k) => `<option value="${k.id}">${k.icon} ${esc(k.label)}</option>`).join('')}
      </select>
    </div>
    <div class="km-field">
      <label>이 한 벌을 「본」으로</label>
      <div class="km-hint">자주 쓰는 덩어리(세력 한 벌·삼각관계)를 떠 두면 <b>다른 맵에도 찍을 수</b> 있습니다.</div>
      <div class="km-link-row">
        <input type="text" data-km="stamp-name" placeholder="본 이름 (예: 세력 한 벌)" />
        <button class="btn btn-ghost" data-km="stamp-save">본으로 저장</button>
      </div>
    </div>
    <div class="km-field">
      <label>고른 것</label>
      <div class="km-table">
        ${ctx.selectedMany().map((id) => {
          const n = ctx.spec().nodes.find((x) => x.id === id);
          if (!n) return '';
          const tags = (n.tags ?? []).join(', ');
          return `<div class="km-trow" data-key="${esc(id)}">
            <input type="text" data-km="many-name" value="${esc(n.label)}" title="이름" />
            <span class="km-tcell">${ctx.kindIcon(n.kind)} ${esc(ctx.kindLabel(n.kind))}</span>
            <span class="km-tcell km-tdim" title="${esc(tags)}">${tags ? esc(tags) : '—'}</span>
            <button class="btn btn-ghost" data-km="many-go" title="가기">→</button>
          </div>`;
        }).join('')}
      </div>
      <div class="km-hint">이름은 여기서 바로 고칠 수 있어요.</div>
    </div>
    <button class="btn btn-danger" data-km="many-del">${ctx.selectedMany().length}개 모두 삭제</button>
`;

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
    if (!confirm(`고른 ${ctx.selectedMany().length}개 노드와 거기 붙은 선을 모두 지울까요?`)) return;
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

