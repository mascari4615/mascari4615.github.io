/**
 * panels/groups-panel.ts — 묶음 (TASK-KL-202 개편 2, 여섯 번째 이사).
 *
 * 묶음은 **캔버스가 이미 그릴 줄 아는 것**이고(멤버를 감싸 자동으로 커진다), 이 패널은
 * 만들고·이름 붙이고·색 고르고·감추는 손잡이만 준다.
 */
import type { GroupDef } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';

export function renderGroupsPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);
  side.innerHTML = `
    <h4>🫧 묶음</h4>
    <div class="km-hint">노드를 고른 뒤 「묶음」에서 넣으세요. 묶음 머리를 끌면 안에 든 노드가 같이 움직입니다.</div>
    <div class="km-field">
      ${
        ctx.spec().groups.length === 0
          ? '<div class="km-hint">아직 묶음이 없습니다.</div>'
          : ctx.spec().groups
              .map((g) => {
                const count = ctx.spec().nodes.filter((n) => ctx.memberOf(n).includes(g.id)).length;
                return `<div class="km-group-row" data-group="${esc(g.id)}">
                  <input type="color" data-km="group-color" value="${esc(g.color)}" title="색" />
                  <input type="text" data-km="group-label" value="${esc(g.label)}" />
                  <span class="km-group-count">${count}</span>
                  <button class="btn btn-ghost" data-km="group-shape" title="테두리 모양 — 윤곽/네모">${(g.shape ?? 'box') === 'hull' ? '⬡' : '▭'}</button>
                  <button class="btn btn-ghost" data-km="group-lock" title="잠그면 끌어도 안 움직입니다">${g.locked ? '🔒' : '🔓'}</button>
                  <button class="btn btn-ghost" data-km="group-eye" title="상자 보이기/숨기기">${g.hidden ? '🚫' : '👁'}</button>
                  <button class="btn btn-ghost" data-km="group-del" title="묶음 삭제">×</button>
                </div>`;
              })
              .join('')
      }
    </div>
    <button class="btn btn-primary" data-km="group-add">+ 새 묶음</button>
    <button class="btn btn-ghost" data-km="group-close">닫기</button>`;

  (side.querySelector('[data-km="group-add"]') as HTMLButtonElement).onclick = () => {
    ctx.createGroup();
    ctx.applySpec();
    ctx.persist();
    ctx.refresh();
  };
  (side.querySelector('[data-km="group-close"]') as HTMLButtonElement).onclick = () => {
    ctx.goNode();
  };

  side.querySelectorAll('.km-group-row').forEach((rowEl) => {
    const row = rowEl as HTMLElement;
    const gid = row.dataset.group ?? '';
    const find = (): GroupDef | undefined => ctx.spec().groups.find((g) => g.id === gid);
    (row.querySelector('[data-km="group-label"]') as HTMLInputElement).oninput = (ev) => {
      const g = find();
      if (!g) return;
      g.label = (ev.target as HTMLInputElement).value;
      ctx.canvas()?.render();
      ctx.persist();
    };
    (row.querySelector('[data-km="group-color"]') as HTMLInputElement).oninput = (ev) => {
      const g = find();
      if (!g) return;
      g.color = (ev.target as HTMLInputElement).value;
      ctx.canvas()?.render();
      ctx.persist();
    };
    (row.querySelector('[data-km="group-shape"]') as HTMLButtonElement).onclick = (ev) => {
      const g = find();
      if (!g) return;
      g.shape = (g.shape ?? 'box') === 'hull' ? 'box' : 'hull';
      (ev.currentTarget as HTMLButtonElement).textContent = g.shape === 'hull' ? '⬡' : '▭';
      ctx.canvas()?.render();
      ctx.persist();
    };
    (row.querySelector('[data-km="group-lock"]') as HTMLButtonElement).onclick = (ev) => {
      const g0 = find();
      if (!g0) return;
      // 잠긴 묶음은 아예 안 잡힌다 — 자물쇠는 이름표 앞에도 붙어 눈으로 보인다.
      g0.locked = g0.locked ? undefined : true;
      (ev.currentTarget as HTMLButtonElement).textContent = g0.locked ? '🔒' : '🔓';
      ctx.canvas()?.render();
      ctx.persist();
    };
    (row.querySelector('[data-km="group-eye"]') as HTMLButtonElement).onclick = (ev) => {
      const g = find();
      if (!g) return;
      // 상자만 감춘다 — 소속은 그대로라 다시 켜면 그대로 나온다.
      g.hidden = g.hidden ? undefined : true;
      (ev.currentTarget as HTMLButtonElement).textContent = g.hidden ? '🚫' : '👁';
      ctx.canvas()?.render();
      ctx.persist();
    };
    (row.querySelector('[data-km="group-del"]') as HTMLButtonElement).onclick = () => {
      // 묶음만 없앤다 — 안에 든 노드는 그 자리에 남는다.
      ctx.spec().groups = ctx.spec().groups.filter((g) => g.id !== gid);
      for (const n of ctx.spec().nodes) {
        const rest = ctx.memberOf(n).filter((x) => x !== gid);
        if (rest.length !== ctx.memberOf(n).length) ctx.setMembership(n, rest);
      }
      ctx.applySpec();
      ctx.persist();
    ctx.refresh();
    };
  });
}

