/**
 * styles.ts — Cockpit 전용 CSS inject (TASK-KL-082 단위 G/H highlight + 전체 CSS).
 */

const STYLE_ID = 'ck-cockpit-styles';

const CSS = `
/* ── Cockpit 위젯 레이아웃 ─────────────────────────────────────────────────── */
.ck-cockpit {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  /* 배경 = KarmoLab 부모 상속. --ck-bg 로 커스텀 가능 (예: '#000' / 'rgba(20,20,30,0.6)'). */
  background: var(--ck-bg, transparent);
  color: #e2e8f0;
  font-family: var(--font-sans, system-ui, sans-serif);
  overflow: hidden;
}

/* ── 탭 바 ─────────────────────────────────────────────────────────────────── */
.ck-tab-bar {
  display: flex;
  gap: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
  height: 38px;
  align-items: flex-end;
}
.ck-tab {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(226,232,240,0.45);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  white-space: nowrap;
  user-select: none;
}
.ck-tab:hover { color: rgba(226,232,240,0.8); }
.ck-tab.active {
  color: #60a5fa;
  border-bottom-color: #60a5fa;
}

/* ── 탭 패널 ────────────────────────────────────────────────────────────────── */
.ck-panel {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.ck-panel.hidden { display: none; }

/* ── Graph 탭 컨트롤 바 ─────────────────────────────────────────────────────── */
.ck-graph-controls {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 10;
  display: flex;
  gap: 6px;
  align-items: center;
}
.ck-ctrl-btn {
  background: var(--glass-strong);
  border: 1px solid var(--border-hover);
  color: var(--text-secondary);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.ck-ctrl-btn:hover {
  background: rgba(96,165,250,0.15);
  color: #60a5fa;
  border-color: rgba(96,165,250,0.3);
}

/* ── 상태 표시 ─────────────────────────────────────────────────────────────── */
.ck-status-bar {
  position: absolute;
  bottom: 175px;  /* 미니맵 위 */
  right: 16px;
  z-index: 10;
  font-size: 10px;
  color: rgba(226,232,240,0.3);
  font-family: var(--font-mono, ui-monospace, monospace);
  text-align: right;
  pointer-events: none;
}

/* 노드 활성 하이라이트 / edge flow 애니메이션 = 캔버스 소관 →
   lib/graph/styles.ts 로 이주 (TASK-KL-087). 캔버스가 스스로 주입한다. */

/* ── 로딩 오버레이 ───────────────────────────────────────────────────────────── */
.ck-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10,12,16,0.7);
  color: #22d3ee;
  font-size: 13px;
  font-family: var(--font-mono, ui-monospace, monospace);
  z-index: 100;
  pointer-events: none;
}

/* ── TASK 탭 ─────────────────────────────────────────────────────────────────── */
.ck-task-pane {
  height: 100%;
  overflow: hidden;
}
`;

export function injectCockpitStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
