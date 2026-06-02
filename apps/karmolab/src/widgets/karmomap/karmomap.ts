/**
 * karmomap/karmomap.ts — KarmoMap 위젯 렌더러 (TASK-KL-087).
 * lib/graph/canvas.ts (GraphCanvas) + localStorage 어댑터 사용.
 * 세계관 마인드맵 — Character/Place/Item/Event/Concept 노드, 관계 엣지.
 */

import { GraphCanvas } from '../../lib/graph/canvas';
import { KarmomapLocalStorageAdapter } from './local-storage-adapter';
import {
  NODE_KINDS, EDGE_KINDS, NODE_KIND_COLORS, NODE_KIND_LABELS, NODE_KIND_ICONS,
  EDGE_KIND_DEFS, DEFAULT_NODE_W, DEFAULT_NODE_H,
  type NodeKind, type EdgeKind,
} from './kinds';
import type { GraphSpec, GraphNode, GraphEdge } from '../../lib/graph/spec';

// ─── 샘플 스펙 ────────────────────────────────────────────────────────────────

function makeSampleSpec(): GraphSpec {
  return {
    version: 1,
    _meta: { created: new Date().toISOString() },
    groups: [],
    nodes: [
      { id: 'n1', kind: 'Character', label: '욘 (Yon)',      group: '', x: 100, y: 100, w: DEFAULT_NODE_W, h: DEFAULT_NODE_H, ports: [] },
      { id: 'n2', kind: 'Place',     label: '카르모 왕국',   group: '', x: 320, y: 80,  w: DEFAULT_NODE_W, h: DEFAULT_NODE_H, ports: [] },
      { id: 'n3', kind: 'Concept',   label: '마나',          group: '', x: 320, y: 180, w: DEFAULT_NODE_W, h: DEFAULT_NODE_H, ports: [] },
      { id: 'n4', kind: 'Item',      label: '불꽃의 검',     group: '', x: 540, y: 80,  w: DEFAULT_NODE_W, h: DEFAULT_NODE_H, ports: [] },
      { id: 'n5', kind: 'Event',     label: '카르모 전쟁',   group: '', x: 540, y: 180, w: DEFAULT_NODE_W, h: DEFAULT_NODE_H, ports: [] },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', kind: 'relates' },
      { id: 'e2', from: 'n1', to: 'n3', kind: 'relates' },
      { id: 'e3', from: 'n4', to: 'n1', kind: 'relates' },
      { id: 'e4', from: 'n5', to: 'n2', kind: 'contains' },
    ],
    ephemeral_anchors: [],
    _edge_kinds: Object.fromEntries(
      Object.entries(EDGE_KIND_DEFS).map(([k, v]) => [k, { color: v.color, style: v.style, arrow: v.arrow }])
    ),
  };
}

// ─── 상태 ──────────────────────────────────────────────────────────────────

type EdgeDrawState = { sourceNodeId: string } | null;

