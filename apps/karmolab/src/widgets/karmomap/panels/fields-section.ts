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
import { t, loadNamespace } from '../../../lib/i18n';

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
  const has = (name: string): boolean => Object.prototype.hasOwnProperty.call(node.fields ?? {}, name);
  const suggest = kindFieldNames(ctx, node).filter((n) => !has(n));
  // 이 맵에 아직 아무도 안 쓴 종류라면 **팩이 들고 있는 틀**을 시작값으로 권한다 —
  // 빈 칸에서 시작하면 무엇을 적을지 몰라 아무것도 안 적는다 (World Anvil 의 template 계보).
  const template = (ctx.nodeKinds().find((k) => k.id === node.kind)?.fields ?? []).filter((n) => !has(n));
  // 칸에 「소속: 마왕성」이라고 적었는데 마왕성이 이 맵의 노드라면, 그건 **관계**다.
  // 글로만 남으면 그림에 안 나온다 — 선으로 올릴지 물어본다 (Airtable 의 「다른 표 연결」 계보).
  const linked = new Set(
    ctx.spec().edges.filter((e) => e.from === node.id || e.to === node.id)
      .map((e) => (e.from === node.id ? e.to : e.from)),
  );
  const promotable = Object.entries(node.fields ?? {})
    .map(([field, value]) => {
      const hit = ctx.spec().nodes.find((n) => n.id !== node.id && n.label && n.label === value.trim());
      return hit && !linked.has(hit.id) ? { field, id: hit.id, label: hit.label } : null;
    })
    .filter((x): x is { field: string; id: string; label: string } => Boolean(x));
  return `
    <div class="km-field">
      <label>${esc(t('karmomap.t416'))} <span class="km-hint">이 ${esc(ctx.kindLabel(node.kind))}에 대해 적어 두는 것</span></label>
      ${rows.map(([name, value], i) => `<div class="km-link-row">
        <input type="text" class="km-field-name" data-km="fld-name" data-key="${esc(name)}" value="${esc(name)}" />
        <input type="text" data-km="fld-value" data-key="${esc(name)}" value="${esc(value)}" placeholder="${esc(t('karmomap.t413'))}" />
        <button class="btn btn-ghost" data-km="fld-del" data-key="${esc(name)}" title="${esc(t('karmomap.t414'))}">×</button>
      </div>${i === rows.length - 1 ? '' : ''}`).join('')}
      ${promotable.length === 0 ? '' : `<div class="km-hint">${t('karmomap.fieldPromote', { em: `<b>${esc(t('karmomap.t418'))}</b>` })}</div>
      ${promotable.map((p) => `<div class="km-link-row">
        <span class="km-link-name">${esc(p.field)}: ${esc(p.label)}</span>
        <button class="btn btn-ghost" data-km="fld-link" data-key="${esc(p.field)}" data-to="${esc(p.id)}">${esc(t('karmomap.t420'))}</button>
      </div>`).join('')}`}
      <div class="km-link-row">
        <input type="text" data-km="fld-new" list="km-fld-suggest" placeholder="${esc(t('karmomap.t415'))}" />
        <datalist id="km-fld-suggest">${suggest.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        <button class="btn btn-ghost" data-km="fld-add">${esc(t('karmomap.t421'))}</button>
      </div>
      ${suggest.length === 0 ? '' : `<div class="km-hint">같은 종류가 쓰는 칸: ${suggest.slice(0, 6).map((n) => esc(n)).join(' · ')}</div>`}
      ${template.length === 0 ? '' : `<button class="btn btn-ghost" data-km="fld-template">틀 한 벌 넣기: ${template.map((n) => esc(n)).join(' · ')}</button>`}
    </div>`;
}

export function bindFieldsSection(ctx: PanelCtx, node: GraphNode, touch: (redrawSide: boolean) => void): void {
  const side = ctx.side;
  const fields = (): Record<string, string> => (node.fields ??= {});

  side.querySelectorAll('[data-km="fld-value"]').forEach((el) => {
    const input = el as HTMLInputElement;
    input.oninput = () => {
      fields()[input.dataset.key ?? ''] = input.value;
      touch(false);   // 타자 중에는 패널을 다시 그리지 않는다 — 커서가 날아간다.
    };
    // 다 치고 손을 뗄 때만 다시 그린다. 그래야 「이 값이 이 맵의 노드다 → 선으로 잇겠나」가
    // 그 자리에서 뜬다(타자 한 글자마다 다시 그리면 아무것도 못 친다).
    input.onchange = () => {
      const value = input.value.trim();
      const hit = ctx.spec().nodes.some((n) => n.id !== node.id && n.label && n.label === value);
      if (hit) touch(true);
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
  side.querySelectorAll('[data-km="fld-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const to = (el as HTMLElement).dataset.to ?? '';
      const label = (el as HTMLElement).dataset.key ?? '';
      if (!to) return;
      ctx.linkWithLabel(node.id, to, label);
      touch(true);
    };
  });
  const tpl = side.querySelector('[data-km="fld-template"]') as HTMLButtonElement | null;
  if (tpl) {
    tpl.onclick = () => {
      const kind = ctx.nodeKinds().find((k) => k.id === node.kind);
      for (const name of kind?.fields ?? []) fields()[name] = fields()[name] ?? '';
      touch(true);
    };
  }
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
