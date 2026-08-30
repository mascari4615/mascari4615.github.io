/**
 * 먹. 그림 화면 (TASK-KL-240, 2b)
 *
 * 문서 모델(`doc`), 합성(`composite`), 붓(`brush`), 픽셀(`pixel`)을 사람 손에 잇는 자리.
 * 여기서만 DOM 을 안다. 아래 파일들은 계속 브라우저를 모른다.
 *
 * 화면은 네 칸이다: 왼쪽 도구, 가운데 그림, 오른쪽 레이어, 아래 타임라인.
 * 그림을 다시 그리는 길은 **하나**(`repaint`)뿐이다. 붓질 중에는 더러워진 사각형만 다시 섞고,
 * 레이어를 바꾸면 전체를 다시 섞는다. 두 경우가 같은 함수를 지나므로 화면이 어긋날 수 없다.
 */

import { loadNamespace, t } from '../../lib/i18n';
// 내려주기, 굽기는 공용 한 자리(`tools/shared/image`). 여기 있던 지역 download 는 그것과 같은 네 줄이었다.
import { download, encode } from '../tools/shared/image';
import { intervalWhileVisible } from '../../lib/tick';
import { Stroke, defaultBrush, pickColor, type BrushSettings } from './brush';
import { composite, compositeAll, spriteSheet } from './composite';
/* GIF 인코더. 약속만 여기서 받고 코드는 늦게 온다. 이미지 묶음이 `tools/gifenc` 를 같이 실으므로
   먹이 뜬 시점에는 이미 와 있다 (`widgets-lazy-meta.ts` 의 image 묶음 lazyScriptPaths). */
import { getKarmoGif } from '../../lib/karmogif';
import { encodeApng } from './apng';
import { injectStyles } from './styles';
import { meokMarkup } from './markup';
import { EMOTE_PRESETS, emoteName, fitBox, findPreset, limitRatio, overBudgetHint, type EmotePreset } from './emote';
import {
  BLEND_MODES, activeLayer, addLayer, celAt, cloneSurface, createDoc, createSurface,
  ensureCel, findLayer, insertFrame, isHold, mergeDown, moveLayer, removeFrame, removeLayer,
  setFrameCount, type BlendMode, type Doc, type Layer, type Surface
} from './doc';
import { History, fieldChange, pixelPatch } from './history';
import { adjust, contentBounds, crop, filter as applyFilter, flip, resize, rotateFree, rotateQuarter, type Adjust, type FilterName } from './ops';
import { createPixelDoc, ditherdeckFromDoc, docFromDitherdeck, extractPalette, floodFill, isDitherdeckProject, parseHex, toHex } from './pixel';
import {
  clearInside, createSelection, edgePixels, feather, invert as invertSelection, isEmpty,
  magicWand, selectAll, selectNone, selectPolygon, selectRect,
  type SelectMode, type Selection
} from './selection';
import { removeBackground } from './rembg';
import { isStoredDoc, packDoc, unpackDoc, type StoredDoc } from './storage';
import { CanvasView } from './view';
import { canUpload, setFoundryToken, uploadToFoundry } from '../../lib/foundry';

declare const Toolbox: {
  register(spec: unknown): void;
  getLazyWidgetPublicMeta?(id: string): unknown;
  onDispose?(fn: () => void): void;
  /** 남이 넘긴 파일을 받는 창구 (TASK-KL-238 / 2). 선언(`accepts`)만 하고 안 받으면 빈 화면이 뜬다. */
  onHandoff?(id: string, cb: (file: File) => void): void;
};

type ToolId = 'brush' | 'eraser' | 'fill' | 'pick' | 'pan' | 'marquee' | 'lasso' | 'wand';

const esc = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const T = (key: string, fallback: string): string => t('meok.' + key, undefined, fallback);

/* ===== 판 ↔ 캔버스 ===== */

/** 판을 캔버스로. 저장, 내보내기에서 쓴다. */
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

const safeName = (name: string): string => name.trim().replace(/[^a-z0-9가-힣_-]+/gi, '-') || 'artwork';

/**
 * 글자를 판에 굽는다. 글꼴 그리기는 브라우저만 할 수 있으므로 여기(화면 파일)에 둔다.
 * 새 레이어로 얹으므로, 굳힌 뒤에도 위치, 크기를 레이어째로 옮길 수 있다.
 */
function textSurface(text: string, size: number, color: string, w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.font = '600 ' + size + 'px "Pretendard Variable", Pretendard, system-ui, sans-serif';
  const lines = text.split(String.fromCharCode(10));
  const lineHeight = size * 1.28;
  /* 판 한가운데에 놓는다. 어디에 놓을지는 레이어를 끌어 정하는 게 자연스럽다. */
  let top = Math.max(0, (h - lines.length * lineHeight) / 2);
  lines.forEach(line => {
    const width = ctx.measureText(line).width;
    ctx.fillText(line, Math.max(0, (w - width) / 2), top);
    top += lineHeight;
  });
  const image = ctx.getImageData(0, 0, w, h);
  const surface = createSurface(w, h);
  surface.data.set(image.data);
  return surface;
}

/* ===== 자동 저장 창고 =====
 *
 * localStorage 는 5MB 언저리라 그림 한 장에도 넘친다. IndexedDB 에 접은 문서를 그대로 넣는다.
 * 판 하나(`last`)만 쓴다. 이 브라우저에서 마지막에 그리던 것이 다음에 열 때 그대로 뜨는 것,
 * 그게 여기서 필요한 전부다(여러 판 관리는 파일로 내보내는 쪽이 정직하다).
 */

const DB_NAME = 'meok';
const STORE = 'docs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLast(stored: StoredDoc): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(stored, 'last');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadLast(): Promise<StoredDoc | null> {
  const db = await openDb();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get('last');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return isStoredDoc(value) ? (value as StoredDoc) : null;
}

/* ===== 화면 ===== */

