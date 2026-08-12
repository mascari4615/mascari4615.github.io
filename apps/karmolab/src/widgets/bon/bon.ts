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
import { addLayer, createDoc, isPaintable, type Doc, type Node } from './model';
import { applyBox, bounds, handleAt, hitTest, resizeBox, type Handle } from './geom';
import { toSvg } from './svg';
import { injectBonStyles } from './styles';
import { BonView } from './view';

declare const Toolbox: {
  register(spec: unknown): void;
  getLazyWidgetPublicMeta?(id: string): unknown;
  onDispose?(fn: () => void): void;
};

type Tool = 'select' | 'rect' | 'ellipse';

const esc = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const ICONS: Record<Tool, string> = {
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 3l14 8-6 1.6L10 19z"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
  ellipse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>'
};
const TOOL_LABEL: Record<Tool, string> = { select: '고르기 (V)', rect: '사각형 (R)', ellipse: '타원 (E)' };

function buildBon(container: HTMLElement): void {
  injectBonStyles();

  const doc: Doc = createDoc(192, 64);
  const history = new History();
  let tool: Tool = 'rect';
  let selected: { layer: number; index: number } | null = null;

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
        '<button data-act="svg">SVG 저장</button>' +
      '</div>' +
      '<div class="bon-body">' +
        '<div class="bon-tools">' +
          (['select', 'rect', 'ellipse'] as Tool[]).map((t) =>
            '<button data-tool="' + t + '" title="' + esc(TOOL_LABEL[t]) + '" aria-label="' + esc(TOOL_LABEL[t]) + '">' + ICONS[t] + '</button>').join('') +
        '</div>' +
        '<div class="bon-canvas" data-canvas></div>' +
        '<div class="bon-side" data-side></div>' +
      '</div>' +
    '</div>';

  const canvasHost = container.querySelector('[data-canvas]') as HTMLElement;
  const side = container.querySelector('[data-side]') as HTMLElement;
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
      '<div class="bon-card"><h4>차례</h4>' +
        '<div class="bon-row"><button data-act="up">앞으로</button><button data-act="down">뒤로</button>' +
        '<button data-act="del">지우기</button></div></div>';
  }

  /* ── 다시 그리기 — 하나뿐인 길 ───────────────────── */
  function repaint(): void {
    view.draw(doc, selected);
    drawSide();
    container.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
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

  view.root.addEventListener('pointerdown', (event: PointerEvent) => {
    const p = view.toDoc(event);
    const snap = view.grid;

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
      : { kind: 'ellipse', cx: x, cy: y, rx: 0, ry: 0, fill: { kind: 'solid', color: '#3b4a6b' } };
    const layer = doc.layers[doc.layers.length - 1];
    layer.nodes.push(fresh);
    selected = { layer: doc.layers.length - 1, index: layer.nodes.length - 1 };
    drag = { kind: 'draw', handle: 'se', startDoc: { x, y }, startBox: { x, y, w: 0, h: 0 }, node: fresh, before: '' };
    view.root.setPointerCapture(event.pointerId);
    repaint();
  });

  view.root.addEventListener('pointermove', (event: PointerEvent) => {
    if (!drag) return;
    const p = view.toDoc(event);
    const box = resizeBox(drag.startBox, drag.handle, p.x - drag.startDoc.x, p.y - drag.startDoc.y, view.grid);
    applyBox(drag.node, box);
    repaint();
  });

  view.root.addEventListener('pointerup', (event: PointerEvent) => {
    if (!drag) return;
    const finished = drag;
    drag = null;
    try { view.root.releasePointerCapture(event.pointerId); } catch { /* 이미 놓았다 */ }

    if (finished.kind === 'draw') {
      const b = bounds(finished.node);
      const layer = doc.layers[selected ? selected.layer : doc.layers.length - 1];
      if (b.w < 1 || b.h < 1) {
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
    const holder = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
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

  /* ── 위쪽 막대 ──────────────────────────────── */
  const bar = container.querySelector('.bon-bar') as HTMLElement;

  bar.addEventListener('click', (event) => {
    const holder = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = holder ? holder.dataset.act : undefined;
    if (act === 'undo') { history.undo(); selected = null; repaint(); }
    else if (act === 'redo') { history.redo(); selected = null; repaint(); }
    else if (act === 'svg') {
      const blob = new Blob([toSvg(doc)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bon.svg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
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
    button.addEventListener('click', () => { tool = button.dataset.tool as Tool; repaint(); });
  });

  const keydown = (event: KeyboardEvent): void => {
    if (!container.isConnected) return;
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (event.key === 'v') { tool = 'select'; repaint(); }
    else if (event.key === 'r') { tool = 'rect'; repaint(); }
    else if (event.key === 'e') { tool = 'ellipse'; repaint(); }
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
