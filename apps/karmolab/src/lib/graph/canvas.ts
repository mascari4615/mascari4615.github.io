/**
 * lib/graph/canvas.ts — SVG 무한 캔버스 (pan/zoom + 노드/edge + 드래그 + 미니맵).
 *
 * Unity Shader Graph / Animator 스타일.
 * - 1개 <g transform="matrix(s 0 0 s tx ty)"> 안에 전체 콘텐츠.
 * - 노드: <g class="ck-node" data-id="…"> rect + text + ports.
 * - edge: 베지어 path — 두 박스의 가장 가까운 면 쌍 자동 선택.
 * - 드래그: pointerdown → pointermove → pointerup → debounce save (터치·펜 포함, 두 손가락 = 핀치 줌).
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
  BackgroundKind,
} from './spec';
import type { GraphPersistAdapter } from './adapter';
import { NULL_PERSIST_ADAPTER } from './adapter';
import { injectGraphCanvasStyles, GRAPH_CANVAS_CSS } from './styles';
import { resolveDoc, displayDoc } from './notes';
import { exportSvgString } from './canvas-export';
import { buildNodeAvatar } from './canvas-avatar';
import { buildNodeBackground, buildNoteCardBody } from './canvas-shape';
import { chooseAnchors, edgeCurve, boundsOf, zoomAt, rectFromPoints, rectHits } from './canvas-math';
import { buildEdgePath, buildEdgeLabel, buildLeaderLine } from './canvas-edge';
import { renderGroups, computeGroupBox } from './canvas-group';
import { nodeBadges } from './canvas-badges';
import { buildChildCard } from './canvas-children';
import { buildCardText } from './canvas-card';
import { buildCanvasDom } from './canvas-dom';
import { renderAnchors, computeAnchorLayout } from './canvas-anchors';
import type { Side } from './canvas-math';
import { colorForTag, snapTo, pointOnCubic, convexHull, roundedHullPath, boxCorners, wobblePath,
  fitProjection, projectPoint, viewportRectOnMap } from './canvas-math';

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
  onNodeResized?: (nodeId: string) => void;
  /** 빈 배경 클릭 — 선택 해제용. */
  onBackgroundClick?: () => void;
  /** 빈 배경 더블클릭 — 그 자리에 새 노드를 만드는 위젯용 (world 좌표). */
  onBackgroundDoubleClick?: (world: { x: number; y: number }) => void;
  /**
   * 노드 손잡이에서 끌어다 다른 노드에 놓았을 때. 이 콜백을 주면 손잡이가 그려진다 —
   * 안 주면 읽기 전용 뷰(cockpit)처럼 손잡이 자체가 없다.
   */
  onConnect?: (fromId: string, toId: string) => void;
  /**
   * 선을 손으로 고쳤을 때(휘기·이름표 자리). 이 콜백을 주면 선에 손잡이가 생긴다 —
   * 캔버스가 `spec` 의 그 선을 직접 고치고, 저장은 위젯이 한다.
   */
  onEdgeChanged?: (edgeId: string) => void;
  /** 선을 클릭했을 때. 주면 선마다 「잡이 선」이 깔린다. */
  onEdgeClick?: (edgeId: string) => void;
  /** 여럿을 한 번에 골랐을 때 (Shift+배경 드래그). 이 콜백을 주면 범위 고르기가 켜진다. */
  onSelectMany?: (nodeIds: string[]) => void;
  /** 묶음을 손으로 고쳤을 때(이름표 자리). 주면 이름표를 끌 수 있게 된다. */
  onGroupChanged?: (groupId: string) => void;
}

