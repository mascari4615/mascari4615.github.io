/**
 * panels/edge-panel.ts — 관계 하나 (TASK-KL-202 개편 2, 아홉 번째 이사 = 마지막).
 *
 * 「언제부터 라이벌인가」는 어느 한쪽 인물의 설명이 아니라 **그 선의 것**이다.
 * 종류·선 위에 쓸 말·긴 이야기·꼬리표·화살표 방향을 여기서 고친다.
 */
import type { PanelCtx } from './context';
import { docFieldHtml, bindDocField, EDGE_DOC_SKIN } from './doc-section';
import { t, loadNamespace } from '../../../lib/i18n';
import { setFace, edgeAt } from '../times';

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
  const nameOf = (id: string): string => ctx.spec().nodes.find((n) => n.id === id)?.label || t('karmograph.unnamed');
  side.classList.remove('hidden');
  side.innerHTML = `
    <h4>${esc(t('karmograph.nameOf.msg'))}</h4>
    <div class="km-hint">${esc(nameOf(edge.from))} → ${esc(nameOf(edge.to))}</div>
    <div class="km-field">
      <label>${esc(t('karmograph.nameOf.msg2'))}</label>
      <select data-km="ed-kind">${ctx.edgeKindOptionsHtml(edge.kind)}</select>
    </div>
    <div class="km-field">
      <label>${esc(t('karmograph.nameOf.msg3'))}</label>
      <input type="text" data-km="ed-label" value="${esc(edge.label ?? '')}" placeholder="${esc(t('karmograph.edLabel.ph'))}" />
    </div>
    ${docFieldHtml(ctx, edge, EDGE_DOC_SKIN)}
    <div class="km-field">
      <label>${esc(t('karmograph.nameOf.msg4'))}</label>
      <div class="km-hint">${t('karmograph.edgeBothViews', { em: `<b>${esc(t('karmograph.nameOf.msg5'))}</b>` })}</div>
      <input type="text" data-km="ed-view-from" value="${esc(edge.viewFrom ?? '')}"
        placeholder="${esc(nameOf(edge.from))} 가 보는 ${esc(nameOf(edge.to))}" />
      <input type="text" data-km="ed-view-to" value="${esc(edge.viewTo ?? '')}"
        placeholder="${esc(nameOf(edge.to))} 가 보는 ${esc(nameOf(edge.from))}" />
    </div>
    ${(() => {
      /* ★ **이 시점에서는** (TASK-KL-271 X2). 시점을 안 쓰는 판에는 아예 안 나온다.
         비우면 원래대로 — 그래야 「1부는 원본, 2부만 다르게」가 손에 붙는다. */
      const times = ctx.spec().times ?? [];
      if (times.length === 0) return '';
      const nowId = ctx.spec()._meta?.time || times[0].id;
      const nowName = times.find((x) => x.id === nowId)?.name ?? '';
      const face = edge.at?.[nowId] ?? {};
      return `<div class="km-field">
        <label>${esc(t('karmograph.face.head', { name: nowName }))}</label>
        <div class="km-hint">${esc(t('karmograph.face.hint'))}</div>
        <input type="text" data-km="ed-face-label" value="${esc(face.label ?? '')}"
          placeholder="${esc(edge.label ?? '')}" />
        <select data-km="ed-face-kind">
          <option value="">${esc(t('karmograph.face.same'))}</option>
          ${ctx.edgeKindOptionsHtml(face.kind ?? '')}
        </select>
        <label class="km-check"><input type="checkbox" data-km="ed-face-gone"${face.gone ? ' checked' : ''} />
          ${esc(t('karmograph.face.gone'))}</label>
      </div>`;
    })()}
    <div class="km-field">
      <label>${esc(t('karmograph.nameOf.msg6'))} <span class="km-hint">${esc(t('karmograph.nameOf.msg7'))}</span></label>
      <input type="text" data-km="ed-tags" value="${esc((edge.tags ?? []).join(', '))}" />
    </div>
    <button class="btn btn-ghost" data-km="ed-both">${edge.arrowStart ? t('karmograph.edBoth.label') : t('karmograph.edBoth.label2')}</button>
    <button class="btn btn-danger" data-km="ed-del">${esc(t('karmograph.edDel.label'))}</button>
    <button class="btn btn-ghost" data-km="ed-close">${esc(t('karmograph.edClose.label'))}</button>`;

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
  // 두 마음은 이제 **선 위에도 그려진다**(KL-271 X1) — 적는 즉시 판이 따라가야 한다.
  // 예전엔 여기 적어도 화면이 그대로라, 적어 둔 사람만 아는 이야기가 됐다.
  (side.querySelector('[data-km="ed-view-from"]') as HTMLInputElement).oninput = (ev) => {
    edge.viewFrom = (ev.target as HTMLInputElement).value.trim() || undefined;
    save();
  };
  (side.querySelector('[data-km="ed-view-to"]') as HTMLInputElement).oninput = (ev) => {
    edge.viewTo = (ev.target as HTMLInputElement).value.trim() || undefined;
    save();
  };
  /* 이 시점의 얼굴 — 비우면 자리째 지운다(빈 껍데기가 쌓이면 「시점 이야기를 한다」가 거짓이 된다). */
  const faceBox = side.querySelector('[data-km="ed-face-label"]') as HTMLInputElement | null;
  if (faceBox) {
    const times = ctx.spec().times ?? [];
    const nowId = ctx.spec()._meta?.time || times[0]?.id || '';
    const kindSel = side.querySelector('[data-km="ed-face-kind"]') as HTMLSelectElement;
    const goneBox = side.querySelector('[data-km="ed-face-gone"]') as HTMLInputElement;
    const write = (): void => {
      const next = setFace(edge, nowId, {
        label: faceBox.value, kind: kindSel.value, gone: goneBox.checked,
      });
      edge.at = next.at;
      ctx.canvas()?.render();
      ctx.persist();
    };
    faceBox.oninput = write;
    kindSel.onchange = write;
    goneBox.onchange = write;
  }
  (side.querySelector('[data-km="ed-tags"]') as HTMLInputElement).onchange = (ev) => {
    const list = (ev.target as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean);
    edge.tags = list.length > 0 ? [...new Set(list)] : undefined;
    ctx.persist();
  };
  (side.querySelector('[data-km="ed-both"]') as HTMLButtonElement).onclick = (ev) => {
    edge.arrowStart = edge.arrowStart ? undefined : true;
    (ev.currentTarget as HTMLButtonElement).textContent = edge.arrowStart ? t('karmograph.edBoth.label') : t('karmograph.edBoth.label2');
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

