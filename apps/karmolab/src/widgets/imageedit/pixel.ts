/**
 * 이미지 편집기 — 픽셀 모드 · Ditherdeck 흡수 (TASK-KL-240 · 4단계 준비)
 *
 * Ditherdeck 은 별도 도구였다. 하지만 그 안에 있던 것 — 프레임 목록 · 어니언스킨 · 팔레트 ·
 * 채우기 · 스프라이트시트 내보내기 — 은 전부 **레이어 문서의 특수한 경우**다.
 * 따로 두면 붓·되돌리기·저장을 두 벌 짓게 되므로, 여기서 문서 모델 쪽으로 끌어온다.
 *
 * 남길 것은 두 가지다:
 *  ① **격자** — 낮은 해상도로 그리되 화면은 크게 본다. 문서는 `doc.grid` 한 값으로 안다.
 *  ② **옛 파일** — 이미 저장해 둔 `.ditherdeck.json` 이 그대로 열려야 한다. 흡수는 삭제가 아니다.
 *
 * 브라우저를 모른다.
 */

import { celAt, createDoc, createSurface, type Doc, type Surface } from './doc';

/* ===== 색 ===== */

/** `#rgb` · `#rrggbb` · `#rrggbbaa` → RGBA. 못 읽으면 null. */
export function parseHex(value: string): [number, number, number, number] | null {
  const hex = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 255];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
  }
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16)
    ];
  }
  return null;
}

const pad2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export const toHex = (r: number, g: number, b: number): string => '#' + pad2(r) + pad2(g) + pad2(b);

/* ===== 채우기 ===== */

/** 두 색이 얼마나 다른가 0..1 (알파까지 본다). */
function difference(data: Uint8ClampedArray, a: number, b: number): number {
  const dr = data[a] - data[b];
  const dg = data[a + 1] - data[b + 1];
  const db = data[a + 2] - data[b + 2];
  const da = data[a + 3] - data[b + 3];
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da) / 510;
}

export interface FillOptions {
  /** 0 = 똑같은 색만, 1 = 전부. */
  tolerance?: number;
  /** 고른 자리(픽셀당 0..255). 주면 그 밖으로는 안 번진다. */
  selection?: Uint8Array | null;
  /** false = 판 전체에서 같은 색을 한꺼번에(이어져 있지 않아도). */
  contiguous?: boolean;
  /** 격자에 맞춰 칸 단위로 채운다(픽셀 모드). */
  grid?: number;
}

/**
 * 페인트통. 바뀐 픽셀 수를 돌려준다(0 = 아무것도 안 바뀜 = 되돌리기 단계 안 늘림).
 * 칠할 자리를 먼저 다 표시하고 **나중에 한꺼번에** 칠한다 — 칠하면서 번지면 자기 색을 따라가
 * 판 전체가 새는 고전 버그가 난다.
 */
export function floodFill(
  surface: Surface,
  x: number,
  y: number,
  color: [number, number, number, number],
  options: FillOptions = {}
): number {
  const g = Math.max(1, (options.grid || 1) | 0);
  const startX = Math.floor(x / g) * g;
  const startY = Math.floor(y / g) * g;
  if (startX < 0 || startY < 0 || startX >= surface.w || startY >= surface.h) return 0;

  const tolerance = Math.max(0, Math.min(1, options.tolerance ?? 0));
  const data = surface.data;
  const seed = (startY * surface.w + startX) * 4;
  const same = (index: number): boolean => difference(data, seed, index * 4) <= tolerance;

  const hit = new Uint8Array(surface.w * surface.h);
  if (options.contiguous === false) {
    for (let p = 0; p < hit.length; p += 1) if (same(p)) hit[p] = 1;
  } else {
    /* 칸(격자) 단위로 번진다 — 픽셀 모드에서 한 칸이 반쪽만 칠해지지 않게. */
    const stack: Array<[number, number]> = [[startX, startY]];
    const seen = new Set<number>();
    while (stack.length) {
      const spot = stack.pop() as [number, number];
      const cx = spot[0]; const cy = spot[1];
      if (cx < 0 || cy < 0 || cx >= surface.w || cy >= surface.h) continue;
      const key = cy * surface.w + cx;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!same(key)) continue;
      for (let dy = 0; dy < g && cy + dy < surface.h; dy += 1) {
        for (let dx = 0; dx < g && cx + dx < surface.w; dx += 1) hit[(cy + dy) * surface.w + cx + dx] = 1;
      }
      stack.push([cx + g, cy], [cx - g, cy], [cx, cy + g], [cx, cy - g]);
    }
  }

  let changed = 0;
  const selection = options.selection && options.selection.length === hit.length ? options.selection : null;
  for (let p = 0; p < hit.length; p += 1) {
    if (!hit[p]) continue;
    if (selection && selection[p] < 128) continue;
    const i = p * 4;
    if (data[i] === color[0] && data[i + 1] === color[1] && data[i + 2] === color[2] && data[i + 3] === color[3]) continue;
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = color[3];
    changed += 1;
  }
  return changed;
}

/* ===== 옛 Ditherdeck 파일 ===== */

export interface DitherdeckProject {
  name: string;
  size: number;
  fps: number;
  /** 프레임마다 `size × size` 칸 색(빈 칸은 빈 문자열). */
  frames: string[][];
  palette: string[];
}

