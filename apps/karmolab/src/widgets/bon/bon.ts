/**
 * 「본」 — 화면 (TASK-KL-254 · 2단계)
 *
 * 도형을 직접 만들고 만지는 자리. 여기서만 DOM 을 안다 — 아래 파일들(`model`·`geom`·`svg`·`parts`)은
 * 계속 브라우저를 모른다. 그래서 화면 없이도 답을 맞출 수 있다.
 *
 * 다시 그리는 길은 **하나**(`repaint`)뿐이다. 도형을 만들든 끌든 숫자를 바꾸든 같은 함수를 지나므로
 * 화면이 어긋날 수 없다.
 */

import { History } from '../../lib/history';
import { addLayer, createDoc, isPaintable, mergeDown, moveLayer, removeLayer, type Doc, type Node } from './model';
import { alignTo, applyBox, bounds, fitToDoc, handleAt, hitTest, resizeBox, type Align, type Handle } from './geom';
import { toSvg } from './svg';
import { clampSlice, defaultSlice, sliceMeta, type Slice } from './slice';
import { PARTS, defaultKnobs, type PartName } from './parts';
import { canUpload, listFoundry, setFoundryToken, uploadToFoundry, type FoundryItem } from '../../lib/foundry';
import { injectBonStyles } from './styles';
import { BonView } from './view';

declare const Toolbox: {
  register(spec: unknown): void;
  getLazyWidgetPublicMeta?(id: string): unknown;
  onDispose?(fn: () => void): void;
};

type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'pen' | 'slice';

const esc = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const ICONS: Record<Tool, string> = {
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 3l14 8-6 1.6L10 19z"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
  ellipse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.8" fill="currentColor"/><circle cx="20" cy="5" r="1.8" fill="currentColor"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 18l5-11 5 7 6-9"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="9" cy="7" r="1.6" fill="currentColor"/><circle cx="14" cy="14" r="1.6" fill="currentColor"/></svg>',
  slice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 5v14M16 5v14M3 10h18M3 15h18" stroke-dasharray="2 2"/></svg>'
};
const TOOL_LABEL: Record<Tool, string> = { select: '고르기 (V)', rect: '사각형 (R)', ellipse: '타원 (E)', line: '선 (L)', pen: '펜 (P) — 눌러서 점, 두 번 눌러 마침', slice: '9-slice 경계 (S)' };

