/**
 * panels/fields-section.ts — 이 노드만의 칸 (TASK-KL-202, Tana 슈퍼태그 계보).
 *
 * 인물에게는 「출신·소속」, 사건에는 「시점」, 개념에는 「출처」가 필요하다. 그런데 종류마다
 * 칸을 **미리 정의하게 만들면** 아무도 안 쓴다 — 첫 노드를 놓기 전에 스키마부터 짜야 하기 때문이다.
 *
 * 그래서 스키마를 **쓰면서 자라게** 둔다: 칸 이름은 자유롭게 적고, *같은 종류의 다른 노드가 쓴
 * 이름*이 후보로 뜬다. 세 번째 인물부터는 고르기만 하면 되고, 결과적으로 종류마다 칸이 정렬된다.
 */
import type { GraphNode } from '../../../lib/graph/spec';
import type { PanelCtx } from './context';

/** 같은 종류의 다른 노드들이 쓰고 있는 칸 이름 (많이 쓰인 순). */
function kindFieldNames(ctx: PanelCtx, node: GraphNode): string[] {
  const count = new Map<string, number>();
  for (const n of ctx.spec().nodes) {
    if (n.kind !== node.kind || n.id === node.id) continue;
    for (const name of Object.keys(n.fields ?? {})) count.set(name, (count.get(name) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export function fieldsSectionHtml(ctx: PanelCtx, node: GraphNode): string {
  const esc = ctx.esc;
  const rows = Object.entries(node.fields ?? {});
  const suggest = kindFieldNames(ctx, node).filter((n) => !(node.fields ?? {})[n]);
  return `
    <div class="km-field">
      <label>칸 <span class="km-hint">이 ${esc(ctx.kindLabel(node.kind))}에 대해 적어 두는 것</span></label>
      ${rows.map(([name, value], i) => `<div class="km-link-row">
        <input type="text" class="km-field-name" data-km="fld-name" data-key="${esc(name)}" value="${esc(name)}" />
        <input type="text" data-km="fld-value" data-key="${esc(name)}" value="${esc(value)}" placeholder="내용" />
        <button class="btn btn-ghost" data-km="fld-del" data-key="${esc(name)}" title="이 칸 지우기">×</button>
      </div>${i === rows.length - 1 ? '' : ''}`).join('')}
      <div class="km-link-row">
        <input type="text" data-km="fld-new" list="km-fld-suggest" placeholder="새 칸 이름 (예: 출신)" />
        <datalist id="km-fld-suggest">${suggest.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        <button class="btn btn-ghost" data-km="fld-add">추가</button>
      </div>
      ${suggest.length === 0 ? '' : `<div class="km-hint">같은 종류가 쓰는 칸: ${suggest.slice(0, 6).map((n) => esc(n)).join(' · ')}</div>`}
    </div>`;
}

export function bindFieldsSection(ctx: PanelCtx, node: GraphNode, touch: (redrawSide: boolean) => void): void {
  const side = ctx.side;
  const fields = (): Record<string, string> => (node.fields ??= {});

  side.querySelectorAll('[data-km="fld-value"]').forEach((el) => {
    const input = el as HTMLInputElement;
    input.oninput = () => {
      fields()[input.dataset.key ?? ''] = input.value;
      touch(false);
    };
  });
  // 칸 **이름**을 고치는 것은 자리 옮기기다 — 순서를 지키려 새로 담는다(그냥 지웠다 넣으면 맨 뒤로 간다).
  side.querySelectorAll('[data-km="fld-name"]').forEach((el) => {
    const input = el as HTMLInputElement;
    input.onchange = () => {
      const old = input.dataset.key ?? '';
      const next = input.value.trim();
      if (!next || next === old) return;
      const rebuilt: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields())) rebuilt[k === old ? next : k] = v;
      node.fields = rebuilt;
      touch(true);
    };
  });
  side.querySelectorAll('[data-km="fld-del"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      delete fields()[(el as HTMLElement).dataset.key ?? ''];
      if (Object.keys(fields()).length === 0) node.fields = undefined;
      touch(true);
    };
  });
  const add = (): void => {
    const box = side.querySelector('[data-km="fld-new"]') as HTMLInputElement | null;
    const name = (box?.value ?? '').trim();
    if (!name) return;
    fields()[name] = fields()[name] ?? '';
    touch(true);
  };
  (side.querySelector('[data-km="fld-add"]') as HTMLButtonElement).onclick = add;
  (side.querySelector('[data-km="fld-new"]') as HTMLInputElement).onkeydown = (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); add(); }
  };
}
