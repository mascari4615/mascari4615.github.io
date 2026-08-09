/**
 * lib/graph/styles.ts — 캔버스가 그리는 요소의 CSS (TASK-KL-087 단위 0).
 *
 * 캔버스 자신이 constructor 에서 주입한다 — 호출자가 잊을 수 없게.
 * cockpit chrome (탭 바 / 컨트롤 버튼 / 상태줄 / 로딩)은 여기 없다,
 * 그건 `widgets/cockpit/styles.ts` 소관.
 */

const STYLE_ID = 'kl-graph-canvas-styles';

export const GRAPH_CANVAS_CSS = `
/* ── 노드 활성 하이라이트 ──────────────────────────────────────────────────── */
.ck-node.is-active > .ck-node-bg {
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
.ck-node.is-selected > .ck-node-bg {
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

/* ── 연결 손잡이 — 노드에 올리거나 고르면 나타난다 (Miro/FigJam 의 파란 점) ── */
.ck-link-handle {
  opacity: 0;
  cursor: crosshair;
  transition: opacity .12s ease;
}
.ck-node:hover .ck-link-handle,
.ck-node.is-selected .ck-link-handle { opacity: 1; }
.ck-edge-grip {
  opacity: 0;
  cursor: ns-resize;
  transition: opacity .12s ease;
}
.ck-edges:hover .ck-edge-grip { opacity: 0.9; }
.ck-node.is-drop-target > .ck-node-bg {
  stroke: #4ade80 !important;
  stroke-width: 2.5 !important;
}
.ck-edge-end { transition: r .12s ease; }
/* ── 포커스 — 볼 것만 또렷하게 (지우지 않고 잠깐 가린다) ────────────────── */
.ck-node.is-dimmed { opacity: 0.16; }
.ck-edge.is-dimmed, .ck-edge-label.is-dimmed, .ck-leader.is-dimmed { opacity: 0.07; }
.ck-edge-grip.is-dimmed, .ck-edge-end.is-dimmed { opacity: 0 !important; pointer-events: none; }
.ck-node, .ck-edge, .ck-edge-label, .ck-leader { transition: opacity .15s ease; }
.ck-marquee {
  fill: rgba(129, 140, 248, 0.12);
  stroke: #818cf8;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}
.ck-link-temp {
  pointer-events: none;
  stroke-dasharray: 5 4;
}
`;

export function injectGraphCanvasStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = GRAPH_CANVAS_CSS;
  document.head.appendChild(tag);
}
