/**
 * 이미지 편집기 — 선택영역 (TASK-KL-240 · 5단계)
 *
 * 「어디까지 손댈지」를 정하는 것. 이게 없으면 모든 도구가 판 전체에만 걸리고, 그러면
 * 하늘만 어둡게 · 얼굴만 흐리게 같은 실제 작업이 통째로 불가능하다. 포토샵에서 선택영역이
 * 도구가 아니라 **바탕**인 이유다 — 붓·채우기·필터·지우기가 전부 이것을 곱해서 쓴다.
 *
 * 모양은 하나뿐이다: 픽셀당 0..255 의 **가림 정도**(feather 를 주면 가장자리가 부드럽다).
 * 사각형·올가미·마술봉은 전부 이 한 장을 만드는 서로 다른 길일 뿐이다 — 그래서 뒤에 오는
 * 도구는 어떤 방법으로 골랐는지 알 필요가 없다.
 */

import { type Surface } from './doc';

export interface Rect { x: number; y: number; w: number; h: number }

/** 고른 자리를 어떻게 합칠지. */
export type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface Selection {
  w: number;
  h: number;
  /** 픽셀당 0..255. */
  mask: Uint8Array;
  /** 고른 것이 있는 사각형. 아무것도 안 골랐으면 null(= 판 전체가 대상). */
  bounds: Rect | null;
}

export const createSelection = (w: number, h: number): Selection => ({
  w, h, mask: new Uint8Array(w * h), bounds: null
});

/** 아무것도 안 고른 상태 = 판 전체가 대상. 도구는 `bounds === null` 을 그렇게 읽는다. */
export const isEmpty = (selection: Selection | null): boolean => !selection || selection.bounds === null;

