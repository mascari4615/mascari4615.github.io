/**
 * lib/graph/canvas.ts — SVG 무한 캔버스 (pan/zoom + 노드/edge + 드래그 + 미니맵).
 *
 * Unity Shader Graph / Animator 스타일.
 * - 1개 <g transform="matrix(s 0 0 s tx ty)"> 안에 전체 콘텐츠.
 * - 노드: <g class="ck-node" data-id="…"> rect + text + ports.
 * - edge: 베지어 path — 두 박스의 가장 가까운 면 쌍 자동 선택.
 * - 드래그: mousedown → mousemove → mouseup → debounce save.
 * - 미니맵: 우하단 200×150 overlay SVG.
 * - Ephemeral 노드: 외부(수집기)가 발행하는 임시 노드 (anchor bbox stack).
 *
 * 출처 = `widgets/cockpit/graph-canvas.ts` (TASK-KL-082, 1066줄).
 * TASK-KL-087 단위 0 에서 cockpit 결합 3개를 seam 으로 바꿔 이주:
 *   ① Tauri invoke 직접 호출 → `GraphPersistAdapter.save()`
 *   ② KIND_COLORS 하드코딩(domain/app/canon/…) → `options.kindColors` 주입
 *   ③ 색상 하드코딩(#131720 등) → `options.theme` (기본값 = 이주 전 값 그대로)
 * 렌더 로직·좌표 계산·이벤트는 손대지 않았다 (cockpit 회귀 0 목표).
 */

