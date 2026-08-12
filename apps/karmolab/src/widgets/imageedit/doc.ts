/**
 * 이미지 편집기 — 문서 모델 (TASK-KL-240 · 1단계)
 *
 * 지금까지 이 위젯은 **캔버스 한 장**이었다. 자르기도 필터도 배경제거도 그 한 장을 덮어썼고,
 * 그래서 되돌리기가 화면 통짜 스냅샷이었다. 포토샵·클립스튜디오와 가르는 것은 도구 개수가
 * 아니라 여기 있는 것 — **레이어 · 마스크 · 셀(cel)** 이다. 도구는 그 위에 얹힌다.
 *
 * 이 파일은 **브라우저를 모른다**. document·canvas 를 안 쓰고 픽셀을 그냥 `Uint8ClampedArray`
 * 로 든다(RGBA, straight alpha). 그래서 화면 없이도 검사할 수 있고, 나중에 워커·OffscreenCanvas
 * 로 옮겨도 이 모델은 그대로다.
 *
 * 애니메이션은 별도 구조가 아니라 **레이어 안의 셀 배열**이다.
 * `cels[frame] === null` = 「앞 프레임 그대로」(hold). 배경처럼 안 움직이는 레이어는 셀 하나만
 * 들고 60프레임을 버틴다 — ditherdeck 의 프레임 목록도 이 모델의 특수 경우(레이어 1장)다.
 */

/** 겹칠 때 섞는 방식. CSS/포토샵과 같은 이름을 쓴다. */
export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

export const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'
];

/** 픽셀 한 판. RGBA 8비트 · straight alpha(색이 알파로 미리 곱해져 있지 않다). */
export interface Surface {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** 잠근 레이어는 붓·필터가 거부한다(합성에는 그대로 참여). */
  locked: boolean;
  /** 0..1 */
  opacity: number;
  blend: BlendMode;
  /** 아래 레이어 모양 안에만 보이기 (클리핑 마스크). */
  clip: boolean;
  /** 레이어 마스크 — 픽셀당 0..255 보이는 정도. 없으면 안 가린다. */
  mask: Uint8ClampedArray | null;
  /** 프레임별 그림. `null` = 앞 프레임 유지. 길이는 문서 프레임 수와 같다. */
  cels: Array<Surface | null>;
}

export interface Doc {
  w: number;
  h: number;
  layers: Layer[];
  /** 프레임 수 (1 = 정지화). */
  frames: number;
  fps: number;
  activeLayer: string | null;
  activeFrame: number;
  /** 픽셀 모드에서 한 칸의 크기(px). 0 = 끔 = 자유 그리기. */
  grid: number;
  /** 인덱스 팔레트(픽셀 모드에서 쓴다). */
  palette: string[];
  name: string;
}

/* ===== 만들기 ===== */

let seq = 0;
/** 레이어 id. 시각이 아니라 순번 — 같은 밀리초에 두 장 만들어도 안 겹친다. */
export const nextId = (prefix = 'L'): string =>
  prefix + (seq += 1).toString(36) + Math.random().toString(36).slice(2, 6);

export function createSurface(w: number, h: number, fill?: [number, number, number, number]): Surface {
  const width = Math.max(1, w | 0);
  const height = Math.max(1, h | 0);
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
    }
  }
  return { w: width, h: height, data };
}

export const cloneSurface = (s: Surface): Surface => ({ w: s.w, h: s.h, data: new Uint8ClampedArray(s.data) });