// ─── 스타일 주입 ──────────────────────────────────────────────────────────────

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.km-wrap {
  display:flex; flex-direction:column; width:100%; height:100%;
  background:var(--bg-primary,#0d1117); color:var(--text-primary,#e2e8f0);
  font-family:var(--font-sans,system-ui,sans-serif);
}
.km-toolbar {
  display:flex; align-items:center; gap:6px; padding:6px 10px;
  background:var(--bg-secondary,#131720); border-bottom:1px solid var(--border,#1e2740);
  flex-wrap:wrap; flex-shrink:0;
}
.km-toolbar input[type=text] {
  flex:1; min-width:120px; max-width:200px;
  padding:4px 8px; border-radius:4px;
  background:var(--bg-primary,#0d1117); color:var(--text-primary,#e2e8f0);
  border:1px solid var(--border,#1e2740); font-size:12px;
}
.km-toolbar select {
  padding:4px 6px; border-radius:4px; font-size:12px;
  background:var(--bg-primary,#0d1117); color:var(--text-primary,#e2e8f0);
  border:1px solid var(--border,#1e2740);
}
.km-btn {
  padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer;
  border:1px solid var(--border,#1e2740);
  background:var(--bg-primary,#0d1117); color:var(--text-primary,#e2e8f0);
  white-space:nowrap;
}
.km-btn:hover { background:var(--bg-secondary,#131720); border-color:var(--accent,#60a5fa); }
.km-btn.primary { background:var(--accent,#60a5fa); color:#000; border-color:var(--accent,#60a5fa); }
.km-btn.primary:hover { opacity:0.85; }
.km-btn.danger { border-color:#f87171; color:#f87171; }
.km-btn.danger:hover { background:#f8717120; }
.km-btn.active { border-color:#fbbf24; color:#fbbf24; background:#fbbf2412; }
.km-canvas-wrap { flex:1; position:relative; overflow:hidden; }
.km-status {
  padding:3px 10px; font-size:11px; background:var(--bg-secondary,#131720);
  border-top:1px solid var(--border,#1e2740); color:var(--text-secondary,#64748b);
  flex-shrink:0;
}
.km-separator { width:1px; height:18px; background:var(--border,#1e2740); margin:0 2px; }
/* 노드 클릭 edge-draw 모드 하이라이트 */
.km-edge-draw-mode .ck-node { cursor:crosshair !important; }
.km-node-selected rect:first-child { stroke:#fbbf24 !important; stroke-width:2.5 !important; }
  `;
  document.head.appendChild(style);
}

// ─── 렌더 함수 ───────────────────────────────────────────────────────────────

export function renderKarmomap(container: HTMLElement): void {
  injectStyles();
  container.innerHTML = '';

  const adapter = new KarmomapLocalStorageAdapter();

  // spec 로드 (sync fallback)
  let spec: GraphSpec = adapter.loadSync() ?? makeSampleSpec();
  if (!adapter.loadSync()) adapter.saveFullSpec(spec);

  let edgeDrawState: EdgeDrawState = null;
  let selectedNodeId: string | null = null;
  let edgeKindForNew: EdgeKind = 'relates';

  // ── DOM 구성 ──────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'km-wrap';

  // 툴바
  const toolbar = document.createElement('div');
  toolbar.className = 'km-toolbar';

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = '노드 레이블';
  labelInput.setAttribute('aria-label', '노드 레이블');

  const kindSelect = document.createElement('select');
  kindSelect.setAttribute('aria-label', '노드 종류');
  for (const k of NODE_KINDS) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = `${NODE_KIND_ICONS[k]} ${NODE_KIND_LABELS[k]}`;
    kindSelect.appendChild(opt);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'km-btn primary';
  addBtn.textContent = '+ 노드';

  const sep1 = document.createElement('div');
  sep1.className = 'km-separator';

  const edgeKindSelect = document.createElement('select');
  edgeKindSelect.setAttribute('aria-label', '엣지 종류');
  for (const k of EDGE_KINDS) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = EDGE_KIND_DEFS[k].label;
    edgeKindSelect.appendChild(opt);
  }

  const edgeBtn = document.createElement('button');
  edgeBtn.className = 'km-btn';
  edgeBtn.textContent = '엣지 연결';
  edgeBtn.title = '클릭 후 소스 노드 → 대상 노드 순으로 클릭';

  const sep2 = document.createElement('div');
  sep2.className = 'km-separator';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'km-btn danger';
  deleteBtn.textContent = '삭제';
  deleteBtn.title = '선택 노드 삭제 (엣지 포함)';

  const sep3 = document.createElement('div');
  sep3.className = 'km-separator';

  const fitBtn = document.createElement('button');
  fitBtn.className = 'km-btn';
  fitBtn.textContent = 'Fit';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'km-btn';
  exportBtn.textContent = 'JSON 내보내기';

  const importBtn = document.createElement('button');
  importBtn.className = 'km-btn';
  importBtn.textContent = 'JSON 가져오기';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json';
  importInput.style.display = 'none';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'km-btn danger';
  resetBtn.textContent = '초기화';
  resetBtn.title = '샘플 데이터로 초기화';

  toolbar.append(
    labelInput, kindSelect, addBtn,
    sep1, edgeKindSelect, edgeBtn,
    sep2, deleteBtn,
    sep3, fitBtn, exportBtn, importBtn, importInput, resetBtn,
  );

  // 캔버스 영역
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'km-canvas-wrap';

  // 상태 표시
  const statusEl = document.createElement('div');
  statusEl.className = 'km-status';

  wrap.append(toolbar, canvasWrap, statusEl);
  container.appendChild(wrap);

  // ── GraphCanvas 초기화 ────────────────────────────────────────────────────

  const canvas = new GraphCanvas(canvasWrap, {
    kindColors: NODE_KIND_COLORS as Record<string, string>,
    edgeKinds: Object.fromEntries(
      Object.entries(EDGE_KIND_DEFS).map(([k, v]) => [k, { color: v.color, style: v.style, arrow: v.arrow }])
    ),
    persistAdapter: adapter,
  });
  canvas.setSpec(spec);
  canvas.fitView();
  updateStatus();

  // ── 헬퍼 ─────────────────────────────────────────────────────────────────

  function genId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function saveAndRefresh(): void {
    canvas.syncCoordsToSpec();
    adapter.saveFullSpec(spec);
    canvas.setSpec(spec);
    updateStatus();
  }

  function updateStatus(): void {
    const nn = spec.nodes.length;
    const ne = spec.edges.length;
    statusEl.textContent = `노드 ${nn}개 · 엣지 ${ne}개${edgeDrawState ? ' | 엣지 연결 모드 — 대상 노드를 클릭하세요' : ''}${selectedNodeId ? ` | 선택: ${spec.nodes.find(n => n.id === selectedNodeId)?.label ?? selectedNodeId}` : ''}`;
  }

  function setEdgeDrawMode(on: boolean): void {
    edgeBtn.classList.toggle('active', on);
    canvasWrap.classList.toggle('km-edge-draw-mode', on);
  }

  function selectNode(id: string | null): void {
    // 이전 선택 해제
    if (selectedNodeId) {
      const prev = canvasWrap.querySelector(`[data-id="${selectedNodeId}"]`);
      prev?.classList.remove('km-node-selected');
    }
    selectedNodeId = id;
    if (id) {
      const el = canvasWrap.querySelector(`[data-id="${id}"]`);
      el?.classList.add('km-node-selected');
    }
    updateStatus();
  }

  // ── 이벤트 ───────────────────────────────────────────────────────────────

  // 노드 추가
  addBtn.addEventListener('click', () => {
    const label = labelInput.value.trim();
    if (!label) { labelInput.focus(); return; }
    const kind = (kindSelect.value as NodeKind);
    const node: GraphNode = {
      id: genId('n'),
      kind,
      label,
      group: '',
      x: 80 + Math.random() * 300 | 0,
      y: 80 + Math.random() * 200 | 0,
      w: DEFAULT_NODE_W,
      h: DEFAULT_NODE_H,
      ports: [],
    };
    spec.nodes.push(node);
    labelInput.value = '';
    saveAndRefresh();
  });

  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  // 엣지 연결 모드
  edgeBtn.addEventListener('click', () => {
    if (edgeDrawState) {
      edgeDrawState = null;
      setEdgeDrawMode(false);
    } else {
      edgeDrawState = null;
      setEdgeDrawMode(true);
      statusEl.textContent = '소스 노드를 클릭하세요';
    }
  });

  edgeKindSelect.addEventListener('change', () => {
    edgeKindForNew = edgeKindSelect.value as EdgeKind;
  });

  // 캔버스 노드 클릭 (선택 + 엣지 드로우)
  canvasWrap.addEventListener('click', (e) => {
    const target = e.target as Element;
    const nodeEl = target.closest('.ck-node') as SVGGElement | null;
    if (!nodeEl) {
      selectNode(null);
      return;
    }
    const nodeId = nodeEl.dataset.id ?? '';
    if (!nodeId) return;

    if (edgeDrawState === null && !canvasWrap.classList.contains('km-edge-draw-mode')) {
      // 선택 모드
      selectNode(nodeId === selectedNodeId ? null : nodeId);
      return;
    }

    if (canvasWrap.classList.contains('km-edge-draw-mode')) {
      if (!edgeDrawState) {
        // 소스 노드 선택
        edgeDrawState = { sourceNodeId: nodeId };
        statusEl.textContent = `소스: ${spec.nodes.find(n => n.id === nodeId)?.label ?? nodeId} → 대상 노드 클릭`;
        return;
      }
      // 대상 노드 선택 → 엣지 생성
      const { sourceNodeId } = edgeDrawState;
      edgeDrawState = null;
      setEdgeDrawMode(false);
      if (sourceNodeId === nodeId) { updateStatus(); return; }
      const edge: GraphEdge = {
        id: genId('e'),
        from: sourceNodeId,
        to: nodeId,
        kind: edgeKindForNew,
      };
      spec.edges.push(edge);
      saveAndRefresh();
    }
  });

  // 삭제 (선택 노드 + 연결 엣지)
  deleteBtn.addEventListener('click', () => {
    if (!selectedNodeId) return;
    spec.nodes = spec.nodes.filter((n) => n.id !== selectedNodeId);
    spec.edges = spec.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId);
    selectedNodeId = null;
    saveAndRefresh();
  });

  // Fit
  fitBtn.addEventListener('click', () => canvas.fitView());

  // JSON 내보내기
  exportBtn.addEventListener('click', () => {
    canvas.syncCoordsToSpec();
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karmomap-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // JSON 가져오기
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        spec = JSON.parse(reader.result as string) as GraphSpec;
        adapter.saveFullSpec(spec);
        canvas.setSpec(spec);
        canvas.fitView();
        updateStatus();
      } catch {
        alert('JSON 파싱 실패. 올바른 KarmoMap JSON 파일인지 확인하세요.');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  // 초기화
  resetBtn.addEventListener('click', () => {
    if (!confirm('샘플 데이터로 초기화하시겠습니까? 현재 데이터가 삭제됩니다.')) return;
    spec = makeSampleSpec();
    adapter.saveFullSpec(spec);
    canvas.setSpec(spec);
    canvas.fitView();
    selectedNodeId = null;
    edgeDrawState = null;
    setEdgeDrawMode(false);
    updateStatus();
  });
}
