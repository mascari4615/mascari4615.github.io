/**
 * lib/karmograph/styles.ts — 캔버스가 그리는 요소의 CSS (TASK-KL-087 단위 0).
 *
 * 캔버스 자신이 constructor 에서 주입한다 — 호출자가 잊을 수 없게.
 * cockpit chrome (탭 바 / 컨트롤 버튼 / 상태줄 / 로딩)은 여기 없다,
 * 그건 `widgets/cockpit/styles.ts` 소관.
 */

const STYLE_ID = 'kl-graph-canvas-styles';

export const GRAPH_CANVAS_CSS = `
/* ── 판에 자판으로 들어왔을 때 ────────────────────────────────────────────────
   Tab 으로 판에 닿을 수 있게 했으니(canvas-a11y), **닿은 것이 보여야** 한다 —
   테두리가 없으면 자판만 쓰는 사람은 초점이 어디 있는지 모른 채 화살표를 누른다.
   마우스로 누를 때는 안 뜬다(:focus-visible). */
.ck-board:focus { outline: none; }
.ck-board:focus-visible { outline: 2px solid #22d3ee; outline-offset: -2px; }
/* ── 단계 띠 ─────────────────────────────────────────────────────────────────
   배경이라 아무것도 가리면 안 된다: 색은 아주 옅게, 글자는 작게, 클릭은 통과시킨다. */
.ck-lane { pointer-events: none; }
.ck-lane-label {
  font-size: 11px;
  fill: currentColor;
  opacity: .45;
  letter-spacing: .04em;
}

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
/* ★ 짚는 자리는 **보이는 점보다 크다**. 손가락 기계(pointer: coarse)에서는 44px 규격에 맞춰
   더 키운다 — 12px 짜리 과녁은 손가락에게 없는 것과 같다(실측 2026-08-14). */
.ck-link-hit { fill: transparent; }
@media (pointer: coarse) {
  .ck-link-hit { r: 22px; }
  /* 손가락으로는 「올려 두기」가 없다 — 고른 카드의 점은 늘 보이게 둔다. */
  .ck-node.is-selected .ck-link-dot { r: 8px; }
}
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
