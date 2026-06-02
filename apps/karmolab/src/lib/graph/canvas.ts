/**
 * lib/graph/canvas.ts — SVG 무한 캔버스 (pan/zoom + 노드/edge + 드래그 + 미니맵).
 * cockpit/graph-canvas.ts 에서 Tauri/cockpit 의존 제거 후 이주.
 * 저장 = 주입된 GraphPersistAdapter.save() 위임.
 * kind 색/엣지 정의 = 외부 주입 (options.kindColors / options.edgeKinds).
 */

import type { GraphSpec, GraphNode, GraphEdge, GroupDef, EphemeralAnchor, EdgeKindDef, NodeCoord } from './spec';
import type { GraphPersistAdapter } from './adapter';

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

export interface GraphCanvasOptions {
  kindColors?: Record<string, string>;
  edgeKinds?: Record<string, EdgeKindDef>;
  persistAdapter?: GraphPersistAdapter;
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const PORT_R = 5;
const MINIMAP_W = 200;
const MINIMAP_H = 150;
const SAVE_DEBOUNCE_MS = 400;
const GRID_SIZE = 8;
const GROUP_HEADER_H = 20;
const NODE_HEADER_H = 30;
const NODE_CHILD_ROW_H = 18;
const NODE_CHILD_PAD = 6;

const DEFAULT_KIND_COLORS: Record<string, string> = {
  domain:   '#a78bfa',
  app:      '#60a5fa',
  canon:    '#34d399',
  external: '#f87171',
  agent:    '#22d3ee',
  runtime:  '#fbbf24',
};

// ─── GraphCanvas ──────────────────────────────────────────────────────────────

export class GraphCanvas {
  private container: HTMLElement;
  private svg!: SVGSVGElement;
  private world!: SVGGElement;
  private edgeLayer!: SVGGElement;
  private nodeLayer!: SVGGElement;
  private groupLayer!: SVGGElement;
  private minimapSvg!: SVGSVGElement;
  private minimapViewport!: SVGRectElement;

  private spec: GraphSpec | null = null;
  private ephemeralNodes: EphemeralNodeRender[] = [];
  private activeSets: ActiveSets = { node_ids_active: new Set(), edge_ids_animated: new Set() };
  private nodeCoords: Map<string, { x: number; y: number }> = new Map();
  private state: CanvasState = { scale: 1, tx: 0, ty: 0 };

  private dragging: { nodeId: string; startMouseX: number; startMouseY: number; startNodeX: number; startNodeY: number } | null = null;
  private draggingGroup: {
    groupId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeCoords: Map<string, { x: number; y: number }>;
    startAnchorCoords: Map<string, { x: number; y: number }>;
    startEphemeralCoords: Map<string, { x: number; y: number }>;
    startGroupX: number;
    startGroupY: number;
  } | null = null;
  private panning: { startMouseX: number; startMouseY: number; startTx: number; startTy: number } | null = null;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSaves: Map<string, { x: number; y: number; kind: 'node' | 'anchor' | 'group' }> = new Map();

  private options: GraphCanvasOptions;

  constructor(container: HTMLElement, options: GraphCanvasOptions = {}) {
    this.container = container;
    this.options = options;
    this.buildDOM();
    this.bindEvents();
  }

  private kindColor(kind: string): string {
    return this.options.kindColors?.[kind] ?? DEFAULT_KIND_COLORS[kind] ?? '#94a3b8';
  }

  // ── DOM 구성 ────────────────────────────────────────────────────────────────

  private buildDOM(): void {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.background = 'var(--ck-canvas-bg, transparent)';

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    this.svg.style.cssText = 'width:100%;height:100%;cursor:grab;';
    this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="ck-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#64748b"/>
      </marker>
      <filter id="ck-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    this.svg.appendChild(defs);

    this.world = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    this.world.setAttribute('class', 'ck-world');
    this.svg.appendChild(this.world);

    this.groupLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    this.groupLayer.setAttribute('class', 'ck-groups');
    this.world.appendChild(this.groupLayer);

    this.edgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    this.edgeLayer.setAttribute('class', 'ck-edges');
    this.world.appendChild(this.edgeLayer);

    this.nodeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    this.nodeLayer.setAttribute('class', 'ck-nodes');
    this.world.appendChild(this.nodeLayer);

    this.container.appendChild(this.svg);

    this.minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    this.minimapSvg.style.cssText = `
      position:absolute; bottom:16px; right:16px;
      width:${MINIMAP_W}px; height:${MINIMAP_H}px;
      background:rgba(10,12,16,0.85); border:1px solid rgba(255,255,255,0.08);
      border-radius:4px; pointer-events:all; cursor:pointer;
    `;
    this.container.appendChild(this.minimapSvg);
    this.minimapViewport = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
    this.minimapViewport.setAttribute('fill', 'rgba(100,160,255,0.1)');
    this.minimapViewport.setAttribute('stroke', 'rgba(100,160,255,0.5)');
    this.minimapViewport.setAttribute('stroke-width', '1');
    this.minimapSvg.appendChild(this.minimapViewport);

    this.applyTransform();
  }

