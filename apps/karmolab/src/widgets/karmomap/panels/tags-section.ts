/**
 * panels/tags-section.ts — 꼬리표 칸 (TASK-KL-202 개편 2, 노드 패널 세 번째 조각).
 *
 * 이미 쓴 꼬리표를 **칩으로 늘어놓고 눌러서 붙인다** — 같은 말을 두 번 만들지 않게.
 * 새 말은 그냥 타이핑(쉼표로 여럿).
 */
import type { GraphNode } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';

/** 이 맵에 이미 쓰인 꼬리표 (가나다순). */
export function allTagsIn(nodes: GraphNode[]): string[] {
  return [...new Set(nodes.flatMap((n) => n.tags ?? []))].sort();
}

export function tagsFieldHtml(ctx: PanelCtx, node: GraphNode): string {
  const esc = ctx.esc;
  const tags = allTagsIn(ctx.spec().nodes);
  return `
    <div class="km-field">
      <label>꼬리표 <span class="km-hint">쉼표로 여러 개</span></label>
      <input type="text" data-km="edit-tags" value="${esc((node.tags ?? []).join(', '))}" placeholder="영향력 큼, 나중에 다시" />
      ${tags.length === 0 ? '' : `<div class="km-tagbar">${tags
        .map((tg) => `<button class="btn btn-ghost km-tagchip" data-km="tag-add" data-key="${esc(tg)}">${esc(tg)}</button>`)
        .join('')}</div>`}
    </div>`;
}

export function bindTagsField(ctx: PanelCtx, node: GraphNode): void {
  const side = ctx.side;
  const input = side.querySelector('[data-km="edit-tags"]') as HTMLInputElement;
  const apply = (): void => {
    const list = input.value.split(',').map((x) => x.trim()).filter(Boolean);
    node.tags = list.length > 0 ? [...new Set(list)] : undefined;
    ctx.persist();
  };
  // 타이핑 도중마다 저장하면 「영」·「영향」 같은 조각이 꼬리표로 남는다 — 다 쓰고 나서만.
  input.onchange = apply;
  input.onblur = apply;
  side.querySelectorAll('[data-km="tag-add"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const tg = (el as HTMLElement).dataset.key ?? '';
      const cur = input.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (!cur.includes(tg)) cur.push(tg);
      input.value = cur.join(', ');
      apply();
    };
  });
}