function buildMeok(container: HTMLElement): void {
  let doc: Doc = createDoc(1024, 1024, T('untitled', '새 그림'));
  /* 되돌리기 300 단계, 그리고 무게로 512MB. 개수만 두면 큰 판에서 터진다 (2048^2 전면 필터
     하나가 전과 후 두 벌로 32MB). 무게가 넘으면 오래된 것부터 버리고 한 단계는 남긴다. */
  const history = new History(300, 900, 512 * 1024 * 1024);
  let brush: BrushSettings = defaultBrush();
  let tool: ToolId = 'brush';
  let onionBefore = 0;
  let onionAfter = 0;
  /** 프레임 넘겨 보기를 멈추는 함수 (`lib/tick`). 보이는 동안만 돈다. 그리기만 하는 시계다. */
  let stopPlaying: (() => void) | null = null;
  let stroke: Stroke | null = null;
  let panning: { x: number; y: number } | null = null;
  let spaceDown = false;
  let selection: Selection = createSelection(doc.w, doc.h);
  /* 고르는 중인 몸짓. 사각형은 시작점, 올가미는 지나온 점들. */
  let picking: { from: { x: number; y: number }; points: Array<{ x: number; y: number }> } | null = null;
  /** 고른 자리 점선(개미) 애니메이션을 멈추는 함수 (`lib/tick`). 이것도 그리기만 한다. */
  let stopAnts: (() => void) | null = null;

  /* 셸이 준 자리를 그림판까지 전달. 이 한 겹이 안 늘어나면 그림판은 내용 높이로 쪼그라듦.
     이미지 묶음 안 탭이라 위에 `material-shell` 껍질 세 겹. 그중 `.pf-body` 의 `align-items:start`
     에서 세로가 끊김. 껍질은 다른 묶음도 쓰므로 **먹 탭일 때만** 잇는다. */
  container.classList.add('meok-host');
  const page = container.closest('.tool-page') as HTMLElement | null;
  page?.classList.add('meok-page');
  Toolbox.onDispose?.(() => { page?.classList.remove('meok-page'); });
  container.innerHTML = meokMarkup();

  injectStyles();

  const root = container.querySelector('.meok') as HTMLElement;
  const pick = <T extends HTMLElement>(selector: string): T => root.querySelector(selector) as T;
  const canvas = pick<HTMLCanvasElement>('[data-canvas]');
  const wrap = pick<HTMLElement>('[data-canvas-wrap]');
  const status = pick<HTMLElement>('[data-status]');
  const view = new CanvasView(canvas, doc.w, doc.h);
  /* 화면에 보이는 합성 결과. 붓질 중에는 이 판의 더러워진 자리만 다시 섞는다. */
  let flat: Surface = createSurface(doc.w, doc.h);

  const say = (message: string): void => { status.textContent = message; };
  /** 확대율 표시. 판 크기가 바뀌면 화면 맞춤도 바뀌므로 한 곳에서만 적는다. */
  const syncZoom = (): void => { pick<HTMLElement>('[data-zoom]').textContent = Math.round(view.scale * 100) + '%'; };

  /* ===== 그리기 한 길 ===== */

  function repaint(rect?: { x: number; y: number; w: number; h: number }): void {
    /* 어니언스킨을 켜도 사각형만 다시 섞는다. `composite` 가 유령도 그 사각형 안에서만 그리므로
       밖으로 번질 자리가 없다. 예전에는 여기서 전체로 돌렸고, 그래서 **애니를 그리는 동안**
       (곧 어니언을 켜 두는 그 시간에) 붓질마다 판 전체가 다시 섞였다. */
    composite(doc, doc.activeFrame, undefined, {
      into: flat,
      rect,
      onionBefore, onionAfter
    });
    view.blit(flat, rect);
    view.invalidate();
  }

  /** 고른 자리가 바뀌면 테두리와 개미 시계가 따라온다. 한 길로만 지나가게 묶어 둔다. */
  function selectionChanged(): void {
    view.setSelectionEdges(edgePixels(selection));
    if (stopAnts) { stopAnts(); stopAnts = null; }
    if (view.hasSelectionEdges) {
      stopAnts = intervalWhileVisible(() => { view.antPhase += 1; view.invalidate(); }, 120);
    }
    const empty = isEmpty(selection);
    root.querySelectorAll<HTMLButtonElement>('[data-needs-selection]').forEach(button => { button.disabled = empty; });
    syncMaskButtons();
    view.invalidate();
  }

  /** 가림막이 있는 레이어에서만 뒤집기, 굳히기, 없애기가 눌린다. */
  /* ===== 이모트 ===== */

  let emotePreset: EmotePreset = EMOTE_PRESETS[0];
  let shotTimer = 0;

  /** 규격 고르는 줄. 고른 것이 미리보기와 뽑기에 그대로 이어진다. */
  function renderEmotePicks(): void {
    const box = pick<HTMLElement>('[data-emote-picks]');
    box.innerHTML = EMOTE_PRESETS.map(preset =>
      '<button data-emote-pick="' + preset.id + '"' + (preset.id === emotePreset.id ? ' class="active"' : '') + '>'
      + esc(T('emote.' + preset.id, preset.label)) + '</button>'
    ).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-emote-pick]').forEach(button => {
      button.onclick = () => {
        emotePreset = findPreset(button.dataset.emotePick || '');
        renderEmotePicks();
        renderEmoteShots();
      };
    });
  }

  /**
   * 올라갈 크기 그대로 미리 보기. 28 에서 뭉개진 것을 **올린 뒤에** 아는 것이 이모트 만드는
   * 사람의 가장 흔한 낭비. 굽는 것은 지금 프레임 하나뿐 (장수만큼 구우면 손이 끊김).
   */
  function renderEmoteShots(): void {
    const box = pick<HTMLElement>('[data-emote-shots]');
    const note = pick<HTMLElement>('[data-emote-note]');
    box.innerHTML = '';
    const baked = composite(doc, doc.activeFrame);
    const source = surfaceToCanvas(baked);
    emotePreset.sizes.forEach(size => {
      const fit = fitBox(doc.w, doc.h, size);
      const shot = document.createElement('canvas');
      shot.width = fit.w;
      shot.height = fit.h;
      const ctx = shot.getContext('2d');
      if (ctx) {
        /* 격자 그림은 뭉개면 안 된다. 그 외에는 부드럽게 줄이는 쪽이 실물에 가깝다. */
        ctx.imageSmoothingEnabled = doc.grid === 0;
        ctx.drawImage(source, 0, 0, fit.w, fit.h);
      }
      const cell = document.createElement('div');
      cell.className = 'meok-emote-shot';
      shot.style.width = fit.w + 'px';
      shot.style.height = fit.h + 'px';
      cell.appendChild(shot);
      const caption = document.createElement('small');
      caption.textContent = fit.w + 'x' + fit.h;
      cell.appendChild(caption);
      box.appendChild(cell);
    });
    note.textContent = T('emote.' + emotePreset.id + '.note', emotePreset.note);
  }

  function syncMaskButtons(): void {
    const layer = activeLayer(doc);
    const has = !!(layer && layer.mask);
    root.querySelectorAll<HTMLButtonElement>('[data-needs-mask]').forEach(button => { button.disabled = !has; });
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
    syncZoom();
    renderLayers();
    renderFrames();
    renderPalette();
    renderEmotePicks();
    renderEmoteShots();
    repaint();
  }

  /* ===== 레이어 패널 ===== */

  function renderLayers(): void {
    const list = pick<HTMLElement>('[data-layers]');
    list.innerHTML = '';
    /* 목록 뒤가 화면 위. 사람이 보는 순서는 반대다. */
    [...doc.layers].reverse().forEach(layer => {
      const row = document.createElement('div');
      row.className = 'meok-layer' + (layer.id === doc.activeLayer ? ' active' : '');
      row.innerHTML =
        '<button class="meok-eye" title="' + esc(T('toggleVisible', '보이기/숨기기')) + '">' + (layer.visible ? '●' : '○') + '</button>' +
        '<canvas class="meok-thumb" width="40" height="40"></canvas>' +
        '<span class="meok-layer-name" title="' + esc(T('renameHelp', '두 번 누르면 이름 고치기')) + '">' + esc(layer.name)
         + (layer.mask ? ' <b class="meok-maskmark" title="' + esc(T('hasMask', '가림막이 걸려 있다')) + '">◐</b>' : '') + '</span>' +
        '<button class="meok-lock" title="' + esc(T('toggleLock', '잠그기')) + '">' + (layer.locked ? '🔒' : '○') + '</button>';
      const thumb = row.querySelector('canvas') as HTMLCanvasElement;
      const cel = celAt(layer, doc.activeFrame);
      if (cel) {
        const ctx = thumb.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(surfaceToCanvas(cel), 0, 0, 40, 40);
      }
      (row.querySelector('.meok-eye') as HTMLElement).onclick = (event) => {
        event.stopPropagation();
        history.run(fieldChange(layer, 'visible', !layer.visible, T('toggleVisible', '보이기/숨기기')));
        renderLayers(); repaint();
      };
      (row.querySelector('.meok-lock') as HTMLElement).onclick = (event) => {
        event.stopPropagation();
        layer.locked = !layer.locked;
        renderLayers();
      };
      const nameEl = row.querySelector('.meok-layer-name') as HTMLElement;
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
      /* ★ **끌기밖에 없으면 못 쓰는 사람이 생긴다** (2026-08-17). 레이어 순서 바꾸기가
         끌기 하나뿐이었다. 키보드만 쓰는 사람, 손떨림, 트랙패드에서 끌기가 힘든 사람은
         순서를 아예 못 바꾼다(WCAG 2.2 끌기 동작. 끌기에는 한 번 누름으로 되는 길이 같이 있어야 한다).
         같은 저장소의 pdf 장 순서 바꾸기는 이미 화살표를 함께 두고 있다. 그 꼴을 맞춘다. */
      row.tabIndex = 0;
      row.onkeydown = (event) => {
        const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const at = doc.layers.findIndex(l => l.id === layer.id);
        const to = at + step;
        if (to < 0 || to >= doc.layers.length) return;
        if (moveLayer(doc, layer.id, to)) {
          doc.activeLayer = layer.id;
          renderLayers();
          repaint();
          /* 옮긴 줄에 초점을 다시 준다. 안 그러면 한 번 옮기고 나서 키가 안 먹는다. */
          const again = list.querySelector(`[data-layer="${layer.id}"]`);
          if (again instanceof HTMLElement) again.focus();
        }
      };
      row.dataset.layer = layer.id;
      row.title = `${row.title || ''}, 위/아래 화살표로 순서 바꾸기`.trim();
      list.append(row);
    });
    syncLayerProps();
    syncMaskButtons();
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
      button.className = 'meok-frame' + (f === doc.activeFrame ? ' active' : '');
      const held = doc.layers.every(layer => isHold(layer, f));
      button.innerHTML = '<canvas width="34" height="34"></canvas><small>' + (f + 1) + (held && f > 0 ? ', ' : '') + '</small>';
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
      swatch.className = 'meok-swatch';
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
      /* Shift = 더하기, Alt = 빼기. 포토샵과 같은 손버릇. */
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
        touched();
      }
      return;
    }
    /* 붓, 지우개. 획이 끝날 때 한 단계로 굳는다. */
    /* 원본 사본은 `Stroke` 가 이미 하나 들고 있다 (`stroke.base`). 여기서 또 뜨면 획 하나에
       판이 두 장 뜬다 (4096^2 이면 128MB). 되돌리기 패치도 그 한 장을 기준으로 만든다. */
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
      /* 끄는 동안 보이는 테두리. 아직 확정 아니다(놓을 때 굳는다). */
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

  /** Shift = 더하기, Alt = 빼기, 둘 다 = 교집합. */
  const pickMode = (event: { shiftKey: boolean; altKey: boolean }): SelectMode =>
    (event.shiftKey && event.altKey) ? 'intersect' : event.shiftKey ? 'add' : event.altKey ? 'subtract' : 'replace';

  /** 끄는 중 미리보기. 확정과 같은 함수를 쓰되 되돌리기에는 안 쌓는다. */
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
    /* 톡 누르기만 하면 선택을 푼다. 밖을 눌러 해제가 몸에 배어 있다. */
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
    if (!stroke) return;
    const layer = activeLayer(doc);
    const cel = layer ? layer.cels[doc.activeFrame] : null;
    const before = stroke.base;
    stroke.end();
    if (cel) {
      const patch = pixelPatch(cel, before, tool === 'eraser' ? T('toolEraser', '지우개') : T('toolBrush', '붓'));
      if (patch) history.push(patch);
    }
    stroke = null;
    renderLayers();
    renderFrames();
    touched();
  };
  canvas.addEventListener('pointerup', (event: PointerEvent) => endStroke(event));
  canvas.addEventListener('pointercancel', (event: PointerEvent) => endStroke(event));
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  canvas.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    view.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    syncZoom();
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
  renderPresets();
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

  /* ===== 붓 담아 두기 =====
   * 굵기, 단단함, 짙기, 흐름, 손떨림을 매번 다시 맞추는 것이 그리기에서 제일 지겨운 일이다.
   * 그림은 무거워 IndexedDB 로 갔지만, 붓 설정은 작으므로 localStorage 로 충분하다.
   */
  const PRESET_KEY = 'meok:brushes:v1';
  interface Preset { name: string; brush: BrushSettings }
  const loadPresets = (): Preset[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(item => item && item.name && item.brush).slice(0, 12) : [];
    } catch { return []; }
  };
  const savePresets = (presets: Preset[]): void => {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch { /* 꽉 찼으면 그냥 못 담는다 */ }
  };
  function renderPresets(): void {
    const box = pick<HTMLElement>('[data-presets]');
    box.innerHTML = '';
    loadPresets().forEach(preset => {
      const button = document.createElement('button');
      button.textContent = preset.name;
      button.title = T('brushApply', '이 붓으로 바꾸기. 오래 누르면 지운다');
      button.onclick = () => {
        brush = { ...brush, ...preset.brush, color: brush.color };
        brushOut();
        say(preset.name);
      };
      button.oncontextmenu = (event) => {
        event.preventDefault();
        savePresets(loadPresets().filter(item => item.name !== preset.name));
        renderPresets();
      };
      box.append(button);
    });
  }

  /* ===== 자동 저장 =====
   * 손을 뗄 때마다 바로 쓰면 큰 그림에서 화면이 끊긴다. **쉬는 순간**에 한 번만 쓴다.
   */
  let saveTimer = 0;
  let saving = false;
  /* 쓰는 중에 또 바뀌었나. 그러면 다 쓴 뒤 **한 번 더** 쓴다.
     예전엔 이 경우를 그냥 버렸다(재시도 없음). 화면엔 저장됨이 떠 있는데 마지막 획만
     빠진 판이 남아, 새로고침해야 알 수 있었다. 실브라우저 검사가 이걸 잡았다. */
  let dirtyAgain = false;
  function writeNow(): void {
    if (saving) { dirtyAgain = true; return; }
    saving = true;
    dirtyAgain = false;
    void saveLast(packDoc(doc))
      .then(() => { savedMark(); })
      .catch(() => { say(T('saveFailed', '자동 저장이 막혔다. 파일로 내보내 두는 게 좋다')); })
      .then(() => {
        saving = false;
        if (dirtyAgain) writeNow();
      });
  }
  function touched(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { saveTimer = 0; writeNow(); }, 1200);
    /* 이모트 미리보기는 **펴 놓았을 때만** 다시 굽는다. 접힌 것을 굽는 것은 버리는 시간.
       획마다 굽지 않고 저장과 같은 박자로 미룸. */
    if (shotTimer) clearTimeout(shotTimer);
    const panel = root.querySelector<HTMLDetailsElement>('.meok-emote');
    if (panel && panel.open) shotTimer = window.setTimeout(() => { shotTimer = 0; renderEmoteShots(); }, 400);
  }
  const savedMark = (): void => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    say(t('meok.savedAt', { time: hh + ':' + mm }, '{time} 에 저장됨'));
  };

  /* ===== 고치기 ===== */

  /**
   * 크기가 바뀌는 연산은 **문서 전체**에 건다. 레이어마다 크기가 다르면 합성이 성립하지 않는다.
   * 되돌리기는 셀 배열을 통째로 들고 있는다(자르기 한 번 = 판 한 장 값. 붓질과 달리 드물다).
   */
  function transformDoc(label: string, fn: (surface: Surface) => Surface, size: (w: number, h: number) => [number, number]): void {
    const oldW = doc.w; const oldH = doc.h;
    const [nextW, nextH] = size(oldW, oldH);
    const before = doc.layers.map(layer => layer.cels.slice());
    const beforeMasks = doc.layers.map(layer => layer.mask);
    const after = doc.layers.map(layer => layer.cels.map(cel => (cel ? fn(cel) : null)));
    /* 레이어 마스크도 같이 옮긴다. 안 그러면 판만 잘리고 가림막은 옛 크기로 남아 어긋난다. */
    const afterMasks = doc.layers.map((layer, index) => {
      if (!layer.mask) return null;
      const wrapped = createSurface(oldW, oldH);
      for (let p = 0; p < layer.mask.length; p += 1) wrapped.data[p * 4 + 3] = layer.mask[p];
      const moved = fn(wrapped);
      const out = new Uint8ClampedArray(moved.w * moved.h);
      for (let p = 0; p < out.length; p += 1) out[p] = moved.data[p * 4 + 3];
      return index >= 0 ? out : null;
    });
    const put = (cels: Array<Array<Surface | null>>, masks: Array<Uint8ClampedArray | null>, w: number, h: number): void => {
      doc.w = w; doc.h = h;
      doc.layers.forEach((layer, index) => { layer.cels = cels[index].slice(); layer.mask = masks[index]; });
      selection = createSelection(doc.w, doc.h);
      flat = createSurface(doc.w, doc.h);
      view.resizeDoc(doc.w, doc.h);
      selectionChanged();
      view.fit();
      syncZoom();
      renderLayers(); renderFrames(); repaint();
      touched();
    };
    history.run({
      label,
      redo: () => put(after, afterMasks, nextW, nextH),
      undo: () => put(before, beforeMasks, oldW, oldH)
    });
  }

  /** 색만 바꾸는 연산은 **활성 레이어의 지금 셀**에만 건다(선택영역이 있으면 그 안만). */
  function paintOp(label: string, fn: (surface: Surface) => Surface): void {
    const layer = canDraw();
    if (!layer) return;
    const cel = ensureCel(doc, layer, doc.activeFrame);
    const before = cloneSurface(cel);
    const next = fn(cel);
    cel.data.set(next.data);
    const patch = pixelPatch(cel, before, label);
    if (patch) history.push(patch);
    renderLayers(); renderFrames(); repaint();
    touched();
  }

  /** 보정 슬라이더 지금 값. */
  const adjustValues = (): Adjust => ({
    brightness: Number(pick<HTMLInputElement>('[data-adjust="brightness"]').value),
    contrast: Number(pick<HTMLInputElement>('[data-adjust="contrast"]').value),
    saturation: Number(pick<HTMLInputElement>('[data-adjust="saturation"]').value),
    hue: Number(pick<HTMLInputElement>('[data-adjust="hue"]').value)
  });
  const noAdjust = (values: Adjust): boolean =>
    !values.brightness && !values.contrast && !values.saturation && !values.hue;
  /** 미리보기. 굳히기 전까지는 원본을 안 건드린다. */
  let adjustBase: { layerId: string; frame: number; surface: Surface } | null = null;

  function previewAdjust(): void {
    const layer = activeLayer(doc);
    if (!layer) return;
    const cel = ensureCel(doc, layer, doc.activeFrame);
    if (!adjustBase || adjustBase.layerId !== layer.id || adjustBase.frame !== doc.activeFrame) {
      adjustBase = { layerId: layer.id, frame: doc.activeFrame, surface: cloneSurface(cel) };
    }
    const values = adjustValues();
    const next = noAdjust(values) ? adjustBase.surface : adjust(adjustBase.surface, values, selectionMask());
    cel.data.set(next.data);
    repaint();
  }

  function resetAdjustSliders(): void {
    root.querySelectorAll<HTMLInputElement>('[data-adjust]').forEach(input => { input.value = '0'; });
  }

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
    'undo': () => { if (history.undo()) { renderLayers(); renderFrames(); repaint(); touched(); } },
    'redo': () => { if (history.redo()) { renderLayers(); renderFrames(); repaint(); touched(); } },
    'fit': () => { view.fit(); syncZoom(); view.invalidate(); },
    /* 전체화면. 도구 화면째 던진다 (timer, arcade 와 같은 손). 나올 때 화면 맞춤은 ResizeObserver 가 한다. */
    'fullscreen': () => {
      const page = (root.closest('.tool-page') || root) as HTMLElement;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void page.requestFullscreen?.();
    },
    'add-layer': () => { addLayer(doc); renderLayers(); repaint(); touched(); },
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
      renderFrames(); renderLayers(); repaint(); touched();
    },
    'del-frame': () => {
      if (removeFrame(doc, doc.activeFrame)) { renderFrames(); renderLayers(); repaint(); }
      else say(T('lastFrame', '마지막 한 장은 못 지운다'));
    },
    'play': () => {
      if (stopPlaying) { stopPlaying(); stopPlaying = null; pick<HTMLElement>('[data-act="play"]').textContent = '▶'; return; }
      if (doc.frames < 2) { say(T('needFrames', '프레임이 두 장 이상이어야 논다')); return; }
      pick<HTMLElement>('[data-act="play"]').textContent = '■';
      stopPlaying = intervalWhileVisible(() => {
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
    'mask-from-selection': () => {
      const layer = activeLayer(doc);
      if (!layer) return;
      if (isEmpty(selection)) { say(T('needSelectionMask', '먼저 보일 자리를 골라라')); return; }
      const next = new Uint8ClampedArray(doc.w * doc.h);
      next.set(selection.mask);
      history.run(fieldChange(layer, 'mask', next, T('maskFromSelection', '가림막')));
      selectNone(selection);
      selectionChanged();
      renderLayers(); repaint(); touched();
    },
    'mask-invert': () => {
      const layer = activeLayer(doc);
      if (!layer || !layer.mask) return;
      const next = new Uint8ClampedArray(layer.mask.length);
      for (let p = 0; p < next.length; p += 1) next[p] = 255 - layer.mask[p];
      history.run(fieldChange(layer, 'mask', next, T('maskInvert', '뒤집기')));
      renderLayers(); repaint(); touched();
    },
    'mask-clear': () => {
      const layer = activeLayer(doc);
      if (!layer || !layer.mask) return;
      history.run(fieldChange(layer, 'mask', null, T('maskClear', '없애기')));
      renderLayers(); repaint(); touched();
    },
    'mask-apply': () => {
      const layer = canDraw();
      if (!layer || !layer.mask) return;
      const mask = layer.mask;
      /* 가림막대로 알파를 깎고 가림막은 치운다. 지금 보이는 대로가 그림이 된다. */
      paintOp(T('maskApply', '굳히기'), surface => {
        const out = cloneSurface(surface);
        for (let p = 0; p < mask.length; p += 1) out.data[p * 4 + 3] = surface.data[p * 4 + 3] * (mask[p] / 255);
        return out;
      });
      layer.mask = null;
      renderLayers(); repaint(); touched();
    },
    'add-text': () => {
      const text = prompt(T('textPrompt', '넣을 글 (줄바꿈 가능)'), '');
      if (!text || !text.trim()) return;
      const size = Math.max(8, Math.round(doc.h / 10));
      const color = pick<HTMLInputElement>('[data-color]').value;
      const layer = addLayer(doc, text.trim().slice(0, 18));
      layer.cels[doc.activeFrame] = textSurface(text, size, color, doc.w, doc.h);
      /* 글자는 **레이어 한 장**이다. 나중에 옮기고 지우고 섞기 위해. */
      renderLayers(); renderFrames(); repaint(); touched();
      say(T('textAdded', '글자를 새 레이어로 얹었다'));
    },
    'add-image': () => {
      pick<HTMLInputElement>('[data-place]').click();
    },
    'rotate-free': () => {
      const answer = prompt(T('rotateFreePrompt', '몇 도 돌릴까? (-180 ~ 180)'), '15');
      const degrees = Number(answer);
      if (!answer || !isFinite(degrees) || !degrees) return;
      const smooth = doc.grid <= 0;
      /* 돌리면 판이 커진다. 새 크기를 미리 재서 문서에 알려 준다. */
      const rad = (degrees * Math.PI) / 180;
      const nextW = Math.ceil(Math.abs(doc.w * Math.cos(rad)) + Math.abs(doc.h * Math.sin(rad)));
      const nextH = Math.ceil(Math.abs(doc.w * Math.sin(rad)) + Math.abs(doc.h * Math.cos(rad)));
      transformDoc(T('rotateFreeLabel', '기울여 돌리기'), surface => rotateFree(surface, degrees, smooth), () => [nextW, nextH]);
    },
    'brush-save': () => {
      const name = prompt(T('brushSavePrompt', '이 붓 설정을 무슨 이름으로 둘까?'), T('brushDefaultName', '내 붓'));
      if (!name || !name.trim()) return;
      const presets = loadPresets().filter(preset => preset.name !== name.trim()).slice(0, 11);
      presets.unshift({ name: name.trim(), brush: { ...brush } });
      savePresets(presets);
      renderPresets();
      say(T('brushSaved', '붓을 담아 뒀다'));
    },
    'rembg': () => {
      const layer = canDraw();
      if (!layer) return;
      const cel = ensureCel(doc, layer, doc.activeFrame);
      const before = cloneSurface(cel);
      const button = pick<HTMLButtonElement>('[data-act="rembg"]');
      if (button.disabled) return;
      button.disabled = true;
      say(T('rembgStart', '배경을 지우는 중. 처음 한 번은 모델을 받느라 오래 걸린다'));
      void encode(surfaceToCanvas(before), 'png').then(blob => {
        const run = removeBackground(blob, 'isnet_fp16', progress => {
          if (progress.ratio >= 0) {
            say(t('meok.rembgProgress', { percent: String(Math.round(progress.ratio * 100)) }, '배경 지우는 중 {percent}%'));
          }
        });
        void run.promise
          .then(result => createImageBitmap(result))
          .then(bitmap => {
            /* 결과는 배경이 지워진 그림 한 장. 지금 셀에 그대로 덮는다(레이어는 그대로다). */
            const cut = imageToSurface(bitmap, doc.w, doc.h);
            cel.data.set(cut.data);
            const patch = pixelPatch(cel, before, T('rembg', '배경 지우기'));
            if (patch) history.push(patch);
            renderLayers(); renderFrames(); repaint(); touched();
            say(T('rembgDone', '배경을 지웠다'));
          })
          .catch(() => { say(T('rembgFailed', '배경을 못 지웠다. 잠시 뒤 다시')); })
          .then(() => { button.disabled = false; });
      }).catch(() => {
        // 구우려다 실패해도 단추는 돌려준다. 안 돌려주면 그 자리에서 영영 못 누른다.
        button.disabled = false;
        say(T('rembgFailed', '배경을 못 지웠다. 잠시 뒤 다시'));
      });
    },
    'crop-selection': () => {
      const bounds = selection.bounds;
      if (!bounds) { say(T('needSelection', '먼저 자를 자리를 골라라')); return; }
      transformDoc(T('cropToSelection', '고른 자리로 자르기'), surface => crop(surface, bounds), () => [bounds.w, bounds.h]);
    },
    'trim': () => {
      const bounds = contentBounds(flat);
      if (!bounds) { say(T('nothingToTrim', '자를 여백이 없다. 판이 비었다')); return; }
      if (bounds.w === doc.w && bounds.h === doc.h) { say(T('noMargin', '여백이 없다')); return; }
      transformDoc(T('trim', '여백 자르기'), surface => crop(surface, bounds), () => [bounds.w, bounds.h]);
    },
    'resize': () => {
      const answer = prompt(T('resizePrompt', '새 가로 크기(px). 세로는 비율대로 따라간다'), String(doc.w));
      const nextW = Math.round(Number(answer));
      if (!answer || !isFinite(nextW) || nextW < 1 || nextW > 8000) return;
      const nextH = Math.max(1, Math.round(doc.h * (nextW / doc.w)));
      const smooth = doc.grid <= 0;   /* 픽셀 그림은 부드럽게 하면 도트가 죽는다 */
      transformDoc(T('resizeDoc', '크기...'), surface => resize(surface, nextW, nextH, smooth), () => [nextW, nextH]);
    },
    'rot-left': () => transformDoc(T('rotLeft', '왼쪽으로 90도'), surface => rotateQuarter(surface, 3), (w, h) => [h, w]),
    'rot-right': () => transformDoc(T('rotRight', '오른쪽으로 90도'), surface => rotateQuarter(surface, 1), (w, h) => [h, w]),
    'flip-x': () => transformDoc(T('flipX', '좌우 뒤집기'), surface => flip(surface, 'x'), (w, h) => [w, h]),
    'flip-y': () => transformDoc(T('flipY', '상하 뒤집기'), surface => flip(surface, 'y'), (w, h) => [w, h]),
    'adjust-apply': () => {
      const values = adjustValues();
      if (noAdjust(values)) { say(T('nothingToAdjust', '움직인 손잡이가 없다')); return; }
      const base = adjustBase;
      /* 미리보기로 이미 화면이 바뀌어 있다. 원본을 되돌린 뒤 한 단계로 굳힌다. */
      const layer = activeLayer(doc);
      if (base && layer) {
        const cel = ensureCel(doc, layer, doc.activeFrame);
        cel.data.set(base.surface.data);
      }
      adjustBase = null;
      paintOp(T('adjustLabel', '색 보정'), surface => adjust(surface, values, selectionMask()));
      resetAdjustSliders();
    },
    'adjust-reset': () => {
      const layer = activeLayer(doc);
      if (adjustBase && layer) {
        const cel = ensureCel(doc, layer, doc.activeFrame);
        cel.data.set(adjustBase.surface.data);
      }
      adjustBase = null;
      resetAdjustSliders();
      renderLayers(); repaint();
    },
    'pick-palette': () => {
      doc.palette = extractPalette(flat, 16);
      renderPalette();
      say(t('meok.paletteTaken', { n: String(doc.palette.length) }, '그림에서 색 {n}개를 뽑았다'));
    },
    'save-png': () => {
      void encode(surfaceToCanvas(composite(doc, doc.activeFrame)), 'png')
        .then(blob => download(blob, safeName(doc.name) + '.png'));
    },
    'to-shelf': () => {
      // 선반은 남의 기계(노트북)가 받는다. 열쇠가 없으면 넣는 자리를 먼저 알려 준다 . 
      // 눌렀다가 권한 없음을 보는 것보다 낫다(본과 같은 결).
      if (!canUpload()) {
        const key = window.prompt(T('shelfKeyAsk', '선반 열쇠 (이 브라우저에만 남는다)'), '') ?? '';
        if (!key.trim()) return;
        setFoundryToken(key.trim());
      }
      void encode(surfaceToCanvas(composite(doc, doc.activeFrame)), 'png').then(blob => {
        say(T('shelfSending', '선반에 올리는 중...'));
        void blob.arrayBuffer()
          .then(buffer => uploadToFoundry({
            tool: 'meok',
            title: doc.name || T('untitled', '새 그림'),
            mime: 'image/png',
            bytes: new Uint8Array(buffer)
          }))
          .then(item => say(T('shelfDone', '선반에 올렸다') + '. ' + item.title))
          .catch(error => say(String(error instanceof Error ? error.message : error)));
      });
    },
    'save-sheet': () => {
      const scale = doc.grid > 0 ? 1 : 1;
      void encode(surfaceToCanvas(spriteSheet(doc, undefined, scale)), 'png')
        .then(blob => download(blob, safeName(doc.name) + '-' + doc.frames + 'f.png'));
    },
    /**
     * 프레임을 움직이는 GIF 한 장으로. 굽는 재료는 `compositeAll` 이 내놓는 그림 그대로,
     * 즉 화면과 저장물이 어긋날 자리 없음. 속도는 타임라인의 초당 값.
     *
     * 인코더는 `window.KarmoGif` 로 늦게 옴. 못 받았으면 그 사실을 말한다. 몰래 기다리면
     * 누른 뒤 몇 초 있다 반응하는 버튼이 됨.
     */
    'save-gif': () => {
      const gif = getKarmoGif();
      if (!gif) { say(T('gifNoEncoder', 'GIF 만드는 것을 아직 못 받았다. 잠시 뒤 다시')); return; }
      if (doc.frames < 2) { say(T('gifNeedsFrames', '프레임이 두 장은 있어야 움직인다')); return; }
      const button = root.querySelector<HTMLButtonElement>('[data-act="save-gif"]');
      if (button) button.disabled = true;
      const delayMs = Math.max(20, Math.round(1000 / Math.max(1, doc.fps)));
      /* 긴 변 상한. 인코딩 시간이 픽셀 수를 따라 가파르게 는다 (같은 기계 3프레임 실측:
         512^2 1.4초, 1024^2 9.9초). 512 로 줄여 구우면 1024^2 문서 3프레임이 5.1초
         (합성 2.0 + 줄이기 2.1 + 인코딩 1.0). GIF 는 움직이는 것을 보여 주는 그림이라
         512 면 충분하고, 원본 크기가 필요하면 PNG 와 시트가 그 자리에 있다. */
      const LONG_EDGE = 512;
      const long = Math.max(doc.w, doc.h);
      const scale = long > LONG_EDGE ? LONG_EDGE / long : 1;
      const outW = Math.max(1, Math.round(doc.w * scale));
      const outH = Math.max(1, Math.round(doc.h * scale));
      say(scale < 1 ? T('gifShrunk', '굽는 중') + ' ' + outW + 'x' + outH : T('gifBaking', '굽는 중'));
      /* 굽기 전에 한 번 쉰다. 안 그러면 위 문구가 화면에 못 뜨고 바로 긴 계산에 들어간다. */
      setTimeout(() => {
        const frames = compositeAll(doc).map(surface => ({
          data: (scale < 1 ? resize(surface, outW, outH, doc.grid === 0) : surface).data,
          delayMs
        }));
        void gif.encodeAsync({
          width: outW, height: outH, frames,
          onProgress: ratio => say(T('gifBaking', '굽는 중') + ' ' + Math.round(ratio * 100) + '%')
        }).then(blob => {
          download(blob, safeName(doc.name) + '.gif');
          say(T('gifDone', 'GIF 나왔다') + ' ' + Math.round(blob.size / 1024) + 'KB');
        }).catch(() => {
          say(T('gifFailed', 'GIF 를 못 구웠다'));
        }).finally(() => {
          if (button) button.disabled = false;
        });
      }, 0);
    },
    /**
     * 움직이는 PNG. GIF 와 재료도 상한도 같고 형식만 다름.
     * GIF 는 색 256개에 투명이 켜짐과 꺼짐 둘뿐이라 반투명 가장자리가 계단.
     * APNG 는 그 가장자리를 그대로 들고 감. 대신 파일이 큼.
     */
    'save-apng': () => {
      if (doc.frames < 2) { say(T('gifNeedsFrames', '프레임이 두 장은 있어야 움직인다')); return; }
      const button = root.querySelector<HTMLButtonElement>('[data-act="save-apng"]');
      if (button) button.disabled = true;
      const delayMs = Math.max(20, Math.round(1000 / Math.max(1, doc.fps)));
      const long = Math.max(doc.w, doc.h);
      const scale = long > 512 ? 512 / long : 1;
      const outW = Math.max(1, Math.round(doc.w * scale));
      const outH = Math.max(1, Math.round(doc.h * scale));
      say(T('gifBaking', '굽는 중') + (scale < 1 ? ' ' + outW + 'x' + outH : ''));
      setTimeout(() => {
        const frames = compositeAll(doc).map(surface => ({
          data: (scale < 1 ? resize(surface, outW, outH, doc.grid === 0) : surface).data,
          delayMs
        }));
        void encodeApng({
          width: outW, height: outH, frames,
          onProgress: ratio => say(T('gifBaking', '굽는 중') + ' ' + Math.round(ratio * 100) + '%')
        }).then(blob => {
          download(blob, safeName(doc.name) + '.png');
          say(T('apngDone', 'APNG 나왔다') + ' ' + Math.round(blob.size / 1024) + 'KB');
        }).catch(() => {
          say(T('apngFailed', 'APNG 를 못 구웠다'));
        }).finally(() => {
          if (button) button.disabled = false;
        });
      }, 0);
    },
    /**
     * 고른 규격대로 한 벌 뽑는다. 장이 하나면 멈춘 PNG, 둘 이상이면 규격이 정한 움직이는 형식.
     * 크기마다 파일 하나씩, 사이는 조금 띄움 (한꺼번에 내리면 브라우저가 뒤엣것을 막는다).
     * 뽑은 뒤에는 **실제 용량**을 한도와 나란히 적는다. 어림이 아니라 올라갈 그 파일의 크기.
     */
    'emote-save': () => {
      const button = root.querySelector<HTMLButtonElement>('[data-act="emote-save"]');
      if (button) button.disabled = true;
      const preset = emotePreset;
      const animated = doc.frames > 1;
      const format = animated ? preset.animated : 'png';
      const delayMs = Math.max(20, Math.round(1000 / Math.max(1, doc.fps)));
      const base = safeName(doc.name);
      const report: string[] = [];
      say(T('emoteBaking', '뽑는 중'));

      /* 원본은 **한 번만** 굽는다. 크기마다 다시 구우면 1024^2 세 장을 세 번 섞게 되고,
         그동안 손이 멈춘다 (Twitch 세 크기에서 합성 3회가 1회로). 줄이는 것만 크기마다. */
      const baked = animated ? compositeAll(doc) : [composite(doc, doc.activeFrame)];

      const bakeOne = async (size: number): Promise<void> => {
        const fit = fitBox(doc.w, doc.h, size);
        const smooth = doc.grid === 0;
        if (!animated) {
          const one = resize(baked[0], fit.w, fit.h, smooth);
          const blob = await encode(surfaceToCanvas(one), 'png');
          report.push(size + ': ' + Math.round(blob.size / 1024) + 'KB');
          download(blob, emoteName(base, size, 'png', preset.sizes.length));
          return;
        }
        const frames = baked.map(surface => ({
          data: resize(surface, fit.w, fit.h, smooth).data,
          delayMs
        }));
        let blob: Blob;
        if (format === 'apng') {
          blob = await encodeApng({ width: fit.w, height: fit.h, frames });
        } else {
          const gif = getKarmoGif();
          if (!gif) throw new Error('no gif encoder');
          blob = await gif.encodeAsync({ width: fit.w, height: fit.h, frames });
        }
        const over = overBudgetHint(blob.size, doc.frames, preset, true);
        report.push(size + ': ' + Math.round(blob.size / 1024) + 'KB'
          + (limitRatio(blob.size, preset, true) > 1 ? ' ' + T('emoteOver', '한도 넘음') : ''));
        if (over) say(over);
        download(blob, emoteName(base, size, format, preset.sizes.length));
      };

      void (async () => {
        try {
          for (const size of preset.sizes) {
            say(T('emoteBaking', '뽑는 중') + ' ' + size);
            await bakeOne(size);
            /* 사이를 띄운다. 브라우저가 잇단 내려받기를 막는 자리다. */
            await new Promise(resolve => { setTimeout(resolve, 350); });
          }
          const limit = Math.round((animated ? preset.limitAnimated : preset.limitStill) / 1024);
          say(report.join(', ') + ' (' + T('emoteLimit', '한도') + ' ' + limit + 'KB)');
        } catch {
          say(T('emoteFailed', '이모트를 못 뽑았다'));
        } finally {
          if (button) button.disabled = false;
        }
      })();
    },
    'save-meok': () => {
      const stored = packDoc(doc);
      download(new Blob([JSON.stringify(stored)], { type: 'application/json' }), safeName(doc.name) + '.meok');
      say(T('savedFile', '파일로 내보냈다'));
    },
    'save-project': () => {
      /* 픽셀 그림은 옛 Ditherdeck 형식으로도 내보낸다. 그 도구로도 계속 열린다. */
      if (doc.grid > 0) {
        const project = ditherdeckFromDoc(doc, (d, f) => composite(d, f));
        download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), safeName(doc.name) + '.ditherdeck.json');
        say(T('savedProject', '프로젝트를 저장했다'));
        return;
      }
      say(T('projectPixelOnly', '지금은 픽셀 그림만 프로젝트로 저장된다. 그림은 PNG 로'));
    }
  };
  /* 필터. 이름만 있으면 되므로 표로 그린다. 세기는 반씩(약하게 두 번 = 사람이 쓰는 법). */
  const FILTERS: Array<[FilterName, string, string]> = [
    ['grayscale', '흑백', '1'], ['sepia', '세피아', '1'], ['invert', '반전', '1'],
    ['blur', '흐리게', '1'], ['sharpen', '선명하게', '1'], ['edge', '윤곽', '1'],
    ['emboss', '돋을새김', '1'], ['posterize', '포스터', '0.5']
  ];
  const filterBox = pick<HTMLElement>('[data-filters]');
  FILTERS.forEach(entry => {
    const button = document.createElement('button');
    button.textContent = T('filter.' + entry[0], entry[1]);
    button.onclick = () => paintOp(
      T('filter.' + entry[0], entry[1]),
      surface => applyFilter(surface, entry[0], Number(entry[2]), selectionMask())
    );
    filterBox.append(button);
  });

  root.querySelectorAll<HTMLInputElement>('[data-adjust]').forEach(input => {
    input.oninput = previewAdjust;
  });

  root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(button => {
    button.onclick = () => actions[button.dataset.act || '']?.();
  });

  /* 이모트 판 첫 그림. `reflowDoc` 은 새 그림과 파일 열기에서만 돌아 첫 진입을 못 덮음.
     미리보기는 접혀 있으면 안 굽고, 펴는 순간 굽는다. */
  renderEmotePicks();
  const emotePanel = root.querySelector<HTMLDetailsElement>('.meok-emote');
  if (emotePanel) {
    emotePanel.ontoggle = () => { if (emotePanel.open) renderEmoteShots(); };
  }

  pick<HTMLInputElement>('[data-open]').onchange = async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      if (/json$/i.test(file.name)) {
        const raw = JSON.parse(await file.text());
        if (isStoredDoc(raw)) {
          doc = unpackDoc(raw as StoredDoc);
          history.clear();
          reflowDoc();
          say(T('openedMeok', '그리던 그림을 열었다'));
          return;
        }
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

  /**
   * 그림 한 장을 **새 레이어로** 얹는다 (TASK-KL-238 / 2 photopea).
   *
   * 파일 고르기 말고 **다른 도구가 넘겨 준 것**도 같은 길로 들어온다. 예전엔 이 일이 `onchange`
   * 안에만 있어서, 이미지 편집이 넘긴 그림은 받을 손이 없었다(먹은 `accepts: image/*` 라고
   * 적어 두고도 실제로는 안 받았다 = 눌러도 빈 화면). 선언과 실물은 같아야 한다.
   */
  const placeImageFile = async (file: File): Promise<void> => {
    try {
      const bitmap = await createImageBitmap(file);
      /* 판보다 크면 판에 맞춰 줄인다. 붙였는데 화면 밖이면 붙인 줄도 모른다. */
      const scale = Math.min(1, doc.w / bitmap.width, doc.h / bitmap.height);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const placed = createSurface(doc.w, doc.h);
      const piece = imageToSurface(bitmap, w, h);
      const ox = Math.floor((doc.w - w) / 2);
      const oy = Math.floor((doc.h - h) / 2);
      for (let y = 0; y < h; y += 1) {
        placed.data.set(piece.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * doc.w + ox) * 4);
      }
      const layer = addLayer(doc, file.name.replace(/\.[^.]+$/, '').slice(0, 18));
      layer.cels[doc.activeFrame] = placed;
      renderLayers(); renderFrames(); repaint(); touched();
      say(T('imagePlaced', '그림을 새 레이어로 얹었다'));
    } catch {
      say(T('openFailed', '열지 못했다'));
    }
  };

  pick<HTMLInputElement>('[data-place]').onchange = async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    await placeImageFile(file);
  };

  /* 남이 넘긴 그림도 같은 자리로 (TASK-KL-238 / 2). 이어서 줄에서 먹을 고르면 여기로 온다. */
  Toolbox.onHandoff?.('meok', (file: File) => {
    if (file.type.startsWith('image/')) void placeImageFile(file);
  });

  /* 단축키. 입력칸에 글자를 치는 중이면 안 가로챈다. */
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
  requestAnimationFrame(() => {
    fitViewport();
    reflowDoc();
    syncZoom();
    /* 지난번에 그리던 것을 되살린다. 새로고침 한 번에 다 날아가는 게 이 도구의 제일 아픈 구멍이었다. */
    void loadLast().then(stored => {
      if (!stored || !root.isConnected) return;
      try {
        doc = unpackDoc(stored);
        history.clear();
        reflowDoc();
        syncZoom();
        say(T('restored', '지난번에 그리던 그림을 되살렸다'));
      } catch {
        say(T('restoreFailed', '지난 그림을 되살리지 못했다. 새 판으로 시작한다'));
      }
    }).catch(() => undefined);
  });

  Toolbox.onDispose?.(() => {
    /* 다른 도구로 넘어가는 순간에도 아직 안 쓴 것이 있으면 지금 쓴다. */
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; writeNow(); }
    if (stopPlaying) stopPlaying();
    if (stopAnts) stopAnts();
    observer.disconnect();
    view.dispose();
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  });
}


(function register(): void {
  if (typeof Toolbox === 'undefined') return;
  const icon = '<rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/>'
    + '<path d="M7 15l3.2-4.2 2.4 3 2-2.4L18 15" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'
    + '<circle cx="9" cy="8" r="1.4" fill="currentColor"/>';
  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta?.('meok') || {}),
    id: 'meok',
    category: 'image',
    layout: 'full',
    icon,
    tabs: [{
      id: 'meok-main',
      label: t('meok.tab.meok', undefined, '먹'),
      build(container: HTMLElement): void {
        void loadNamespace('meok').then(() => buildMeok(container));
      }
    }]
  });
})();
