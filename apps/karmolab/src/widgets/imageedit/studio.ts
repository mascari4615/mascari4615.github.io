/**
 * 이미지 스튜디오 — 화면 (TASK-KL-240 · 2b)
 *
 * 문서 모델(`doc`)·합성(`composite`)·붓(`brush`)·픽셀(`pixel`)을 사람 손에 잇는 자리.
 * 여기서만 DOM 을 안다 — 아래 파일들은 계속 브라우저를 모른다.
 *
 * 화면은 네 칸이다: 왼쪽 도구 · 가운데 그림 · 오른쪽 레이어 · 아래 타임라인.
 * 그림을 다시 그리는 길은 **하나**(`repaint`)뿐이다. 붓질 중에는 더러워진 사각형만 다시 섞고,
 * 레이어를 바꾸면 전체를 다시 섞는다 — 두 경우가 같은 함수를 지나므로 화면이 어긋날 수 없다.
 */

import { loadNamespace, t } from '../../lib/i18n';
import { Stroke, defaultBrush, pickColor, type BrushSettings } from './brush';
import { composite, spriteSheet } from './composite';
import {
  BLEND_MODES, activeLayer, addLayer, celAt, cloneSurface, createDoc, createSurface,
  ensureCel, findLayer, insertFrame, isHold, mergeDown, moveLayer, removeFrame, removeLayer,
  setFrameCount, type BlendMode, type Doc, type Layer, type Surface
} from './doc';
import { History, fieldChange, pixelPatch } from './history';
import { createPixelDoc, ditherdeckFromDoc, docFromDitherdeck, extractPalette, floodFill, isDitherdeckProject, parseHex, toHex } from './pixel';
import {
  clearInside, createSelection, edgePixels, feather, invert as invertSelection, isEmpty,
  magicWand, selectAll, selectNone, selectPolygon, selectRect,
  type SelectMode, type Selection
} from './selection';
import { CanvasView } from './view';

declare const Toolbox: {
  register(spec: unknown): void;
  getLazyWidgetPublicMeta?(id: string): unknown;
  onDispose?(fn: () => void): void;
};

type ToolId = 'brush' | 'eraser' | 'fill' | 'pick' | 'pan' | 'marquee' | 'lasso' | 'wand';

const esc = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const T = (key: string, fallback: string): string => t('imageedit.' + key, undefined, fallback);

/** 도구 단추 하나 — 아이콘은 글리프가 아니라 선 그림이다(글꼴 따라 안 달라진다). */
const toolButton = (id: string, hotkey: string, label: string, path: string, active = false): string =>
  '<button data-tool="' + id + '"' + (active ? ' class="active"' : '') + ' title="' + esc(label + ' (' + hotkey + ')') + '">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>' +
  '<small>' + esc(label) + '</small></button>';

/* ===== 판 ↔ 캔버스 ===== */

