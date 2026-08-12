/**
 * 「먹」 — 저장 (TASK-KL-240 · 6단계)
 *
 * 그림 도구에서 제일 아픈 구멍은 기능이 아니라 **새로고침하면 다 날아가는 것**이다.
 * 그래서 문서를 통째로 바이트로 접었다 펴는 길을 둔다. 두 곳에 쓴다:
 *   ① 자동 저장(브라우저 안 IndexedDB) — 아무것도 안 눌러도 다음에 열면 그대로
 *   ② 파일로 내보내기(`.meok`) — 다른 기기로 옮기거나 남에게 준다
 *
 * 픽셀은 PNG 로 굽지 않는다 — 그러면 이 파일이 캔버스(브라우저)를 알아야 하고, 화면 없이
 * 검사할 수 없다. 대신 **같은 색이 이어지면 묶는(RLE)** 아주 단순한 방식으로 접는다.
 * 도트 그림·단색 배경에서 특히 잘 접히고(수십 배), 사진에서도 원본보다 커지지 않는다
 * (묶이지 않으면 「그대로 두기」 조각으로 흘려보낸다).
 *
 * 브라우저를 모른다 — IndexedDB 를 부르는 쪽은 화면 파일이다.
 */

import { createSurface, type BlendMode, type Doc, type Layer, type Surface } from './doc';

/** 접은 판 한 장. */
export type Packed = Uint8Array;

/**
 * RLE 로 접는다.
 *  - `1..127`  = 같은 픽셀이 n번 (뒤에 픽셀 1개)
 *  - `129..255`= 서로 다른 픽셀이 (n-128)개 (뒤에 픽셀 그만큼)
 *  - `0`       = 안 쓴다
 */
export function packSurface(surface: Surface): Packed {
  const src = surface.data;
  const count = surface.w * surface.h;
  /* 최악(전부 다른 색)이라도 원본 + 조각 머리만큼만 커지게 잡는다. */
  const out = new Uint8Array(count * 4 + Math.ceil(count / 127) + 8);
  let at = 0;
  let p = 0;
  const same = (a: number, b: number): boolean =>
    src[a * 4] === src[b * 4] && src[a * 4 + 1] === src[b * 4 + 1]
    && src[a * 4 + 2] === src[b * 4 + 2] && src[a * 4 + 3] === src[b * 4 + 3];

  while (p < count) {
    let run = 1;
    while (run < 127 && p + run < count && same(p, p + run)) run += 1;
    if (run > 1) {
      out[at++] = run;
      out.set(src.subarray(p * 4, p * 4 + 4), at);
      at += 4;
      p += run;
      continue;
    }
    /* 안 묶이는 구간 — 다음에 「두 개가 같아지는 자리」가 나올 때까지 그대로 흘린다. */
    let literal = 1;
    while (literal < 127 && p + literal < count && !same(p + literal, p + literal - 1)) literal += 1;
    out[at++] = 128 + literal;
    out.set(src.subarray(p * 4, (p + literal) * 4), at);
    at += literal * 4;
    p += literal;
  }
  return out.slice(0, at);
}

export function unpackSurface(packed: Packed, w: number, h: number): Surface {
  const out = createSurface(w, h);
  const count = w * h;
  let at = 0;
  let p = 0;
  while (at < packed.length && p < count) {
    const head = packed[at++];
    if (head === 0) break;
    if (head < 128) {
      const pixel = packed.subarray(at, at + 4);
      at += 4;
      for (let i = 0; i < head && p < count; i += 1, p += 1) out.data.set(pixel, p * 4);
    } else {
      const literal = head - 128;
      for (let i = 0; i < literal && p < count; i += 1, p += 1) {
        out.data.set(packed.subarray(at + i * 4, at + i * 4 + 4), p * 4);
      }
      at += literal * 4;
    }
  }
  return out;
}

/* ===== 문서 통째 ===== */

export interface StoredLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  clip: boolean;
  /** 프레임별 접은 판. `null` = 앞 프레임 유지(hold). */
  cels: Array<Packed | null>;
  mask: Packed | null;
}

