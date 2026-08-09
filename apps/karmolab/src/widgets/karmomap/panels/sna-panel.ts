/**
 * panels/sna-panel.ts — 관계망 읽기 (TASK-KL-202 개편 2, 두 번째 이사).
 *
 * 계산은 `sna.ts` 가 이미 따로였고, 남은 건 그리기와 「가기」 버튼뿐이라 옮기기 쉬웠다.
 */
import { computeSna, topBy } from '../sna';
import type { PanelCtx } from './context';

export function renderSnaPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const live = ctx.canvas()?.getSpec() ?? ctx.spec();
  const sna = computeSna({ nodes: live.nodes, edges: live.edges });
  const nameOf = (id: string): string => live.nodes.find((n) => n.id === id)?.label || '(이름 없음)';

  const list = (title: string, hint: string, rows: { id: string; value: number }[], digits: number): string => `
    <div class="km-field">
      <label>${title}</label>
      <div class="km-hint">${hint}</div>
      ${rows.length === 0
        ? '<div class="km-hint">아직 이어진 것이 없습니다.</div>'
        : rows.map((r) => `<div class="km-link-row">
            <span class="km-link-name">${esc(nameOf(r.id))}</span>
            <span class="km-group-count">${r.value.toFixed(digits)}</span>
            <button class="btn btn-ghost" data-km="go-link" data-key="${esc(r.id)}">가기</button>
          </div>`).join('')}
    </div>`;

  side.innerHTML = `
    <h4>📊 관계망 읽기</h4>
    ${list('이어진 선이 많은 쪽', '허브 — 없어지면 곤란한 자리의 1차 신호.', topBy(sna.degree, 5), 0)}
    ${list('다리 역할', '남들 사이를 잇는 길목. 이 사람이 빠지면 그림이 두 조각 난다.', topBy(sna.betweenness, 5), 1)}
    ${list('모두에게 가까운 쪽', '소문이 가장 빨리 퍼지는 자리.', topBy(sna.closeness, 5), 3)}
    <button class="btn btn-ghost" data-km="sna-focus">다리 역할 셋만 보기</button>
    <button class="btn btn-ghost" data-km="sna-close">닫기</button>`;

  side.querySelectorAll('[data-km="go-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      if (id) ctx.focusNode(id);
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