/** 판을 캔버스로 — 저장·내보내기에서 쓴다. */
function surfaceToCanvas(surface: Surface): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = surface.w;
  canvas.height = surface.h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(surface.w, surface.h);
  image.data.set(surface.data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** 그림 파일을 판으로. */
function imageToSurface(source: CanvasImageSource, w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(source, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const surface = createSurface(w, h);
  surface.data.set(image.data);
  return surface;
}

function download(blob: Blob, name: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const safeName = (name: string): string => name.trim().replace(/[^a-z0-9가-힣_-]+/gi, '-') || 'artwork';

/* ===== 화면 ===== */

function buildStudio(container: HTMLElement): void {
  let doc: Doc = createDoc(1024, 1024, T('untitled', '새 그림'));
  const history = new History(300);
  let brush: BrushSettings = defaultBrush();
  let tool: ToolId = 'brush';
  let onionBefore = 0;
  let onionAfter = 0;
  let playing = 0;
  let stroke: Stroke | null = null;
  let strokeBase: Surface | null = null;
  let panning: { x: number; y: number } | null = null;
  let spaceDown = false;
  let selection: Selection = createSelection(doc.w, doc.h);
  /* 고르는 중인 몸짓 — 사각형은 시작점, 올가미는 지나온 점들. */
  let picking: { from: { x: number; y: number }; points: Array<{ x: number; y: number }> } | null = null;
  let ants = 0;

  container.innerHTML =
    '<div class="ies">' +
    '<header class="ies-bar">' +
      '<strong class="ies-logo">STUDIO</strong>' +
      '<input class="ies-name" data-name aria-label="' + esc(T('docName', '그림 이름')) + '">' +
      '<span class="ies-sep"></span>' +
      '<button data-act="new" title="' + esc(T('newHelp', '빈 그림을 새로 시작한다')) + '">' + esc(T('new', '새로')) + '</button>' +
      '<button data-act="new-pixel" title="' + esc(T('newPixelHelp', '격자에 붙는 픽셀 그림 — 도트 애니메이션용')) + '">' + esc(T('newPixel', '픽셀')) + '</button>' +
      '<label class="ies-file">' + esc(T('open', '열기')) +
        '<input data-open type="file" accept="image/*,application/json,.json,.ditherdeck.json" hidden></label>' +
      '<button data-act="undo" data-hot="Ctrl+Z">' + esc(T('undo', '되돌리기')) + '</button>' +
      '<button data-act="redo" data-hot="Ctrl+Shift+Z">' + esc(T('redo', '다시')) + '</button>' +
      '<span class="ies-sep"></span>' +
      '<button data-act="save-png">' + esc(T('savePng', 'PNG')) + '</button>' +
      '<button data-act="save-sheet">' + esc(T('saveSheet', '시트')) + '</button>' +
      '<button data-act="save-project">' + esc(T('saveProject', '프로젝트')) + '</button>' +
      '<span class="ies-status" data-status></span>' +
    '</header>' +
    '<div class="ies-body">' +
      '<aside class="ies-tools">' +
        toolButton('brush', 'B', T('toolBrush', '붓'), '<path d="M4 20c2.5.4 4.6-.6 5.4-2.6.5-1.3 0-2.6-1-3.3-1.2-.8-2.8-.5-3.5.8C4 16.4 4.2 18.3 4 20z"/><path d="M10.5 14.8 19.2 5.4a1.7 1.7 0 0 0-2.4-2.4L7.3 11.6"/>', true) +
        toolButton('eraser', 'E', T('toolEraser', '지우개'), '<path d="m5.5 15.5 6-6a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8l-4 4H8l-2.5-2.5a2 2 0 0 1 0-2z"/><path d="M9.5 20h10"/>') +
        toolButton('fill', 'F', T('toolFill', '채우기'), '<path d="m10 3 8.2 8.2a1.4 1.4 0 0 1 0 2L12 19.4a1.4 1.4 0 0 1-2 0l-6.2-6.2a1.4 1.4 0 0 1 0-2L10 5"/><path d="M20.5 15.5c1 1.4 1.5 2.4 1.5 3a1.5 1.5 0 1 1-3 0c0-.6.5-1.6 1.5-3z" fill="currentColor"/>') +
        toolButton('pick', 'I', T('toolPick', '스포이드'), '<path d="m13.5 7.5 3 3M4 20l1-3.2 8-8 2.2 2.2-8 8z"/><path d="M15 4.6a2 2 0 0 1 2.8 0l1.6 1.6a2 2 0 0 1 0 2.8l-1.5 1.5-4.4-4.4z"/>') +
        toolButton('marquee', 'M', T('toolMarquee', '사각 선택'), '<rect x="3.5" y="5.5" width="17" height="13" rx="1" stroke-dasharray="3 2.5"/>') +
        toolButton('lasso', 'L', T('toolLasso', '올가미'), '<path d="M12 4.5c4.4 0 8 2.5 8 5.6 0 3-3.6 5.5-8 5.5-1.3 0-2.6-.2-3.7-.6-1.4 1.2-1.6 2.6-1 4.5-2-1.3-2.6-3.4-1.6-5.5C4.4 13 4 11.6 4 10.1c0-3.1 3.6-5.6 8-5.6z"/>') +
        toolButton('wand', 'W', T('toolWand', '마술봉'), '<path d="m4 20 9.5-9.5M15 4l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9zM19.5 12.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>') +
        toolButton('pan', 'Space', T('toolPan', '이동'), '<path d="M12 3v18M3 12h18M12 3 9.5 5.8M12 3l2.5 2.8M12 21l-2.5-2.8M12 21l2.5-2.8M3 12l2.8-2.5M3 12l2.8 2.5M21 12l-2.8-2.5M21 12l-2.8 2.5"/>') +
        '<hr>' +
        '<input data-color type="color" value="#18202c" aria-label="' + esc(T('color', '색')) + '">' +
        '<div class="ies-palette" data-palette></div>' +
        '<button data-act="pick-palette" class="ies-mini">' + esc(T('paletteFromArt', '그림에서 색 뽑기')) + '</button>' +
      '</aside>' +
      '<section class="ies-stage">' +
        '<div class="ies-brush">' +
          '<label>' + esc(T('size', '굵기')) + '<input data-brush="size" type="range" min="1" max="200" step="1"><b data-out="size"></b></label>' +
          '<label>' + esc(T('hardness', '단단함')) + '<input data-brush="hardness" type="range" min="0" max="1" step="0.01"><b data-out="hardness"></b></label>' +
          '<label>' + esc(T('opacity', '짙기')) + '<input data-brush="opacity" type="range" min="0" max="1" step="0.01"><b data-out="opacity"></b></label>' +
          '<label>' + esc(T('flow', '흐름')) + '<input data-brush="flow" type="range" min="0.02" max="1" step="0.01"><b data-out="flow"></b></label>' +
          '<label>' + esc(T('smoothing', '손떨림')) + '<input data-brush="smoothing" type="range" min="0" max="0.95" step="0.01"><b data-out="smoothing"></b></label>' +
          '<span class="ies-selbar">' +
            '<button data-act="deselect" data-needs-selection class="ies-mini" title="Ctrl+D">' + esc(T('deselect', '선택 풀기')) + '</button>' +
            '<button data-act="feather-selection" data-needs-selection class="ies-mini">' + esc(T('featherEdge', '가장자리 부드럽게')) + '</button>' +
            '<button data-act="clear-selection" data-needs-selection class="ies-mini" title="Delete">' + esc(T('clearSelection', '고른 자리 지우기')) + '</button>' +
          '</span>' +
          '<span class="ies-zoom" data-zoom></span>' +
          '<button data-act="fit" class="ies-mini">' + esc(T('fit', '맞춤')) + '</button>' +
        '</div>' +
        '<div class="ies-canvas" data-canvas-wrap><canvas data-canvas></canvas></div>' +
        '<div class="ies-timeline">' +
          '<button data-act="play">▶</button>' +
          '<label>' + esc(T('fps', '초당')) + '<input data-fps type="number" min="1" max="60" value="12"></label>' +
          '<label class="ies-onion"><input data-onion type="checkbox"> ' + esc(T('onion', '어니언스킨')) + '</label>' +
          '<div class="ies-frames" data-frames></div>' +
          '<button data-act="add-frame" title="' + esc(T('addFrameHelp', '지금 프레임을 복사해 뒤에 끼운다')) + '">＋</button>' +
          '<button data-act="del-frame">－</button>' +
        '</div>' +
      '</section>' +
      '<aside class="ies-layers">' +
        '<div class="ies-layer-head">' +
          '<b>' + esc(T('layers', '레이어')) + '</b>' +
          '<button data-act="add-layer" title="' + esc(T('addLayerHelp', '위에 새 레이어')) + '">＋</button>' +
          '<button data-act="merge-layer" title="' + esc(T('mergeHelp', '아래 레이어에 눌러 붙인다')) + '">⇩</button>' +
          '<button data-act="del-layer">🗑</button>' +
        '</div>' +
        '<div class="ies-layer-props">' +
          '<label>' + esc(T('layerOpacity', '불투명도')) + '<input data-layer="opacity" type="range" min="0" max="1" step="0.01"></label>' +
          '<label>' + esc(T('blend', '섞기')) + '<select data-layer="blend"></select></label>' +
          '<label class="ies-check"><input data-layer="clip" type="checkbox"> ' + esc(T('clip', '아래에 끼우기')) + '</label>' +
        '</div>' +
        '<div class="ies-layer-list" data-layers></div>' +
      '</aside>' +
    '</div></div>';

  injectStyles();

  const root = container.querySelector('.ies') as HTMLElement;
  const pick = <T extends HTMLElement>(selector: string): T => root.querySelector(selector) as T;
  const canvas = pick<HTMLCanvasElement>('[data-canvas]');
  const wrap = pick<HTMLElement>('[data-canvas-wrap]');
  const status = pick<HTMLElement>('[data-status]');
  const view = new CanvasView(canvas, doc.w, doc.h);
  /* 화면에 보이는 합성 결과. 붓질 중에는 이 판의 더러워진 자리만 다시 섞는다. */
  let flat: Surface = createSurface(doc.w, doc.h);

  const say = (message: string): void => { status.textContent = message; };

  /* ===== 그리기 한 길 ===== */

  function repaint(rect?: { x: number; y: number; w: number; h: number }): void {
    const onion = onionBefore || onionAfter;
    /* 어니언스킨이 켜져 있으면 부분 갱신이 유령까지 다시 그려야 하므로 그냥 전체를 섞는다. */
    const area = onion ? undefined : rect;
    composite(doc, doc.activeFrame, undefined, {
      into: flat,
      rect: area,
      onionBefore, onionAfter
    });
    view.blit(flat, area);
    view.invalidate();
  }

  /** 고른 자리가 바뀌면 테두리와 개미 시계가 따라온다 — 한 길로만 지나가게 묶어 둔다. */
  function selectionChanged(): void {
    view.setSelectionEdges(edgePixels(selection));
    if (ants) { clearInterval(ants); ants = 0; }
    if (view.hasSelectionEdges) {
      ants = window.setInterval(() => { view.antPhase += 1; view.invalidate(); }, 120);
    }
    const empty = isEmpty(selection);
    root.querySelectorAll<HTMLButtonElement>('[data-needs-selection]').forEach(button => { button.disabled = empty; });
    view.invalidate();
  }

  /** 지금 붓이 지켜야 할 자리. 아무것도 안 골랐으면 판 전체다(= null). */
  const selectionMask = (): Uint8Array | null => (isEmpty(selection) ? null : selection.mask);

  function reflowDoc(): void {
    view.resizeDoc(doc.w, doc.h);
    view.grid = doc.grid;
    selection = createSelection(doc.w, doc.h);
    selectionChanged();
    flat = createSurface(doc.w, doc.h);
    pick<HTMLInputElement>('[data-name]').value = doc.name;
    pick<HTMLInputElement>('[data-fps]').value = String(doc.fps);
    view.fit();
    renderLayers();
    renderFrames();
    renderPalette();
    repaint();
  }

  /* ===== 레이어 패널 ===== */

  function renderLayers(): void {
    const list = pick<HTMLElement>('[data-layers]');
    list.innerHTML = '';
    /* 목록 뒤가 화면 위 — 사람이 보는 순서는 반대다. */
    [...doc.layers].reverse().forEach(layer => {
      const row = document.createElement('div');
      row.className = 'ies-layer' + (layer.id === doc.activeLayer ? ' active' : '');
      row.innerHTML =
        '<button class="ies-eye" title="' + esc(T('toggleVisible', '보이기/숨기기')) + '">' + (layer.visible ? '●' : '○') + '</button>' +
        '<canvas class="ies-thumb" width="40" height="40"></canvas>' +
        '<span class="ies-layer-name" title="' + esc(T('renameHelp', '두 번 누르면 이름 고치기')) + '">' + esc(layer.name) + '</span>' +
        '<button class="ies-lock" title="' + esc(T('toggleLock', '잠그기')) + '">' + (layer.locked ? '🔒' : '○') + '</button>';
      const thumb = row.querySelector('canvas') as HTMLCanvasElement;
      const cel = celAt(layer, doc.activeFrame);
      if (cel) {
        const ctx = thumb.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(surfaceToCanvas(cel), 0, 0, 40, 40);
      }
      (row.querySelector('.ies-eye') as HTMLElement).onclick = (event) => {
        event.stopPropagation();
        history.run(fieldChange(layer, 'visible', !layer.visible, T('toggleVisible', '보이기/숨기기')));
        renderLayers(); repaint();
      };
      (row.querySelector('.ies-lock') as HTMLElement).onclick = (event) => {
        event.stopPropagation();
        layer.locked = !layer.locked;
        renderLayers();
      };
      const nameEl = row.querySelector('.ies-layer-name') as HTMLElement;
      nameEl.ondblclick = (event) => {
        event.stopPropagation();
        const next = prompt(T('renamePrompt', '레이어 이름'), layer.name);
        if (next != null && next.trim()) {
          history.run(fieldChange(layer, 'name', next.trim(), T('rename', '이름 바꾸기')));
          renderLayers();
        }
      };
      row.onclick = () => { doc.activeLayer = layer.id; renderLayers(); syncLayerProps(); };
      /* 끌어서 순서 바꾸기 */
      row.draggable = true;
      row.ondragstart = (event) => { event.dataTransfer?.setData('text/plain', layer.id); };
      row.ondragover = (event) => event.preventDefault();
      row.ondrop = (event) => {
        event.preventDefault();
        const moved = event.dataTransfer?.getData('text/plain');
        if (!moved || moved === layer.id) return;
        const to = doc.layers.findIndex(l => l.id === layer.id);
        if (moveLayer(doc, moved, to)) { renderLayers(); repaint(); }
      };
      list.append(row);
    });
    syncLayerProps();
  }

  function syncLayerProps(): void {
    const layer = activeLayer(doc);
    const opacity = pick<HTMLInputElement>('[data-layer="opacity"]');
    const blend = pick<HTMLSelectElement>('[data-layer="blend"]');
    const clip = pick<HTMLInputElement>('[data-layer="clip"]');
    if (!blend.options.length) {
      BLEND_MODES.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = T('blend.' + mode, mode);
        blend.append(option);
      });
    }
    if (!layer) return;
    opacity.value = String(layer.opacity);
    blend.value = layer.blend;
    clip.checked = layer.clip;
  }

  /* ===== 타임라인 ===== */

  function renderFrames(): void {
    const strip = pick<HTMLElement>('[data-frames]');
    strip.innerHTML = '';
    for (let f = 0; f < doc.frames; f += 1) {
      const button = document.createElement('button');
      button.className = 'ies-frame' + (f === doc.activeFrame ? ' active' : '');
      const held = doc.layers.every(layer => isHold(layer, f));
      button.innerHTML = '<canvas width="34" height="34"></canvas><small>' + (f + 1) + (held && f > 0 ? '·' : '') + '</small>';
      const thumb = button.querySelector('canvas') as HTMLCanvasElement;
      const ctx = thumb.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(surfaceToCanvas(composite(doc, f)), 0, 0, 34, 34);
      button.onclick = () => { doc.activeFrame = f; renderFrames(); renderLayers(); repaint(); };
      strip.append(button);
    }
  }

  function renderPalette(): void {
    const box = pick<HTMLElement>('[data-palette]');
    box.innerHTML = '';
    doc.palette.forEach(color => {
      const swatch = document.createElement('button');
      swatch.className = 'ies-swatch';
      swatch.style.background = color;
      swatch.title = color;
      swatch.onclick = () => {
        const rgba = parseHex(color);
        if (!rgba) return;
        brush.color = [rgba[0], rgba[1], rgba[2]];
        pick<HTMLInputElement>('[data-color]').value = toHex(rgba[0], rgba[1], rgba[2]);
      };
      box.append(swatch);
    });
  }

  /* ===== 그리는 손 ===== */

  const canDraw = (): Layer | null => {
    const layer = activeLayer(doc);
    if (!layer) return null;
    if (layer.locked) { say(T('lockedLayer', '잠긴 레이어다')); return null; }
    if (!layer.visible) { say(T('hiddenLayer', '숨긴 레이어에는 안 그려진다')); return null; }
    return layer;
  };

  const toDoc = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return view.toDoc(event.clientX - rect.left, event.clientY - rect.top);
  };

  canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    canvas.setPointerCapture(event.pointerId);
    const point = toDoc(event);
    if (tool === 'pan' || spaceDown || event.button === 1) {
      panning = { x: event.clientX, y: event.clientY };
      return;
    }
    if (tool === 'marquee' || tool === 'lasso') {
      /* Shift = 더하기, Alt = 빼기 — 포토샵과 같은 손버릇. */
      picking = { from: point, points: [point] };
      return;
    }
    if (tool === 'wand') {
      magicWand(selection, flat, point.x, point.y, 0.14, !event.altKey, pickMode(event));
      selectionChanged();
      say(isEmpty(selection) ? T('selectedNone', '고른 것이 없다') : T('selected', '골랐다'));
      return;
    }
    if (tool === 'pick') {
      const color = pickColor(flat, point.x, point.y);
      if (color) {
        brush.color = [color[0], color[1], color[2]];
        pick<HTMLInputElement>('[data-color]').value = toHex(color[0], color[1], color[2]);
        say(T('picked', '색을 집었다'));
      }
      return;
    }
    const layer = canDraw();
    if (!layer) return;
    const cel = ensureCel(doc, layer, doc.activeFrame);
    if (tool === 'fill') {
      const before = cloneSurface(cel);
      const changed = floodFill(cel, point.x, point.y, [brush.color[0], brush.color[1], brush.color[2], 255], {
        tolerance: 0.06, grid: doc.grid || 1, selection: selectionMask()
      });
      if (changed) {
        const patch = pixelPatch(cel, before, T('toolFill', '채우기'));
        if (patch) history.push(patch);
        renderLayers();
        repaint();
      }
      return;
    }
    /* 붓·지우개 — 획이 끝날 때 한 단계로 굳는다. */
    strokeBase = cloneSurface(cel);
    stroke = new Stroke(cel, {
      ...brush,
      mode: tool === 'eraser' ? 'erase' : 'paint',
      pixel: doc.grid > 0,
      grid: doc.grid || 1
    }, selectionMask());
    stroke.begin({ x: point.x, y: point.y, pressure: event.pressure || 0.5 });
    repaint(stroke.dirty || undefined);
  });

  canvas.addEventListener('pointermove', (event: PointerEvent) => {
    if (panning) {
      view.pan(event.clientX - panning.x, event.clientY - panning.y);
      panning = { x: event.clientX, y: event.clientY };
      view.invalidate();
      return;
    }
    if (picking) {
      const point = toDoc(event);
      if (tool === 'lasso') picking.points.push(point);
      else picking.points = [point];
      /* 끄는 동안 보이는 테두리 — 아직 확정 아니다(놓을 때 굳는다). */
      previewSelection(event);
      return;
    }
    if (!stroke) return;
    const point = toDoc(event);
    const previous = stroke.dirty;
    stroke.move({ x: point.x, y: point.y, pressure: event.pressure || 0.5 });
    const now = stroke.dirty;
    /* 이번 움직임으로 넓어진 자리만 다시 섞는다. */
    if (now) repaint(previous ? union(previous, now) : now);
  });

  /** Shift = 더하기 · Alt = 빼기 · 둘 다 = 교집합. */
  const pickMode = (event: { shiftKey: boolean; altKey: boolean }): SelectMode =>
    (event.shiftKey && event.altKey) ? 'intersect' : event.shiftKey ? 'add' : event.altKey ? 'subtract' : 'replace';

  /** 끄는 중 미리보기 — 확정과 같은 함수를 쓰되 되돌리기에는 안 쌓는다. */
  function previewSelection(event: PointerEvent): void {
    if (!picking) return;
    const backup = selection;
    selection = createSelection(doc.w, doc.h);
    selection.mask.set(backup.mask);
    selection.bounds = backup.bounds;
    applyPicking(event);
    view.setSelectionEdges(edgePixels(selection));
    view.invalidate();
    selection = backup;
  }

  function applyPicking(event: PointerEvent): void {
    if (!picking) return;
    const mode = pickMode(event);
    if (tool === 'lasso') {
      selectPolygon(selection, picking.points, mode);
      return;
    }
    const to = picking.points[picking.points.length - 1];
    const rect = {
      x: Math.min(picking.from.x, to.x), y: Math.min(picking.from.y, to.y),
      w: Math.abs(to.x - picking.from.x), h: Math.abs(to.y - picking.from.y)
    };
    /* 톡 누르기만 하면 선택을 푼다 — 「밖을 눌러 해제」가 몸에 배어 있다. */
    if (rect.w < 1 || rect.h < 1) selectNone(selection);
    else selectRect(selection, rect, mode);
  }

  const endStroke = (event?: PointerEvent): void => {
    panning = null;
    if (picking) {
      if (event) applyPicking(event);
      picking = null;
      selectionChanged();
      return;
    }
    if (!stroke || !strokeBase) { stroke = null; strokeBase = null; return; }
    const layer = activeLayer(doc);
    const cel = layer ? layer.cels[doc.activeFrame] : null;
    stroke.end();
    if (cel) {
      const patch = pixelPatch(cel, strokeBase, tool === 'eraser' ? T('toolEraser', '지우개') : T('toolBrush', '붓'));
      if (patch) history.push(patch);
    }
    stroke = null;
    strokeBase = null;
    renderLayers();
    renderFrames();
  };
  canvas.addEventListener('pointerup', (event: PointerEvent) => endStroke(event));
  canvas.addEventListener('pointercancel', (event: PointerEvent) => endStroke(event));
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  canvas.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    view.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    pick<HTMLElement>('[data-zoom]').textContent = Math.round(view.scale * 100) + '%';
    view.invalidate();
  }, { passive: false });

  const union = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };

  /* ===== 손잡이 ===== */

  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
    button.onclick = () => {
      tool = (button.dataset.tool || 'brush') as ToolId;
      root.querySelectorAll('[data-tool]').forEach(other => other.classList.toggle('active', other === button));
      canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    };
  });

  const brushOut = (): void => {
    (['size', 'hardness', 'opacity', 'flow', 'smoothing'] as const).forEach(key => {
      const input = pick<HTMLInputElement>('[data-brush="' + key + '"]');
      input.value = String(brush[key]);
      const out = root.querySelector('[data-out="' + key + '"]') as HTMLElement;
      out.textContent = key === 'size' ? String(Math.round(brush.size)) : brush[key].toFixed(2);
    });
  };
  root.querySelectorAll<HTMLInputElement>('[data-brush]').forEach(input => {
    input.oninput = () => {
      const key = input.dataset.brush as 'size' | 'hardness' | 'opacity' | 'flow' | 'smoothing';
      brush = { ...brush, [key]: Number(input.value) };
      brushOut();
    };
  });
  brushOut();

  pick<HTMLInputElement>('[data-color]').oninput = (event) => {
    const rgba = parseHex((event.target as HTMLInputElement).value);
    if (rgba) brush.color = [rgba[0], rgba[1], rgba[2]];
  };

  pick<HTMLInputElement>('[data-name]').oninput = (event) => {
    doc.name = (event.target as HTMLInputElement).value;
  };

  pick<HTMLInputElement>('[data-fps]').onchange = (event) => {
    doc.fps = Math.max(1, Math.min(60, Number((event.target as HTMLInputElement).value) || 12));
    (event.target as HTMLInputElement).value = String(doc.fps);
  };

  pick<HTMLInputElement>('[data-onion]').onchange = (event) => {
    const on = (event.target as HTMLInputElement).checked;
    onionBefore = on ? 2 : 0;
    onionAfter = on ? 1 : 0;
    repaint();
  };

  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-layer]').forEach(input => {
    input.onchange = () => {
      const layer = activeLayer(doc);
      if (!layer) return;
      const key = (input as HTMLElement).dataset.layer;
      if (key === 'opacity') {
        history.run(fieldChange(layer, 'opacity', Number((input as HTMLInputElement).value), T('layerOpacity', '불투명도'), 'opacity:' + layer.id));
      } else if (key === 'blend') {
        history.run(fieldChange(layer, 'blend', (input as HTMLSelectElement).value as BlendMode, T('blend', '섞기')));
      } else if (key === 'clip') {
        history.run(fieldChange(layer, 'clip', (input as HTMLInputElement).checked, T('clip', '아래에 끼우기')));
      }
      repaint();
      renderLayers();
    };
    if (input instanceof HTMLInputElement && input.type === 'range') {
      input.oninput = () => {
        const layer = activeLayer(doc);
        if (!layer) return;
        layer.opacity = Number(input.value);
        repaint();
      };
    }
  });

  const actions: Record<string, () => void> = {
    'new': () => {
      if (!confirm(T('confirmNew', '지금 그림을 버리고 새로 시작할까?'))) return;
      doc = createDoc(1024, 1024, T('untitled', '새 그림'));
      history.clear();
      reflowDoc();
    },
    'new-pixel': () => {
      if (!confirm(T('confirmNew', '지금 그림을 버리고 새로 시작할까?'))) return;
      doc = createPixelDoc(32, 16, T('untitledSprite', '새 도트'));
      history.clear();
      reflowDoc();
    },
    'undo': () => { if (history.undo()) { renderLayers(); renderFrames(); repaint(); } },
    'redo': () => { if (history.redo()) { renderLayers(); renderFrames(); repaint(); } },
    'fit': () => { view.fit(); pick<HTMLElement>('[data-zoom]').textContent = Math.round(view.scale * 100) + '%'; view.invalidate(); },
    'add-layer': () => { addLayer(doc); renderLayers(); repaint(); },
    'del-layer': () => {
      if (doc.activeLayer && removeLayer(doc, doc.activeLayer)) { renderLayers(); repaint(); }
      else say(T('lastLayer', '마지막 한 장은 못 지운다'));
    },
    'merge-layer': () => {
      if (doc.activeLayer && mergeDown(doc, doc.activeLayer, (d, f, only) => composite(d, f, only))) {
        renderLayers(); renderFrames(); repaint();
      } else say(T('noLayerBelow', '아래에 붙일 레이어가 없다'));
    },
    'add-frame': () => {
      insertFrame(doc, doc.activeFrame + 1, true);
      setFrameCount(doc, doc.frames);
      renderFrames(); renderLayers(); repaint();
    },
    'del-frame': () => {
      if (removeFrame(doc, doc.activeFrame)) { renderFrames(); renderLayers(); repaint(); }
      else say(T('lastFrame', '마지막 한 장은 못 지운다'));
    },
    'play': () => {
      if (playing) { clearInterval(playing); playing = 0; pick<HTMLElement>('[data-act="play"]').textContent = '▶'; return; }
      if (doc.frames < 2) { say(T('needFrames', '프레임이 두 장 이상이어야 논다')); return; }
      pick<HTMLElement>('[data-act="play"]').textContent = '■';
      playing = window.setInterval(() => {
        doc.activeFrame = (doc.activeFrame + 1) % doc.frames;
        renderFrames();
        repaint();
      }, 1000 / doc.fps);
    },
    'clear-selection': () => {
      const layer = canDraw();
      if (!layer) return;
      const cel = ensureCel(doc, layer, doc.activeFrame);
      const before = cloneSurface(cel);
      clearInside(cel, selection);
      const patch = pixelPatch(cel, before, T('clearSelection', '고른 자리 지우기'));
      if (patch) history.push(patch);
      renderLayers(); renderFrames(); repaint();
    },
    'feather-selection': () => {
      if (isEmpty(selection)) return;
      feather(selection, 3);
      selectionChanged();
      say(T('feathered', '가장자리를 부드럽게 했다'));
    },
    'deselect': () => { selectNone(selection); selectionChanged(); },
    'pick-palette': () => {
      doc.palette = extractPalette(flat, 16);
      renderPalette();
      say(t('imageedit.paletteTaken', { n: String(doc.palette.length) }, '그림에서 색 {n}개를 뽑았다'));
    },
    'save-png': () => {
      surfaceToCanvas(composite(doc, doc.activeFrame)).toBlob(blob => {
        if (blob) download(blob, safeName(doc.name) + '.png');
      }, 'image/png');
    },
    'save-sheet': () => {
      const scale = doc.grid > 0 ? 1 : 1;
      surfaceToCanvas(spriteSheet(doc, undefined, scale)).toBlob(blob => {
        if (blob) download(blob, safeName(doc.name) + '-' + doc.frames + 'f.png');
      }, 'image/png');
    },
    'save-project': () => {
      /* 픽셀 그림은 옛 Ditherdeck 형식으로도 내보낸다 — 그 도구로도 계속 열린다. */
      if (doc.grid > 0) {
        const project = ditherdeckFromDoc(doc, (d, f) => composite(d, f));
        download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), safeName(doc.name) + '.ditherdeck.json');
        say(T('savedProject', '프로젝트를 저장했다'));
        return;
      }
      say(T('projectPixelOnly', '지금은 픽셀 그림만 프로젝트로 저장된다 — 그림은 PNG 로'));
    }
  };
  root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(button => {
    button.onclick = () => actions[button.dataset.act || '']?.();
  });

  pick<HTMLInputElement>('[data-open]').onchange = async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      if (/json$/i.test(file.name)) {
        const raw = JSON.parse(await file.text());
        if (!isDitherdeckProject(raw)) { say(T('badProject', '읽을 수 없는 파일이다')); return; }
        doc = docFromDitherdeck(raw, 24);
        history.clear();
        reflowDoc();
        say(T('openedProject', '옛 Ditherdeck 그림을 열었다'));
        return;
      }
      const bitmap = await createImageBitmap(file);
      doc = createDoc(bitmap.width, bitmap.height, file.name.replace(/\.[^.]+$/, ''));
      const layer = doc.layers[0];
      layer.cels[0] = imageToSurface(bitmap, bitmap.width, bitmap.height);
      layer.name = T('layerPhoto', '사진');
      history.clear();
      reflowDoc();
      say(T('openedImage', '그림을 열었다'));
    } catch {
      say(T('openFailed', '열지 못했다'));
    }
  };

  /* 단축키 — 입력칸에 글자를 치는 중이면 안 가로챈다. */
  const keydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (!root.isConnected) return;
    if (event.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; return; }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      actions[event.shiftKey ? 'redo' : 'undo']();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'a') { event.preventDefault(); selectAll(selection); selectionChanged(); return; }
    if ((event.ctrlKey || event.metaKey) && key === 'd') { event.preventDefault(); selectNone(selection); selectionChanged(); return; }
    if ((event.ctrlKey || event.metaKey) && key === 'i') { event.preventDefault(); invertSelection(selection); selectionChanged(); return; }
    if (key === 'delete' || key === 'backspace') { event.preventDefault(); actions['clear-selection'](); return; }
    const map: Record<string, ToolId> = { b: 'brush', e: 'eraser', f: 'fill', i: 'pick', m: 'marquee', l: 'lasso', w: 'wand' };
    if (map[key]) {
      tool = map[key];
      root.querySelectorAll<HTMLElement>('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
    }
    if (key === '[') { brush = { ...brush, size: Math.max(1, brush.size - 2) }; brushOut(); }
    if (key === ']') { brush = { ...brush, size: Math.min(200, brush.size + 2) }; brushOut(); }
  };
  const keyup = (event: KeyboardEvent): void => {
    if (event.code === 'Space') { spaceDown = false; canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair'; }
  };
  document.addEventListener('keydown', keydown);
  document.addEventListener('keyup', keyup);

  /* 창 크기에 맞춘다. */
  const fitViewport = (): void => {
    const rect = wrap.getBoundingClientRect();
    view.resizeViewport(Math.max(120, rect.width), Math.max(120, rect.height), window.devicePixelRatio || 1);
    view.paint();
  };
  const observer = new ResizeObserver(fitViewport);
  observer.observe(wrap);

  canvas.style.cursor = 'crosshair';
  requestAnimationFrame(() => { fitViewport(); reflowDoc(); pick<HTMLElement>('[data-zoom]').textContent = Math.round(view.scale * 100) + '%'; });

  Toolbox.onDispose?.(() => {
    if (playing) clearInterval(playing);
    if (ants) clearInterval(ants);
    observer.disconnect();
    view.dispose();
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  });
}