const DITHER_SIZES = [8, 12, 16, 24, 32];

/** 옛 파일이 맞나 — 얼렁뚱땅 열어서 빈 문서를 내놓지 않게. */
export const isDitherdeckProject = (raw: unknown): boolean => {
  const value = raw as Partial<DitherdeckProject>;
  return !!value && Array.isArray(value.frames) && typeof value.size === 'number';
};

/**
 * `.ditherdeck.json` → 문서.
 * 칸 하나가 화면에서 너무 작지 않게 `cell` 배로 키운다(16칸 그림이 512px 판이 된다).
 */
export function docFromDitherdeck(raw: Partial<DitherdeckProject>, cell = 32): Doc {
  const size = DITHER_SIZES.includes(Number(raw.size)) ? Number(raw.size) : 16;
  const zoom = Math.max(1, cell | 0);
  const frames = Array.isArray(raw.frames) && raw.frames.length ? raw.frames : [[]];
  const doc = createDoc(size * zoom, size * zoom, String(raw.name || 'sprite'));
  doc.grid = zoom;
  doc.fps = Math.min(24, Math.max(1, Number(raw.fps) || 8));
  doc.palette = (Array.isArray(raw.palette) ? raw.palette : []).filter(c => !!parseHex(c));
  doc.frames = frames.length;
  const layer = doc.layers[0];
  layer.name = 'pixels';
  layer.cels = new Array(frames.length).fill(null);

  frames.forEach((frame, index) => {
    /* 옛 파일의 프레임은 서로 독립이다 — `ensureCel` 로 만들면 앞 프레임을 물려받아(hold)
       빈 칸이 앞 그림으로 메워진다. 그래서 빈 판을 직접 깐다. */
    const surface = createSurface(doc.w, doc.h);
    layer.cels[index] = surface;
    for (let cy = 0; cy < size; cy += 1) {
      for (let cx = 0; cx < size; cx += 1) {
        const rgba = parseHex(String((frame || [])[cy * size + cx] || ''));
        if (!rgba) continue;
        for (let y = 0; y < zoom; y += 1) {
          for (let x = 0; x < zoom; x += 1) {
            const i = ((cy * zoom + y) * surface.w + cx * zoom + x) * 4;
            surface.data[i] = rgba[0]; surface.data[i + 1] = rgba[1];
            surface.data[i + 2] = rgba[2]; surface.data[i + 3] = rgba[3];
          }
        }
      }
    }
  });
  return doc;
}

/**
 * 문서 → `.ditherdeck.json`. 옛 도구로도 계속 열리게(흡수는 가둠이 아니다).
 * 격자 한 칸의 **왼쪽 위 픽셀 색**을 그 칸 색으로 본다.
 */
export function ditherdeckFromDoc(doc: Doc, composite: (doc: Doc, frame: number) => Surface): DitherdeckProject {
  const zoom = Math.max(1, doc.grid || 1);
  const size = Math.max(1, Math.round(doc.w / zoom));
  const frames: string[][] = [];
  for (let f = 0; f < doc.frames; f += 1) {
    const flat = composite(doc, f);
    const cells: string[] = [];
    for (let cy = 0; cy < size; cy += 1) {
      for (let cx = 0; cx < size; cx += 1) {
        const i = ((cy * zoom) * flat.w + cx * zoom) * 4;
        cells.push(flat.data[i + 3] < 8 ? '' : toHex(flat.data[i], flat.data[i + 1], flat.data[i + 2]));
      }
    }
    frames.push(cells);
  }
  return {
    name: doc.name,
    size,
    fps: Math.min(24, Math.max(1, doc.fps)),
    frames,
    palette: doc.palette.slice(0, 16)
  };
}

/** 새 픽셀 문서 — 칸 수로 만든다(px 가 아니라). */
export function createPixelDoc(cells = 32, cell = 16, name = 'sprite'): Doc {
  const doc = createDoc(cells * cell, cells * cell, name);
  doc.grid = cell;
  doc.palette = ['#18222d', '#f4e8cf', '#ff4f88', '#ffc857', '#4cc9a4', '#4f7cff'];
  return doc;
}

/** 그림에 실제로 쓰인 색을 뽑아 팔레트를 만든다(많이 쓴 순). */
export function extractPalette(surface: Surface, max = 16): string[] {
  const tally = new Map<string, number>();
  for (let i = 0; i < surface.data.length; i += 4) {
    if (surface.data[i + 3] < 8) continue;
    const key = toHex(surface.data[i], surface.data[i + 1], surface.data[i + 2]);
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(entry => entry[0]);
}

/** 격자 한 칸을 통째로 칠한다(픽셀 모드에서 붓 대신 쓰는 최소 동작). */
export function setCell(surface: Surface, doc: Doc, cx: number, cy: number, rgba: [number, number, number, number]): void {
  const g = Math.max(1, doc.grid || 1);
  for (let y = cy * g; y < (cy + 1) * g && y < surface.h; y += 1) {
    for (let x = cx * g; x < (cx + 1) * g && x < surface.w; x += 1) {
      const i = (y * surface.w + x) * 4;
      surface.data[i] = rgba[0]; surface.data[i + 1] = rgba[1];
      surface.data[i + 2] = rgba[2]; surface.data[i + 3] = rgba[3];
    }
  }
}

export { celAt, createSurface };