function buildBon(container: HTMLElement): void {
  injectBonStyles();

  const doc: Doc = createDoc(192, 64);
  const history = new History();
  let tool: Tool = 'rect';
  let selected: { layer: number; index: number } | null = null;
  /** 새 도형이 놓일 레이어. 고른 도형이 있으면 그 도형이 사는 레이어를 따라간다. */
  let activeLayer = 0;

  container.innerHTML =
    '<div class="bon-wrap">' +
      '<div class="bon-bar">' +
        '<strong>본</strong>' +
        '<button data-act="undo" title="되돌리기 (Ctrl+Z)">되돌리기</button>' +
        '<button data-act="redo" title="다시 (Ctrl+Shift+Z)">다시</button>' +
        '<span class="spacer"></span>' +
        '<label class="bon-row"><span>판</span>' +
          '<input type="number" data-doc-w value="192" min="1" max="2048">' +
          '<input type="number" data-doc-h value="64" min="1" max="2048"></label>' +
        '<label class="bon-row"><span>격자</span><input type="number" data-grid value="8" min="0" max="64"></label>' +
        '<label class="bon-row"><span>확대</span><input type="range" data-zoom min="1" max="8" step="1" value="2"></label>' +
        '<button data-act="svg">SVG</button>' +
        '<button data-act="png">PNG</button>' +
        '<button data-act="pack" title="SVG + PNG + 9-slice 값">9-slice 묶음</button>' +
        '<button data-act="shelf" title="만든 것을 선반에 올린다 (CC0)">선반에 올리기</button>' +
        '<button data-act="shelf-open" title="선반 구경하기">선반</button>' +
      '</div>' +
      '<div class="bon-body">' +
        '<div class="bon-tools">' +
          (['select', 'rect', 'ellipse', 'line', 'pen', 'slice'] as Tool[]).map((t) =>
            '<button data-tool="' + t + '" title="' + esc(TOOL_LABEL[t]) + '" aria-label="' + esc(TOOL_LABEL[t]) + '">' + ICONS[t] + '</button>').join('') +
        '</div>' +
        '<div class="bon-canvas" data-canvas></div>' +
        '<div class="bon-side" data-side></div>' +
      '</div>' +
      '<div class="bon-foot">' +
        '<span class="bon-foot-label">시작점</span>' +
        '<button data-seed="button">버튼</button>' +
        '<button data-seed="panel">패널</button>' +
        '<button data-seed="gauge">게이지</button>' +
        '<span class="bon-foot-hint">얹고 나서 손으로 고쳐라 — 정답이 아니라 출발점이다</span>' +
      '</div>' +
    '</div>';

  const canvasHost = container.querySelector('[data-canvas]') as HTMLElement;
  const side = container.querySelector('[data-side]') as HTMLElement;
  const layerBox = document.createElement('div');
  layerBox.className = 'bon-card bon-layers';
  const view = new BonView(canvasHost);

  const activeNode = (): Node | null =>
    selected ? doc.layers[selected.layer]?.nodes[selected.index] ?? null : null;

  const row = (label: string, value: number, min: number, max: number, key: string): string =>
    '<div class="bon-row"><label>' + esc(label) + '</label>' +
    '<input type="number" data-box="' + key + '" value="' + value + '" min="' + min + '" max="' + max + '"></div>';

  const rangeRow = (label: string, value: number, min: number, max: number, key: string): string =>
    '<div class="bon-row"><label>' + esc(label) + '</label>' +
    '<input type="range" data-num="' + key + '" value="' + value + '" min="' + min + '" max="' + Math.round(max) + '" step="1">' +
    '<output>' + Math.round(value) + '</output></div>';

  /* ── 오른쪽 — 고른 도형의 숫자. 도형 종류에 따라 통째로 바뀐다 ── */
  function drawSide(): void {
    const node = activeNode();
    if (!node) {
      side.innerHTML = '<div class="bon-card"><h4>고른 것</h4><div class="bon-empty">' +
        '아무것도 안 골랐다. 왼쪽에서 도형을 고르고 판 위에 끌어서 그려라.</div></div>';
      return;
    }
    const b = bounds(node);
    const rows: string[] = [
      row('x', Math.round(b.x), -999, 999, 'x'),
      row('y', Math.round(b.y), -999, 999, 'y'),
      row('너비', Math.round(b.w), 0, 2048, 'w'),
      row('높이', Math.round(b.h), 0, 2048, 'h')
    ];
    if (node.kind === 'rect') {
      rows.push(rangeRow('둥글기', node.radius, 0, Math.max(1, Math.min(b.w, b.h) / 2), 'radius'));
    }
    const paintable = isPaintable(node) ? node : null;
    const fillPaint = paintable ? paintable.fill : undefined;
    const strokeOf = paintable ? paintable.stroke : undefined;
    const fill = fillPaint && fillPaint.kind === 'solid' ? fillPaint.color : '#3b4a6b';
    const strokeW = strokeOf ? strokeOf.width : 0;
    const strokeC = strokeOf && strokeOf.paint.kind === 'solid' ? strokeOf.paint.color : '#8fa6d8';
    const title = node.kind === 'rect' ? '사각형' : node.kind === 'ellipse' ? '타원' : '도형';
    side.innerHTML =
      '<div class="bon-card"><h4>' + title + '</h4>' + rows.join('') + '</div>' +
      '<div class="bon-card"><h4>칠</h4>' +
        '<div class="bon-row"><label>채우기</label><input type="color" data-fill value="' + esc(fill) + '"></div>' +
        rangeRow('테두리', strokeW, 0, 16, 'strokeW') +
        '<div class="bon-row"><label>선 색</label><input type="color" data-stroke-color value="' + esc(strokeC) + '"></div>' +
      '</div>' +
      '<div class="bon-card"><h4>자리</h4>' +
        '<div class="bon-row bon-align">' +
          '<button data-align="left" title="왼쪽">&#8676;</button>' +
          '<button data-align="hcenter" title="가로 가운데">&#8596;</button>' +
          '<button data-align="right" title="오른쪽">&#8677;</button>' +
          '<button data-align="top" title="위">&#8679;</button>' +
          '<button data-align="vcenter" title="세로 가운데">&#8597;</button>' +
          '<button data-align="bottom" title="아래">&#8681;</button>' +
        '</div>' +
        '<div class="bon-row"><button data-fit="0">판에 꽉</button>' +
          '<button data-fit="8">여백 8</button></div>' +
      '</div>' +
      '<div class="bon-card"><h4>차례</h4>' +
        '<div class="bon-row"><button data-act="up">앞으로</button><button data-act="down">뒤로</button>' +
        '<button data-act="del">지우기</button></div></div>';
  }

  /** 레이어 목록 — 위가 앞이다(배열은 뒤가 위라 뒤집어 보인다). */
  function drawLayers(): void {
    const rows: string[] = [];
    for (let i = doc.layers.length - 1; i >= 0; i -= 1) {
      const layer = doc.layers[i];
      const active = i === activeLayer ? ' active' : '';
      rows.push(
        '<div class="bon-layer' + active + '" data-layer="' + i + '">' +
          '<button class="bon-eye" data-layer-eye="' + i + '" title="' + (layer.visible ? '숨기기' : '보이기') + '">' +
            (layer.visible ? '&#9679;' : '&#9675;') + '</button>' +
          '<span class="bon-layer-name">' + esc(layer.name) + '</span>' +
          '<span class="bon-layer-count">' + layer.nodes.length + '</span>' +
        '</div>'
      );
    }
    layerBox.innerHTML =
      '<h4>레이어</h4>' + rows.join('') +
      '<div class="bon-row bon-layer-acts">' +
        '<button data-lact="add" title="새 레이어">새로</button>' +
        '<button data-lact="up" title="앞으로">&#9650;</button>' +
        '<button data-lact="down" title="뒤로">&#9660;</button>' +
        '<button data-lact="merge" title="아래에 합치기">합치기</button>' +
        '<button data-lact="del" title="지우기">지우기</button>' +
      '</div>';
  }

  /* ── 다시 그리기 — 하나뿐인 길 ───────────────────── */
  function repaint(): void {
    if (activeLayer >= doc.layers.length) activeLayer = doc.layers.length - 1;
    view.draw(doc, selected);
    drawSide();
    side.append(layerBox);   // 오른쪽을 다시 만들어도 레이어 상자는 그대로 이어 붙인다
    drawLayers();
    container.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
  }

  /* ── 펜 ────────────────────────────────────── */
  /**
   * 끌어서 만드는 도형들과 **다루는 결이 다르다** — 누를 때마다 점이 하나씩 붙고, 두 번 누르거나
   * Enter 를 치면 끝난다. 그동안 그리던 것은 문서 안에 이미 들어가 있어야 화면에 보이므로,
   * 「짓는 중」인 도형을 들고 있다가 마칠 때 되돌리기에 한 번만 담는다(점마다 담으면 되돌리기가
   * 점 개수만큼 쌓여 쓸모없어진다).
   */
  let pen: null | { node: Node & { kind: 'path' }; points: { x: number; y: number }[]; layer: number } = null;

  function penPath(points: { x: number; y: number }[], closed = false): string {
    if (points.length === 0) return '';
    const head = 'M' + points[0].x + ' ' + points[0].y;
    const rest = points.slice(1).map((p) => 'L' + p.x + ' ' + p.y).join('');
    return head + rest + (closed ? 'Z' : '');
  }

  function penAdd(p: { x: number; y: number }): void {
    const snap = view.grid;
    const q = (v: number): number => (snap > 0 ? Math.round(v / snap) * snap : Math.round(v * 10) / 10);
    const point = { x: q(p.x), y: q(p.y) };
    if (!pen) {
      const node: Node & { kind: 'path' } = {
        kind: 'path', d: penPath([point]),
        stroke: { paint: { kind: 'solid', color: '#8fa6d8' }, width: 2, align: 'center' }
      };
      doc.layers[activeLayer].nodes.push(node);
      pen = { node, points: [point], layer: activeLayer };
    } else {
      pen.points.push(point);
      pen.node.d = penPath(pen.points);
    }
    selected = { layer: pen.layer, index: doc.layers[pen.layer].nodes.indexOf(pen.node) };
    repaint();
  }

  /** 마침. 점이 셋 이상이면 닫아서 채울 수 있게 한다 — 부품 모양은 대개 닫힌 도형이다. */
  function penFinish(closed: boolean): void {
    if (!pen) return;
    const { node, points, layer: layerIndex } = pen;
    pen = null;
    const layer = doc.layers[layerIndex];
    if (points.length < 2) {
      // 한 점짜리는 안 보인다 — 목록에만 쌓이므로 버린다.
      const at = layer.nodes.indexOf(node);
      if (at >= 0) layer.nodes.splice(at, 1);
      selected = null;
      repaint();
      return;
    }
    if (closed && points.length >= 3) {
      node.d = penPath(points, true);
      node.fill = { kind: 'solid', color: '#3b4a6b' };
    }
    history.push({
      label: '펜으로 그리기',
      redo: () => { if (!layer.nodes.includes(node)) layer.nodes.push(node); },
      undo: () => { const at = layer.nodes.indexOf(node); if (at >= 0) layer.nodes.splice(at, 1); }
    });
    repaint();
  }

  /* ── 판 위에서 ────────────────────────────────── */
  let drag: null | {
    kind: 'draw' | 'move';
    handle: Handle;
    startDoc: { x: number; y: number };
    startBox: { x: number; y: number; w: number; h: number };
    node: Node;
    before: string;
  } = null;

  /** 지금 잡고 있는 9-slice 선. */
  let sliceDrag: keyof Slice | null = null;

  view.root.addEventListener('pointerdown', (event: PointerEvent) => {
    const p = view.toDoc(event);
    const snap = view.grid;

    if (tool === 'pen') {
      penAdd(p);
      return;
    }
    if (tool === 'slice') {
      // 가장 가까운 선을 잡는다. 확대해도 잡기 쉬움이 그대로이도록 손가락 굵기를 문서 좌표로 옮긴다.
      const slop = view.slop(7);
      for (const line of view.sliceLines(doc)) {
        const near = line.vertical ? Math.abs(line.at - p.x) : Math.abs(line.at - p.y);
        if (near <= slop) {
          sliceDrag = line.name;
          view.root.setPointerCapture(event.pointerId);
          return;
        }
      }
      return;
    }

    if (tool === 'select') {
      const current = activeNode();
      if (current) {
        const h = handleAt(bounds(current), p.x, p.y, view.slop());
        if (h) {
          drag = { kind: 'move', handle: h, startDoc: p, startBox: bounds(current), node: current, before: JSON.stringify(current) };
          view.root.setPointerCapture(event.pointerId);
          return;
        }
      }
      const hit = hitTest(doc, p.x, p.y);
      selected = hit;
      if (hit) activeLayer = hit.layer;
      if (hit) {
        const target = doc.layers[hit.layer].nodes[hit.index];
        drag = { kind: 'move', handle: 'move', startDoc: p, startBox: bounds(target), node: target, before: JSON.stringify(target) };
        view.root.setPointerCapture(event.pointerId);
      }
      repaint();
      return;
    }

    // 그리기 — 누른 자리에 크기 0 으로 놓고, 끄는 동안 오른쪽 아래 손잡이를 잡은 것과 같게 다룬다.
    const x = snap > 0 ? Math.round(p.x / snap) * snap : p.x;
    const y = snap > 0 ? Math.round(p.y / snap) * snap : p.y;
    const fresh: Node = tool === 'rect'
      ? { kind: 'rect', x, y, w: 0, h: 0, radius: 0, fill: { kind: 'solid', color: '#3b4a6b' } }
      : tool === 'ellipse'
        ? { kind: 'ellipse', cx: x, cy: y, rx: 0, ry: 0, fill: { kind: 'solid', color: '#3b4a6b' } }
        // 선은 칠이 아니라 **테두리**로 보인다 — 채우기를 주면 두 점 사이가 메워져 안 보인다.
        : { kind: 'path', d: 'M' + x + ' ' + y + 'L' + x + ' ' + y,
            stroke: { paint: { kind: 'solid', color: '#8fa6d8' }, width: 2, align: 'center' } };
    const layer = doc.layers[activeLayer];
    layer.nodes.push(fresh);
    selected = { layer: activeLayer, index: layer.nodes.length - 1 };
    drag = { kind: 'draw', handle: 'se', startDoc: { x, y }, startBox: { x, y, w: 0, h: 0 }, node: fresh, before: '' };
    view.root.setPointerCapture(event.pointerId);
    repaint();
  });

  view.root.addEventListener('dblclick', () => {
    if (pen) penFinish(true);   // 두 번 누르면 닫아서 채운다
  });

  view.root.addEventListener('pointermove', (event: PointerEvent) => {
    if (drag && drag.kind === 'draw' && drag.node.kind === 'path') {
      const p = view.toDoc(event);
      const snap = view.grid;
      const q = (v: number): number => (snap > 0 ? Math.round(v / snap) * snap : Math.round(v * 10) / 10);
      drag.node.d = 'M' + drag.startDoc.x + ' ' + drag.startDoc.y + 'L' + q(p.x) + ' ' + q(p.y);
      repaint();
      return;
    }
    if (sliceDrag) {
      const p = view.toDoc(event);
      const snap = view.grid;
      const q = (v: number): number => (snap > 0 ? Math.round(v / snap) * snap : Math.round(v));
      const next = { ...view.slice };
      if (sliceDrag === 'left') next.left = q(p.x);
      else if (sliceDrag === 'right') next.right = q(doc.w - p.x);
      else if (sliceDrag === 'top') next.top = q(p.y);
      else next.bottom = q(doc.h - p.y);
      view.slice = clampSlice(next, doc.w, doc.h);
      repaint();
      return;
    }
    if (!drag) return;
    const p = view.toDoc(event);
    const box = resizeBox(drag.startBox, drag.handle, p.x - drag.startDoc.x, p.y - drag.startDoc.y, view.grid);
    applyBox(drag.node, box);
    repaint();
  });

  view.root.addEventListener('pointerup', (event: PointerEvent) => {
    if (sliceDrag) {
      sliceDrag = null;
      try { view.root.releasePointerCapture(event.pointerId); } catch { /* 이미 놓았다 */ }
      return;
    }
    if (!drag) return;
    const finished = drag;
    drag = null;
    try { view.root.releasePointerCapture(event.pointerId); } catch { /* 이미 놓았다 */ }

    if (finished.kind === 'draw') {
      const b = bounds(finished.node);
      const layer = doc.layers[selected ? selected.layer : doc.layers.length - 1];
      // 선은 가로나 세로 한쪽이 0 일 수 있다(곧은 선). 길이로 본다.
      const tooSmall = finished.node.kind === 'path'
        ? Math.hypot(b.w, b.h) < 1
        : b.w < 1 || b.h < 1;
      if (tooSmall) {
        // 살짝 눌렀다 뗀 것 — 크기 0 짜리를 남기지 않는다(안 보이는데 목록에만 쌓인다).
        layer.nodes.pop();
        selected = null;
        repaint();
        return;
      }
      const node = finished.node;
      history.push({
        label: '도형 그리기',
        redo: () => { if (!layer.nodes.includes(node)) layer.nodes.push(node); },
        undo: () => { const i = layer.nodes.indexOf(node); if (i >= 0) layer.nodes.splice(i, 1); }
      });
    } else {
      const after = JSON.stringify(finished.node);
      if (after !== finished.before) {
        const target = finished.node;
        const before = finished.before;
        history.push({
          label: '도형 옮기기',
          redo: () => Object.assign(target, JSON.parse(after)),
          undo: () => Object.assign(target, JSON.parse(before))
        });
      }
    }
    repaint();
  });

  /* ── 오른쪽 숫자를 직접 고치기 ──────────────────── */
  side.addEventListener('input', (event) => {
    const el = event.target as HTMLInputElement;
    const node = activeNode();
    if (!node) return;

    if (el.dataset.box) {
      const b = bounds(node);
      const v = Number(el.value);
      const next = { ...b };
      if (el.dataset.box === 'x') next.x = v;
      else if (el.dataset.box === 'y') next.y = v;
      else if (el.dataset.box === 'w') next.w = Math.max(0, v);
      else if (el.dataset.box === 'h') next.h = Math.max(0, v);
      applyBox(node, next);
    } else if (el.dataset.num === 'radius' && node.kind === 'rect') {
      node.radius = Number(el.value);
    } else if (el.dataset.num === 'strokeW' && isPaintable(node)) {
      const width = Number(el.value);
      node.stroke = width > 0
        ? { paint: node.stroke ? node.stroke.paint : { kind: 'solid', color: '#8fa6d8' }, width, align: 'inside' }
        : undefined;
    } else if (el.dataset.fill !== undefined && isPaintable(node)) {
      node.fill = { kind: 'solid', color: el.value };
    } else if (el.dataset.strokeColor !== undefined && isPaintable(node)) {
      const width = node.stroke ? node.stroke.width : 1;
      node.stroke = { paint: { kind: 'solid', color: el.value }, width, align: 'inside' };
    } else {
      return;
    }
    // 끄는 동안에는 그림만 다시 그린다 — 오른쪽까지 다시 만들면 잡고 있던 손잡이가 사라진다.
    view.draw(doc, selected);
    const out = el.parentElement ? el.parentElement.querySelector('output') : null;
    if (out) out.textContent = String(Math.round(Number(el.value)));
  });

  side.addEventListener('click', (event) => {
    const el = event.target as HTMLElement;
    const node = activeNode();

    const alignBtn = el.closest<HTMLElement>('[data-align]');
    if (alignBtn && node) {
      const before = JSON.stringify(node);
      alignTo(node, doc.w, doc.h, alignBtn.dataset.align as Align);
      const after = JSON.stringify(node);
      if (before !== after) {
        history.push({
          label: '자리 맞추기',
          redo: () => Object.assign(node, JSON.parse(after)),
          undo: () => Object.assign(node, JSON.parse(before))
        });
      }
      repaint();
      return;
    }

    const fitBtn = el.closest<HTMLElement>('[data-fit]');
    if (fitBtn && node) {
      const before = JSON.stringify(node);
      fitToDoc(node, doc.w, doc.h, Number(fitBtn.dataset.fit));
      const after = JSON.stringify(node);
      if (before !== after) {
        history.push({
          label: '판에 맞추기',
          redo: () => Object.assign(node, JSON.parse(after)),
          undo: () => Object.assign(node, JSON.parse(before))
        });
      }
      repaint();
      return;
    }

    const holder = el.closest<HTMLElement>('[data-act]');
    const act = holder ? holder.dataset.act : undefined;
    if (!act || !selected) return;
    const layer = doc.layers[selected.layer];
    const i = selected.index;
    if (act === 'del') {
      const removed = layer.nodes.splice(i, 1)[0];
      history.push({
        label: '지우기',
        redo: () => { const at = layer.nodes.indexOf(removed); if (at >= 0) layer.nodes.splice(at, 1); },
        undo: () => layer.nodes.splice(i, 0, removed)
      });
      selected = null;
    } else if (act === 'up' && i < layer.nodes.length - 1) {
      layer.nodes.splice(i + 1, 0, layer.nodes.splice(i, 1)[0]);
      selected = { layer: selected.layer, index: i + 1 };
    } else if (act === 'down' && i > 0) {
      layer.nodes.splice(i - 1, 0, layer.nodes.splice(i, 1)[0]);
      selected = { layer: selected.layer, index: i - 1 };
    }
    repaint();
  });

  /* ── 레이어 상자 ──────────────────────────────── */
  layerBox.addEventListener('click', (event) => {
    const el = event.target as HTMLElement;

    const eye = el.closest<HTMLElement>('[data-layer-eye]');
    if (eye) {
      const i = Number(eye.dataset.layerEye);
      const layer = doc.layers[i];
      const was = layer.visible;
      layer.visible = !was;
      history.push({ label: '레이어 숨김', redo: () => { layer.visible = !was; }, undo: () => { layer.visible = was; } });
      repaint();
      return;
    }

    const pick = el.closest<HTMLElement>('[data-layer]');
    if (pick) {
      activeLayer = Number(pick.dataset.layer);
      selected = null;   // 다른 겹으로 옮겨 갔으니 고른 것은 놓는다
      repaint();
      return;
    }

    const act = el.closest<HTMLElement>('[data-lact]')?.dataset.lact;
    if (!act) return;
    const at = activeLayer;

    if (act === 'add') {
      const layer = addLayer(doc);
      activeLayer = doc.layers.length - 1;
      history.push({
        label: '레이어 만들기',
        redo: () => { if (!doc.layers.includes(layer)) doc.layers.push(layer); },
        undo: () => { const i = doc.layers.indexOf(layer); if (i >= 0) doc.layers.splice(i, 1); }
      });
    } else if (act === 'del') {
      const removed = removeLayer(doc, at);
      if (!removed) return;   // 마지막 하나는 안 지운다
      activeLayer = Math.max(0, at - 1);
      selected = null;
      history.push({
        label: '레이어 지우기',
        redo: () => { const i = doc.layers.indexOf(removed); if (i >= 0) doc.layers.splice(i, 1); },
        undo: () => doc.layers.splice(at, 0, removed)
      });
    } else if (act === 'up' || act === 'down') {
      const to = act === 'up' ? at + 1 : at - 1;
      if (!moveLayer(doc, at, to)) return;
      activeLayer = to;
      selected = null;
      history.push({ label: '레이어 옮기기', redo: () => moveLayer(doc, at, to), undo: () => moveLayer(doc, to, at) });
    } else if (act === 'merge') {
      // 합치기는 되돌리려면 옛 모습이 통째로 필요하다 — 겹이 사라지므로 자리만으론 못 되돌린다.
      const before = JSON.stringify(doc.layers);
      if (!mergeDown(doc, at)) return;
      const after = JSON.stringify(doc.layers);
      activeLayer = Math.max(0, at - 1);
      selected = null;
      history.push({
        label: '레이어 합치기',
        redo: () => { doc.layers.length = 0; doc.layers.push(...JSON.parse(after)); },
        undo: () => { doc.layers.length = 0; doc.layers.push(...JSON.parse(before)); }
      });
    }
    repaint();
  });

  /* ── 시작점 얹기 ────────────────────────────── */
  const foot = container.querySelector('.bon-foot') as HTMLElement;
  foot.addEventListener('click', (event) => {
    const holder = (event.target as HTMLElement).closest<HTMLElement>('[data-seed]');
    if (!holder) return;
    const part = holder.dataset.seed as PartName;
    // 판 크기에 맞춰 얹는다 — 판보다 큰 부품이 튀어나와 있으면 손대기 전에 헤맨다.
    const knobs = { ...defaultKnobs(), w: doc.w, h: doc.h };
    const node = PARTS[part](knobs);
    const layer = doc.layers[activeLayer];
    layer.nodes.push(node);
    selected = { layer: activeLayer, index: layer.nodes.length - 1 };
    history.push({
      label: '시작점 얹기',
      redo: () => { if (!layer.nodes.includes(node)) layer.nodes.push(node); },
      undo: () => { const i = layer.nodes.indexOf(node); if (i >= 0) layer.nodes.splice(i, 1); }
    });
    repaint();
  });

  /* ── 내보내기 ──────────────────────────────── */
  function download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * PNG 는 SVG 를 그림으로 한 번 거쳐 굽는다. **`scale` 배로 크게 굽는다** — 게임은 보통
   * 2~4 배 짜리를 쓰고, 벡터라 크게 구워도 안 뭉개진다.
   */
  async function renderPng(scale = 1): Promise<Blob> {
    const svg = toSvg(doc);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('SVG 를 그림으로 못 읽었다'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(doc.w * scale));
      canvas.height = Math.max(1, Math.round(doc.h * scale));
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 로 못 구웠다'))), 'image/png');
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportPng(): Promise<void> {
    download(await renderPng(1), 'bon.png');
  }

  /**
   * 묶음 — 게임에 넣을 때 필요한 것을 한 번에. SVG(원본) · PNG(2배) · 9-slice 값(json).
   * 값을 따로 적어 두지 않으면 「이 그림의 경계가 어디였더라」가 며칠 뒤에 사라진다.
   */
  async function exportPack(): Promise<void> {
    download(new Blob([toSvg(doc)], { type: 'image/svg+xml' }), 'bon.svg');
    download(await renderPng(2), 'bon@2x.png');
    const meta = { ...sliceMeta(view.slice, doc.w, doc.h), madeWith: 'KarmoLab 본' };
    download(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), 'bon.9slice.json');
  }

  /* ── 선반 ────────────────────────────────── */
  const shelf = document.createElement('div');
  shelf.className = 'bon-shelf';
  shelf.hidden = true;
  container.querySelector('.bon-wrap')?.append(shelf);

  function shelfMessage(text: string, bad = false): void {
    shelf.hidden = false;
    shelf.innerHTML = '<div class="bon-shelf-msg' + (bad ? ' bad' : '') + '">' + esc(text) +
      '<button data-shelf="close">닫기</button></div>';
  }

  /** 올리기 — 열쇠가 없으면 넣는 자리를 먼저 보여 준다(눌렀다가 「권한 없음」을 보는 것보다 낫다). */
  async function putOnShelf(): Promise<void> {
    if (!canUpload()) {
      shelf.hidden = false;
      shelf.innerHTML =
        '<div class="bon-shelf-msg">선반에 올리려면 열쇠가 든다. 이 브라우저에만 남는다.' +
          '<input type="password" data-shelf-token placeholder="선반 열쇠" autocomplete="off">' +
          '<button data-shelf="save-token">넣기</button><button data-shelf="close">닫기</button></div>';
      return;
    }
    const title = window.prompt('선반에 올릴 이름', '부품') ?? '';
    if (!title.trim()) return;
    shelfMessage('올리는 중…');
    try {
      const svg = toSvg(doc);
      const item = await uploadToFoundry({
        tool: 'bon',
        title: title.trim(),
        mime: 'image/svg+xml',
        bytes: new TextEncoder().encode(svg),
        // 다시 열 수 있게 문서와 9-slice 값을 함께 담는다 — 그림만 남으면 고칠 수가 없다.
        recipe: { doc: JSON.parse(JSON.stringify(doc)) as unknown, slice: view.slice }
      });
      shelfMessage('올렸다 — ' + item.title + ' (CC0, 아무나 가져다 쓴다)');
    } catch (error) {
      shelfMessage(String(error instanceof Error ? error.message : error), true);
    }
  }

  /** 구경하기 — 남이 올린 것도 함께 보인다. 누르면 그 설정 그대로 내 판에 열린다. */
  async function openShelf(): Promise<void> {
    shelfMessage('선반을 여는 중…');
    try {
      const { items, total } = await listFoundry({ limit: 40 });
      if (items.length === 0) {
        shelfMessage('선반이 비었다. 먼저 하나 올려 보라.');
        return;
      }
      shelf.innerHTML =
        '<div class="bon-shelf-head">선반 <small>' + total + '개 · CC0</small>' +
          '<button data-shelf="close">닫기</button></div>' +
        '<div class="bon-shelf-grid">' +
          items.map((item) =>
            '<figure class="bon-shelf-card" data-shelf-id="' + esc(item.id) + '">' +
              '<img src="' + esc(item.url) + '" alt="' + esc(item.title) + '" loading="lazy">' +
              '<figcaption>' + esc(item.title) + '<small>' + esc(item.tool) + '</small></figcaption>' +
              (item.recipe ? '<button data-shelf="open" data-id="' + esc(item.id) + '">이대로 열기</button>' : '') +
            '</figure>').join('') +
        '</div>';
      shelf.hidden = false;
      shelfItems = items;
    } catch (error) {
      shelfMessage(String(error instanceof Error ? error.message : error), true);
    }
  }

  let shelfItems: FoundryItem[] = [];

  shelf.addEventListener('click', (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-shelf]');
    if (!el) return;
    const what = el.dataset.shelf;
    if (what === 'close') { shelf.hidden = true; return; }
    if (what === 'save-token') {
      const input = shelf.querySelector<HTMLInputElement>('[data-shelf-token]');
      setFoundryToken(input?.value.trim() ?? '');
      shelf.hidden = true;
      void putOnShelf();
      return;
    }
    if (what === 'open') {
      const item = shelfItems.find((x) => x.id === el.dataset.id);
      const recipe = item?.recipe as { doc?: Doc; slice?: typeof view.slice } | undefined;
      if (!recipe?.doc) { shelfMessage('이 항목엔 다시 열 설정이 없다', true); return; }
      // 판을 통째로 갈아 끼운다. 되돌리기 한 번으로 원래 것으로 돌아갈 수 있게 옛 모습을 들고 간다.
      const before = JSON.stringify({ w: doc.w, h: doc.h, layers: doc.layers });
      const after = JSON.stringify(recipe.doc);
      const apply = (text: string): void => {
        const next = JSON.parse(text) as Doc;
        doc.w = next.w; doc.h = next.h;
        doc.layers.length = 0;
        doc.layers.push(...next.layers);
        selected = null;
        activeLayer = 0;
      };
      apply(after);
      if (recipe.slice) view.slice = recipe.slice;
      history.push({ label: '선반에서 열기', redo: () => apply(after), undo: () => apply(before) });
      shelf.hidden = true;
      repaint();
    }
  });

  /* ── 위쪽 막대 ──────────────────────────────── */
  const bar = container.querySelector('.bon-bar') as HTMLElement;

  bar.addEventListener('click', (event) => {
    const holder = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = holder ? holder.dataset.act : undefined;
    if (act === 'undo') { history.undo(); selected = null; repaint(); }
    else if (act === 'redo') { history.redo(); selected = null; repaint(); }
    else if (act === 'svg') download(new Blob([toSvg(doc)], { type: 'image/svg+xml' }), 'bon.svg');
    else if (act === 'png') void exportPng();
    else if (act === 'pack') void exportPack();
    else if (act === 'shelf') void putOnShelf();
    else if (act === 'shelf-open') void openShelf();
  });

  bar.addEventListener('input', (event) => {
    const el = event.target as HTMLInputElement;
    if (el.dataset.zoom !== undefined) view.scale = Number(el.value);
    else if (el.dataset.grid !== undefined) view.grid = Number(el.value);
    else if (el.dataset.docW !== undefined) doc.w = Math.max(1, Number(el.value));
    else if (el.dataset.docH !== undefined) doc.h = Math.max(1, Number(el.value));
    else return;
    repaint();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      if (pen) penFinish(false);   // 짓던 것을 놓고 가면 화면에 붙어 다닌다
      tool = button.dataset.tool as Tool;
      view.sliceOn = tool === 'slice';
      if (view.sliceOn && view.slice.left + view.slice.right + view.slice.top + view.slice.bottom === 0) {
        view.slice = defaultSlice(doc.w, doc.h);   // 처음 켤 때만 자리를 잡아 준다
      }
      repaint();
    });
  });

  const keydown = (event: KeyboardEvent): void => {
    if (!container.isConnected) return;
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (event.key === 'v') { tool = 'select'; repaint(); }
    else if (event.key === 'r') { tool = 'rect'; repaint(); }
    else if (event.key === 'e') { tool = 'ellipse'; repaint(); }
    else if (event.key === 'l') { tool = 'line'; repaint(); }
    else if (event.key === 'p') { tool = 'pen'; repaint(); }
    else if (event.key === 'Enter' && pen) { event.preventDefault(); penFinish(false); }
    else if (event.key === 'Escape' && pen) {
      // 취소 — 짓던 것을 통째로 버린다(되돌리기에 담기 전이라 남는 게 없다).
      const layer = doc.layers[pen.layer];
      const at = layer.nodes.indexOf(pen.node);
      if (at >= 0) layer.nodes.splice(at, 1);
      pen = null;
      selected = null;
      repaint();
    }
    else if (event.key === 's') {
      tool = 'slice';
      view.sliceOn = true;
      if (view.slice.left + view.slice.right + view.slice.top + view.slice.bottom === 0) view.slice = defaultSlice(doc.w, doc.h);
      repaint();
    }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) history.redo(); else history.undo();
      selected = null;
      repaint();
    } else if (event.key === 'Delete' && selected) {
      doc.layers[selected.layer].nodes.splice(selected.index, 1);
      selected = null;
      repaint();
    }
  };
  document.addEventListener('keydown', keydown);
  if (Toolbox.onDispose) Toolbox.onDispose(() => document.removeEventListener('keydown', keydown));

  // 처음부터 겹을 둘 준다 — 부품은 바탕·빛·그늘로 겹쳐 만드는 것이라 하나로는 좁다.
  addLayer(doc, '위');
  repaint();
}

(function register(): void {
  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta ? Toolbox.getLazyWidgetPublicMeta('bon') || {} : {}),
    id: 'bon',
    category: 'tool',
    layout: 'full',
    icon: '<rect x="3" y="7" width="18" height="10" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="3" cy="7" r="1.6" fill="currentColor"/><circle cx="21" cy="17" r="1.6" fill="currentColor"/>',
    tabs: [{ id: 'bon-main', label: '본', build: buildBon }]
  });
})();