function injectStyles(): void {
  if (document.getElementById('imagestudio-style')) return;
  const style = document.createElement('style');
  style.id = 'imagestudio-style';
  style.textContent = [
    '.ies{--ies-gap:8px;display:flex;flex-direction:column;height:min(78vh,820px);min-height:520px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;font-size:12px}',
    '.ies *{box-sizing:border-box}',
    '.ies button{border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);border-radius:6px;padding:5px 8px;cursor:pointer;font-size:12px}',
    '.ies button:hover{border-color:var(--accent,#4f7cff)}',
    '.ies button.active{border-color:var(--accent,#4f7cff);background:color-mix(in srgb,var(--accent,#4f7cff) 18%,transparent)}',
    '.ies-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bg-secondary);border-bottom:1px solid var(--border);flex-wrap:wrap}',
    '.ies-logo{letter-spacing:.18em;font-size:11px;color:var(--text-tertiary)}',
    '.ies-name{flex:0 1 180px;min-width:90px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;padding:5px 7px}',
    '.ies-sep{width:1px;height:20px;background:var(--border)}',
    '.ies-file{border:1px solid var(--border);background:var(--bg-tertiary);border-radius:6px;padding:5px 8px;cursor:pointer}',
    '.ies-status{margin-left:auto;color:var(--text-tertiary);font-size:11px}',
    '.ies-body{flex:1;display:grid;grid-template-columns:76px minmax(0,1fr) 216px;min-height:0}',
    '.ies-tools{display:flex;flex-direction:column;gap:5px;padding:8px;background:var(--bg-secondary);border-right:1px solid var(--border);overflow:auto}',
    '.ies-tools button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;line-height:1.1}',
    '.ies-tools small{font-size:9px;color:var(--text-tertiary);white-space:nowrap}',
    '.ies-tools svg{width:19px;height:19px}',
    '.ies-tools button.active svg{color:var(--accent,#4f7cff)}',
    '.ies-tools hr{width:100%;border:0;border-top:1px solid var(--border);margin:4px 0}',
    '.ies-tools input[type=color]{width:100%;height:30px;padding:0;border:1px solid var(--border);border-radius:6px;background:none}',
    '.ies-palette{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}',
    '.ies-swatch{aspect-ratio:1;padding:0;border-radius:4px}',
    '.ies-mini{font-size:10px!important;padding:5px 4px!important;line-height:1.25;white-space:normal}',
    '.ies-stage{display:flex;flex-direction:column;min-width:0;min-height:0}',
    '.ies-brush{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--bg-secondary);flex-wrap:wrap}',
    '.ies-brush label{display:flex;align-items:center;gap:5px;color:var(--text-secondary)}',
    '.ies-brush input[type=range]{width:74px}',
    '.ies-brush b{min-width:26px;color:var(--text-tertiary);font-weight:500}',
    '.ies-zoom{margin-left:auto;color:var(--text-tertiary)}',
    '.ies-selbar{display:flex;gap:4px}',
    '.ies-selbar button[disabled]{opacity:.35;cursor:default}',
    '.ies-canvas{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--bg-primary);background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--border) 60%,transparent) 1px,transparent 0);background-size:18px 18px}',
    '.ies-canvas canvas{position:absolute;inset:0;touch-action:none}',
    '.ies-timeline{display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--border);background:var(--bg-secondary)}',
    '.ies-timeline label{display:flex;align-items:center;gap:4px;color:var(--text-secondary)}',
    '.ies-timeline input[type=number]{width:52px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:5px;padding:3px 5px}',
    '.ies-frames{flex:1;display:flex;gap:5px;overflow-x:auto;padding:2px}',
    '.ies-frame{padding:2px;display:flex;flex-direction:column;align-items:center;gap:1px}',
    '.ies-frame canvas{width:34px;height:34px;image-rendering:pixelated;background:#fff;border-radius:3px}',
    '.ies-frame small{font-size:9px;color:var(--text-tertiary)}',
    '.ies-layers{display:flex;flex-direction:column;background:var(--bg-secondary);border-left:1px solid var(--border);min-height:0}',
    '.ies-layer-head{display:flex;align-items:center;gap:4px;padding:8px}',
    '.ies-layer-head b{flex:1;font-size:11px;letter-spacing:.1em;color:var(--text-tertiary)}',
    '.ies-layer-props{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px;border-bottom:1px solid var(--border)}',
    '.ies-layer-props label{display:flex;align-items:center;gap:6px;color:var(--text-secondary)}',
    '.ies-layer-props input[type=range]{flex:1}',
    '.ies-layer-props select{flex:1;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:5px;padding:3px}',
    '.ies-layer-list{flex:1;overflow:auto;padding:6px}',
    '.ies-layer{display:flex;align-items:center;gap:5px;padding:4px;border:1px solid transparent;border-radius:6px;cursor:pointer}',
    '.ies-layer.active{border-color:var(--accent,#4f7cff);background:color-mix(in srgb,var(--accent,#4f7cff) 12%,transparent)}',
    '.ies-layer canvas{width:34px;height:34px;background:#fff;border-radius:4px;image-rendering:pixelated}',
    '.ies-layer-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ies-eye,.ies-lock{padding:2px 3px!important;border-color:transparent!important;background:none!important;font-size:10px;color:var(--text-tertiary);opacity:.8}',
    '@media(max-width:860px){.ies-body{grid-template-columns:60px minmax(0,1fr)}.ies-layers{grid-column:1/-1;border-left:0;border-top:1px solid var(--border);max-height:210px}.ies{height:auto}}'
  ].join('');
  document.head.append(style);
}

(function register(): void {
  if (typeof Toolbox === 'undefined') return;
  const icon = '<rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/>'
    + '<path d="M7 15l3.2-4.2 2.4 3 2-2.4L18 15" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'
    + '<circle cx="9" cy="8" r="1.4" fill="currentColor"/>';
  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('imagestudio') || {}),
    id: 'imagestudio',
    category: 'tool',
    layout: 'full',
    icon,
    tabs: [{
      id: 'imagestudio-main',
      label: t('imageedit.tab.studio', undefined, '스튜디오'),
      build(container: HTMLElement): void {
        void loadNamespace('imageedit').then(() => buildStudio(container));
      }
    }]
  });
})();
