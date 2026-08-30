/**
 * panels/sna-panel.ts. 관계망 읽기 (TASK-KL-202 개편 2, 두 번째 이사).
 *
 * 계산은 `sna.ts` 가 이미 따로였고, 남은 건 그리기와 가기 버튼뿐이라 옮기기 쉬웠다.
 */
import { computeSna, topBy, structuralGaps } from '../sna';
import { snaLines, islandCount } from '../sna-words';
import { fieldGaps } from '../field-gaps';
import { resolveEdges } from '../times';
import { findClusters, clustersWorthTelling } from '../clusters';
import type { PanelCtx } from './context';
import { t, loadNamespace } from '../../../lib/i18n';

export function renderSnaPanel(ctx: PanelCtx): void {
  const { side, esc } = ctx;
  side.classList.remove('hidden');
  ctx.canvas()?.setSelectedNode(null);

  const raw = ctx.canvas()?.getSpec() ?? ctx.spec();
  /* 판을 **읽어 세는 곳**도 시점을 따른다 (KL-271 X2). 화면과 설명이 어긋나면 둘 중 하나가
     틀린 것보다 나쁘다. 2부를 보는데 관계망은 1부 것이 그 꼴이었다. */
  const live = { ...raw, edges: resolveEdges(raw.edges, raw._meta?.time ?? '') };
  const sna = computeSna({ nodes: live.nodes, edges: live.edges });
  const nameOf = (id: string): string => live.nodes.find((n) => n.id === id)?.label || t('karmograph.unnamed');

  // 순위만으로는 그래서 뭘 하지가 안 나온다. 이을 자리를 짚어 준다.
  const gaps = structuralGaps({ nodes: live.nodes, edges: live.edges });

  const list = (title: string, hint: string, rows: { id: string; value: number }[], digits: number): string => `
    <div class="km-field">
      <label>${title}</label>
      <div class="km-hint">${hint}</div>
      ${rows.length === 0
        ? t('karmograph.list.msg2')
        : rows.map((r) => `<div class="km-link-row">
            <span class="km-link-name">${esc(nameOf(r.id))}</span>
            <span class="km-group-count">${r.value.toFixed(digits)}</span>
            <button class="btn btn-ghost" data-km="go-link" data-key="${esc(r.id)}">${esc(t('karmograph.goLink.label'))}</button>
          </div>`).join('')}
    </div>`;

  /* ★ **숫자 앞에 말 한 줄** (TASK-KL-271 L2). 연결 3.4, 다리 0.21은 이미 아는 사람에게만
     말을 건다. 처음 보는 사람에게는 그래서 뭐?로 끝나 열어 보고 닫는 칸이었다.
     무슨 말을 할지는 `sna-words` 가 정하고(검사로 잠근다), 여기서는 말만 골라 끼운다. */
  const topDeg = topBy(sna.degree, 1)[0];
  const topBtw = topBy(sna.betweenness, 1)[0];
  const lonely = live.nodes
    .filter((n) => !live.edges.some((e) => e.from === n.id || e.to === n.id))
    .map((n) => n.label || t('karmograph.unnamed'));
  const lines = snaLines({
    nodes: live.nodes.length,
    edges: live.edges.length,
    hub: topDeg ? { name: nameOf(topDeg.id), count: Math.round(topDeg.value) } : undefined,
    bridge: topBtw ? { name: nameOf(topBtw.id), score: topBtw.value } : undefined,
    lonely,
    islands: islandCount(live.nodes.map((n) => n.id), live.edges),
  });
  const saidHtml = `<div class="km-field km-said">${lines
    .map((l) => `<div class="km-said-line">${t(`karmograph.said.${l.kind}`, l.vars as Record<string, string>)}</div>`)
    .join('')}</div>`;

  /* ★ **아직 안 적은 칸** (TASK-KL-271 L6). 위의 이어질 법한데 안 이어진 사이와 짝이다 . 
     이건 **적힐 법한데 안 적힌 칸**. 카드를 하나씩 눌러 보지 않으면 알 수 없던 것이라
     세계관을 짓는 사람이 가장 자주 하는 질문(무엇을 더 채워야 하나)에 도구가 처음 답한다. */
  /* ★ **무리** (TASK-KL-271 L3). 관계망 칸은 끊긴 덩어리는 세지만, 다 이어져 있는 판 안에서
     누가 누구랑 한 패인가는 안 말했다. 학교 무리와 가족 무리가 한 사람으로만 붙어 있어도
     눈으로는 그 경계가 안 보인다. Gephi, Kumu 가 파는 자리. */
  const clusters = findClusters(live.nodes.map((n) => n.id), live.edges);
  const cluHtml = !clustersWorthTelling(clusters) ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.clusters.head'))}</label>
      <div class="km-hint">${esc(t('karmograph.clusters.hint'))}</div>
      <div class="km-clu-line">${esc(t('karmograph.clusters.line', {
        n: String(clusters.length),
        size: String(clusters[0].members.length),
        names: clusters[0].members.slice(0, 3).map(nameOf).join(', '),
      }))}</div>
    </div>`;

  const holes = fieldGaps(live.nodes);
  const holesHtml = holes.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.gapField.head'))}</label>
      <div class="km-hint">${esc(t('karmograph.gapField.hint'))}</div>
      ${holes.map((h) => `<div class="km-gap-line">${esc(t(
        h.none ? 'karmograph.gapField.none' : 'karmograph.gapField.some',
        { field: h.field, kind: ctx.kindLabel(h.kind), total: String(h.total), missing: String(h.missing) },
      ))}</div>`).join('')}
    </div>`;

  side.innerHTML = `
    <h4>${esc(t('karmograph.list.msg3'))}</h4>
    <!-- ★ **말이 먼저, 숫자가 나중** (KL-271 L2 의 뜻). 무리, 안 적은 칸도 읽으면 바로 아는 말인데
         숫자 목록 셋 뒤에 있어서 접힌 자리 밖으로 밀려났다(실측 2026-08-14: 684, 756px / 보이는 795px . 
         카드가 조금만 늘면 안 보인다). 말끼리 앞에 모은다. -->
    ${saidHtml}
    ${cluHtml}
    ${holesHtml}
    ${list(t('karmograph.list.msg4'), t('karmograph.list.msg5'), topBy(sna.degree, 5), 0)}
    ${list(t('karmograph.list.msg6'), t('karmograph.list.msg7'), topBy(sna.betweenness, 5), 1)}
    ${list(t('karmograph.list.msg8'), t('karmograph.list.msg9'), topBy(sna.closeness, 5), 3)}
    ${gaps.length === 0 ? '' : `<div class="km-field">
      <label>${esc(t('karmograph.list.msg10'))}</label>
      <div class="km-hint">${esc(t('karmograph.list.msg11'))}</div>
      ${gaps.slice(0, 5).map((g0) => `<div class="km-link-row">
        <span class="km-link-name">${esc(nameOf(g0.a))} ↔ ${esc(nameOf(g0.b))}</span>
        <span class="km-group-count">${esc(t('karmograph.gap.shared', { n: String(g0.shared) }))}</span>
        <button class="btn btn-ghost" data-km="gap-link" data-key="${esc(g0.a)}" data-to="${esc(g0.b)}">${esc(t('karmograph.gapLink.label'))}</button>
      </div>`).join('')}
    </div>`}
    <button class="btn btn-ghost" data-km="sna-focus">${esc(t('karmograph.snaFocus.label'))}</button>
    <button class="btn btn-ghost" data-km="sna-close">${esc(t('karmograph.snaClose.label'))}</button>`;

  side.querySelectorAll('[data-km="go-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const id = (el as HTMLElement).dataset.key ?? '';
      if (id) ctx.focusNode(id);
    };
  });
  side.querySelectorAll('[data-km="gap-link"]').forEach((el) => {
    (el as HTMLButtonElement).onclick = () => {
      const a0 = (el as HTMLElement).dataset.key ?? '';
      const b0 = (el as HTMLElement).dataset.to ?? '';
      if (!a0 || !b0) return;
      ctx.linkWithLabel(a0, b0, '');
      ctx.refresh();
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
