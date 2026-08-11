/**
 * panels/tags-section.ts — 꼬리표 칸 (TASK-KL-202 개편 2, 노드 패널 세 번째 조각).
 *
 * 이미 쓴 꼬리표를 **칩으로 늘어놓고 눌러서 붙인다** — 같은 말을 두 번 만들지 않게.
 * 새 말은 그냥 타이핑(쉼표로 여럿).
 */
import type { GraphNode } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

/** 이 맵에 이미 쓰인 꼬리표 (가나다순). */
export function allTagsIn(nodes: GraphNode[]): string[] {
  return [...new Set(nodes.flatMap((n) => n.tags ?? []))].sort();
}

export function tagsFieldHtml(ctx: PanelCtx, node: GraphNode): string {
  const esc = ctx.esc;
  const tags = allTagsIn(ctx.spec().nodes);
  return `
    <div class="km-field">
      <label>${esc(t('karmograph.t426'))} <span class="km-hint">${esc(t('karmograph.t427'))}</span></label>
      <input type="text" data-km="edit-tags" value="${esc((node.tags ?? []).join(', '))}" placeholder="${esc(t('karmograph.t425'))}" />
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

  /** 지금 쓰고 있는 조각 = 마지막 쉼표 뒤. 제안은 그 조각으로만 거른다. */
  const lastToken = (): string => (input.value.split(',').pop() ?? '').trim().toLowerCase();
  const already = (): string[] => input.value.split(',').map((x) => x.trim()).filter(Boolean);

  const syncChips = (): void => {
    const token = lastToken();
    const used = new Set(already().map((x) => x.toLowerCase()));
    let shown = 0;
    side.querySelectorAll('[data-km="tag-add"]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      const tg = (btn.dataset.key ?? '').toLowerCase();
      // 이미 붙인 것은 제안할 이유가 없고, 조각과 안 맞는 것도 뺀다.
      const hit = !used.has(tg) && (!token || tg.includes(token));
      btn.hidden = !hit;
      if (hit) shown += 1;
    });
    const bar = side.querySelector('.km-tagbar') as HTMLElement | null;
    if (bar) bar.hidden = shown === 0;
  };
  input.addEventListener('input', syncChips);
  syncChips();

  // Enter = 첫 제안을 붙인다. 타이핑하다 손을 안 떼고 이어 갈 수 있게.
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const first = [...side.querySelectorAll('[data-km="tag-add"]')]
      .find((el) => !(el as HTMLButtonElement).hidden) as HTMLButtonElement | undefined;
    if (!first) return;
    ev.preventDefault();
    first.click();
  });
  side.querySelectorAll('[data-km="tag-add"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const tg = (el as HTMLElement).dataset.key ?? '';
      const cur = input.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (!cur.includes(tg)) cur.push(tg);
      // 붙일 때는 쓰던 조각을 지우고 그 자리에 넣는다 — 「영향」 치다 칩을 누르면 「영향, 영향력 큼」이 되면 안 된다.
      const head = cur.slice(0, -1);
      const typing = (cur[cur.length - 1] ?? '');
      const base = typing && tg.toLowerCase().includes(typing.toLowerCase()) ? head : cur;
      if (!base.includes(tg)) base.push(tg);
      input.value = base.join(', ');
      apply();
      syncChips();
    };
  });
}