export interface StoredDoc {
  /** 뒷날 형식을 바꾸면 이 번호로 가른다 — 옛 저장본을 못 열게 되는 사고를 막는다. */
  version: 1;
  w: number;
  h: number;
  frames: number;
  fps: number;
  grid: number;
  palette: string[];
  name: string;
  activeLayer: string | null;
  activeFrame: number;
  layers: StoredLayer[];
  savedAt: number;
}

export function packDoc(doc: Doc, now = Date.now()): StoredDoc {
  return {
    version: 1,
    w: doc.w, h: doc.h, frames: doc.frames, fps: doc.fps, grid: doc.grid,
    palette: doc.palette.slice(), name: doc.name,
    activeLayer: doc.activeLayer, activeFrame: doc.activeFrame,
    savedAt: now,
    layers: doc.layers.map(layer => ({
      id: layer.id, name: layer.name, visible: layer.visible, locked: layer.locked,
      opacity: layer.opacity, blend: layer.blend, clip: layer.clip,
      cels: layer.cels.map(cel => (cel ? packSurface(cel) : null)),
      /* 마스크는 알파만 있는 판으로 접는다 — 접는 길을 하나로 둔다. */
      mask: layer.mask ? packSurface(maskToSurface(layer.mask, doc.w, doc.h)) : null
    }))
  };
}

const maskToSurface = (mask: Uint8ClampedArray, w: number, h: number): Surface => {
  const surface = createSurface(w, h);
  for (let p = 0; p < mask.length; p += 1) surface.data[p * 4 + 3] = mask[p];
  return surface;
};

/** 저장본이 우리 것인가 — 남의 JSON 을 열어 빈 문서를 내놓지 않게. */
export const isStoredDoc = (raw: unknown): boolean => {
  const value = raw as Partial<StoredDoc>;
  return !!value && value.version === 1 && Array.isArray(value.layers) && typeof value.w === 'number';
};

export function unpackDoc(stored: StoredDoc): Doc {
  const w = Math.max(1, stored.w | 0);
  const h = Math.max(1, stored.h | 0);
  const frames = Math.max(1, stored.frames | 0);
  const layers: Layer[] = stored.layers.map(layer => {
    const cels: Array<Surface | null> = new Array(frames).fill(null);
    layer.cels.slice(0, frames).forEach((cel, index) => {
      cels[index] = cel ? unpackSurface(toBytes(cel), w, h) : null;
    });
    let mask: Uint8ClampedArray | null = null;
    if (layer.mask) {
      const surface = unpackSurface(toBytes(layer.mask), w, h);
      mask = new Uint8ClampedArray(w * h);
      for (let p = 0; p < mask.length; p += 1) mask[p] = surface.data[p * 4 + 3];
    }
    return {
      id: layer.id, name: layer.name,
      visible: layer.visible !== false, locked: !!layer.locked,
      opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
      blend: layer.blend || 'normal', clip: !!layer.clip,
      mask, cels
    };
  });
  if (!layers.length) throw new Error('레이어가 없는 저장본');
  const activeLayer = layers.some(l => l.id === stored.activeLayer) ? stored.activeLayer : layers[0].id;
  return {
    w, h, frames,
    fps: Math.max(1, Math.min(60, stored.fps || 12)),
    grid: Math.max(0, stored.grid | 0),
    palette: Array.isArray(stored.palette) ? stored.palette.slice(0, 32) : [],
    name: String(stored.name || 'untitled'),
    activeLayer,
    activeFrame: Math.max(0, Math.min(frames - 1, stored.activeFrame | 0)),
    layers
  };
}

/** JSON 을 거쳐 오면 바이트가 배열·객체로 풀려 있다 — 어떤 모양이든 바이트로 되돌린다. */
function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (value && typeof value === 'object') {
    const record = value as Record<string, number>;
    const keys = Object.keys(record);
    const out = new Uint8Array(keys.length);
    keys.forEach(key => { out[Number(key)] = record[key]; });
    return out;
  }
  return new Uint8Array(0);
}

/** 접은 문서가 대략 몇 바이트인가 — 「너무 커서 저장 못 함」을 미리 안다. */
export function storedSize(stored: StoredDoc): number {
  let bytes = 256 + stored.name.length * 2;
  stored.layers.forEach(layer => {
    layer.cels.forEach(cel => { if (cel) bytes += cel.length; });
    if (layer.mask) bytes += layer.mask.length;
  });
  return bytes;
}