function recomputeBounds(selection: Selection): void {
  let minX = selection.w; let minY = selection.h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < selection.h; y += 1) {
    const row = y * selection.w;
    for (let x = 0; x < selection.w; x += 1) {
      if (selection.mask[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  selection.bounds = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 새로 만든 한 장을 지금 것과 합친다. */
function combine(selection: Selection, next: Uint8Array, mode: SelectMode): void {
  const mask = selection.mask;
  for (let i = 0; i < mask.length; i += 1) {
    const a = mask[i];
    const b = next[i];
    mask[i] = mode === 'replace' ? b
      : mode === 'add' ? Math.max(a, b)
      : mode === 'subtract' ? Math.max(0, a - b)
      : Math.min(a, b);
  }
  recomputeBounds(selection);
}

export function selectAll(selection: Selection): void {
  selection.mask.fill(255);
  selection.bounds = { x: 0, y: 0, w: selection.w, h: selection.h };
}

export function selectNone(selection: Selection): void {
  selection.mask.fill(0);
  selection.bounds = null;
}

export function invert(selection: Selection): void {
  for (let i = 0; i < selection.mask.length; i += 1) selection.mask[i] = 255 - selection.mask[i];
  recomputeBounds(selection);
}

export function selectRect(selection: Selection, rect: Rect, mode: SelectMode = 'replace'): void {
  const next = new Uint8Array(selection.mask.length);
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(selection.w, Math.round(rect.x + rect.w));
  const y1 = Math.min(selection.h, Math.round(rect.y + rect.h));
  for (let y = y0; y < y1; y += 1) next.fill(255, y * selection.w + x0, y * selection.w + x1);
  combine(selection, next, mode);
}

export function selectEllipse(selection: Selection, rect: Rect, mode: SelectMode = 'replace'): void {
  const next = new Uint8Array(selection.mask.length);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const rx = Math.max(0.5, rect.w / 2);
  const ry = Math.max(0.5, rect.h / 2);
  for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(selection.h, Math.ceil(rect.y + rect.h)); y += 1) {
    for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(selection.w, Math.ceil(rect.x + rect.w)); x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) next[y * selection.w + x] = 255;
    }
  }
  combine(selection, next, mode);
}

/**
 * 올가미 — 점을 이어 만든 다각형 안쪽. 짝수-홀수 규칙으로 채운다(스스로 겹쳐도 뚫린다).
 * 점이 3개 미만이면 아무 일도 안 한다 — 실수로 톡 눌렀을 때 선택이 통째로 날아가지 않게.
 */
export function selectPolygon(selection: Selection, points: Array<{ x: number; y: number }>, mode: SelectMode = 'replace'): void {
  if (points.length < 3) return;
  const next = new Uint8Array(selection.mask.length);
  let minY = selection.h; let maxY = 0;
  points.forEach(point => {
    minY = Math.min(minY, Math.floor(point.y));
    maxY = Math.max(maxY, Math.ceil(point.y));
  });
  for (let y = Math.max(0, minY); y <= Math.min(selection.h - 1, maxY); y += 1) {
    const crossings: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[j];
      const b = points[i];
      /* 가로줄이 이 변을 지나가나 — 위 끝은 포함, 아래 끝은 제외(꼭짓점 이중 계산 방지). */
      if ((a.y > y + 0.5) !== (b.y > y + 0.5)) {
        crossings.push(a.x + ((y + 0.5 - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const to = Math.min(selection.w, Math.ceil(crossings[i + 1] - 0.5));
      for (let x = from; x < to; x += 1) next[y * selection.w + x] = 255;
    }
  }
  combine(selection, next, mode);
}

/** 마술봉 — 누른 자리와 비슷한 색을 고른다. 채우기와 같은 눈으로 본다. */
export function magicWand(
  selection: Selection,
  surface: Surface,
  x: number,
  y: number,
  tolerance = 0.12,
  contiguous = true,
  mode: SelectMode = 'replace'
): void {
  const px = Math.floor(x); const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= surface.w || py >= surface.h) return;
  const next = new Uint8Array(selection.mask.length);
  const data = surface.data;
  const seed = (py * surface.w + px) * 4;
  const near = (index: number): boolean => {
    const i = index * 4;
    const dr = data[seed] - data[i];
    const dg = data[seed + 1] - data[i + 1];
    const db = data[seed + 2] - data[i + 2];
    const da = data[seed + 3] - data[i + 3];
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) / 510 <= tolerance;
  };
  if (!contiguous) {
    for (let p = 0; p < next.length; p += 1) if (near(p)) next[p] = 255;
  } else {
    const stack = [py * surface.w + px];
    while (stack.length) {
      const p = stack.pop() as number;
      if (next[p]) continue;
      if (!near(p)) continue;
      next[p] = 255;
      const cx = p % surface.w;
      if (cx > 0) stack.push(p - 1);
      if (cx < surface.w - 1) stack.push(p + 1);
      if (p >= surface.w) stack.push(p - surface.w);
      if (p < next.length - surface.w) stack.push(p + surface.w);
    }
  }
  combine(selection, next, mode);
}

/**
 * 가장자리를 부드럽게(feather). 상자 흐림을 두 번 지나 대충 가우시안처럼 만든다 —
 * 딱 떨어지는 선택으로 오려 내면 종이 오린 자국이 남는다.
 */
export function feather(selection: Selection, radius: number): void {
  const r = Math.max(0, Math.round(radius));
  if (!r) return;
  const { w, h, mask } = selection;
  const temp = new Uint8Array(mask.length);
  const blurOnce = (from: Uint8Array, to: Uint8Array): void => {
    /* 가로 → 세로. 한 줄에 한 번씩만 훑으므로 반지름이 커도 값싸다. */
    const line = new Uint8Array(Math.max(w, h));
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      for (let x = -r; x <= r; x += 1) sum += from[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x += 1) {
        line[x] = Math.round(sum / (r * 2 + 1));
        sum -= from[y * w + Math.min(w - 1, Math.max(0, x - r))];
        sum += from[y * w + Math.min(w - 1, Math.max(0, x + r + 1))];
      }
      for (let x = 0; x < w; x += 1) to[y * w + x] = line[x];
    }
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) sum += to[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y += 1) {
        line[y] = Math.round(sum / (r * 2 + 1));
        sum -= to[Math.min(h - 1, Math.max(0, y - r)) * w + x];
        sum += to[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
      }
      for (let y = 0; y < h; y += 1) to[y * w + x] = line[y];
    }
  };
  blurOnce(mask, temp);
  blurOnce(temp, mask);
  recomputeBounds(selection);
}

/** 선택 밖을 지운다 — 「골라서 오려 내기」. */
export function clearOutside(surface: Surface, selection: Selection): void {
  if (isEmpty(selection)) return;
  for (let p = 0; p < selection.mask.length; p += 1) {
    const keep = selection.mask[p] / 255;
    surface.data[p * 4 + 3] = surface.data[p * 4 + 3] * keep;
  }
}

/** 선택 안을 지운다 — Delete. */
export function clearInside(surface: Surface, selection: Selection): void {
  if (isEmpty(selection)) {
    surface.data.fill(0);
    return;
  }
  for (let p = 0; p < selection.mask.length; p += 1) {
    const cut = selection.mask[p] / 255;
    if (cut > 0) surface.data[p * 4 + 3] = surface.data[p * 4 + 3] * (1 - cut);
  }
}

/**
 * 「달리는 개미」 테두리를 그릴 선 — 선택된 자리와 아닌 자리의 경계 픽셀만 모은다.
 * 화면에 점선을 그리는 쪽(view)이 이걸 받아 쓴다.
 */
export function edgePixels(selection: Selection): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  if (isEmpty(selection)) return edges;
  const { w, h, mask } = selection;
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] >= 128;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!on(x, y)) continue;
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) edges.push([x, y]);
    }
  }
  return edges;
}