  // ── 이벤트 ──────────────────────────────────────────────────────────────────

  private bindEvents(): void {
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { left, top } = this.svg.getBoundingClientRect();
      const mx = e.clientX - left;
      const my = e.clientY - top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, this.state.scale * delta));
      this.state.tx = mx - (mx - this.state.tx) * (newScale / this.state.scale);
      this.state.ty = my - (my - this.state.ty) * (newScale / this.state.scale);
      this.state.scale = newScale;
      this.applyTransform();
    }, { passive: false });

    this.svg.addEventListener('mousedown', (e) => {
      const target = e.target as Element;
      const nodeEl = target.closest('.ck-node') as SVGGElement | null;
      const groupEl = target.closest('.ck-group') as SVGRectElement | null;
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
        const snappedGX = this.snap(dg.startGroupX + rawDx);
        const snappedGY = this.snap(dg.startGroupY + rawDy);
        const dx = snappedGX - dg.startGroupX;
        const dy = snappedGY - dg.startGroupY;
        for (const [nodeId, start] of dg.startNodeCoords) {
          const nx = start.x + dx;
          const ny = start.y + dy;
          this.nodeCoords.set(nodeId, { x: nx, y: ny });
          this.updateNodeTransform(nodeId, nx, ny);
          this.scheduleSave(nodeId);
        }
        for (const [anchorId, start] of dg.startAnchorCoords) {
          const ax = start.x + dx;
          const ay = start.y + dy;
          const a = this.spec?.ephemeral_anchors?.find((x) => x.id === anchorId);
          if (a) { a.x = ax; a.y = ay; }
          this.scheduleSaveRaw(anchorId, ax, ay, 'anchor');
        }
        for (const [enId, start] of dg.startEphemeralCoords) {
          const en = this.ephemeralNodes.find((x) => x.id === enId);
          if (en) { en.x = start.x + dx; en.y = start.y + dy; }
        }
        const grp = this.spec?.groups.find((g) => g.id === dg.groupId);
        if (grp) {
          grp.bbox.x = snappedGX;
          grp.bbox.y = snappedGY;
          this.scheduleSaveRaw(dg.groupId, grp.bbox.x, grp.bbox.y, 'group');
        }
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

    window.addEventListener('mouseup', () => {
      this.dragging = null;
      this.draggingGroup = null;
      this.panning = null;
      this.svg.style.cursor = 'grab';
    });

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
    this.nodeCoords.clear();
    for (const node of spec.nodes) {
      this.nodeCoords.set(node.id, { x: node.x, y: node.y });
    }
    this.render();
  }

  getSpec(): GraphSpec | null {
    return this.spec;
  }

  setEphemeralNodes(nodes: EphemeralNodeRender[]): void {
    this.ephemeralNodes = nodes;
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

  private render(): void {
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

  private computeAnchorLayout(): Map<string, { x: number; y: number; w: number; h: number; offsetY: number }> {
    const out = new Map<string, { x: number; y: number; w: number; h: number; offsetY: number }>();
    if (!this.spec) return out;
    const GAP = 16;
    const anchors = this.spec.ephemeral_anchors ?? [];
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
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(eff.x));
      rect.setAttribute('y', String(eff.y));
      rect.setAttribute('width', String(eff.w));
      rect.setAttribute('height', String(eff.h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', 'rgba(34,211,238,0.04)');
      rect.setAttribute('stroke', 'rgba(34,211,238,0.35)');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4 3');
      this.groupLayer.appendChild(rect);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(eff.x + 8));
      text.setAttribute('y', String(eff.y + 14));
      text.setAttribute('fill', 'rgba(34,211,238,0.85)');
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
      text.textContent = '⚡ ' + a.label;
      this.groupLayer.appendChild(text);
    }
  }

  private computeGroupBox(group: GroupDef): { x: number; y: number; w: number; h: number } {
    let minX = group.bbox.x;
    let minY = group.bbox.y;
    let maxX = group.bbox.x + group.bbox.w;
    let maxY = group.bbox.y + group.bbox.h;
    const pad = 12;
    for (const n of this.spec?.nodes ?? []) {
      if (n.group !== group.id) continue;
      const c = this.nodeCoords.get(n.id) ?? { x: n.x, y: n.y };
      minX = Math.min(minX, c.x - pad);
      minY = Math.min(minY, c.y - pad);
      maxX = Math.max(maxX, c.x + n.w + pad);
      maxY = Math.max(maxY, c.y + this.getNodeEffectiveH(n) + pad);
    }
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
      const bodyRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
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

      const clipId = `ck-clip-${g.id}`;
      const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clipPath.setAttribute('id', clipId);
      const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      clipRect.setAttribute('x', String(box.x));
      clipRect.setAttribute('y', String(box.y));
      clipRect.setAttribute('width', String(box.w));
      clipRect.setAttribute('height', String(GROUP_HEADER_H));
      clipRect.setAttribute('rx', '6');
      clipPath.appendChild(clipRect);
      this.groupLayer.appendChild(clipPath);

      const headerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
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

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    g.setAttribute('class', 'ck-node');
    g.dataset.id = node.id;
    g.setAttribute('transform', `translate(${coords.x},${coords.y})`);
    g.style.cursor = 'grab';

    const kindColor = this.kindColor(node.kind);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', String(node.w));
    rect.setAttribute('height', String(effH));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#131720');
    rect.setAttribute('stroke', kindColor + '60');
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', '0');
    bar.setAttribute('y', '0');
    bar.setAttribute('width', '3');
    bar.setAttribute('height', String(effH));
    bar.setAttribute('rx', '4');
    bar.setAttribute('fill', kindColor);
    g.appendChild(bar);

    if (children.length === 0) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '12');
      text.setAttribute('y', String(node.h / 2 + 4));
      text.setAttribute('fill', '#e2e8f0');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
      text.setAttribute('pointer-events', 'none');
      text.textContent = node.label;
      g.appendChild(text);
    } else {
      const headerH = NODE_HEADER_H;
      const headerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      headerRect.setAttribute('x', '0');
      headerRect.setAttribute('y', '0');
      headerRect.setAttribute('width', String(node.w));
      headerRect.setAttribute('height', String(headerH));
      headerRect.setAttribute('rx', '4');
      headerRect.setAttribute('fill', kindColor + '18');
      headerRect.setAttribute('pointer-events', 'none');
      g.appendChild(headerRect);

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.setAttribute('x', '12');
      title.setAttribute('y', String(headerH / 2 + 4));
      title.setAttribute('fill', '#e2e8f0');
      title.setAttribute('font-size', '11');
      title.setAttribute('font-weight', '600');
      title.setAttribute('font-family', 'var(--font-sans, system-ui, sans-serif)');
      title.setAttribute('pointer-events', 'none');
      title.textContent = node.label;
      g.appendChild(title);

      const sep = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      sep.setAttribute('x1', '3');
      sep.setAttribute('y1', String(headerH));
      sep.setAttribute('x2', String(node.w));
      sep.setAttribute('y2', String(headerH));
      sep.setAttribute('stroke', kindColor + '30');
      sep.setAttribute('stroke-width', '1');
      g.appendChild(sep);

      children.forEach((child, i) => {
        const cy = headerH + NODE_CHILD_PAD + i * NODE_CHILD_ROW_H + NODE_CHILD_ROW_H / 2 + 4;
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', '14');
        dot.setAttribute('cy', String(cy - 3));
        dot.setAttribute('r', '2');
        dot.setAttribute('fill', kindColor + '80');
        dot.setAttribute('pointer-events', 'none');
        g.appendChild(dot);

        const row = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        row.setAttribute('x', '22');
        row.setAttribute('y', String(cy));
        row.setAttribute('fill', 'rgba(226,232,240,0.65)');
        row.setAttribute('font-size', '10');
        row.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
        row.setAttribute('pointer-events', 'none');
        const maxChars = Math.max(4, Math.floor((node.w - 30) / 6.2));
        row.textContent = child.length > maxChars ? child.slice(0, maxChars - 1) + '…' : child;
        g.appendChild(row);
      });
    }

    return g;
  }

  private renderEphemeralLayer(): void {
    this.nodeLayer.querySelectorAll('.ck-node-ephemeral').forEach((el) => el.remove());
    const layout = this.computeAnchorLayout();
    for (const en of this.ephemeralNodes) {
      const offY = layout.get(en.anchorId)?.offsetY ?? 0;
      const effY = en.y + offY;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      g.setAttribute('class', 'ck-node ck-node-ephemeral');
      g.dataset.id = en.id;
      g.setAttribute('transform', `translate(${en.x},${effY})`);
      g.style.opacity = '0.85';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', String(en.w));
      rect.setAttribute('height', String(en.h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', '#0f1520');
      rect.setAttribute('stroke', '#22d3ee60');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4 2');
      g.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '8');
      text.setAttribute('y', String(en.h / 2 + 4));
      text.setAttribute('fill', '#22d3ee');
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'var(--font-mono, ui-monospace, monospace)');
      text.setAttribute('pointer-events', 'none');
      const maxChars = Math.max(4, Math.floor((en.w - 16) / 6.2));
      text.textContent = en.label.length > maxChars ? en.label.slice(0, maxChars - 1) + '…' : en.label;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
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
    this.applyEdgeHighlights();
  }

  private buildEdgeElements(edge: GraphEdge): SVGElement[] | null {
    const path = this.buildEdgePath(edge);
    if (!path) return null;
    const id1 = this.parseNodeRef(edge.from);
    const id2 = this.parseNodeRef(edge.to);
    const b1 = this.getNodeBox(id1);
    const b2 = this.getNodeBox(id2);
    if (!b1 || !b2) return [path];
    const { p1, p2 } = this.chooseAnchors(b1, b2);
    const edgeKinds = this.options.edgeKinds ?? this.spec?._edge_kinds ?? {};
    const kind = edgeKinds[edge.kind] ?? { color: '#64748b' };
    const color = kind.color ?? '#64748b';
    const mkDot = (x: number, y: number) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', '3.5');
      c.setAttribute('fill', '#0a0c10');
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', '1.5');
      c.setAttribute('pointer-events', 'none');
      return c;
    };
    return [path, mkDot(p1.x, p1.y), mkDot(p2.x, p2.y)];
  }

  private parseNodeRef(ref: string): string {
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
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const push = Math.max(40, dist * 0.4);
    const offset = (side: string, p: { x: number; y: number }) => {
      switch (side) {
        case 'top':    return { x: p.x,        y: p.y - push };
        case 'bottom': return { x: p.x,        y: p.y + push };
        case 'left':   return { x: p.x - push, y: p.y };
        case 'right':  return { x: p.x + push, y: p.y };
        default:       return { x: p.x,        y: p.y };
      }
    };
    const c1 = offset(side1, p1);
    const c2 = offset(side2, p2);

    const edgeKinds = this.options.edgeKinds ?? this.spec?._edge_kinds ?? {};
    const kind = edgeKinds[edge.kind] ?? { color: '#64748b', style: 'solid', arrow: true };

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'ck-edge');
    path.dataset.edgeId = edge.id;
    path.setAttribute('d', `M ${p1.x},${p1.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', kind.color ?? '#64748b');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-opacity', '0.7');
    if (kind.style === 'dashed') path.setAttribute('stroke-dasharray', '6 3');
    else if (kind.style === 'dotted') path.setAttribute('stroke-dasharray', '2 3');
    if (kind.arrow) path.setAttribute('marker-end', 'url(#ck-arrow)');

    return path;
  }

  // ── 하이라이트 ───────────────────────────────────────────────────────────────

  applyHighlights(): void {
    this.nodeLayer.querySelectorAll('.ck-node').forEach((el) => {
      const g = el as SVGGElement;
      const id = g.dataset.id ?? '';
      g.classList.toggle('is-active', this.activeSets.node_ids_active.has(id));
    });
    this.applyEdgeHighlights();
  }

  private applyEdgeHighlights(): void {
    this.edgeLayer.querySelectorAll('.ck-edge').forEach((el) => {
      const path = el as SVGPathElement;
      const id = path.dataset.edgeId ?? '';
      path.classList.toggle('is-flowing', this.activeSets.edge_ids_animated.has(id));
    });
  }

  // ── 미니맵 ───────────────────────────────────────────────────────────────────

  private worldBounds(): { minX: number; minY: number; w: number; h: number } {
    if (!this.spec) return { minX: 0, minY: 0, w: 1200, h: 1100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.spec.nodes) {
      const c = this.nodeCoords.get(node.id) ?? { x: node.x, y: node.y };
      minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + node.w); maxY = Math.max(maxY, c.y + node.h);
    }
    for (const anchor of this.spec.ephemeral_anchors ?? []) {
      minX = Math.min(minX, anchor.x); minY = Math.min(minY, anchor.y);
      maxX = Math.max(maxX, anchor.x + anchor.w); maxY = Math.max(maxY, anchor.y + anchor.h);
    }
    if (minX === Infinity) return { minX: 0, minY: 0, w: 1200, h: 1100 };
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }

  private redrawMinimap(): void {
    if (!this.spec) return;
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

    for (const g of this.spec.groups) {
      const { mx, my } = toMm(g.bbox.x, g.bbox.y);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(mx));
      rect.setAttribute('y', String(my));
      rect.setAttribute('width', String(g.bbox.w * ms));
      rect.setAttribute('height', String(g.bbox.h * ms));
      rect.setAttribute('fill', g.color + '10');
      rect.setAttribute('stroke', g.color + '30');
      rect.setAttribute('stroke-width', '0.5');
      this.minimapSvg.insertBefore(rect, this.minimapViewport);
    }

    for (const node of this.spec.nodes) {
      const c = this.nodeCoords.get(node.id) ?? { x: node.x, y: node.y };
      const { mx, my } = toMm(c.x, c.y);
      const kindColor = this.kindColor(node.kind);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(mx));
      rect.setAttribute('y', String(my));
      rect.setAttribute('width', String(Math.max(2, node.w * ms)));
      rect.setAttribute('height', String(Math.max(2, this.getNodeEffectiveH(node) * ms)));
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', kindColor + '60');
      this.minimapSvg.insertBefore(rect, this.minimapViewport);
    }

    for (const en of this.ephemeralNodes) {
      const { mx, my } = toMm(en.x, en.y);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(mx));
      rect.setAttribute('y', String(my));
      rect.setAttribute('width', String(Math.max(2, en.w * ms)));
      rect.setAttribute('height', String(Math.max(2, en.h * ms)));
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', '#22d3ee40');
      this.minimapSvg.insertBefore(rect, this.minimapViewport);
    }

    const svgW = this.svg.clientWidth || 1;
    const svgH = this.svg.clientHeight || 1;
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

  private getNodeEffectiveH(node: GraphNode): number {
    const ch = node.children ?? [];
    if (ch.length === 0) return node.h;
    return NODE_HEADER_H + 1 + NODE_CHILD_PAD + ch.length * NODE_CHILD_ROW_H + NODE_CHILD_PAD;
  }

  private snap(v: number): number {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  // ── 저장 디바운스 ────────────────────────────────────────────────────────────

  private scheduleSave(id: string, kind: 'node' | 'anchor' | 'group' = 'node'): void {
    if (kind === 'node') {
      const c = this.nodeCoords.get(id);
      if (c) this.pendingSaves.set(`node:${id}`, { x: c.x, y: c.y, kind });
    }
    this.flushSaveDebounced();
  }

  private scheduleSaveRaw(id: string, x: number, y: number, kind: 'anchor' | 'group'): void {
    this.pendingSaves.set(`${kind}:${id}`, { x, y, kind });
    this.flushSaveDebounced();
  }

  private flushSaveDebounced(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const updates: NodeCoord[] = Array.from(this.pendingSaves.entries()).map(([key, v]) => ({
        id: key.split(':').slice(1).join(':'),
        x: v.x,
        y: v.y,
        kind: v.kind,
      }));
      this.pendingSaves.clear();
      this.saveTimer = null;
      void this.options.persistAdapter?.save(updates);
    }, SAVE_DEBOUNCE_MS);
  }

  // ── 공개 헬퍼 ───────────────────────────────────────────────────────────────

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

  /** 현재 spec 의 nodeCoords 를 spec 에 반영 (저장 전 sync). */
  syncCoordsToSpec(): void {
    if (!this.spec) return;
    for (const node of this.spec.nodes) {
      const c = this.nodeCoords.get(node.id);
      if (c) { node.x = c.x; node.y = c.y; }
    }
  }

  /** PORT_R 노출 — 호환용 */
  static readonly PORT_R = PORT_R;
}