/** 클릭과 드래그를 가르는 이동 거리 (px). */
const CLICK_SLOP = 4;

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const MINIMAP_W = 200;
const MINIMAP_H = 150;
const SAVE_DEBOUNCE_MS = 400;
const GRID_SIZE = 8;         // 그리드 스냅 단위 (px)
const BG_CELL = 32;          // 배경 무늬 한 칸 (= 스냅 4칸)
/** 이 배율보다 작아지면 배경 무늬를 끈다 — 촘촘한 무늬는 축소하면 모아레(먼지)가 된다. */
const BG_MIN_SCALE = 0.4;
const GROUP_HEADER_H = 20;   // 그룹 프레임 헤더 높이
const NODE_HEADER_H = 30;    // children 있는 노드의 헤더 영역 높이
/** 쪽지 본문 줄 간격·최대 줄 수 — 카드가 소설이 되면 그림이 안 읽힌다. */
/** 카드에 접어 넣는 칸 줄 — 표가 되면 그림이 안 읽힌다. */
const NODE_FIELD_ROW_H = 11;
const NODE_FIELD_MAX_ROWS = 3;
const NOTE_BODY_LINE_H = 12;
const NOTE_BODY_MAX_LINES = 6;
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
  private bgRect!: SVGRectElement;
  private background: BackgroundKind = 'dots';
  private minimapViewport!: SVGRectElement;

  private spec: GraphSpec | null = null;
  private ephemeralNodes: EphemeralNodeRender[] = [];
  private activeSets: ActiveSets = { node_ids_active: new Set(), edge_ids_animated: new Set() };

  // node id → 현재 좌표 (드래그 중 변경)
  private nodeCoords: Map<string, { x: number; y: number }> = new Map();

  private state: CanvasState = { scale: 1, tx: 0, ty: 0 };

  // 드래그 상태
  /** 카드 크기 바꾸기 — 모서리를 끌면 사람이 정한 크기가 되고, 그 뒤로 자동 맞춤이 손대지 않는다. */
  private sizing: { nodeId: string; startX: number; startY: number; startW: number; startH: number } | null = null;
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

  /** 지금 화면에 닿아 있는 포인터들 — 손가락 두 개를 알아보려면 세고 있어야 한다. */
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private pinch: {
    startDist: number; startScale: number;
    startTx: number; startTy: number;
    startMidX: number; startMidY: number;
  } | null = null;

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
  /** 카드 크기를 손으로 바꾼 뒤 — 저장은 위젯이 한다(캔버스는 저장소를 모른다). */
  private onNodeResized?: (nodeId: string) => void;
  private onBackgroundClick?: () => void;
  private onBackgroundDoubleClick?: (world: { x: number; y: number }) => void;
  private onConnect?: (fromId: string, toId: string) => void;
  private onEdgeChanged?: (edgeId: string) => void;
  private onEdgeClick?: (edgeId: string) => void;
  private onSelectMany?: (nodeIds: string[]) => void;
  private onGroupChanged?: (groupId: string) => void;
  /** 묶음 이름표를 옮기는 중. */
  private labelDrag: { groupId: string; x0: number; y0: number; dx0: number; dy0: number } | null = null;
  /** 범위 고르기 중 — 시작점(world)과 화면에 그리는 사각형. */
  private marquee: { x0: number; y0: number; rect: SVGRectElement } | null = null;
  /** 여러 개를 고른 상태. 하나를 끌면 이들이 함께 움직인다. */
  private selectedIds: Set<string> = new Set();
  private multiDrag: Map<string, { x: number; y: number }> | null = null;
  /** 선을 휘거나 이름표를 옮기는 중. */
  private edgeDrag: { edgeId: string; mode: 'curve' | 'label'; moved: boolean } | null = null;
  /** 선 끝점을 다른 노드로 옮기는 중. */
  private rewiring: { edgeId: string; end: 'from' | 'to'; temp: SVGPathElement } | null = null;
  /** 지금 「여기 놓으면 붙는다」로 밝혀 둔 노드. */
  private hintEl: SVGGElement | null = null;
  /** 누른 자리가 어느 선이었나 — 뗄 때 클릭으로 칠지 판단한다. */
  private pressEdgeId: string | null = null;
  /** 포커스 대상 id — null 이면 포커스 없음. */
  private focusIds: Set<string> | null = null;
  /**
   * 거르기 (TASK-KL-202 M-3). 포커스가 「잠깐 흐리기」라면 이쪽은 **아예 안 그리기**다 —
   * Kumu 도 focus(근접 기반)와 filter(조건 선별)를 다른 도구로 둔다.
   */
  /**
   * 데이터로 꾸미기 (TASK-KL-202 격차 S). 손으로 하나씩 키우는 대신 **규칙 한 줄**로
   * 「많이 이어진 것이 크다」를 만든다 — 자료가 늘어도 규칙이 알아서 따라간다(Kumu 의 decoration).
   */
  private decorate: { sizeByDegree: boolean; colorByTag: boolean; colorByField: string } =
    { sizeByDegree: false, colorByTag: false, colorByField: '' };
  /** 이번 렌더에서 쓸 노드별 연결 수. render 시작 때 한 번만 센다. */
  private degreeCache: Map<string, number> = new Map();

  private filter: {
    nodeKinds: Set<string>; edgeKinds: Set<string>; tags: Set<string>;
    hideOrphans: boolean; minDegree: number;
    /** 칸으로 좁히기 — 「출신 = 마계」. 이름만 있고 값이 비면 **그 칸을 가진 노드만**. */
    fieldName: string; fieldValue: string;
  } = {
    nodeKinds: new Set(), edgeKinds: new Set(), tags: new Set(), hideOrphans: false, minDegree: 0,
    fieldName: '', fieldValue: '',
  };
  /** 손잡이에서 끌고 있는 중. 임시 선은 edgeLayer 에 그렸다가 놓을 때 지운다. */
  private linking: { fromId: string; temp: SVGPathElement } | null = null;

  /** 누른 지점 — 뗄 때 이동량으로 클릭/드래그를 가른다. */
  private pressOrigin: { x: number; y: number; nodeId: string | null } | null = null;

  constructor(container: HTMLElement, options: GraphCanvasOptions = {}) {
    this.container = container;
    this.persist = options.persistAdapter ?? NULL_PERSIST_ADAPTER;
    this.kindColors = options.kindColors ?? {};
    this.defaultKindColor = options.defaultKindColor ?? DEFAULT_KIND_COLOR;
    this.edgeKindFallback = options.edgeKinds ?? {};
    this.theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) };
    this.onNodeClick = options.onNodeClick;
    this.onNodeResized = options.onNodeResized;
    this.onBackgroundClick = options.onBackgroundClick;
    this.onBackgroundDoubleClick = options.onBackgroundDoubleClick;
    this.onConnect = options.onConnect;
    this.onEdgeChanged = options.onEdgeChanged;
    this.onEdgeClick = options.onEdgeClick;
    this.onSelectMany = options.onSelectMany;
    this.onGroupChanged = options.onGroupChanged;
    instanceSeq += 1;
    this.uid = `g${instanceSeq}`;
    injectGraphCanvasStyles();
    this.buildDOM();
    this.bindEvents();
  }

  /** node.kind → 색. 주입된 맵에 없으면 기본색. */
  /** 노드 종류 색표를 갈아 끼운다 — 사용자가 자기 종류를 만들면 표가 늘어난다. */
  setKindColors(colors: Record<string, string>): void {
    this.kindColors = colors;
    this.render();
  }

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
    // 뼈대(층 순서·배경 무늬·미니맵)는 canvas-dom 이 안다.
    const dom = buildCanvasDom(this.container, this.uid, this.theme);
    this.svg = dom.svg;
    this.world = dom.world;
    this.groupLayer = dom.groupLayer;
    this.edgeLayer = dom.edgeLayer;
    this.nodeLayer = dom.nodeLayer;
    this.bgRect = dom.bgRect;
    this.minimapSvg = dom.minimapSvg;
    this.minimapViewport = dom.minimapViewport;
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
      // 가리킨 자리를 붙잡은 채 확대·축소 — 셈법은 canvas-math 가 안다.
      Object.assign(this.state, zoomAt(this.state, e.deltaY > 0 ? 0.9 : 1.1, { x: mx, y: my }));
      this.applyTransform();
    }, { passive: false });

    // Pan (배경 누름) / drag (노드 누름) / pinch (손가락 둘)
    this.svg.addEventListener('pointerdown', (e) => {
      // 사람이 손을 대면 진행 중인 미끄러짐은 그 자리에서 접는다 — 손과 화면이 싸우면 안 된다.
      if (this.tween) { cancelAnimationFrame(this.tween); this.tween = 0; }
      // 손가락 두 개 = 핀치 줌. 첫 손가락이 시작한 드래그는 접고 확대·축소로 넘어간다.
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 2) {
        const [a, b] = [...this.activePointers.values()];
        this.pinch = {
          startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          startScale: this.state.scale,
          startTx: this.state.tx,
          startTy: this.state.ty,
          startMidX: (a.x + b.x) / 2,
          startMidY: (a.y + b.y) / 2,
        };
        this.dragging = null;
        this.draggingGroup = null;
        this.panning = null;
        this.pressOrigin = null;
        return;
      }
      if (this.activePointers.size > 2) return;
      const target = e.target as Element;
      const endEl = target.closest('.ck-edge-end') as SVGCircleElement | null;
      if (endEl && this.onEdgeChanged) {
        const edgeId = endEl.dataset.edgeId ?? '';
        const end = (endEl.dataset.end ?? 'to') as 'from' | 'to';
        if (edgeId) {
          e.stopPropagation();
          e.preventDefault();
          const temp = document.createElementNS(SVG_NS, 'path');
          temp.setAttribute('class', 'ck-edge ck-link-temp');
          temp.setAttribute('fill', 'none');
          temp.setAttribute('stroke', this.theme.edgeDefaultColor);
          temp.setAttribute('stroke-width', '2');
          this.edgeLayer.appendChild(temp);
          this.rewiring = { edgeId, end, temp };
          this.pressOrigin = null;
          return;
        }
      }
      const labelDragEl = target.closest('.ck-group-label') as SVGTextElement | null;
      if (labelDragEl && this.onGroupChanged) {
        const gid = labelDragEl.dataset.groupId ?? '';
        const grp = this.spec?.groups.find((x) => x.id === gid);
        if (grp) {
          e.stopPropagation();
          e.preventDefault();
          const w = this.screenToWorld(e.clientX, e.clientY);
          this.labelDrag = { groupId: gid, x0: w.x, y0: w.y, dx0: grp.labelDx ?? 0, dy0: grp.labelDy ?? 0 };
          this.pressOrigin = null;
          return;
        }
      }
      const gripEl = target.closest('.ck-edge-grip') as SVGCircleElement | null;
      const labelEl = target.closest('.ck-edge-label') as SVGGElement | null;
      if ((gripEl || labelEl) && this.onEdgeChanged) {
        const edgeId = (gripEl ?? labelEl)?.dataset.edgeId ?? '';
        if (edgeId) {
          e.stopPropagation();
          e.preventDefault();
          this.edgeDrag = { edgeId, mode: gripEl ? 'curve' : 'label', moved: false };
          this.pressOrigin = null;
          return;
        }
      }
      const sizeEl = target.closest('.ck-size-handle') as SVGRectElement | null;
      if (sizeEl) {
        const id = sizeEl.dataset.sizeFor ?? '';
        const n = this.spec?.nodes.find((x) => x.id === id);
        if (n) {
          e.stopPropagation();
          e.preventDefault();
          this.sizing = { nodeId: id, startX: e.clientX, startY: e.clientY, startW: n.w, startH: n.h };
          this.pressOrigin = null;
          return;
        }
      }
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

      const hitEl = target.closest('.ck-edge-hit') as SVGPathElement | null;
      this.pressEdgeId = hitEl?.dataset.edgeId ?? null;
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
        // 고른 무리 안의 노드를 끌면 무리 전체가 따라온다.
        if (this.selectedIds.size > 1 && this.selectedIds.has(nodeId)) {
          this.multiDrag = new Map();
          for (const id of this.selectedIds) {
            const c0 = this.nodeCoords.get(id);
            if (c0) this.multiDrag.set(id, { x: c0.x, y: c0.y });
          }
        } else {
          this.multiDrag = null;
        }
        this.svg.style.cursor = 'grabbing';
      } else if (groupEl) {
        // 그룹 드래그 — 멤버 노드 + anchor 같이 이동
        const groupId = groupEl.dataset.groupId ?? '';
        const grp = this.spec?.groups.find((g) => g.id === groupId);
        if (!grp || !this.spec) return;
        // 잠긴 묶음은 아예 안 잡힌다 — 「잡히는데 안 움직이는」 것보다 안 잡히는 게 덜 헷갈린다.
        if (grp.locked) return;
        e.stopPropagation();
        const startNodeCoords = new Map<string, { x: number; y: number }>();
        for (const n of this.spec.nodes) {
          if (!this.isMember(n, groupId)) continue;
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
      } else if (e.shiftKey && this.onSelectMany) {
        // Shift+배경 드래그 = 범위 고르기(rubber band). 그냥 드래그는 화면 밀기 그대로 —
        // 두 뜻을 같은 몸짓에 주면 「밀려다 골라지는」 사고가 난다.
        const w = this.screenToWorld(e.clientX, e.clientY);
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', 'ck-marquee');
        rect.setAttribute('x', String(w.x));
        rect.setAttribute('y', String(w.y));
        rect.setAttribute('width', '0');
        rect.setAttribute('height', '0');
        this.nodeLayer.appendChild(rect);
        this.marquee = { x0: w.x, y0: w.y, rect };
        this.pressOrigin = null;
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

    window.addEventListener('pointermove', (e) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this.pinch && this.activePointers.size >= 2) {
        const [a, b] = [...this.activePointers.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const { left, top } = this.svg.getBoundingClientRect();
        // 두 손가락 사이 지점을 화면에 고정한 채 배율만 바꾼다 — **휠 줌과 같은 셈법**을 쓴다
        // (규칙이 갈리면 「마우스로는 자연스러운데 손가락으로는 튄다」가 된다).
        Object.assign(this.state, zoomAt(
          { tx: this.pinch.startTx, ty: this.pinch.startTy, scale: this.pinch.startScale },
          dist / this.pinch.startDist,
          { x: this.pinch.startMidX - left, y: this.pinch.startMidY - top },
        ));
        this.applyTransform();
        return;
      }
      if (this.labelDrag) {
        const grp = this.spec?.groups.find((x) => x.id === this.labelDrag?.groupId);
        if (grp) {
          const w = this.screenToWorld(e.clientX, e.clientY);
          grp.labelDx = Math.round(this.labelDrag.dx0 + (w.x - this.labelDrag.x0));
          grp.labelDy = Math.round(this.labelDrag.dy0 + (w.y - this.labelDrag.y0));
          this.groupLayer.innerHTML = '';
          this.renderGroups();
          this.renderAnchors();
        }
        return;
      }
      if (this.marquee) {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const box = rectFromPoints({ x: this.marquee.x0, y: this.marquee.y0 }, w);
        this.marquee.rect.setAttribute('x', String(box.x));
        this.marquee.rect.setAttribute('y', String(box.y));
        this.marquee.rect.setAttribute('width', String(box.w));
        this.marquee.rect.setAttribute('height', String(box.h));
        return;
      }
      if (this.multiDrag && this.dragging) {
        // 고른 것들이 함께 움직인다 — 끌고 있는 노드의 이동량을 그대로 얹는다.
        const dx = (e.clientX - this.dragging.startMouseX) / this.state.scale;
        const dy = (e.clientY - this.dragging.startMouseY) / this.state.scale;
        for (const [id, start] of this.multiDrag) {
          const nx = this.snap(start.x + dx);
          const ny = this.snap(start.y + dy);
          this.nodeCoords.set(id, { x: nx, y: ny });
          this.updateNodeTransform(id, nx, ny);
          this.scheduleSave(id);
        }
        this.groupLayer.innerHTML = '';
        this.renderGroups();
        this.renderAnchors();
        this.redrawEdges();
        this.renderLeaders();
        this.redrawMinimap();
        return;
      }
      if (this.rewiring) {
        const edge = this.spec?.edges.find((x) => x.id === this.rewiring?.edgeId);
        if (!edge) return;
        // 붙잡은 쪽 반대편은 고정. 거기서 커서까지 임시 선을 긋는다.
        const anchorId = this.parseNodeRef(this.rewiring.end === 'from' ? edge.to : edge.from);
        const box = this.getNodeBox(anchorId);
        if (box) {
          const w = this.screenToWorld(e.clientX, e.clientY);
          this.linkTargetHint(e.clientX, e.clientY);
          this.rewiring.temp.setAttribute(
            'd', `M ${box.x + box.w / 2},${box.y + box.h / 2} L ${w.x},${w.y}`
          );
        }
        return;
      }
      if (this.edgeDrag) {
        this.edgeDrag.moved = true;
        const edge = this.spec?.edges.find((x) => x.id === this.edgeDrag?.edgeId);
        if (!edge) return;
        const b1 = this.getNodeBox(this.parseNodeRef(edge.from));
        const b2 = this.getNodeBox(this.parseNodeRef(edge.to));
        if (!b1 || !b2) return;
        const { p1, p2 } = this.chooseAnchors(b1, b2);
        const w = this.screenToWorld(e.clientX, e.clientY);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        if (this.edgeDrag.mode === 'curve') {
          // 두 끝점을 잇는 직선에서 얼마나 벗어났는지(법선 성분)를 그대로 휘는 값으로.
          const nx = -dy / len;
          const ny = dx / len;
          const off = (w.x - (p1.x + p2.x) / 2) * nx + (w.y - (p1.y + p2.y) / 2) * ny;
          const curve = Math.max(-0.8, Math.min(0.8, (off / len) * 1.35));
          edge.curve = Math.abs(curve) < 0.02 ? undefined : Number(curve.toFixed(3));
        } else {
          // 이름표는 두 끝점 사이 어디쯤인지(접선 성분)로 자리를 잡는다.
          const t = ((w.x - p1.x) * dx + (w.y - p1.y) * dy) / (len * len);
          edge.labelPos = Number(Math.min(0.95, Math.max(0.05, t)).toFixed(3));
        }
        this.redrawEdges();
        return;
      }
      if (this.linking) {
        const from = this.getNodeBox(this.linking.fromId);
        if (from) {
          this.linkTargetHint(e.clientX, e.clientY);
          const p = this.screenToWorld(e.clientX, e.clientY);
          const sx = from.x + from.w;
          const sy = from.y + from.h / 2;
          this.linking.temp.setAttribute('d', `M ${sx},${sy} L ${p.x},${p.y}`);
        }
        return;
      }
      if (this.sizing) {
        const n = this.spec?.nodes.find((x) => x.id === this.sizing?.nodeId);
        if (n) {
          const dw = (e.clientX - this.sizing.startX) / this.state.scale;
          const dh = (e.clientY - this.sizing.startY) / this.state.scale;
          n.w = Math.max(60, Math.round(this.sizing.startW + dw));
          n.h = Math.max(32, Math.round(this.sizing.startH + dh));
          n.sized = true;   // 이제부터 이 카드는 **사람 것**이다 — 자동 맞춤이 손대지 않는다.
          this.render();
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

    window.addEventListener('pointerup', (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.pinch) {
        // 손가락 하나가 떨어지면 핀치는 끝. 남은 손가락으로 이어서 끌지는 않는다
        // (핀치 도중 한 손가락이 뜨는 건 흔한데, 거기서 화면이 확 튀면 놀란다).
        if (this.activePointers.size < 2) this.pinch = null;
        return;
      }
      if (this.labelDrag) {
        const { groupId } = this.labelDrag;
        this.labelDrag = null;
        this.onGroupChanged?.(groupId);
        return;
      }
      if (this.marquee) {
        const r = this.marquee.rect;
        const x = Number(r.getAttribute('x'));
        const y = Number(r.getAttribute('y'));
        const w = Number(r.getAttribute('width'));
        const h = Number(r.getAttribute('height'));
        r.remove();
        this.marquee = null;
        // 「조금이라도 겹치면 고른 것」 규칙은 canvas-math 가 안다.
        const hits = (this.spec?.nodes ?? []).filter((n) => {
          const c0 = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
          return rectHits({ x, y, w, h }, { x: c0.x, y: c0.y, w: n.w, h: this.getNodeEffectiveH(n) });
        });
        this.setSelectedNodes(hits.map((n) => n.id));
        this.onSelectMany?.(hits.map((n) => n.id));
        return;
      }
      if (this.rewiring) {
        const { edgeId, end, temp } = this.rewiring;
        this.rewiring = null;
        temp.remove();
        this.clearTargetHint();
        const edge = this.spec?.edges.find((x) => x.id === edgeId);
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const toEl = under?.closest?.('.ck-node') as SVGGElement | null;
        const dropId = toEl?.dataset.id ?? '';
        const otherId = edge ? this.parseNodeRef(end === 'from' ? edge.to : edge.from) : '';
        // 자기 자신에 잇거나 반대편과 같아지면 선이 사라진 것처럼 보인다 — 그냥 되돌린다.
        if (edge && dropId && dropId !== otherId) {
          if (end === 'from') edge.from = dropId;
          else edge.to = dropId;
          this.redrawEdges();
          this.onEdgeChanged?.(edgeId);
        } else {
          this.redrawEdges();
        }
        return;
      }
      if (this.edgeDrag) {
        const { edgeId, mode, moved } = this.edgeDrag;
        this.edgeDrag = null;
        // 이름표를 「눌렀다 뗀」 것뿐이면 옮기려던 게 아니라 **그 선을 보려던** 것이다.
        if (mode === 'label' && !moved) { this.onEdgeClick?.(edgeId); return; }
        this.onEdgeChanged?.(edgeId);
        return;
      }
      if (this.linking) {
        const { fromId, temp } = this.linking;
        this.linking = null;
        temp.remove();
        this.clearTargetHint();
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
          else if (this.pressEdgeId) this.onEdgeClick?.(this.pressEdgeId);
          else if (this.panning) this.onBackgroundClick?.();
        }
        this.pressEdgeId = null;
      }
      if (this.sizing) {
        this.onNodeResized?.(this.sizing.nodeId);
        this.sizing = null;
      }
      this.dragging = null;
      this.draggingGroup = null;
      this.panning = null;
      this.svg.style.cursor = 'grab';
    });

    // 손가락이 화면 밖으로 나가거나 시스템이 제스처를 가로채면 여기로 온다 —
    // 안 지우면 「끌고 있는 중」 상태가 남아 다음 터치가 이상하게 동작한다.
    window.addEventListener('pointercancel', (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) this.pinch = null;
      this.dragging = null;
      this.multiDrag = null;
      this.draggingGroup = null;
      this.panning = null;
      this.edgeDrag = null;
      this.labelDrag = null;
      this.rewiring?.temp.remove();
      this.rewiring = null;
      this.clearTargetHint();
      this.linking?.temp.remove();
      this.linking = null;
      this.svg.style.cursor = 'grab';
    });

    // 빈 배경 더블클릭 → 그 자리에 새 노드 (Scapple·FigJam 의 「그냥 두 번 눌러라」).
    this.svg.addEventListener('dblclick', (e) => {
      if (!this.onBackgroundDoubleClick || !this.editable) return;
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

    // 연결 수는 한 번만 센다 — 노드마다 세면 그림이 커질수록 제곱으로 느려진다.
    this.degreeCache = new Map();
    if (this.decorate.sizeByDegree) {
      for (const e of this.spec.edges) {
        for (const ref of [e.from, e.to]) {
          const id = this.parseNodeRef(ref);
          this.degreeCache.set(id, (this.degreeCache.get(id) ?? 0) + 1);
        }
      }
    }

    this.renderGroups();
    this.renderAnchors();
    this.renderNodes(this.visibleNodes());
    this.redrawEdges();
    this.renderLeaders();
    this.redrawMinimap();
    this.applyFocus();
    // 다시 그리면 노드 요소가 새로 만들어진다 — 고른 표시를 여기서 되살리지 않으면
    // 「골라 놨는데 표시가 사라지는」 상태가 된다(고른 상태 자체는 남아 있어 더 헷갈린다).
    this.paintSelection();
  }

  /**
   * anchor 들의 effective y/h 계산 — 같은 group 안 anchors 는 spec order 로
   * 위→아래 stack push (도미노). spec y = 첫 박스 base, 다음부터 = 이전 actual bottom + GAP.
   * items 따라 박스 늘림 → 다음 박스도 자동으로 밀려서 겹침 없음.
   */
  private computeAnchorLayout(): Map<string, { x: number; y: number; w: number; h: number; offsetY: number }> {
    if (!this.spec) return new Map();
    return computeAnchorLayout(
      this.spec.ephemeral_anchors ?? [],
      (anchorId) => this.ephemeralNodes.filter((n) => n.anchorId === anchorId),
    );
  }

  private renderAnchors(): void {
    if (!this.spec) return;
    renderAnchors(this.spec.ephemeral_anchors, this.computeAnchorLayout(), this.groupLayer, this.theme);
  }

  /**
   * group bbox = max(spec bbox, content bbox).
   * content = group 멤버 노드(드래그 반영) + group 소속 anchor(effective h, stack push 반영).
   * 근본 — spec 은 최소 hint, 실제는 자기 컨텐츠 항상 감쌈.
   */
  /** 이 노드가 그 묶음에 드는가. 여러 묶음에 동시에 들 수 있다(격차 D-2). */
  private isMember(n: { group: string; groups?: string[] }, groupId: string): boolean {
    if (n.groups && n.groups.length > 0) return n.groups.includes(groupId);
    return n.group === groupId;
  }

  private computeGroupBox(group: GroupDef): { x: number; y: number; w: number; h: number } {
    // 멤버가 **지금 어디 있나**(끌어 옮긴 좌표)와 임시 자리의 쌓인 자리를 모아 넘긴다.
    const layout = this.computeAnchorLayout();
    const boxes = [
      ...(this.spec?.nodes ?? [])
        .filter((n) => this.isMember(n, group.id))
        .map((n) => {
          const c = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
          return { x: c.x, y: c.y, w: this.effW(n), h: this.getNodeEffectiveH(n) };
        }),
      ...(this.spec?.ephemeral_anchors ?? [])
        .filter((a) => a.group === group.id)
        .map((a) => layout.get(a.id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    ];
    return computeGroupBox(group, boxes);
  }

  /**
   * 멤버들을 감싸는 볼록 껍질(convex hull) 경로. 각 노드의 네 모서리를 점으로 모아 껍질을 구하고,
   * 바깥으로 살짝 부풀린 뒤 모서리를 둥글린다.
   *
   * Bubble Sets 처럼 오목한 등고선까지 가진 않는다 — 이 캔버스는 노드가 수십 개 규모라
   * **가장 싸면서 겹침을 확 낫게 하는 것**이 볼록 껍질이다. 멤버가 둘 이하면 네모가 낫다(껍질이 선이 된다).
   */
  private groupHullPath(g: GroupDef): string | null {
    if (!this.spec) return null;
    const pad = 18;
    const pts: { x: number; y: number }[] = [];
    for (const n of this.spec.nodes) {
      if (!this.isMember(n, g.id)) continue;
      const c0 = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
      pts.push(...boxCorners(
        { x: c0.x, y: c0.y, w: this.effW(n), h: this.getNodeEffectiveH(n) },
        pad,
      ));
    }
    if (pts.length < 12) return null;   // 멤버 2 이하 — 껍질이 선이 된다. 네모가 낫다
    return roundedHullPath(convexHull(pts));
  }

  private renderGroups(): void {
    if (!this.spec) return;
    // 「어떻게 그리나」는 canvas-group 이 안다 — 여기서는 **무엇을 그릴지**와 자리 계산만 준다.
    renderGroups(this.spec.groups.filter((g) => !g.hidden), {
      layer: this.groupLayer,
      uid: this.uid,
      boxOf: (g) => this.computeGroupBox(g),
      hullOf: (g) => ((g.shape ?? 'box') === 'hull' ? this.groupHullPath(g) : null),
    });
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
    // 그리는 동안은 「배율 먹인 폭」이 곧 그 노드의 폭이다. 원본 node.w 는 그대로 둔다
    // (저장본을 건드리면 규칙을 껐을 때 크기가 안 돌아온다).
    const baseW = node.w;
    node = new Proxy(node, {
      get: (t, k) => (k === 'w' ? baseW * this.sizeScale(t.id) : (t as unknown as Record<string, unknown>)[k as string]),
    }) as GraphNode;

    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', 'ck-node');
    g.dataset.id = node.id;
    // 기울기는 상자 한가운데를 축으로 — 모서리를 축으로 돌리면 위치가 같이 밀려서
    // 「돌렸을 뿐인데 딴 데로 갔다」가 된다.
    const rot = node.rotate ?? 0;
    g.setAttribute(
      'transform',
      rot
        ? `translate(${coords.x},${coords.y}) rotate(${rot} ${node.w / 2} ${effH / 2})`
        : `translate(${coords.x},${coords.y})`
    );
    g.style.cursor = 'grab';

    const kindColor = this.nodeColor(node);
    const shape: NodeShape = node.shape ?? 'rect';

    // 배경 — 모양에 따라 카드 / 동그라미 / 말풍선.
    // 클래스를 박아 두는 이유: 선택·활성 표시가 `rect:first-of-type` 를 집던 시절엔
    // 동그라미·말풍선(rect 가 아님)에서 표시가 통째로 사라졌다.
    const bg = this.buildNodeBackground(node, effH, kindColor, shape);
    bg.setAttribute('class', 'ck-node-bg');
    g.appendChild(bg);

    // 좌측 색띠 — 카드 모양일 때만 (동그라미·말풍선·메모에선 띠가 어색하다)
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

    if (shape === 'photo' && node.avatar?.kind === 'image') {
      // 사진이 주인공인 카드. 이름은 아래 반투명 띠에 얹어 그림을 안 가린다
      // (관계도에서 얼굴이 가장 빨리 읽히는 표지다).
      const clipId = `ck-photo-${this.uid}-${node.id}`;
      const defs = document.createElementNS(SVG_NS, 'defs');
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('width', String(node.w));
      r.setAttribute('height', String(effH));
      r.setAttribute('rx', '6');
      clip.appendChild(r);
      defs.appendChild(clip);
      g.appendChild(defs);

      const img = document.createElementNS(SVG_NS, 'image');
      img.setAttribute('x', '0');
      img.setAttribute('y', '0');
      img.setAttribute('width', String(node.w));
      img.setAttribute('height', String(effH));
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', node.avatar.value);
      img.setAttribute('href', node.avatar.value);
      img.setAttribute('pointer-events', 'none');
      g.appendChild(img);

      const band = document.createElementNS(SVG_NS, 'rect');
      band.setAttribute('x', '0');
      band.setAttribute('y', String(effH - 26));
      band.setAttribute('width', String(node.w));
      band.setAttribute('height', '26');
      band.setAttribute('fill', 'rgba(0,0,0,0.62)');
      band.setAttribute('clip-path', `url(#${clipId})`);
      band.setAttribute('pointer-events', 'none');
      g.appendChild(band);

      const nameEl = document.createElementNS(SVG_NS, 'text');
      nameEl.setAttribute('x', String(node.w / 2));
      nameEl.setAttribute('y', String(effH - 9));
      nameEl.setAttribute('text-anchor', 'middle');
      nameEl.setAttribute('fill', '#fff');
      nameEl.setAttribute('font-size', '11');
      nameEl.setAttribute('font-weight', '600');
      nameEl.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
      nameEl.setAttribute('pointer-events', 'none');
      nameEl.textContent = node.label;
      g.appendChild(nameEl);
    } else if (shape === 'note' && this.spec && displayDoc(this.spec, node).trim()) {
      // 쪽지에 **글이 안 보이면** 그냥 이름표다 — 접는 규칙은 canvas-shape 이 안다.
      for (const el of buildNoteCardBody(node.label, displayDoc(this.spec, node).trim(), node.w, this.theme)) {
        g.appendChild(el);
      }
    } else if (children.length === 0) {
      const centered = shape === 'circle';
      const avatarEl = this.buildNodeAvatar(node, effH, kindColor, centered);
      if (avatarEl) g.appendChild(avatarEl);
      // 이름·한마디·칸 줄의 자리 규칙은 canvas-card 가 안다.
      for (const el of buildCardText(node, effH, centered, this.theme)) g.appendChild(el);
    } else {
      // 자식 있음 — 머리 + 구분선 + 목록. 그리는 규칙은 canvas-children 이 안다.
      for (const el of buildChildCard(node.label, children, node.w, kindColor, this.theme)) {
        g.appendChild(el);
      }
    }

    // 카드 모서리 표식(📄 · 🔗N · 💬N)은 canvas-badges 가 안다.
    for (const b of nodeBadges(this.spec, node, effH)) g.appendChild(b);

    // 연결 손잡이 — 노드 오른쪽 가장자리. 여기서 끌어다 다른 노드에 놓으면 선이 생긴다
    // (Miro·FigJam 의 파란 점. 「연결 시작」 버튼을 누르고 다시 클릭하던 2단계를 없앤다).
    // 크기 손잡이 — **고른 카드에만**. 늘 보이면 카드가 지저분해지고 잘못 잡는다.
    if (this.editable && this.selectedIds.size === 1 && this.selectedIds.has(node.id)) {
      const grip = document.createElementNS(SVG_NS, 'rect');
      grip.setAttribute('class', 'ck-size-handle');
      grip.dataset.sizeFor = node.id;
      grip.setAttribute('x', String(node.w - 7));
      grip.setAttribute('y', String(effH - 7));
      grip.setAttribute('width', '10');
      grip.setAttribute('height', '10');
      grip.setAttribute('rx', '2');
      grip.setAttribute('fill', this.theme.nodeFill);
      grip.setAttribute('stroke', kindColor);
      grip.setAttribute('stroke-width', '1.5');
      grip.setAttribute('cursor', 'nwse-resize');
      g.appendChild(grip);
    }

    if (this.onConnect && this.editable) {
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

  /** 카드 바탕 모양은 `canvas-shape.ts` 가 안다 — 여기서는 테마 색만 건네준다. */
  private buildNodeBackground(node: GraphNode, effH: number, kindColor: string, shape: NodeShape): SVGElement {
    return buildNodeBackground(node, effH, kindColor, shape, this.theme.nodeFill);
  }

  /**
   * 노드 얼굴 — 이모지 / 색 원 / 사진. 사진은 `clipPath` 로 동그랗게 자른다.
   * clip id 는 캔버스 uid + 노드 id 로 만든다 — 한 페이지에 캔버스가 둘 이상 떠도 안 섞이게.
   */
  private buildNodeAvatar(node: GraphNode, effH: number, kindColor: string, centered: boolean): SVGGElement | null {
    return buildNodeAvatar(node, effH, kindColor, centered, this.theme, this.uid);
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

    const shown = this.visibleNodeIds();
    for (const edge of this.spec.edges) {
      // 종류가 걸러졌거나, 양끝 중 하나가 화면에 없으면 선도 안 그린다 —
      // 한쪽만 남은 선은 허공으로 뻗은 것처럼 보인다.
      if (this.filter.edgeKinds.has(edge.kind)) continue;
      if (!shown.has(this.parseNodeRef(edge.from)) || !shown.has(this.parseNodeRef(edge.to))) continue;
      const parts = this.buildEdgeElements(edge);
      if (parts) parts.forEach((el) => this.edgeLayer.appendChild(el));
    }
    // highlight 재적용
    this.applyEdgeHighlights();
    // 선을 다시 그리면 흐림 표시도 함께 날아간다 — 여기서 되살린다.
    if (this.focusIds) this.applyFocus();
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
    const mkDot = (x: number, y: number, end?: 'from' | 'to') => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', end && this.onEdgeChanged ? '4.5' : '3.5');
      c.setAttribute('fill', this.theme.edgeDotFill);
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', '1.5');
      if (end && this.onEdgeChanged) {
        // 끝점을 끌어 다른 노드로 옮긴다 (FigJam 의 커넥터 끝점 재연결).
        c.setAttribute('class', 'ck-edge-end');
        c.dataset.edgeId = edge.id;
        c.dataset.end = end;
        c.style.cursor = 'crosshair';
      } else {
        c.setAttribute('pointer-events', 'none');
      }
      return c;
    };
    const out: SVGElement[] = [];
    if (this.onEdgeClick) {
      // ★ 보이지 않는 두꺼운 선을 밑에 깐다. 1.5px 짜리 선을 정확히 찍는 건 사람에게 무리다
      //   — 눈에 보이는 굵기와 **잡을 수 있는 굵기**는 다른 값이어야 한다.
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('class', 'ck-edge-hit');
      hit.dataset.edgeId = edge.id;
      hit.setAttribute('d', path.getAttribute('d') ?? '');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      // ★ 투명한 선은 기본 규칙(visiblePainted)에서 「안 칠해진 것」으로 취급돼 클릭을 못 받는다.
      //   잡이 선은 눈에 안 보이는 게 목적이므로 규칙을 stroke 로 바꿔 준다.
      hit.setAttribute('pointer-events', 'stroke');
      hit.setAttribute('stroke-width', '14');
      hit.style.cursor = 'pointer';
      out.push(hit);
    }
    out.push(path, mkDot(p1.x, p1.y, 'from'), mkDot(p2.x, p2.y, 'to'));
    if (this.onEdgeChanged) {
      const g = this.edgeGeom(edge);
      if (g) {
        const mid = this.pointOnEdge(g, 0.5);
        const grip = document.createElementNS(SVG_NS, 'circle');
        grip.setAttribute('class', 'ck-edge-grip');
        grip.dataset.edgeId = edge.id;
        grip.setAttribute('cx', String(mid.x));
        grip.setAttribute('cy', String(mid.y));
        grip.setAttribute('r', '5');
        grip.setAttribute('fill', color);
        grip.setAttribute('stroke', this.theme.nodeFill);
        grip.setAttribute('stroke-width', '1.5');
        out.push(grip);
      }
    }
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
      return { x: coords.x, y: coords.y, w: this.effW(persistent), h: this.getNodeEffectiveH(persistent) };
    }
    const eph = this.ephemeralNodes.find((n) => n.id === nodeId);
    if (eph) {
      const offY = this.computeAnchorLayout().get(eph.anchorId)?.offsetY ?? 0;
      return { x: eph.x, y: eph.y + offY, w: eph.w, h: eph.h };
    }
    return null;
  }

  private chooseAnchors(b1: { x: number; y: number; w: number; h: number },
                        b2: { x: number; y: number; w: number; h: number }): { p1: { x: number; y: number }; p2: { x: number; y: number }; side1: Side; side2: Side } {
    return chooseAnchors(b1, b2);
  }

  /**
   * 선 하나의 기하 — 시작·끝점과 베지어 제어점. 경로·이름표·손잡이가 **같은 계산**을 쓴다
   * (예전엔 경로와 이름표가 따로 계산해서, 한쪽만 고치면 이름표가 선을 벗어났다).
   *
   * `edge.curve` = 휘는 정도. 0 이면 직선에 가깝고 부호가 바뀌면 반대쪽으로 휜다 —
   * 같은 두 노드를 잇는 선이 여럿일 때 겹치지 않게 하는 것도 이 값이다(Kumu 와 같은 규칙).
   */
  private edgeGeom(edge: GraphEdge): {
    p1: { x: number; y: number }; c1: { x: number; y: number };
    c2: { x: number; y: number }; p2: { x: number; y: number };
  } | null {
    const b1 = this.getNodeBox(this.parseNodeRef(edge.from));
    const b2 = this.getNodeBox(this.parseNodeRef(edge.to));
    if (!b1 || !b2) return null;
    // 곡선 셈법은 canvas-math 가 안다 — 여기서는 **어느 상자인지**만 찾는다.
    return edgeCurve(b1, b2, edge.curve ?? 0);
  }

  /** 베지어 위 한 점 (t=0~1). 이름표·손잡이 자리를 잡는 데 쓴다. */
  private pointOnEdge(g: { p1: { x: number; y: number }; c1: { x: number; y: number }; c2: { x: number; y: number }; p2: { x: number; y: number } }, t: number): { x: number; y: number } {
    return pointOnCubic(g, t);
  }

  private buildEdgePath(edge: GraphEdge): SVGPathElement | null {
    const g = this.edgeGeom(edge);
    if (!g) return null;
    const kind = this.edgeKindFor(edge.kind);
    // 선 하나만 따로 고친 값이 있으면 그게 이긴다 (edge > kind > 테마).
    return buildEdgePath(edge.id, g, {
      style: edge.style ?? kind.style,
      color: edge.color ?? kind.color ?? this.theme.edgeDefaultColor,
      width: edge.width ?? kind.width ?? 1.5,
      arrowEnd: Boolean(kind.arrow),
      arrowStart: Boolean(edge.arrowStart ?? kind.arrowStart),
    });
  }

  /**
   * 물결·금 간 선. 베지어를 직접 표본으로 떠서 법선 방향으로 흔든다 —
   * `getPointAtLength` 로 재려면 DOM 에 붙어 있어야 해서(브라우저마다 다르다),
   * 수식으로 뜨는 쪽이 확실하고 빠르다.
   */

  /**
   * 메모 지시선 — 메모에서 대상(노드 또는 선)까지 잇는 옅은 점선.
   * 관계선 위에 그리지 않고 **선 층 맨 뒤**에 둔다: 지시선이 관계선을 가리면
   * 「무슨 관계인지」가 안 읽힌다. 메모가 무엇을 가리키는지는 두 번째로 중요하다.
   */
  private renderLeaders(): void {
    if (!this.spec) return;
    const shownForLeaders = this.visibleNodeIds();
    for (const n of this.spec.nodes) {
      const targetId = n.attachedTo;
      if (!targetId) continue;
      if (!shownForLeaders.has(n.id)) continue;
      const from = this.getNodeBox(n.id);
      if (!from) continue;

      let tx: number;
      let ty: number;
      const targetNode = this.getNodeBox(this.parseNodeRef(targetId));
      if (targetNode) {
        tx = targetNode.x + targetNode.w / 2;
        ty = targetNode.y + targetNode.h / 2;
      } else {
        const targetEdge = this.spec.edges.find((x) => x.id === targetId);
        const g = targetEdge ? this.edgeGeom(targetEdge) : null;
        if (!g) continue;
        const mid = this.pointOnEdge(g, targetEdge?.labelPos ?? 0.5);
        tx = mid.x;
        ty = mid.y;
      }

      const line = buildLeaderLine(
        { x: from.x + from.w / 2, y: from.y + from.h / 2 },
        { x: tx, y: ty },
        this.colorForKind(n.kind),
      );
      this.edgeLayer.insertBefore(line, this.edgeLayer.firstChild);
    }
  }

  /** 선 위 라벨 — 베지어 중앙(t=0.5)에 판을 깔고 글자를 얹는다. */
  private buildEdgeLabel(edge: GraphEdge): SVGGElement | null {
    const geom = this.edgeGeom(edge);
    if (!geom) return null;
    const kind = this.edgeKindFor(edge.kind);
    return buildEdgeLabel(edge.id, edge.label ?? '', geom, {
      at: edge.labelPos,
      color: edge.color ?? kind.color ?? this.theme.edgeDefaultColor,
      plateFill: this.theme.nodeFill,
      textColor: this.theme.nodeText,
      draggable: Boolean(this.onEdgeChanged),
    });
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
    // 좌표는 끌어 옮긴 값(nodeCoords)이 우선 — 저장본 좌표만 보면 방금 옮긴 것이 화면 밖에 남는다.
    const boxes = [
      ...this.spec.nodes.map((n) => {
        const c = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
        return { x: c.x, y: c.y, w: n.w, h: n.h };
      }),
      ...(this.spec.ephemeral_anchors ?? []).map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h })),
    ];
    return boundsOf(boxes);
  }

  private redrawMinimap(): void {
    if (!this.spec) return;

    // 기존 노드 rect 제거 (viewport rect 는 유지)
    Array.from(this.minimapSvg.children)
      .filter((c) => c !== this.minimapViewport)
      .forEach((c) => c.remove());

    const bounds = this.worldBounds();
    if (bounds.w <= 0 || bounds.h <= 0) return;

    const proj = fitProjection(bounds, { w: MINIMAP_W, h: MINIMAP_H });
    if (proj.scale <= 0) return;
    const ms = proj.scale;
    const toMm = (x: number, y: number) => {
      const p = projectPoint(bounds, proj, x, y);
      return { mx: p.x, my: p.y };
    };

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

    // 「지금 보는 곳」 상자 — 판 밖으로 삐져나간 만큼은 셈법 쪽에서 잘라 준다.
    const vp = viewportRectOnMap(bounds, proj, {
      tx: this.state.tx, ty: this.state.ty, scale: this.state.scale,
      w: this.svg.clientWidth || 1, h: this.svg.clientHeight || 1,
    }, { w: MINIMAP_W, h: MINIMAP_H });
    this.minimapViewport.setAttribute('x', String(vp.x));
    this.minimapViewport.setAttribute('y', String(vp.y));
    this.minimapViewport.setAttribute('width', String(vp.w));
    this.minimapViewport.setAttribute('height', String(vp.h));
  }

  // ── 변환 적용 ────────────────────────────────────────────────────────────────

  private applyTransform(): void {
    const { scale: s, tx, ty } = this.state;
    this.world.setAttribute('transform', `matrix(${s} 0 0 ${s} ${tx} ${ty})`);
    this.syncBackground();
    this.redrawMinimap();
  }

  /** 배경 무늬를 화면 이동·배율에 맞춘다. 너무 축소하면 아예 끈다(모아레 방지). */
  private syncBackground(): void {
    if (!this.bgRect) return;
    const { scale: s, tx, ty } = this.state;
    const off = this.background === 'none' || s < BG_MIN_SCALE;
    this.bgRect.setAttribute('fill', off ? 'none' : `url(#ck-bg-${this.background}-${this.uid})`);
    if (off) return;
    // 패턴 자체를 world 와 같은 행렬로 밀어야 노드와 무늬가 같이 움직인다.
    const p = this.svg.querySelector(`#ck-bg-${this.background}-${this.uid}`);
    p?.setAttribute('patternTransform', `matrix(${s} 0 0 ${s} ${tx} ${ty})`);
  }

  /**
   * 편집 손잡이를 통째로 끄고 켠다 (보기 전용 링크). **숨기는 게 아니라 안 만든다** —
   * 숨기기는 CSS 한 줄만 어긋나도 새어 나오고, 「보이지만 안 먹히는 손잡이」가 제일 나쁘다.
   */
  setEditable(on: boolean): void {
    this.editable = on;
    this.render();
  }

  isEditable(): boolean {
    return this.editable;
  }

  /** 배경 무늬 고르기 — 점 / 모눈 / 십자 / 없음. */
  setBackground(kind: BackgroundKind): void {
    this.background = kind;
    this.syncBackground();
  }

  getBackground(): BackgroundKind {
    return this.background;
  }

  private updateNodeTransform(nodeId: string, x: number, y: number): void {
    const el = this.nodeLayer.querySelector(`[data-id="${nodeId}"]`) as SVGGElement | null;
    if (el) el.setAttribute('transform', `translate(${x},${y})`);
  }

  // ── 노드 유효 높이 (children 포함) ─────────────────────────────────────────

  private getNodeEffectiveH(node: GraphNode): number {
    const ch = node.children ?? [];
    const base = ch.length === 0
      ? node.h
      : NODE_HEADER_H + 1 + NODE_CHILD_PAD + ch.length * NODE_CHILD_ROW_H + NODE_CHILD_PAD;
    return base * this.sizeScale(node.id);
  }

  // ── 그리드 스냅 ─────────────────────────────────────────────────────────────

  private snap(v: number): number {
    return snapTo(v, GRID_SIZE);
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

  /**
   * 그린 것 전체를 **혼자 서는 SVG 문자열**로 뽑는다 (TASK-KL-202 격차 G).
   *
   * 화면에 보이는 만큼이 아니라 *world bbox 전체* 를 담고, 화면용 UI(연결 손잡이·선택 테두리)는
   * 뺀다 — 레퍼런스들이 「스크린샷 모드」로 UI 를 숨기고 사람에게 캡처를 시키는 자리인데,
   * 여기선 그럴 필요가 없다. CSS 를 문자열째 끼워 넣어야 클래스로 준 모양이 살아남는다.
   */
  exportSVGString(opts: { padding?: number; background?: string } = {}): string {
    // 「무엇을 걷어 내는가」는 canvas-export 가 안다 — 화면 장식이 늘 때마다 여기 조건이 붙으면
    // 언젠가 그림에 손잡이가 찍혀 나간다.
    return exportSvgString(this.svg, this.worldBounds(), { ...opts, css: GRAPH_CANVAS_CSS });
  }

  /**
   * 끌고 있는 끝이 어느 노드 위인지 테두리로 알린다 — draw.io·Visio 가 연결점을 초록/파랑으로
   * 밝히는 자리. 이 표시가 없으면 「놓았는데 안 붙었다」가 자주 난다.
   */
  private linkTargetHint(clientX: number, clientY: number): void {
    const under = document.elementFromPoint(clientX, clientY);
    const nodeEl = under?.closest?.('.ck-node') as SVGGElement | null;
    if (this.hintEl === nodeEl) return;
    this.hintEl?.classList.remove('is-drop-target');
    this.hintEl = nodeEl;
    this.hintEl?.classList.add('is-drop-target');
  }

  private clearTargetHint(): void {
    this.hintEl?.classList.remove('is-drop-target');
    this.hintEl = null;
  }

  /** 화면 좌표(clientX/Y) → world 좌표. 더블클릭 자리·끌고 있는 선 끝을 잡는 데 쓴다. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const { left, top } = this.svg.getBoundingClientRect();
    return {
      x: (clientX - left - this.state.tx) / this.state.scale,
      y: (clientY - top - this.state.ty) / this.state.scale,
    };
  }

  /**
   * 노드가 지금 **화면 어디에 있는지**(캔버스 안 좌표, px). 고른 것 옆에 작은 도구 줄을 띄우려면
   * 이것이 필요하다 — 없으면 도구가 늘 옆 패널에 갇힌다. 안 보이는 노드면 null.
   */
  nodeScreenRect(nodeId: string): { x: number; y: number; w: number; h: number } | null {
    const box = this.getNodeBox(nodeId);
    if (!box) return null;
    const { scale, tx, ty } = this.state;
    return {
      x: box.x * scale + tx,
      y: box.y * scale + ty,
      w: box.w * scale,
      h: box.h * scale,
    };
  }

  /** 지금 화면이 덮고 있는 world 사각형 — 「이 화면을 한 장으로」 굳힐 때 쓴다. */
  viewRectWorld(): { x: number; y: number; w: number; h: number } {
    const { scale, tx, ty } = this.state;
    const w = (this.svg.clientWidth || 800) / scale;
    const h = (this.svg.clientHeight || 600) / scale;
    return { x: -tx / scale, y: -ty / scale, w, h };
  }

  /**
   * 그 사각형 **안에 중심이 든** 노드들. 장면을 노드 목록이 아니라 *틀*로 잡으면,
   * 나중에 그 자리에 새로 놓은 인물도 저절로 그 장에 낀다 (Miro 프레임 계보).
   */
  nodesInWorldRect(rect: { x: number; y: number; w: number; h: number }): string[] {
    return (this.spec?.nodes ?? [])
      .filter((n) => {
        const b = this.getNodeBox(n.id);
        if (!b) return false;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
      })
      .map((n) => n.id);
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

  /**
   * 포커스 — 준 id 들만 또렷하게 두고 나머지는 흐린다 (TASK-KL-202 격차 M).
   * Kumu 의 focus 처럼 **지우지 않고 잠깐 가린다**: 노드가 수십 개를 넘으면 그리기보다
   * 「지금 볼 것만 보기」가 문제가 된다. `null` 이면 전부 또렷.
   *
   * 선은 **양끝이 모두 포커스 안일 때만** 살린다 — 한쪽만 걸린 선을 남기면 흐린 노드로
   * 향하는 선이 허공에 뜬 것처럼 보인다.
   */
  setFocus(ids: Set<string> | null): void {
    this.focusIds = ids;
    this.applyFocus();
  }

  private applyFocus(): void {
    const ids = this.focusIds;
    this.nodeLayer.querySelectorAll('.ck-node').forEach((el) => {
      const g = el as SVGGElement;
      g.classList.toggle('is-dimmed', !!ids && !ids.has(g.dataset.id ?? ''));
    });
    const edgeOn = (edgeId: string): boolean => {
      if (!ids) return true;
      const e = this.spec?.edges.find((x) => x.id === edgeId);
      if (!e) return true;
      return ids.has(this.parseNodeRef(e.from)) && ids.has(this.parseNodeRef(e.to));
    };
    this.edgeLayer.querySelectorAll('.ck-edge, .ck-edge-label, .ck-edge-grip, .ck-edge-end').forEach((el) => {
      const node = el as SVGElement;
      const id = (node as SVGElement & { dataset: DOMStringMap }).dataset.edgeId ?? '';
      node.classList.toggle('is-dimmed', !!ids && !edgeOn(id));
    });
    this.edgeLayer.querySelectorAll('.ck-leader').forEach((el) => {
      (el as SVGElement).classList.toggle('is-dimmed', !!ids);
    });
  }

  /** 거르기 설정. 넘긴 종류는 화면에서 빠진다(자료는 그대로). */
  setFilter(next: {
    nodeKinds?: Iterable<string>; edgeKinds?: Iterable<string>;
    tags?: Iterable<string>; hideOrphans?: boolean; minDegree?: number;
    fieldName?: string; fieldValue?: string;
  }): void {
    this.filter = {
      nodeKinds: new Set(next.nodeKinds ?? []),
      edgeKinds: new Set(next.edgeKinds ?? []),
      tags: new Set(next.tags ?? []),
      hideOrphans: next.hideOrphans ?? false,
      minDegree: next.minDegree ?? 0,
      fieldName: next.fieldName ?? '',
      fieldValue: next.fieldValue ?? '',
    };
    this.render();
  }

  /** 꾸미기 규칙. 지금은 「연결 수만큼 크게」 하나. */
  setDecorate(next: { sizeByDegree?: boolean; colorByTag?: boolean; colorByField?: string }): void {
    this.decorate = {
      sizeByDegree: next.sizeByDegree ?? false,
      colorByTag: next.colorByTag ?? false,
      colorByField: next.colorByField ?? '',
    };
    this.render();
  }

  /**
   * 노드 색. 「꼬리표로 색 입히기」가 켜져 있고 꼬리표가 있으면 **첫 꼬리표**의 색을 쓴다.
   * 꼬리표는 사람이 아무 말이나 붙이는 칸이라 색을 미리 정해 둘 수 없다 — 이름에서 **정해진 방식으로**
   * 뽑아 쓴다(같은 말이면 언제나 같은 색, 맵을 바꿔도 같다).
   */
  /** 규칙에 맞는 것들 — 뒤에 있는 규칙이 이긴다(사람은 목록을 위에서 아래로 읽는다). */
  private matchedRules(node: GraphNode): { color?: string; scale?: number } {
    const out: { color?: string; scale?: number } = {};
    for (const r of this.spec?.decorRules ?? []) {
      let hit = false;
      if (r.on === 'kind') hit = node.kind === r.value;
      else if (r.on === 'tag') hit = (node.tags ?? []).includes(r.value ?? '');
      else if (r.on === 'field') {
        const v = (node.fields ?? {})[r.key ?? ''];
        hit = v !== undefined && (!r.value || String(v).trim() === r.value);
      }
      if (!hit) continue;
      if (r.color) out.color = r.color;
      if (r.scale) out.scale = r.scale;
    }
    return out;
  }

  private nodeColor(node: GraphNode): string {
    // 규칙이 가장 세다 — 사람이 「이런 것은 이렇게」라고 **직접 적어 둔 것**이라서다.
    const ruled = this.matchedRules(node).color;
    if (ruled) return ruled;
    // 칸 값으로 물들이기가 먼저다 — 사람이 **방금 고른** 기준이라 꼬리표보다 뜻이 세다.
    if (this.decorate.colorByField) {
      const v = (node.fields ?? {})[this.decorate.colorByField];
      if (v && String(v).trim()) return colorForTag(String(v).trim());
    }
    if (this.decorate.colorByTag) {
      const tag = (node.tags ?? [])[0];
      if (tag) return colorForTag(tag);
    }
    return this.colorForKind(node.kind);
  }

  /** 노드 크기 배율 — 연결이 많을수록 큼(최대 1.6배). 규칙이 꺼져 있으면 항상 1. */
  private sizeScale(nodeId: string): number {
    const node = this.spec?.nodes.find((n) => n.id === nodeId);
    const ruledScale = node ? this.matchedRules(node).scale : undefined;
    if (!this.decorate.sizeByDegree) return ruledScale ?? 1;
    const d = this.degreeCache.get(nodeId) ?? 0;
    return Math.min(1.6, 1 + d * 0.12) * (ruledScale ?? 1);
  }

  /** 화면에 그려지는 실제 폭 — 배율 반영. 선 앵커·묶음 상자도 이 값을 봐야 어긋나지 않는다. */
  private effW(node: GraphNode): number {
    return node.w * this.sizeScale(node.id);
  }

  /** 지금 화면에 남아 있는 노드 id — 거르기까지 반영한 것. */
  visibleNodeIds(): Set<string> {
    return new Set(this.visibleNodes().map((n) => n.id));
  }

  /** 거르기를 통과한 노드들. 렌더·선 그리기가 모두 이걸 기준으로 삼는다. */
  private visibleNodes(): GraphNode[] {
    const nodes = (this.spec?.nodes ?? []).filter(
      (n) => !this.filter.nodeKinds.has(n.kind)
        // 꺼 둔 꼬리표가 하나라도 붙어 있으면 뺀다 — 「이건 지금 안 볼 것」이 여러 개일 수 있다.
        && !(n.tags ?? []).some((tag) => this.filter.tags.has(tag))
        // 칸으로 좁히기 — 값까지 적었으면 그 값인 것만, 이름만 적었으면 **그 칸을 가진 것만**
        // (「출신을 안 정한 인물이 누구인가」를 보려면 이 반쪽이 필요하다).
        && (!this.filter.fieldName || (() => {
          const v = (n.fields ?? {})[this.filter.fieldName];
          if (v === undefined) return false;
          return !this.filter.fieldValue || String(v).trim() === this.filter.fieldValue;
        })())
    );
    const min = Math.max(this.filter.minDegree, this.filter.hideOrphans ? 1 : 0);
    if (min <= 0) return nodes;
    // 「연결 수 하한」 — 선이 min 개 미만인 노드를 뺀다. **빠질 게 없을 때까지 되풀이**한다:
    // 이웃이 빠지면 남은 노드의 연결 수도 줄어드는데, 한 번만 걸러내면 조건을 못 채운 노드가 남는다
    // (network 쪽에서 k-core 라 부르는 것과 같은 셈법).
    let live = new Set(nodes.map((n) => n.id));
    for (let round = 0; round < 40; round += 1) {
      const deg = new Map<string, number>();
      for (const e of this.spec?.edges ?? []) {
        if (this.filter.edgeKinds.has(e.kind)) continue;
        const a = this.parseNodeRef(e.from);
        const b = this.parseNodeRef(e.to);
        if (!live.has(a) || !live.has(b)) continue;
        deg.set(a, (deg.get(a) ?? 0) + 1);
        deg.set(b, (deg.get(b) ?? 0) + 1);
      }
      const next = new Set([...live].filter((id) => (deg.get(id) ?? 0) >= min));
      if (next.size === live.size) break;
      live = next;
    }
    return nodes.filter((n) => live.has(n.id));
  }

  /** 선택 표시 — 편집 UI 가 어떤 노드를 다루는지 캔버스에 반영. */
  setSelectedNode(nodeId: string | null): void {
    this.selectedIds = nodeId ? new Set([nodeId]) : new Set();
    this.paintSelection();
  }

  /** 여러 개를 고른 상태로 둔다. 하나를 끌면 함께 움직인다. */
  setSelectedNodes(ids: string[]): void {
    this.selectedIds = new Set(ids);
    this.paintSelection();
  }

  /** 지금 고른 노드들. 키보드 조작이 「무엇에」 하는지 알아야 한다. */
  getSelectedNodes(): string[] {
    return [...this.selectedIds];
  }

  /**
   * 고른 노드를 방향키로 민다 (TASK-KL-202 격차 X). 마우스 드래그와 **같은 길**로 흘려보내
   * 저장·되돌리기가 저절로 따라오게 한다.
   */
  nudgeSelected(dx: number, dy: number): boolean {
    if (this.selectedIds.size === 0) return false;
    for (const id of this.selectedIds) {
      const c0 = this.nodeCoords.get(id);
      if (!c0) continue;
      const nx = this.snap(c0.x + dx);
      const ny = this.snap(c0.y + dy);
      this.nodeCoords.set(id, { x: nx, y: ny });
      this.updateNodeTransform(id, nx, ny);
      this.scheduleSave(id);
    }
    this.groupLayer.innerHTML = '';
    this.renderGroups();
    this.renderAnchors();
    this.redrawEdges();
    this.renderLeaders();
    this.redrawMinimap();
    return true;
  }

  /**
   * 다음(또는 이전) 노드로 옮겨 고른다. 화면에 보이는 것만 돈다 —
   * 걸러 놓은 것으로 옮겨 가면 「고른 게 어디 있는지」를 잃는다.
   */
  selectStep(delta: 1 | -1): string | null {
    const list = this.visibleNodes();
    if (list.length === 0) return null;
    const cur = [...this.selectedIds][0];
    const at = list.findIndex((n) => n.id === cur);
    const next = list[(at + delta + list.length * 2) % list.length];
    if (!next) return null;
    this.setSelectedNodes([next.id]);
    this.fitIntoView(next.id);
    return next.id;
  }

  /** 노드가 화면 밖이면 그쪽으로 화면만 민다(배율은 그대로 — 키를 누를 때마다 줌이 바뀌면 어지럽다). */
  private fitIntoView(nodeId: string): void {
    const b = this.getNodeBox(nodeId);
    if (!b) return;
    const svgW = this.svg.clientWidth || 800;
    const svgH = this.svg.clientHeight || 600;
    const s = this.state.scale;
    const left = b.x * s + this.state.tx;
    const top = b.y * s + this.state.ty;
    const right = left + b.w * s;
    const bottom = top + b.h * s;
    const pad = 40;
    if (left < pad) this.state.tx += pad - left;
    else if (right > svgW - pad) this.state.tx -= right - (svgW - pad);
    if (top < pad) this.state.ty += pad - top;
    else if (bottom > svgH - pad) this.state.ty -= bottom - (svgH - pad);
    this.applyTransform();
  }

  private paintSelection(): void {
    const only = this.selectedIds.size === 1 ? [...this.selectedIds][0] : null;
    this.nodeLayer.querySelectorAll('.ck-node').forEach((el) => {
      const g = el as SVGGElement;
      const id = g.dataset.id ?? '';
      g.classList.toggle('is-selected', this.selectedIds.has(id));
      // 크기 손잡이는 **고른 카드 하나에만** 붙는다. 통째 다시 그리면 타자 중에 화면이 튄다 —
      // 그래서 그 카드에만 넣고 뺀다.
      const has = g.querySelector('.ck-size-handle');
      if (id === only && !has && this.editable) {
        const n = this.spec?.nodes.find((x) => x.id === id);
        if (n) {
          const grip = document.createElementNS(SVG_NS, 'rect');
          grip.setAttribute('class', 'ck-size-handle');
          grip.dataset.sizeFor = id;
          grip.setAttribute('x', String(n.w - 7));
          grip.setAttribute('y', String(this.getNodeEffectiveH(n) - 7));
          grip.setAttribute('width', '10');
          grip.setAttribute('height', '10');
          grip.setAttribute('rx', '2');
          grip.setAttribute('fill', this.theme.nodeFill);
          grip.setAttribute('stroke', this.colorForKind(n.kind));
          grip.setAttribute('stroke-width', '1.5');
          grip.setAttribute('cursor', 'nwse-resize');
          g.appendChild(grip);
        }
      } else if (id !== only && has) {
        has.remove();
      }
    });
  }

  /** 뷰를 world bbox 에 맞게 fit. */
  /** 준 노드들만 화면에 꽉 채운다 — 발표에서 「이 장의 인물들」로 줌인할 때. */
  /**
   * 화면을 목표 자리로 **미끄러뜨린다** (TASK-KL-202, Prezi 계보). 장에서 장으로 톡 끊어 점프하면
   * 「어디에서 어디로 갔는지」가 안 남아 발표를 듣는 쪽이 매번 지도를 다시 그린다.
   *
   * 새 이동이 들어오면 앞 이동은 그 자리에서 접는다 — 두 트윈이 겹치면 화면이 떤다.
   * 사람이 손으로 끌면(=다음 pointerdown) 트윈은 스스로 물러난다.
   */
  private editable = true;
  private tween = 0;

  animateTo(target: { tx: number; ty: number; scale: number }, ms = 420): void {
    if (this.tween) cancelAnimationFrame(this.tween);
    const from = { tx: this.state.tx, ty: this.state.ty, scale: this.state.scale };
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / ms);
      // ease-in-out — 시작과 끝이 부드러워야 「빨려 들어갔다 놓인다」로 읽힌다.
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      this.state.tx = from.tx + (target.tx - from.tx) * e;
      this.state.ty = from.ty + (target.ty - from.ty) * e;
      this.state.scale = from.scale + (target.scale - from.scale) * e;
      this.applyTransform();
      this.tween = k < 1 ? requestAnimationFrame(step) : 0;
    };
    this.tween = requestAnimationFrame(step);
  }

  fitToNodes(ids: string[], pad = 80, animate = false): void {
    if (!this.spec || ids.length === 0) { this.fitView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const b = this.getNodeBox(id);
      if (!b) continue;
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
    if (!Number.isFinite(minX)) { this.fitView(); return; }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const svgW = this.svg.clientWidth || 800;
    const svgH = this.svg.clientHeight || 600;
    const scale = Math.max(0.1, Math.min(2, Math.min((svgW - pad * 2) / w, (svgH - pad * 2) / h)));
    const target = {
      scale,
      tx: svgW / 2 - (minX + w / 2) * scale,
      ty: svgH / 2 - (minY + h / 2) * scale,
    };
    if (animate) { this.animateTo(target); return; }
    this.state.scale = target.scale;
    this.state.tx = target.tx;
    this.state.ty = target.ty;
    this.applyTransform();
  }

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