export function createLayer(doc: Pick<Doc, 'w' | 'h' | 'frames'>, name: string, opts: Partial<Layer> = {}): Layer {
  const cels: Array<Surface | null> = new Array(Math.max(1, doc.frames)).fill(null);
  cels[0] = createSurface(doc.w, doc.h);
  return {
    id: nextId(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    clip: false,
    mask: null,
    cels,
    ...opts
  };
}

export function createDoc(w = 1024, h = 1024, name = 'untitled'): Doc {
  const base: Doc = {
    w: Math.max(1, w | 0), h: Math.max(1, h | 0),
    layers: [], frames: 1, fps: 12,
    activeLayer: null, activeFrame: 0,
    grid: 0, palette: [], name
  };
  const layer = createLayer(base, 'Layer 1');
  base.layers.push(layer);
  base.activeLayer = layer.id;
  return base;
}

/* ===== 셀 읽기 — hold 해석 ===== */

/**
 * 그 프레임에서 **실제로 보이는** 그림.
 * `cels[frame]` 이 비어 있으면 앞으로 거슬러 올라가 가장 가까운 그림을 쓴다(hold).
 * 앞에 아무것도 없으면 `null` — 그 레이어는 그 프레임에 아직 존재하지 않는다.
 */
export function celAt(layer: Layer, frame: number): Surface | null {
  for (let i = Math.min(frame, layer.cels.length - 1); i >= 0; i -= 1) {
    const cel = layer.cels[i];
    if (cel) return cel;
  }
  return null;
}

/** 그 프레임이 앞 그림을 물려받고 있는가(= 자기 그림이 없는가). */
export const isHold = (layer: Layer, frame: number): boolean => !layer.cels[frame];

/**
 * 그 프레임에 **자기 그림**을 만든다 — 물려받고 있었다면 복사해서 끊는다.
 * 붓질 직전에 부른다: 안 그러면 한 획이 여러 프레임을 한꺼번에 바꾼다.
 */
export function ensureCel(doc: Doc, layer: Layer, frame: number): Surface {
  const own = layer.cels[frame];
  if (own) return own;
  const held = celAt(layer, frame);
  const fresh = held ? cloneSurface(held) : createSurface(doc.w, doc.h);
  layer.cels[frame] = fresh;
  return fresh;
}

/* ===== 레이어 다루기 ===== */

export const findLayer = (doc: Doc, id: string | null): Layer | null =>
  id ? doc.layers.find(l => l.id === id) || null : null;

export const activeLayer = (doc: Doc): Layer | null => findLayer(doc, doc.activeLayer);

/** 위에 얹는다(목록 뒤 = 화면 위). `above` 를 주면 그 레이어 바로 위. */
export function addLayer(doc: Doc, name?: string, above?: string): Layer {
  const layer = createLayer(doc, name || 'Layer ' + (doc.layers.length + 1));
  const at = above ? doc.layers.findIndex(l => l.id === above) : -1;
  if (at >= 0) doc.layers.splice(at + 1, 0, layer); else doc.layers.push(layer);
  doc.activeLayer = layer.id;
  return layer;
}

/** 마지막 한 장은 지우지 않는다 — 레이어 0장 문서는 그릴 데가 없다. */
export function removeLayer(doc: Doc, id: string): boolean {
  if (doc.layers.length <= 1) return false;
  const at = doc.layers.findIndex(l => l.id === id);
  if (at < 0) return false;
  doc.layers.splice(at, 1);
  if (doc.activeLayer === id) doc.activeLayer = doc.layers[Math.min(at, doc.layers.length - 1)].id;
  return true;
}

/** 순서 바꾸기. `to` 는 옮긴 **뒤** 기준 자리. */
export function moveLayer(doc: Doc, id: string, to: number): boolean {
  const at = doc.layers.findIndex(l => l.id === id);
  const dest = Math.max(0, Math.min(doc.layers.length - 1, to | 0));
  if (at < 0 || at === dest) return false;
  const picked = doc.layers.splice(at, 1)[0];
  doc.layers.splice(dest, 0, picked);
  return true;
}

/**
 * 위 레이어를 아래 레이어에 눌러 붙인다 — 합성 결과를 아래 셀에 굽는다.
 * 합성은 `composite.ts` 가 하지만 이 파일이 그걸 부르면 두 파일이 서로를 물게 되므로,
 * 합성 함수를 **넘겨받는다**(문서 모델은 계속 아무것도 안 부른다).
 */
export function mergeDown(
  doc: Doc,
  id: string,
  composite: (doc: Doc, frame: number, only: Layer[]) => Surface
): boolean {
  const at = doc.layers.findIndex(l => l.id === id);
  if (at <= 0) return false;
  const upper = doc.layers[at];
  const lower = doc.layers[at - 1];
  const baked: Surface[] = [];
  for (let f = 0; f < doc.frames; f += 1) {
    /* 두 장만 골라 합성한다 — 아래의 아래는 안 섞는다. 밑판의 클리핑은 잠시 푼다. */
    baked.push(composite(doc, f, [{ ...lower, clip: false }, upper]));
  }
  baked.forEach((surface, f) => { lower.cels[f] = surface; });
  lower.mask = null;
  lower.opacity = 1;
  lower.blend = 'normal';
  doc.layers.splice(at, 1);
  if (doc.activeLayer === id) doc.activeLayer = lower.id;
  return true;
}

/* ===== 프레임 다루기 ===== */

export function setFrameCount(doc: Doc, count: number): void {
  const next = Math.max(1, Math.min(512, count | 0));
  doc.layers.forEach(layer => {
    if (next > layer.cels.length) {
      while (layer.cels.length < next) layer.cels.push(null);
    } else {
      layer.cels.length = next;
    }
  });
  doc.frames = next;
  doc.activeFrame = Math.min(doc.activeFrame, next - 1);
}

/** 프레임 한 칸 끼워 넣기. 모든 레이어가 같이 밀린다(셀은 hold 로 비워 둔다). */
export function insertFrame(doc: Doc, at: number, copy = false): void {
  const index = Math.max(0, Math.min(doc.frames, at | 0));
  doc.layers.forEach(layer => {
    const source = copy ? celAt(layer, Math.max(0, index - 1)) : null;
    layer.cels.splice(index, 0, source ? cloneSurface(source) : null);
  });
  doc.frames += 1;
  doc.activeFrame = index;
}

export function removeFrame(doc: Doc, at: number): boolean {
  if (doc.frames <= 1) return false;
  const index = Math.max(0, Math.min(doc.frames - 1, at | 0));
  doc.layers.forEach(layer => {
    /* 지우는 칸이 뒤 칸에게 물려주고 있었다면 그 그림을 뒤 칸으로 옮겨 준다 — 안 그러면
       뒤 칸이 갑자기 더 앞의 그림을 물려받아 그림이 튄다. */
    const own = layer.cels[index];
    if (own && index + 1 < layer.cels.length && !layer.cels[index + 1]) layer.cels[index + 1] = own;
    layer.cels.splice(index, 1);
  });
  doc.frames -= 1;
  doc.activeFrame = Math.min(doc.activeFrame, doc.frames - 1);
  return true;
}