import type {
  GraphSpec,
  GraphNode,
  GraphEdge,
  GroupDef,
  EphemeralAnchor,
  EdgeKindDef,
  NodeShape,
  EdgeStyle,
} from './spec';
import type { GraphPersistAdapter } from './adapter';
import { NULL_PERSIST_ADAPTER } from './adapter';
import { injectGraphCanvasStyles } from './styles';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface EphemeralNodeRender {
  id: string;
  label: string;
  anchorId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasState {
  scale: number;
  tx: number;
  ty: number;
}

export interface ActiveSets {
  node_ids_active: Set<string>;
  edge_ids_animated: Set<string>;
}

/** 캔버스 색상 — 전부 선택. 미지정 시 cockpit 원본 값(어두운 톤). */
export interface GraphCanvasTheme {
  nodeFill?: string;
  nodeText?: string;
  childText?: string;
  edgeDotFill?: string;
  edgeDefaultColor?: string;
  ephemeralFill?: string;
  ephemeralStroke?: string;
  ephemeralText?: string;
  anchorFill?: string;
  anchorStroke?: string;
  anchorText?: string;
  minimapBg?: string;
  minimapBorder?: string;
}

export interface GraphCanvasOptions {
  /** 좌표 영속 seam. 미지정 = 저장 안 함. */
  persistAdapter?: GraphPersistAdapter;
  /** node.kind → 색. 미지정 kind 는 defaultKindColor. */
  kindColors?: Record<string, string>;
  defaultKindColor?: string;
  /** spec._edge_kinds 에 없는 edge.kind 의 fallback 정의. */
  edgeKinds?: Record<string, EdgeKindDef>;
  theme?: GraphCanvasTheme;
  /**
   * 노드를 *클릭* 했을 때 (드래그가 아니라 — 이동 4px 미만).
   * 편집 UI 를 붙이는 위젯용 seam. cockpit 은 안 쓴다(읽기 전용 뷰).
   */
  onNodeClick?: (nodeId: string, ev: MouseEvent) => void;
  /** 빈 배경 클릭 — 선택 해제용. */
  onBackgroundClick?: () => void;
  /** 빈 배경 더블클릭 — 그 자리에 새 노드를 만드는 위젯용 (world 좌표). */
  onBackgroundDoubleClick?: (world: { x: number; y: number }) => void;
  /**
   * 노드 손잡이에서 끌어다 다른 노드에 놓았을 때. 이 콜백을 주면 손잡이가 그려진다 —
   * 안 주면 읽기 전용 뷰(cockpit)처럼 손잡이 자체가 없다.
   */
  onConnect?: (fromId: string, toId: string) => void;
}

/** 클릭과 드래그를 가르는 이동 거리 (px). */
const CLICK_SLOP = 4;

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const MINIMAP_W = 200;
const MINIMAP_H = 150;
const SAVE_DEBOUNCE_MS = 400;
const GRID_SIZE = 8;         // 그리드 스냅 단위 (px)
const GROUP_HEADER_H = 20;   // 그룹 프레임 헤더 높이
const NODE_HEADER_H = 30;    // children 있는 노드의 헤더 영역 높이
const NODE_CHILD_ROW_H = 18; // 자식 항목 한 줄 높이
const NODE_CHILD_PAD = 6;    // 자식 영역 상하 패딩

const DEFAULT_KIND_COLOR = '#94a3b8';

const DEFAULT_THEME: Required<GraphCanvasTheme> = {
  nodeFill: '#131720',
  nodeText: '#e2e8f0',
  childText: 'rgba(226,232,240,0.65)',
  edgeDotFill: '#0a0c10',
  edgeDefaultColor: '#64748b',
  ephemeralFill: '#0f1520',
  ephemeralStroke: '#22d3ee60',
  ephemeralText: '#22d3ee',
  anchorFill: 'rgba(34,211,238,0.04)',
  anchorStroke: 'rgba(34,211,238,0.35)',
  anchorText: 'rgba(34,211,238,0.85)',
  minimapBg: 'var(--glass-strong)',
  minimapBorder: 'var(--border)',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** clipPath DOM id 충돌 방지 — 한 문서에 캔버스 2개 이상 뜰 수 있다. */
let instanceSeq = 0;

// ─── GraphCanvas ──────────────────────────────────────────────────────────────

export class GraphCanvas {
  private container: HTMLElement;
  private svg!: SVGSVGElement;
  private world!: SVGGElement;   // matrix transform group
  private edgeLayer!: SVGGElement;
  private nodeLayer!: SVGGElement;
  private groupLayer!: SVGGElement;
  private minimapSvg!: SVGSVGElement;
  private minimapViewport!: SVGRectElement;

  private spec: GraphSpec | null = null;
  private ephemeralNodes: EphemeralNodeRender[] = [];
  private activeSets: ActiveSets = { node_ids_active: new Set(), edge_ids_animated: new Set() };

  // node id → 현재 좌표 (드래그 중 변경)
  private nodeCoords: Map<string, { x: number; y: number }> = new Map();

  private state: CanvasState = { scale: 1, tx: 0, ty: 0 };

  // 드래그 상태
  private dragging: { nodeId: string; startMouseX: number; startMouseY: number; startNodeX: number; startNodeY: number } | null = null;

  // 그룹 드래그 상태 — 멤버 node 좌표 + anchor x/y + ephemeral x/y + group bbox 모두 이동.
  private draggingGroup: {
    groupId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeCoords: Map<string, { x: number; y: number }>;
    startAnchorCoords: Map<string, { x: number; y: number }>;
    startEphemeralCoords: Map<string, { x: number; y: number }>;  // ephemeral 노드 id → 시작 좌표
    startGroupX: number;
    startGroupY: number;
  } | null = null;

  // 패닝 상태
  private panning: { startMouseX: number; startMouseY: number; startTx: number; startTy: number } | null = null;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSaves: Map<string, { x: number; y: number; kind: 'node' | 'anchor' | 'group' }> = new Map();

  // ── 주입된 seam ────────────────────────────────────────────────────────────
  private persist: GraphPersistAdapter;
  private kindColors: Record<string, string>;
  private defaultKindColor: string;
  private edgeKindFallback: Record<string, EdgeKindDef>;
  private theme: Required<GraphCanvasTheme>;
  private uid: string;
  private onNodeClick?: (nodeId: string, ev: MouseEvent) => void;
  private onBackgroundClick?: () => void;
  private onBackgroundDoubleClick?: (world: { x: number; y: number }) => void;
  private onConnect?: (fromId: string, toId: string) => void;
  /** 손잡이에서 끌고 있는 중. 임시 선은 edgeLayer 에 그렸다가 놓을 때 지운다. */
  private linking: { fromId: string; temp: SVGPathElement } | null = null;

  /** mousedown 지점 — mouseup 때 이동량으로 클릭/드래그를 가른다. */
  private pressOrigin: { x: number; y: number; nodeId: string | null } | null = null;

  constructor(container: HTMLElement, options: GraphCanvasOptions = {}) {
    this.container = container;
    this.persist = options.persistAdapter ?? NULL_PERSIST_ADAPTER;
    this.kindColors = options.kindColors ?? {};
    this.defaultKindColor = options.defaultKindColor ?? DEFAULT_KIND_COLOR;
    this.edgeKindFallback = options.edgeKinds ?? {};
    this.theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) };
    this.onNodeClick = options.onNodeClick;
    this.onBackgroundClick = options.onBackgroundClick;
    this.onBackgroundDoubleClick = options.onBackgroundDoubleClick;
    this.onConnect = options.onConnect;
    instanceSeq += 1;
    this.uid = `g${instanceSeq}`;
    injectGraphCanvasStyles();
    this.buildDOM();
    this.bindEvents();
  }

  /** node.kind → 색. 주입된 맵에 없으면 기본색. */
  private colorForKind(kind: string): string {
    return this.kindColors[kind] ?? this.defaultKindColor;
  }

  /** edge.kind → 스타일 정의. spec 우선, 없으면 주입 fallback, 없으면 기본. */
  private edgeKindFor(kind: string): EdgeKindDef {
    return (
      this.spec?._edge_kinds?.[kind] ??
      this.edgeKindFallback[kind] ?? {
        color: this.theme.edgeDefaultColor,
        style: 'solid',
        arrow: true,
      }
    );
  }

  // ── DOM 구성 ────────────────────────────────────────────────────────────────

  private buildDOM(): void {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    // 배경 = 부모(KarmoLab) 상속. --ck-canvas-bg 로 커스텀 가능.
    this.container.style.background = 'var(--ck-canvas-bg, transparent)';

    // 메인 SVG
    this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.svg.style.cssText = 'width:100%;height:100%;cursor:grab;';
    this.svg.setAttribute('xmlns', SVG_NS);

    // defs (마커·필터) — id 는 전역 고정. 캔버스가 여러 개여도 정의가 동일하므로
    // url(#ck-glow) 가 어느 쪽을 잡아도 결과가 같다 (CSS 가 이 id 를 참조한다).
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <marker id="ck-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="${this.theme.edgeDefaultColor}"/>
      </marker>
      <filter id="ck-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    this.svg.appendChild(defs);

    // world group (pan/zoom matrix)
    this.world = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.world.setAttribute('class', 'ck-world');
    this.svg.appendChild(this.world);

    this.groupLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.groupLayer.setAttribute('class', 'ck-groups');
    this.world.appendChild(this.groupLayer);

    this.edgeLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.edgeLayer.setAttribute('class', 'ck-edges');
    this.world.appendChild(this.edgeLayer);

    this.nodeLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.nodeLayer.setAttribute('class', 'ck-nodes');
    this.world.appendChild(this.nodeLayer);

    this.container.appendChild(this.svg);

    // 미니맵
    this.minimapSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.minimapSvg.style.cssText = `
      position:absolute; bottom:16px; right:16px;
      width:${MINIMAP_W}px; height:${MINIMAP_H}px;
      background:${this.theme.minimapBg}; border:1px solid ${this.theme.minimapBorder};
      border-radius:4px; pointer-events:all; cursor:pointer;
    `;
    this.container.appendChild(this.minimapSvg);
    this.minimapViewport = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    this.minimapViewport.setAttribute('fill', 'rgba(100,160,255,0.1)');
    this.minimapViewport.setAttribute('stroke', 'rgba(100,160,255,0.5)');
    this.minimapViewport.setAttribute('stroke-width', '1');
    this.minimapSvg.appendChild(this.minimapViewport);

    this.applyTransform();
  }

  // ── 이벤트 ──────────────────────────────────────────────────────────────────

  private bindEvents(): void {
    // Zoom (wheel)
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { left, top } = this.svg.getBoundingClientRect();
      const mx = e.clientX - left;
      const my = e.clientY - top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, this.state.scale * delta));
      // 마우스 위치 기준 줌 보정
      this.state.tx = mx - (mx - this.state.tx) * (newScale / this.state.scale);
      this.state.ty = my - (my - this.state.ty) * (newScale / this.state.scale);
      this.state.scale = newScale;
      this.applyTransform();
    }, { passive: false });

    // Pan (mousedown on svg background) / drag (mousedown on node)
    this.svg.addEventListener('mousedown', (e) => {
      const target = e.target as Element;
      const handleEl = target.closest('.ck-link-handle') as SVGCircleElement | null;
      const nodeEl = target.closest('.ck-node') as SVGGElement | null;
      const groupEl = target.closest('.ck-group') as SVGRectElement | null;

      // 손잡이가 먼저다 — 안 그러면 노드 드래그로 먹혀 선을 못 뽑는다.
      if (handleEl && this.onConnect) {
        const fromId = handleEl.dataset.linkFrom ?? nodeEl?.dataset.id ?? '';
        if (fromId) {
          e.stopPropagation();
          e.preventDefault();
          const temp = document.createElementNS(SVG_NS, 'path');
          temp.setAttribute('class', 'ck-edge ck-link-temp');
          temp.setAttribute('fill', 'none');
          temp.setAttribute('stroke', this.theme.edgeDefaultColor);
          temp.setAttribute('stroke-width', '2');
          this.edgeLayer.appendChild(temp);
          this.linking = { fromId, temp };
          this.pressOrigin = null;
          return;
        }
      }

      this.pressOrigin = { x: e.clientX, y: e.clientY, nodeId: nodeEl?.dataset.id ?? null };
      if (nodeEl) {
        const nodeId = nodeEl.dataset.id ?? '';
        if (!nodeId) return;
        const coords = this.nodeCoords.get(nodeId);
        if (!coords) return;
        e.stopPropagation();
        this.dragging = {
          nodeId,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startNodeX: coords.x,
          startNodeY: coords.y,
        };
        this.svg.style.cursor = 'grabbing';
      } else if (groupEl) {
        // 그룹 드래그 — 멤버 노드 + anchor 같이 이동
        const groupId = groupEl.dataset.groupId ?? '';
        const grp = this.spec?.groups.find((g) => g.id === groupId);
        if (!grp || !this.spec) return;
        e.stopPropagation();
        const startNodeCoords = new Map<string, { x: number; y: number }>();
        for (const n of this.spec.nodes) {
          if (n.group !== groupId) continue;
          const c = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
          startNodeCoords.set(n.id, { x: c.x, y: c.y });
        }
        const startAnchorCoords = new Map<string, { x: number; y: number }>();
        const memberAnchorIds = new Set<string>();
        for (const a of this.spec.ephemeral_anchors ?? []) {
          if (a.group !== groupId) continue;
          startAnchorCoords.set(a.id, { x: a.x, y: a.y });
          memberAnchorIds.add(a.id);
        }
        const startEphemeralCoords = new Map<string, { x: number; y: number }>();
        for (const en of this.ephemeralNodes) {
          if (memberAnchorIds.has(en.anchorId)) {
            startEphemeralCoords.set(en.id, { x: en.x, y: en.y });
          }
        }
        this.draggingGroup = {
          groupId,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startNodeCoords,
          startAnchorCoords,
          startEphemeralCoords,
          startGroupX: grp.bbox.x,
          startGroupY: grp.bbox.y,
        };
        this.svg.style.cursor = 'grabbing';
      } else {
        // pan
        this.panning = {
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startTx: this.state.tx,
          startTy: this.state.ty,
        };
        this.svg.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.linking) {
        const from = this.getNodeBox(this.linking.fromId);
        if (from) {
          const p = this.screenToWorld(e.clientX, e.clientY);
          const sx = from.x + from.w;
          const sy = from.y + from.h / 2;
          this.linking.temp.setAttribute('d', `M ${sx},${sy} L ${p.x},${p.y}`);
        }
        return;
      }
      if (this.dragging) {
        const dx = (e.clientX - this.dragging.startMouseX) / this.state.scale;
        const dy = (e.clientY - this.dragging.startMouseY) / this.state.scale;
        const newX = this.snap(this.dragging.startNodeX + dx);
        const newY = this.snap(this.dragging.startNodeY + dy);
        this.nodeCoords.set(this.dragging.nodeId, { x: newX, y: newY });
        this.updateNodeTransform(this.dragging.nodeId, newX, newY);
        this.groupLayer.innerHTML = '';
        this.renderGroups();
        this.renderAnchors();
        this.redrawEdges();
        this.redrawMinimap();
        this.scheduleSave(this.dragging.nodeId);
      } else if (this.draggingGroup) {
        const dg = this.draggingGroup;
        const rawDx = (e.clientX - dg.startMouseX) / this.state.scale;
        const rawDy = (e.clientY - dg.startMouseY) / this.state.scale;
        // 그룹 기준점(startGroupX/Y)을 snap한 뒤 실제 delta 계산
        const snappedGX = this.snap(dg.startGroupX + rawDx);
        const snappedGY = this.snap(dg.startGroupY + rawDy);
        const dx = snappedGX - dg.startGroupX;
        const dy = snappedGY - dg.startGroupY;
        // 멤버 노드 좌표 이동 + transform 갱신 + save 큐잉
        for (const [nodeId, start] of dg.startNodeCoords) {
          const nx = start.x + dx;
          const ny = start.y + dy;
          this.nodeCoords.set(nodeId, { x: nx, y: ny });
          this.updateNodeTransform(nodeId, nx, ny);
          this.scheduleSave(nodeId);
        }
        // 멤버 anchor 좌표 이동 (spec 직접 변경 — 영속에도 들어감)
        for (const [anchorId, start] of dg.startAnchorCoords) {
          const ax = start.x + dx;
          const ay = start.y + dy;
          const a = this.spec?.ephemeral_anchors?.find((x) => x.id === anchorId);
          if (a) { a.x = ax; a.y = ay; }
          this.scheduleSaveRaw(anchorId, ax, ay, 'anchor');
        }
        // ephemeral 노드 좌표 이동 — 시작 좌표 기반 (누적 회피)
        for (const [enId, start] of dg.startEphemeralCoords) {
          const en = this.ephemeralNodes.find((x) => x.id === enId);
          if (en) {
            en.x = start.x + dx;
            en.y = start.y + dy;
          }
        }
        // group bbox spec 이동 + save
        const grp = this.spec?.groups.find((g) => g.id === dg.groupId);
        if (grp) {
          grp.bbox.x = snappedGX;
          grp.bbox.y = snappedGY;
          this.scheduleSaveRaw(dg.groupId, grp.bbox.x, grp.bbox.y, 'group');
        }
        // 전체 재렌더 (anchor + ephemeral + edges + minimap)
        this.groupLayer.innerHTML = '';
        this.renderGroups();
        this.renderAnchors();
        this.renderEphemeralLayer();
        this.redrawEdges();
        this.redrawMinimap();
      } else if (this.panning) {
        this.state.tx = this.panning.startTx + (e.clientX - this.panning.startMouseX);
        this.state.ty = this.panning.startTy + (e.clientY - this.panning.startMouseY);
        this.applyTransform();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.linking) {
        const { fromId, temp } = this.linking;
        this.linking = null;
        temp.remove();
        // 놓은 자리 아래에 있는 노드를 찾는다. 임시 선은 이미 지웠으니 가로막지 않는다.
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const toEl = under?.closest?.('.ck-node') as SVGGElement | null;
        const toId = toEl?.dataset.id ?? '';
        if (toId && toId !== fromId) this.onConnect?.(fromId, toId);
        this.svg.style.cursor = 'grab';
        return;
      }
      // 드래그 상태를 지우기 *전에* 클릭 판정 — 이동이 slop 미만이면 클릭.
      const origin = this.pressOrigin;
      this.pressOrigin = null;
      if (origin) {
        const moved = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
        if (moved < CLICK_SLOP) {
          if (origin.nodeId) this.onNodeClick?.(origin.nodeId, e);
          else if (this.panning) this.onBackgroundClick?.();
        }
      }
      this.dragging = null;
      this.draggingGroup = null;
      this.panning = null;
      this.svg.style.cursor = 'grab';
    });

    // 빈 배경 더블클릭 → 그 자리에 새 노드 (Scapple·FigJam 의 「그냥 두 번 눌러라」).
    this.svg.addEventListener('dblclick', (e) => {
      if (!this.onBackgroundDoubleClick) return;
      const target = e.target as Element;
      if (target.closest('.ck-node') || target.closest('.ck-group')) return;
      e.preventDefault();
      this.onBackgroundDoubleClick(this.screenToWorld(e.clientX, e.clientY));
    });

    // 미니맵 클릭 → viewport 점프
    this.minimapSvg.addEventListener('click', (e) => {
      const rect = this.minimapSvg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const bounds = this.worldBounds();
      const scaleX = MINIMAP_W / (bounds.w || 1);
      const scaleY = MINIMAP_H / (bounds.h || 1);
      const ms = Math.min(scaleX, scaleY) * 0.9;
      const worldX = (mx / ms) + bounds.minX;
      const worldY = (my / ms) + bounds.minY;
      const svgW = this.svg.clientWidth;
      const svgH = this.svg.clientHeight;
      this.state.tx = svgW / 2 - worldX * this.state.scale;
      this.state.ty = svgH / 2 - worldY * this.state.scale;
      this.applyTransform();
    });
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  setSpec(spec: GraphSpec): void {
    this.spec = spec;
    // 좌표 초기화
    this.nodeCoords.clear();
    for (const node of spec.nodes) {
      this.nodeCoords.set(node.id, { x: node.x, y: node.y });
    }
    this.render();
  }

  /** 현재 스펙 (드래그 좌표 반영본). 전체 저장이 필요한 어댑터용. */
  getSpec(): GraphSpec | null {
    if (!this.spec) return null;
    for (const n of this.spec.nodes) {
      const c = this.nodeCoords.get(n.id);
      if (c) { n.x = c.x; n.y = c.y; }
    }
    return this.spec;
  }

  setEphemeralNodes(nodes: EphemeralNodeRender[]): void {
    this.ephemeralNodes = nodes;
    // anchor 박스 자동 확장 (items 따라 dynamic height) 위해 group 재렌더.
    this.groupLayer.innerHTML = '';
    this.renderGroups();
    this.renderAnchors();
    this.renderEphemeralLayer();
    this.redrawEdges();
    this.redrawMinimap();
  }

  setActiveSets(sets: ActiveSets): void {
    this.activeSets = sets;
    this.applyHighlights();
  }

  /** 전체 재렌더 — 노드/엣지를 외부에서 추가·삭제한 뒤 호출. */
  render(): void {
    if (!this.spec) return;
    this.groupLayer.innerHTML = '';
    this.edgeLayer.innerHTML = '';
    this.nodeLayer.innerHTML = '';

    this.renderGroups();
    this.renderAnchors();
    this.renderNodes(this.spec.nodes);
    this.redrawEdges();
    this.redrawMinimap();
  }

  /**
   * anchor 들의 effective y/h 계산 — 같은 group 안 anchors 는 spec order 로
   * 위→아래 stack push (도미노). spec y = 첫 박스 base, 다음부터 = 이전 actual bottom + GAP.
   * items 따라 박스 늘림 → 다음 박스도 자동으로 밀려서 겹침 없음.
   */
  private computeAnchorLayout(): Map<string, { x: number; y: number; w: number; h: number; offsetY: number }> {
    const out = new Map<string, { x: number; y: number; w: number; h: number; offsetY: number }>();
    if (!this.spec) return out;
    const GAP = 16;
    const anchors = this.spec.ephemeral_anchors ?? [];
    // group 별 순서대로 stack
    const byGroup = new Map<string, EphemeralAnchor[]>();
    for (const a of anchors) {
      const arr = byGroup.get(a.group) ?? [];
      arr.push(a);
      byGroup.set(a.group, arr);
    }
    for (const [, list] of byGroup) {
      let nextY: number | null = null;
      for (const a of list) {
        const items = this.ephemeralNodes.filter((n) => n.anchorId === a.id);
        const specY = a.y;
        const effY: number = nextY ?? specY;
        const offsetY = effY - specY;
        let h = a.h;
        if (items.length > 0) {
          // items 의 y 는 spec y 기반 → effective 로 보정 후 maxBottom 계산
          const maxBottomEff = Math.max(...items.map((n) => (n.y + offsetY) + n.h));
          const needed = (maxBottomEff - effY) + 8;
          h = Math.max(a.h, needed);
        }
        out.set(a.id, { x: a.x, y: effY, w: a.w, h, offsetY });
        nextY = effY + h + GAP;
      }
    }
    return out;
  }

  private renderAnchors(): void {
    if (!this.spec) return;
    const layout = this.computeAnchorLayout();
    for (const a of this.spec.ephemeral_anchors ?? []) {
      const eff = layout.get(a.id);
      if (!eff) continue;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(eff.x));
      rect.setAttribute('y', String(eff.y));
      rect.setAttribute('width', String(eff.w));
      rect.setAttribute('height', String(eff.h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', this.theme.anchorFill);
      rect.setAttribute('stroke', this.theme.anchorStroke);
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4 3');
      this.groupLayer.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(eff.x + 8));
      text.setAttribute('y', String(eff.y + 14));
      text.setAttribute('fill', this.theme.anchorText);
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
      text.textContent = '⚡ ' + a.label;
      this.groupLayer.appendChild(text);
    }
  }

  /**
   * group bbox = max(spec bbox, content bbox).
   * content = group 멤버 노드(드래그 반영) + group 소속 anchor(effective h, stack push 반영).
   * 근본 — spec 은 최소 hint, 실제는 자기 컨텐츠 항상 감쌈.
   */
  private computeGroupBox(group: GroupDef): { x: number; y: number; w: number; h: number } {
    let minX = group.bbox.x;
    let minY = group.bbox.y;
    let maxX = group.bbox.x + group.bbox.w;
    let maxY = group.bbox.y + group.bbox.h;
    const pad = 12;
    // persistent 노드 (드래그 좌표 반영)
    for (const n of this.spec?.nodes ?? []) {
      if (n.group !== group.id) continue;
      const c = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
      minX = Math.min(minX, c.x - pad);
      minY = Math.min(minY, c.y - pad);
      maxX = Math.max(maxX, c.x + n.w + pad);
      maxY = Math.max(maxY, c.y + this.getNodeEffectiveH(n) + pad);
    }
    // ephemeral anchors (effective bbox)
    const layout = this.computeAnchorLayout();
    for (const a of this.spec?.ephemeral_anchors ?? []) {
      if (a.group !== group.id) continue;
      const eff = layout.get(a.id);
      if (!eff) continue;
      minX = Math.min(minX, eff.x - pad);
      minY = Math.min(minY, eff.y - pad);
      maxX = Math.max(maxX, eff.x + eff.w + pad);
      maxY = Math.max(maxY, eff.y + eff.h + pad);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private renderGroups(): void {
    if (!this.spec) return;
    for (const g of this.spec.groups) {
      const box = this.computeGroupBox(g);

      // ── 바디 (전체 프레임) ────────────────────────────────────────────────
      const bodyRect = document.createElementNS(SVG_NS, 'rect');
      bodyRect.setAttribute('class', 'ck-group');
      bodyRect.dataset.groupId = g.id;
      bodyRect.setAttribute('x', String(box.x));
      bodyRect.setAttribute('y', String(box.y));
      bodyRect.setAttribute('width', String(box.w));
      bodyRect.setAttribute('height', String(box.h));
      bodyRect.setAttribute('rx', '6');
      bodyRect.setAttribute('fill', g.color + '06');
      bodyRect.setAttribute('stroke', g.color + '28');
      bodyRect.setAttribute('stroke-width', '1');
      bodyRect.style.cursor = 'grab';
      this.groupLayer.appendChild(bodyRect);

      // ── 헤더 바 (Unity 스타일) ─────────────────────────────────────────────
      // clipPath 로 상단 rx 살리면서 헤더만 클리핑.
      // id 에 인스턴스 uid 를 섞는다 — 캔버스 2개가 같은 group id 를 쓰면 충돌.
      const clipId = `ck-clip-${this.uid}-${g.id}`;
      const clipPath = document.createElementNS(SVG_NS, 'clipPath');
      clipPath.setAttribute('id', clipId);
      const clipRect = document.createElementNS(SVG_NS, 'rect');
      clipRect.setAttribute('x', String(box.x));
      clipRect.setAttribute('y', String(box.y));
      clipRect.setAttribute('width', String(box.w));
      clipRect.setAttribute('height', String(GROUP_HEADER_H));
      clipRect.setAttribute('rx', '6');
      clipPath.appendChild(clipRect);
      this.groupLayer.appendChild(clipPath);

      const headerRect = document.createElementNS(SVG_NS, 'rect');
      headerRect.setAttribute('class', 'ck-group');
      headerRect.dataset.groupId = g.id;
      headerRect.setAttribute('x', String(box.x));
      headerRect.setAttribute('y', String(box.y));
      headerRect.setAttribute('width', String(box.w));
      headerRect.setAttribute('height', String(GROUP_HEADER_H));
      headerRect.setAttribute('fill', g.color + '28');
      headerRect.setAttribute('clip-path', `url(#${clipId})`);
      headerRect.style.cursor = 'grab';
      this.groupLayer.appendChild(headerRect);

      // ── 헤더 레이블 ───────────────────────────────────────────────────────
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'ck-group-label');
      text.dataset.groupId = g.id;
      text.setAttribute('x', String(box.x + 8));
      text.setAttribute('y', String(box.y + GROUP_HEADER_H - 6));
      text.setAttribute('fill', g.color + 'cc');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '600');
      text.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
      text.setAttribute('pointer-events', 'none');
      text.textContent = g.label;
      this.groupLayer.appendChild(text);
    }
  }

  private renderNodes(nodes: GraphNode[]): void {
    for (const node of nodes) {
      const g = this.buildNodeElement(node);
      this.nodeLayer.appendChild(g);
    }
  }

  private buildNodeElement(node: GraphNode): SVGGElement {
    const coords = this.nodeCoords.get(node.id) ?? { x: node.x, y: node.y };
    const children = node.children ?? [];
    const effH = this.getNodeEffectiveH(node);

    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', 'ck-node');
    g.dataset.id = node.id;
    g.setAttribute('transform', `translate(${coords.x},${coords.y})`);
    g.style.cursor = 'grab';

    const kindColor = this.colorForKind(node.kind);
    const shape: NodeShape = node.shape ?? 'rect';

    // 배경 — 모양에 따라 카드 / 동그라미 / 말풍선.
    // 클래스를 박아 두는 이유: 선택·활성 표시가 `rect:first-of-type` 를 집던 시절엔
    // 동그라미·말풍선(rect 가 아님)에서 표시가 통째로 사라졌다.
    const bg = this.buildNodeBackground(node, effH, kindColor, shape);
    bg.setAttribute('class', 'ck-node-bg');
    g.appendChild(bg);

    // 좌측 색띠 — 카드 모양일 때만 (동그라미·말풍선에선 띠가 어색하다)
    if (shape === 'rect') {
      const bar = document.createElementNS(SVG_NS, 'rect');
      bar.setAttribute('x', '0');
      bar.setAttribute('y', '0');
      bar.setAttribute('width', '3');
      bar.setAttribute('height', String(effH));
      bar.setAttribute('rx', '4');
      bar.setAttribute('fill', kindColor);
      g.appendChild(bar);
    }

    if (children.length === 0) {
      const centered = shape === 'circle';
      const avatarEl = node.avatar ? this.buildNodeAvatar(node, effH, kindColor, centered) : null;
      if (avatarEl) g.appendChild(avatarEl);

      const hasNote = Boolean(node.note && node.note.trim());
      const textX = centered ? node.w / 2 : node.avatar ? 40 : 12;
      // 한마디가 있으면 이름을 위로 올리고 그 밑에 한 줄 더 놓는다.
      const baseY = centered && node.avatar ? effH / 2 + 18 : effH / 2 + 4;
      const labelY = hasNote ? baseY - 6 : baseY;

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(textX));
      text.setAttribute('y', String(labelY));
      if (centered) text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', this.theme.nodeText);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
      text.setAttribute('pointer-events', 'none');
      text.textContent = node.label;
      g.appendChild(text);

      if (hasNote) {
        const note = document.createElementNS(SVG_NS, 'text');
        note.setAttribute('x', String(textX));
        note.setAttribute('y', String(labelY + 13));
        if (centered) note.setAttribute('text-anchor', 'middle');
        note.setAttribute('fill', this.theme.childText);
        note.setAttribute('font-size', '9.5');
        note.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
        note.setAttribute('pointer-events', 'none');
        const room = centered ? node.w - 16 : node.w - textX - 10;
        const maxChars = Math.max(4, Math.floor(room / 5.4));
        const raw = node.note ?? '';
        note.textContent = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw;
        g.appendChild(note);
      }
    } else {
      // 자식 있음 — 헤더 + 구분선 + 자식 목록
      const headerH = NODE_HEADER_H;

      // 헤더 배경
      const headerRect = document.createElementNS(SVG_NS, 'rect');
      headerRect.setAttribute('x', '0');
      headerRect.setAttribute('y', '0');
      headerRect.setAttribute('width', String(node.w));
      headerRect.setAttribute('height', String(headerH));
      headerRect.setAttribute('rx', '4');
      headerRect.setAttribute('fill', kindColor + '18');
      headerRect.setAttribute('pointer-events', 'none');
      g.appendChild(headerRect);

      // 헤더 레이블
      const title = document.createElementNS(SVG_NS, 'text');
      title.setAttribute('x', '12');
      title.setAttribute('y', String(headerH / 2 + 4));
      title.setAttribute('fill', this.theme.nodeText);
      title.setAttribute('font-size', '11');
      title.setAttribute('font-weight', '600');
      title.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
      title.setAttribute('pointer-events', 'none');
      title.textContent = node.label;
      g.appendChild(title);

      // 구분선
      const sep = document.createElementNS(SVG_NS, 'line');
      sep.setAttribute('x1', '3');
      sep.setAttribute('y1', String(headerH));
      sep.setAttribute('x2', String(node.w));
      sep.setAttribute('y2', String(headerH));
      sep.setAttribute('stroke', kindColor + '30');
      sep.setAttribute('stroke-width', '1');
      g.appendChild(sep);

      // 자식 항목
      children.forEach((child, i) => {
        const cy = headerH + NODE_CHILD_PAD + i * NODE_CHILD_ROW_H + NODE_CHILD_ROW_H / 2 + 4;

        // 불릿 도트
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', '14');
        dot.setAttribute('cy', String(cy - 3));
        dot.setAttribute('r', '2');
        dot.setAttribute('fill', kindColor + '80');
        dot.setAttribute('pointer-events', 'none');
        g.appendChild(dot);

        const row = document.createElementNS(SVG_NS, 'text');
        row.setAttribute('x', '22');
        row.setAttribute('y', String(cy));
        row.setAttribute('fill', this.theme.childText);
        row.setAttribute('font-size', '10');
        row.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
        row.setAttribute('pointer-events', 'none');
        const maxChars = Math.max(4, Math.floor((node.w - 30) / 6.2));
        row.textContent = child.length > maxChars ? child.slice(0, maxChars - 1) + '…' : child;
        g.appendChild(row);
      });
    }

    // 연결 손잡이 — 노드 오른쪽 가장자리. 여기서 끌어다 다른 노드에 놓으면 선이 생긴다
    // (Miro·FigJam 의 파란 점. 「연결 시작」 버튼을 누르고 다시 클릭하던 2단계를 없앤다).
    if (this.onConnect) {
      const handle = document.createElementNS(SVG_NS, 'circle');
      handle.setAttribute('class', 'ck-link-handle');
      handle.dataset.linkFrom = node.id;
      handle.setAttribute('cx', String(node.w));
      handle.setAttribute('cy', String(effH / 2));
      handle.setAttribute('r', '5');
      handle.setAttribute('fill', kindColor);
      handle.setAttribute('stroke', this.theme.nodeFill);
      handle.setAttribute('stroke-width', '1.5');
      g.appendChild(handle);
    }

    return g;
  }

  /** 노드 배경 도형. 모양이 달라도 바깥에서 보는 상자 크기(w × effH)는 같다 — 선 연결 계산이 흔들리지 않게. */
  private buildNodeBackground(node: GraphNode, effH: number, kindColor: string, shape: NodeShape): SVGElement {
    const fill = this.theme.nodeFill;
    const stroke = kindColor + '60';

    if (shape === 'circle') {
      const el = document.createElementNS(SVG_NS, 'ellipse');
      el.setAttribute('cx', String(node.w / 2));
      el.setAttribute('cy', String(effH / 2));
      el.setAttribute('rx', String(node.w / 2));
      el.setAttribute('ry', String(effH / 2));
      el.setAttribute('fill', fill);
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', '1.5');
      return el;
    }

    if (shape === 'bubble') {
      // 둥근 사각 + 왼쪽 아래 꼬리. 꼬리는 상자 *안쪽* 으로 그려 바깥 크기를 안 늘린다.
      const r = 12;
      const w = node.w;
      const h = effH;
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute(
        'd',
        `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r - 6} A ${r} ${r} 0 0 1 ${w - r} ${h - 6}` +
          ` H ${Math.min(34, w - r)} L ${Math.min(20, w - r - 6)} ${h} L ${Math.min(24, w - r - 4)} ${h - 6}` +
          ` H ${r} A ${r} ${r} 0 0 1 0 ${h - r - 6} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
      );
      el.setAttribute('fill', fill);
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', '1.5');
      return el;
    }

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(node.w));
    rect.setAttribute('height', String(effH));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1.5');
    return rect;
  }

  /**
   * 노드 얼굴 — 이모지 / 색 원 / 사진. 사진은 `clipPath` 로 동그랗게 자른다.
   * clip id 는 캔버스 uid + 노드 id 로 만든다 — 한 페이지에 캔버스가 둘 이상 떠도 안 섞이게.
   */
  private buildNodeAvatar(node: GraphNode, effH: number, kindColor: string, centered: boolean): SVGGElement | null {
    const avatar = node.avatar;
    if (!avatar) return null;
    const r = 12;
    const cx = centered ? node.w / 2 : 22;
    const cy = centered ? Math.max(r + 6, effH / 2 - 12) : effH / 2;

    const wrap = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    wrap.setAttribute('pointer-events', 'none');

    if (avatar.kind === 'image') {
      const clipId = `ck-av-${this.uid}-${node.id}`;
      const defs = document.createElementNS(SVG_NS, 'defs');
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(r));
      clip.appendChild(circle);
      defs.appendChild(clip);
      wrap.appendChild(defs);

      const img = document.createElementNS(SVG_NS, 'image');
      img.setAttribute('x', String(cx - r));
      img.setAttribute('y', String(cy - r));
      img.setAttribute('width', String(r * 2));
      img.setAttribute('height', String(r * 2));
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', avatar.value);
      img.setAttribute('href', avatar.value);
      wrap.appendChild(img);

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', String(cx));
      ring.setAttribute('cy', String(cy));
      ring.setAttribute('r', String(r));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', kindColor + '90');
      ring.setAttribute('stroke-width', '1.5');
      wrap.appendChild(ring);
      return wrap;
    }

    const disc = document.createElementNS(SVG_NS, 'circle');
    disc.setAttribute('cx', String(cx));
    disc.setAttribute('cy', String(cy));
    disc.setAttribute('r', String(r));
    disc.setAttribute('fill', avatar.kind === 'color' ? avatar.value : kindColor + '25');
    disc.setAttribute('stroke', kindColor + '70');
    disc.setAttribute('stroke-width', '1');
    wrap.appendChild(disc);

    if (avatar.kind === 'emoji') {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(cx));
      t.setAttribute('y', String(cy + 5));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '14');
      t.textContent = avatar.value;
      wrap.appendChild(t);
    }
    return wrap;
  }

  private renderEphemeralLayer(): void {
    // 기존 ephemeral 요소 제거
    this.nodeLayer.querySelectorAll('.ck-node-ephemeral').forEach((el) => el.remove());

    const layout = this.computeAnchorLayout();
    for (const en of this.ephemeralNodes) {
      const offY = layout.get(en.anchorId)?.offsetY ?? 0;
      const effY = en.y + offY;
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      g.setAttribute('class', 'ck-node ck-node-ephemeral');
      g.dataset.id = en.id;
      g.setAttribute('transform', `translate(${en.x},${effY})`);
      g.style.opacity = '0.85';

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', String(en.w));
      rect.setAttribute('height', String(en.h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', this.theme.ephemeralFill);
      rect.setAttribute('stroke', this.theme.ephemeralStroke);
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4 2');
      g.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '8');
      text.setAttribute('y', String(en.h / 2 + 4));
      text.setAttribute('fill', this.theme.ephemeralText);
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
      text.setAttribute('pointer-events', 'none');
      // 라벨 ellipsis — 1자 ≈ 6.2px (mono 10px 기준), 패딩 16px 빼고 자름.
      const maxChars = Math.max(4, Math.floor((en.w - 16) / 6.2));
      text.textContent = en.label.length > maxChars ? en.label.slice(0, maxChars - 1) + '…' : en.label;
      // 호버 시 풀 라벨 표시
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = en.label;
      g.appendChild(title);
      g.appendChild(text);

      this.nodeLayer.appendChild(g);
    }
  }

  // ── 엣지 렌더 ────────────────────────────────────────────────────────────────

  private redrawEdges(): void {
    if (!this.spec) return;
    this.edgeLayer.innerHTML = '';

    for (const edge of this.spec.edges) {
      const parts = this.buildEdgeElements(edge);
      if (parts) parts.forEach((el) => this.edgeLayer.appendChild(el));
    }
    // highlight 재적용
    this.applyEdgeHighlights();
  }

  /** edge = path + 2 커넥터 도트 (시작·끝 면) */
  private buildEdgeElements(edge: GraphEdge): SVGElement[] | null {
    const path = this.buildEdgePath(edge);
    if (!path) return null;
    const id1 = this.parseNodeRef(edge.from);
    const id2 = this.parseNodeRef(edge.to);
    const b1 = this.getNodeBox(id1);
    const b2 = this.getNodeBox(id2);
    if (!b1 || !b2) return [path];
    const { p1, p2 } = this.chooseAnchors(b1, b2);
    const color = edge.color ?? this.edgeKindFor(edge.kind).color ?? this.theme.edgeDefaultColor;
    const mkDot = (x: number, y: number) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', '3.5');
      c.setAttribute('fill', this.theme.edgeDotFill);
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', '1.5');
      c.setAttribute('pointer-events', 'none');
      return c;
    };
    const out: SVGElement[] = [path, mkDot(p1.x, p1.y), mkDot(p2.x, p2.y)];
    const label = this.buildEdgeLabel(edge);
    if (label) out.push(label);
    return out;
  }

  private parseNodeRef(ref: string): string {
    // 포트 suffix(:in/:out) 가 spec 에 남아있어도 무시 — 4면 자동 라우팅.
    const idx = ref.lastIndexOf(':');
    return idx < 0 ? ref : ref.slice(0, idx);
  }

  private getNodeBox(nodeId: string): { x: number; y: number; w: number; h: number } | null {
    const persistent = this.spec?.nodes.find((n) => n.id === nodeId);
    if (persistent) {
      const coords = this.nodeCoords.get(nodeId) ?? { x: persistent.x, y: persistent.y };
      return { x: coords.x, y: coords.y, w: persistent.w, h: this.getNodeEffectiveH(persistent) };
    }
    const eph = this.ephemeralNodes.find((n) => n.id === nodeId);
    if (eph) {
      const offY = this.computeAnchorLayout().get(eph.anchorId)?.offsetY ?? 0;
      return { x: eph.x, y: eph.y + offY, w: eph.w, h: eph.h };
    }
    return null;
  }

  /**
   * 두 박스 중심 상대 위치 → 가장 가까운 면 쌍 선택.
   * 반환 = {p1, p2, side1, side2}, side ∈ 'top'|'right'|'bottom'|'left'.
   * 면의 중점이 anchor. 베지어 control 은 면에 수직으로 밀어냄.
   */
  private chooseAnchors(b1: { x: number; y: number; w: number; h: number },
                        b2: { x: number; y: number; w: number; h: number }) {
    const c1 = { x: b1.x + b1.w / 2, y: b1.y + b1.h / 2 };
    const c2 = { x: b2.x + b2.w / 2, y: b2.y + b2.h / 2 };
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    let side1: 'top' | 'right' | 'bottom' | 'left';
    let side2: 'top' | 'right' | 'bottom' | 'left';
    if (horizontal) {
      side1 = dx >= 0 ? 'right' : 'left';
      side2 = dx >= 0 ? 'left' : 'right';
    } else {
      side1 = dy >= 0 ? 'bottom' : 'top';
      side2 = dy >= 0 ? 'top' : 'bottom';
    }
    const sidePoint = (b: { x: number; y: number; w: number; h: number }, side: string) => {
      switch (side) {
        case 'top':    return { x: b.x + b.w / 2, y: b.y };
        case 'bottom': return { x: b.x + b.w / 2, y: b.y + b.h };
        case 'left':   return { x: b.x,           y: b.y + b.h / 2 };
        case 'right':  return { x: b.x + b.w,     y: b.y + b.h / 2 };
        default:       return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      }
    };
    return { p1: sidePoint(b1, side1), p2: sidePoint(b2, side2), side1, side2 };
  }

  private buildEdgePath(edge: GraphEdge): SVGPathElement | null {
    const id1 = this.parseNodeRef(edge.from);
    const id2 = this.parseNodeRef(edge.to);
    const b1 = this.getNodeBox(id1);
    const b2 = this.getNodeBox(id2);
    if (!b1 || !b2) return null;

    const { p1, p2, side1, side2 } = this.chooseAnchors(b1, b2);

    // 베지어 control = 면 법선으로 거리 비례 push (자연스러운 곡선).
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const push = Math.max(40, dist * 0.4);
    const offset = (side: string, p: { x: number; y: number }) => {
      switch (side) {
        case 'top':    return { x: p.x,         y: p.y - push };
        case 'bottom': return { x: p.x,         y: p.y + push };
        case 'left':   return { x: p.x - push,  y: p.y };
        case 'right':  return { x: p.x + push,  y: p.y };
        default:       return { x: p.x,         y: p.y };
      }
    };
    const c1 = offset(side1, p1);
    const c2 = offset(side2, p2);

    const kind = this.edgeKindFor(edge.kind);
    // 선 하나만 따로 고친 값이 있으면 그게 이긴다 (edge > kind > 테마).
    const style: EdgeStyle = edge.style ?? kind.style;
    const color = edge.color ?? kind.color ?? this.theme.edgeDefaultColor;
    const width = edge.width ?? kind.width ?? 1.5;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'ck-edge');
    path.dataset.edgeId = edge.id;
    path.setAttribute(
      'd',
      style === 'wavy' || style === 'crack'
        ? this.buildWaveD(p1, c1, c2, p2, style)
        : `M ${p1.x},${p1.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-opacity', '0.7');
    if (style === 'crack') path.setAttribute('stroke-linejoin', 'miter');

    if (style === 'dashed') path.setAttribute('stroke-dasharray', '6 3');
    else if (style === 'dotted') path.setAttribute('stroke-dasharray', '2 3');

    if (kind.arrow) path.setAttribute('marker-end', 'url(#ck-arrow)');

    return path;
  }

  /**
   * 물결·금 간 선. 베지어를 직접 표본으로 떠서 법선 방향으로 흔든다 —
   * `getPointAtLength` 로 재려면 DOM 에 붙어 있어야 해서(브라우저마다 다르다),
   * 수식으로 뜨는 쪽이 확실하고 빠르다.
   */
  private buildWaveD(
    p1: { x: number; y: number }, c1: { x: number; y: number },
    c2: { x: number; y: number }, p2: { x: number; y: number },
    style: 'wavy' | 'crack'
  ): string {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(12, Math.min(120, Math.round(dist / (style === 'wavy' ? 6 : 12))));
    const amp = style === 'wavy' ? 3.5 : 5;
    const at = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
        y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
      };
    };
    const pts: string[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const p = at(t);
      const q = at(Math.min(1, t + 0.001));
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      // 법선 = 진행 방향을 90° 돌린 것. 끝에서는 흔들림을 0 으로 죽여 노드에 딱 붙게 한다.
      const taper = Math.sin(Math.PI * t);
      const off = style === 'wavy'
        ? Math.sin(t * Math.PI * (steps / 3)) * amp * taper
        : (i % 2 === 0 ? amp : -amp) * taper;
      pts.push(`${(p.x - (dy / len) * off).toFixed(2)},${(p.y + (dx / len) * off).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')}`;
  }

  /** 선 위 라벨 — 베지어 중앙(t=0.5)에 판을 깔고 글자를 얹는다. */
  private buildEdgeLabel(edge: GraphEdge): SVGGElement | null {
    const text = (edge.label ?? '').trim();
    if (!text) return null;
    const id1 = this.parseNodeRef(edge.from);
    const id2 = this.parseNodeRef(edge.to);
    const b1 = this.getNodeBox(id1);
    const b2 = this.getNodeBox(id2);
    if (!b1 || !b2) return null;
    const { p1, p2, side1, side2 } = this.chooseAnchors(b1, b2);
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const push = Math.max(40, dist * 0.4);
    const off = (side: string, p: { x: number; y: number }) => {
      switch (side) {
        case 'top':    return { x: p.x, y: p.y - push };
        case 'bottom': return { x: p.x, y: p.y + push };
        case 'left':   return { x: p.x - push, y: p.y };
        case 'right':  return { x: p.x + push, y: p.y };
        default:       return p;
      }
    };
    const q1 = off(side1, p1);
    const q2 = off(side2, p2);
    // t=0.5 의 3차 베지어 값 = (p1 + 3c1 + 3c2 + p2) / 8
    const mx = (p1.x + 3 * q1.x + 3 * q2.x + p2.x) / 8;
    const my = (p1.y + 3 * q1.y + 3 * q2.y + p2.y) / 8;

    const kind = this.edgeKindFor(edge.kind);
    const color = edge.color ?? kind.color ?? this.theme.edgeDefaultColor;
    const w = text.length * 7 + 12;
    const h = 16;

    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', 'ck-edge-label');
    g.dataset.edgeId = edge.id;
    g.setAttribute('pointer-events', 'none');

    const plate = document.createElementNS(SVG_NS, 'rect');
    plate.setAttribute('x', String(mx - w / 2));
    plate.setAttribute('y', String(my - h / 2));
    plate.setAttribute('width', String(w));
    plate.setAttribute('height', String(h));
    plate.setAttribute('rx', '8');
    plate.setAttribute('fill', this.theme.nodeFill);
    plate.setAttribute('stroke', color + '80');
    plate.setAttribute('stroke-width', '1');
    g.appendChild(plate);

    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(mx));
    t.setAttribute('y', String(my + 3.5));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', this.theme.nodeText);
    t.setAttribute('font-size', '9.5');
    t.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  // ── 하이라이트 ───────────────────────────────────────────────────────────────

  applyHighlights(): void {
    // 노드 활성
    this.nodeLayer.querySelectorAll('.ck-node').forEach((el) => {
      const g = el as SVGGElement;
      const id = g.dataset.id ?? '';
      if (this.activeSets.node_ids_active.has(id)) {
        g.classList.add('is-active');
      } else {
        g.classList.remove('is-active');
      }
    });
    this.applyEdgeHighlights();
  }

  private applyEdgeHighlights(): void {
    this.edgeLayer.querySelectorAll('.ck-edge').forEach((el) => {
      const path = el as SVGPathElement;
      const id = path.dataset.edgeId ?? '';
      if (this.activeSets.edge_ids_animated.has(id)) {
        path.classList.add('is-flowing');
      } else {
        path.classList.remove('is-flowing');
      }
    });
  }

  // ── 미니맵 ───────────────────────────────────────────────────────────────────

  private worldBounds(): { minX: number; minY: number; w: number; h: number } {
    if (!this.spec) return { minX: 0, minY: 0, w: 1200, h: 1100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.spec.nodes) {
      const c = this.nodeCoords.get(node.id) ?? { x: node.x, y: node.y };
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + node.w);
      maxY = Math.max(maxY, c.y + node.h);
    }
    for (const anchor of this.spec.ephemeral_anchors ?? []) {
      minX = Math.min(minX, anchor.x);
      minY = Math.min(minY, anchor.y);
      maxX = Math.max(maxX, anchor.x + anchor.w);
      maxY = Math.max(maxY, anchor.y + anchor.h);
    }
    if (minX === Infinity) return { minX: 0, minY: 0, w: 1200, h: 1100 };
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }

  private redrawMinimap(): void {
    if (!this.spec) return;

    // 기존 노드 rect 제거 (viewport rect 는 유지)
    Array.from(this.minimapSvg.children)
      .filter((c) => c !== this.minimapViewport)
      .forEach((c) => c.remove());

    const bounds = this.worldBounds();
    if (bounds.w <= 0 || bounds.h <= 0) return;

    const scaleX = MINIMAP_W / bounds.w;
    const scaleY = MINIMAP_H / bounds.h;
    const ms = Math.min(scaleX, scaleY) * 0.9;
    const offsetX = (MINIMAP_W - bounds.w * ms) / 2;
    const offsetY = (MINIMAP_H - bounds.h * ms) / 2;

    const toMm = (x: number, y: number) => ({
      mx: (x - bounds.minX) * ms + offsetX,
      my: (y - bounds.minY) * ms + offsetY,
    });

    // 그룹 배경
    for (const g of this.spec.groups) {
      const { mx, my } = toMm(g.bbox.x, g.bbox.y);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(mx));
      rect.setAttribute('y', String(my));
      rect.setAttribute('width', String(g.bbox.w * ms));
      rect.setAttribute('height', String(g.bbox.h * ms));
      rect.setAttribute('fill', g.color + '10');
      rect.setAttribute('stroke', g.color + '30');
      rect.setAttribute('stroke-width', '0.5');
      this.minimapSvg.insertBefore(rect, this.minimapViewport);
    }

    // 노드 rect
    for (const node of this.spec.nodes) {
      const c = this.nodeCoords.get(node.id) ?? { x: node.x, y: node.y };
      const { mx, my } = toMm(c.x, c.y);
      const kindColor = this.colorForKind(node.kind);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(mx));
      rect.setAttribute('y', String(my));
      rect.setAttribute('width', String(Math.max(2, node.w * ms)));
      rect.setAttribute('height', String(Math.max(2, this.getNodeEffectiveH(node) * ms)));
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', kindColor + '60');
      this.minimapSvg.insertBefore(rect, this.minimapViewport);
    }

    // ephemeral 노드
    for (const en of this.ephemeralNodes) {
      const { mx, my } = toMm(en.x, en.y);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(mx));
      rect.setAttribute('y', String(my));
      rect.setAttribute('width', String(Math.max(2, en.w * ms)));
      rect.setAttribute('height', String(Math.max(2, en.h * ms)));
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', '#22d3ee40');
      this.minimapSvg.insertBefore(rect, this.minimapViewport);
    }

    // viewport 박스
    const svgW = this.svg.clientWidth || 1;
    const svgH = this.svg.clientHeight || 1;
    // 캔버스 좌상단이 world 에서 어느 좌표인지
    const worldLeft = (-this.state.tx) / this.state.scale;
    const worldTop = (-this.state.ty) / this.state.scale;
    const worldRight = worldLeft + svgW / this.state.scale;
    const worldBottom = worldTop + svgH / this.state.scale;

    const vp1 = toMm(worldLeft, worldTop);
    const vp2 = toMm(worldRight, worldBottom);
    this.minimapViewport.setAttribute('x', String(Math.max(0, vp1.mx)));
    this.minimapViewport.setAttribute('y', String(Math.max(0, vp1.my)));
    this.minimapViewport.setAttribute('width', String(Math.min(MINIMAP_W, vp2.mx - vp1.mx)));
    this.minimapViewport.setAttribute('height', String(Math.min(MINIMAP_H, vp2.my - vp1.my)));
  }

  // ── 변환 적용 ────────────────────────────────────────────────────────────────

  private applyTransform(): void {
    const { scale: s, tx, ty } = this.state;
    this.world.setAttribute('transform', `matrix(${s} 0 0 ${s} ${tx} ${ty})`);
    this.redrawMinimap();
  }

  private updateNodeTransform(nodeId: string, x: number, y: number): void {
    const el = this.nodeLayer.querySelector(`[data-id="${nodeId}"]`) as SVGGElement | null;
    if (el) el.setAttribute('transform', `translate(${x},${y})`);
  }

  // ── 노드 유효 높이 (children 포함) ─────────────────────────────────────────

  private getNodeEffectiveH(node: GraphNode): number {
    const ch = node.children ?? [];
    if (ch.length === 0) return node.h;
    return NODE_HEADER_H + 1 + NODE_CHILD_PAD + ch.length * NODE_CHILD_ROW_H + NODE_CHILD_PAD;
  }

  // ── 그리드 스냅 ─────────────────────────────────────────────────────────────

  private snap(v: number): number {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  // ── 저장 디바운스 ────────────────────────────────────────────────────────────

  private flushSaves(): void {
    const updates = Array.from(this.pendingSaves.entries()).map(([key, v]) => ({
      id: key.split(':').slice(1).join(':'),
      x: v.x,
      y: v.y,
      kind: v.kind,
    }));
    this.pendingSaves.clear();
    this.saveTimer = null;
    void this.persist.save(updates);
  }

  private scheduleSave(id: string, kind: 'node' | 'anchor' | 'group' = 'node'): void {
    // 노드면 현재 nodeCoords 에서 최신 좌표 끌어옴 — 같은 노드 N회 호출 시 마지막 좌표 우선.
    if (kind === 'node') {
      const c = this.nodeCoords.get(id);
      if (c) this.pendingSaves.set(`node:${id}`, { x: c.x, y: c.y, kind });
    }
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSaves(), SAVE_DEBOUNCE_MS);
  }

  /** 그룹 드래그 시 anchor/group 좌표 patch 큐잉 (kind 명시). */
  private scheduleSaveRaw(id: string, x: number, y: number, kind: 'anchor' | 'group'): void {
    this.pendingSaves.set(`${kind}:${id}`, { x, y, kind });
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSaves(), SAVE_DEBOUNCE_MS);
  }

  // ── 공개 헬퍼 ───────────────────────────────────────────────────────────────

  /** 화면 좌표(clientX/Y) → world 좌표. 더블클릭 자리·끌고 있는 선 끝을 잡는 데 쓴다. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const { left, top } = this.svg.getBoundingClientRect();
    return {
      x: (clientX - left - this.state.tx) / this.state.scale,
      y: (clientY - top - this.state.ty) / this.state.scale,
    };
  }

  /** 현재 화면 중앙에 해당하는 world 좌표 — 새 노드를 "보이는 곳" 에 놓을 때. */
  viewCenterWorld(): { x: number; y: number } {
    const svgW = this.svg.clientWidth || 800;
    const svgH = this.svg.clientHeight || 600;
    return {
      x: (svgW / 2 - this.state.tx) / this.state.scale,
      y: (svgH / 2 - this.state.ty) / this.state.scale,
    };
  }

  /** 선택 표시 — 편집 UI 가 어떤 노드를 다루는지 캔버스에 반영. */
  setSelectedNode(nodeId: string | null): void {
    this.nodeLayer.querySelectorAll('.ck-node').forEach((el) => {
      const g = el as SVGGElement;
      g.classList.toggle('is-selected', !!nodeId && g.dataset.id === nodeId);
    });
  }

  /** 뷰를 world bbox 에 맞게 fit. */
  fitView(): void {
    const bounds = this.worldBounds();
    if (bounds.w <= 0 || bounds.h <= 0) return;
    const svgW = this.svg.clientWidth || 800;
    const svgH = this.svg.clientHeight || 600;
    const pad = 60;
    const scaleX = (svgW - pad * 2) / bounds.w;
    const scaleY = (svgH - pad * 2) / bounds.h;
    this.state.scale = Math.max(0.1, Math.min(2, Math.min(scaleX, scaleY)));
    this.state.tx = pad - bounds.minX * this.state.scale;
    this.state.ty = pad - bounds.minY * this.state.scale;
    this.applyTransform();
  }
}
