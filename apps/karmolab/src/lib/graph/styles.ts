/**
 * lib/graph/styles.ts — 캔버스가 그리는 요소의 CSS (TASK-KL-087 단위 0).
 *
 * 캔버스 자신이 constructor 에서 주입한다 — 호출자가 잊을 수 없게.
 * cockpit chrome (탭 바 / 컨트롤 버튼 / 상태줄 / 로딩)은 여기 없다,
 * 그건 `widgets/cockpit/styles.ts` 소관.
 */

const STYLE_ID = 'kl-graph-canvas-styles';

const CSS = `
/* ── 노드 활성 하이라이트 ──────────────────────────────────────────────────── */
.ck-node.is-active > rect:first-of-type {
  stroke: #22d3ee !important;
  stroke-width: 2 !important;
  filter: url(#ck-glow);
}

@keyframes ck-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.ck-node.is-active {
  animation: ck-pulse 2s ease-in-out infinite;
}

/* ── 선택 표시 (편집 UI 용 — 활성 하이라이트와 별개) ────────────────────────── */
.ck-node.is-selected > rect:first-of-type {
  stroke: #f0abfc !important;
  stroke-width: 2.5 !important;
}

/* ── edge flow 애니메이션 ─────────────────────────────────────────────────── */
@keyframes ck-flow {
  to { stroke-dashoffset: -24; }
}
.ck-edge.is-flowing {
  stroke-dasharray: 8 4 !important;
  stroke-dashoffset: 0;
  animation: ck-flow 0.8s linear infinite;
  stroke-opacity: 1 !important;
}
`;

export function injectGraphCanvasStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
