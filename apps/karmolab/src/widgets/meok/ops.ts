/**
 * 「먹」 — 그림 연산 (TASK-KL-240 · 3단계)
 *
 * 옛 편집 도구(4,714줄)는 **캔버스 한 장**에 자르기·크기·회전·보정·필터를 덮어썼다.
 * 그래서 「하늘만 어둡게」도, 「이 레이어만 흐리게」도 안 됐다. 여기서는 전부
 * **판(Surface) 하나를 받아 새 판을 내놓는 함수**로 다시 쓴다 — 그러면 세 가지가 공짜다:
 *
 *   ① 레이어별 적용   ② 선택영역 안에서만 적용   ③ 되돌리기(옛 판을 그대로 들고 있으므로)
 *
 * 크기가 바뀌는 연산(자르기·크기·회전)은 **문서 전체**에 걸린다 — 레이어마다 크기가 다르면
 * 합성이 성립하지 않기 때문이다. 색을 바꾸는 연산(보정·필터)만 레이어 하나에 건다.
 *
 * 브라우저를 모른다 — 보간·컨볼루션까지 직접 한다(그래야 화면·저장·검사가 같은 답을 낸다).
 */

import { createSurface, type Surface } from './doc';

export interface Rect { x: number; y: number; w: number; h: number }

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/* ===== 크기가 바뀌는 연산 ===== */

/** 잘라내기. 판 밖을 요구하면 그만큼 투명하게 채운다(밖으로 넓히는 데도 쓴다). */
export function crop(surface: Surface, rect: Rect): Surface {
  const out = createSurface(Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h)));
  const ox = Math.round(rect.x);
  const oy = Math.round(rect.y);
  for (let y = 0; y < out.h; y += 1) {
    const sy = oy + y;
    if (sy < 0 || sy >= surface.h) continue;
    for (let x = 0; x < out.w; x += 1) {
      const sx = ox + x;
      if (sx < 0 || sx >= surface.w) continue;
      const from = (sy * surface.w + sx) * 4;
      const to = (y * out.w + x) * 4;
      out.data[to] = surface.data[from];
      out.data[to + 1] = surface.data[from + 1];
      out.data[to + 2] = surface.data[from + 2];
      out.data[to + 3] = surface.data[from + 3];
    }
  }
  return out;
}

/**
 * 크기 바꾸기.
 * `smooth` = 쌍선형(사진용). 픽셀 아트는 꺼야 한다 — 부드럽게 하면 도트가 죽는다.
 * 알파는 **미리 곱해서** 섞는다. 안 그러면 투명한 자리의 색(보통 검정)이 가장자리로 배어난다.
 */
export function resize(surface: Surface, w: number, h: number, smooth = true): Surface {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const out = createSurface(width, height);
  const sx = surface.w / width;
  const sy = surface.h / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4;
      if (!smooth) {
        const px = Math.min(surface.w - 1, Math.floor(x * sx));
        const py = Math.min(surface.h - 1, Math.floor(y * sy));
        const from = (py * surface.w + px) * 4;
        out.data[to] = surface.data[from];
        out.data[to + 1] = surface.data[from + 1];
        out.data[to + 2] = surface.data[from + 2];
        out.data[to + 3] = surface.data[from + 3];
        continue;
      }
      const fx = Math.min(surface.w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const fy = Math.min(surface.h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
      const x0 = Math.floor(fx); const y0 = Math.floor(fy);
      const x1 = Math.min(surface.w - 1, x0 + 1);
      const y1 = Math.min(surface.h - 1, y0 + 1);
      const tx = fx - x0; const ty = fy - y0;
      let r = 0; let g = 0; let b = 0; let a = 0;
      const corners: Array<[number, number, number]> = [
        [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
        [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]
      ];
      corners.forEach(corner => {
        const from = (corner[1] * surface.w + corner[0]) * 4;
        const alpha = surface.data[from + 3] / 255;
        const weight = corner[2];
        r += surface.data[from] * alpha * weight;
        g += surface.data[from + 1] * alpha * weight;
        b += surface.data[from + 2] * alpha * weight;
        a += alpha * weight;
      });
      out.data[to + 3] = Math.round(a * 255);
      if (a > 0) {
        out.data[to] = Math.round(r / a);
        out.data[to + 1] = Math.round(g / a);
        out.data[to + 2] = Math.round(b / a);
      }
    }
  }
  return out;
}

/** 90·180·270도 돌리기. 픽셀을 옮기기만 하므로 화질이 안 상한다. */
export function rotateQuarter(surface: Surface, turns: number): Surface {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return crop(surface, { x: 0, y: 0, w: surface.w, h: surface.h });
  const swap = t % 2 === 1;
  const out = createSurface(swap ? surface.h : surface.w, swap ? surface.w : surface.h);
  for (let y = 0; y < surface.h; y += 1) {
    for (let x = 0; x < surface.w; x += 1) {
      const from = (y * surface.w + x) * 4;
      const nx = t === 1 ? surface.h - 1 - y : t === 2 ? surface.w - 1 - x : y;
      const ny = t === 1 ? x : t === 2 ? surface.h - 1 - y : surface.w - 1 - x;
      const to = (ny * out.w + nx) * 4;
      out.data[to] = surface.data[from];
      out.data[to + 1] = surface.data[from + 1];
      out.data[to + 2] = surface.data[from + 2];
      out.data[to + 3] = surface.data[from + 3];
    }
  }
  return out;
}

export function flip(surface: Surface, axis: 'x' | 'y'): Surface {
  const out = createSurface(surface.w, surface.h);
  for (let y = 0; y < surface.h; y += 1) {
    for (let x = 0; x < surface.w; x += 1) {
      const from = (y * surface.w + x) * 4;
      const nx = axis === 'x' ? surface.w - 1 - x : x;
      const ny = axis === 'y' ? surface.h - 1 - y : y;
      const to = (ny * surface.w + nx) * 4;
      out.data[to] = surface.data[from];
      out.data[to + 1] = surface.data[from + 1];
      out.data[to + 2] = surface.data[from + 2];
      out.data[to + 3] = surface.data[from + 3];
    }
  }
  return out;
}

/**
 * 자유 각도 회전. 판이 잘리지 않게 **커진 판**에 담는다(45도로 돌리면 모서리가 삐져나온다).
 * 뒤에서 앞으로(목적지 → 원본) 훑어 구멍이 안 뚫리게 하고, 알파는 미리 곱해 섞어
 * 투명한 가장자리에 검정이 배어나지 않게 한다.
 */
export function rotateFree(surface: Surface, degrees: number, smooth = true): Surface {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const w = Math.ceil(Math.abs(surface.w * cos) + Math.abs(surface.h * sin));
  const h = Math.ceil(Math.abs(surface.w * sin) + Math.abs(surface.h * cos));
  const out = createSurface(w, h);
  const cx = surface.w / 2;
  const cy = surface.h / 2;
  const ox = w / 2;
  const oy = h / 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      /* 목적지 점을 반대로 돌려 원본 어디서 왔는지 찾는다. */
      const dx = x + 0.5 - ox;
      const dy = y + 0.5 - oy;
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      if (sx < -0.5 || sy < -0.5 || sx > surface.w - 0.5 || sy > surface.h - 0.5) continue;
      const to = (y * w + x) * 4;
      if (!smooth) {
        const px = Math.min(surface.w - 1, Math.max(0, Math.round(sx - 0.5)));
        const py = Math.min(surface.h - 1, Math.max(0, Math.round(sy - 0.5)));
        const from = (py * surface.w + px) * 4;
        out.data[to] = surface.data[from];
        out.data[to + 1] = surface.data[from + 1];
        out.data[to + 2] = surface.data[from + 2];
        out.data[to + 3] = surface.data[from + 3];
        continue;
      }
      const fx = sx - 0.5; const fy = sy - 0.5;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy);
      const tx = fx - x0; const ty = fy - y0;
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let ky = 0; ky <= 1; ky += 1) {
        for (let kx = 0; kx <= 1; kx += 1) {
          const px = Math.min(surface.w - 1, Math.max(0, x0 + kx));
          const py = Math.min(surface.h - 1, Math.max(0, y0 + ky));
          const weight = (kx ? tx : 1 - tx) * (ky ? ty : 1 - ty);
          if (weight <= 0) continue;
          const from = (py * surface.w + px) * 4;
          const alpha = surface.data[from + 3] / 255;
          r += surface.data[from] * alpha * weight;
          g += surface.data[from + 1] * alpha * weight;
          b += surface.data[from + 2] * alpha * weight;
          a += alpha * weight;
        }
      }
      out.data[to + 3] = Math.round(a * 255);
      if (a > 0) {
        out.data[to] = Math.round(r / a);
        out.data[to + 1] = Math.round(g / a);
        out.data[to + 2] = Math.round(b / a);
      }
    }
  }
  return out;
}

/* ===== 색을 바꾸는 연산 — 자리는 그대로 ===== */

export interface Adjust {
  /** -1..1 */
  brightness?: number;
  /** -1..1 */
  contrast?: number;
  /** -1..1 (-1 = 흑백) */
  saturation?: number;
  /** -180..180 도 */
  hue?: number;
  /** 0.1..3 (1 = 그대로) */
  gamma?: number;
}

/** 사람 눈이 느끼는 밝기 — 초록에 가장 민감하다. */
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * 밝기·대비·채도·색조·감마를 **한 번에** 건다.
 * 따로따로 돌리면 8비트 반올림이 겹겹이 쌓여 색이 뭉갠다 — 한 번에 계산하고 마지막에 한 번만 굳힌다.
 */
export function adjust(surface: Surface, values: Adjust, selection?: Uint8Array | null): Surface {
  const out = createSurface(surface.w, surface.h);
  out.data.set(surface.data);
  const brightness = values.brightness || 0;
  const contrast = values.contrast || 0;
  const saturation = values.saturation == null ? 0 : values.saturation;
  const hue = ((values.hue || 0) * Math.PI) / 180;
  const gamma = values.gamma && values.gamma > 0 ? values.gamma : 1;
  /* 대비 계수 — 흔히 쓰는 (259·(c+255))/(255·(259−c)) 꼴. */
  const c = contrast * 255;
  const contrastK = (259 * (c + 255)) / (255 * (259 - c));
  const cosH = Math.cos(hue);
  const sinH = Math.sin(hue);

  for (let p = 0; p < surface.w * surface.h; p += 1) {
    const weight = selection ? selection[p] / 255 : 1;
    if (weight <= 0) continue;
    const i = p * 4;
    if (surface.data[i + 3] === 0) continue;
    let r = surface.data[i];
    let g = surface.data[i + 1];
    let b = surface.data[i + 2];

    if (brightness) { const add = brightness * 255; r += add; g += add; b += add; }
    if (contrast) { r = contrastK * (r - 128) + 128; g = contrastK * (g - 128) + 128; b = contrastK * (b - 128) + 128; }
    if (saturation) {
      const grey = luma(r, g, b);
      const k = 1 + saturation;
      r = grey + (r - grey) * k; g = grey + (g - grey) * k; b = grey + (b - grey) * k;
    }
    if (hue) {
      /* YIQ 색 공간에서 색상환만 돌린다 — 밝기를 안 건드린다. */
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const iq1 = 0.596 * r - 0.274 * g - 0.322 * b;
      const iq2 = 0.211 * r - 0.523 * g + 0.312 * b;
      const ri = iq1 * cosH - iq2 * sinH;
      const rq = iq1 * sinH + iq2 * cosH;
      r = y + 0.956 * ri + 0.621 * rq;
      g = y - 0.272 * ri - 0.647 * rq;
      b = y - 1.106 * ri + 1.703 * rq;
    }
    if (gamma !== 1) {
      r = 255 * Math.pow(Math.max(0, r) / 255, 1 / gamma);
      g = 255 * Math.pow(Math.max(0, g) / 255, 1 / gamma);
      b = 255 * Math.pow(Math.max(0, b) / 255, 1 / gamma);
    }

    /* 선택영역 가장자리에서는 원래 색과 섞는다 — 자른 자국이 안 나게. */
    out.data[i] = clamp255(surface.data[i] + (clamp255(r) - surface.data[i]) * weight);
    out.data[i + 1] = clamp255(surface.data[i + 1] + (clamp255(g) - surface.data[i + 1]) * weight);
    out.data[i + 2] = clamp255(surface.data[i + 2] + (clamp255(b) - surface.data[i + 2]) * weight);
  }
  return out;
}

export type FilterName = 'grayscale' | 'sepia' | 'invert' | 'blur' | 'sharpen' | 'edge' | 'emboss' | 'posterize';

/** 3×3 컨볼루션. 가장자리는 바깥 대신 가장 가까운 픽셀을 본다(테두리가 어두워지지 않게). */
function convolve(surface: Surface, kernel: number[], divisor: number, offset: number, selection?: Uint8Array | null): Surface {
  const out = createSurface(surface.w, surface.h);
  out.data.set(surface.data);
  const at = (x: number, y: number): number =>
    (Math.min(surface.h - 1, Math.max(0, y)) * surface.w + Math.min(surface.w - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < surface.h; y += 1) {
    for (let x = 0; x < surface.w; x += 1) {
      const p = y * surface.w + x;
      const weight = selection ? selection[p] / 255 : 1;
      if (weight <= 0) continue;
      let r = 0; let g = 0; let b = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const k = kernel[(ky + 1) * 3 + (kx + 1)];
          if (!k) continue;
          const from = at(x + kx, y + ky);
          r += surface.data[from] * k;
          g += surface.data[from + 1] * k;
          b += surface.data[from + 2] * k;
        }
      }
      const i = p * 4;
      const nr = clamp255(r / divisor + offset);
      const ng = clamp255(g / divisor + offset);
      const nb = clamp255(b / divisor + offset);
      out.data[i] = clamp255(surface.data[i] + (nr - surface.data[i]) * weight);
      out.data[i + 1] = clamp255(surface.data[i + 1] + (ng - surface.data[i + 1]) * weight);
      out.data[i + 2] = clamp255(surface.data[i + 2] + (nb - surface.data[i + 2]) * weight);
    }
  }
  return out;
}

export function filter(surface: Surface, name: FilterName, amount = 1, selection?: Uint8Array | null): Surface {
  if (name === 'blur') return convolve(surface, [1, 2, 1, 2, 4, 2, 1, 2, 1], 16, 0, selection);
  if (name === 'sharpen') return convolve(surface, [0, -1, 0, -1, 5, -1, 0, -1, 0], 1, 0, selection);
  if (name === 'edge') return convolve(surface, [-1, -1, -1, -1, 8, -1, -1, -1, -1], 1, 0, selection);
  if (name === 'emboss') return convolve(surface, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 0, selection);

  const out = createSurface(surface.w, surface.h);
  out.data.set(surface.data);
  const steps = Math.max(2, Math.round(2 + (1 - Math.min(1, amount)) * 14));
  for (let p = 0; p < surface.w * surface.h; p += 1) {
    const weight = selection ? selection[p] / 255 : 1;
    if (weight <= 0) continue;
    const i = p * 4;
    if (surface.data[i + 3] === 0) continue;
    const r = surface.data[i]; const g = surface.data[i + 1]; const b = surface.data[i + 2];
    let nr = r; let ng = g; let nb = b;
    if (name === 'grayscale') { const y = luma(r, g, b); nr = y; ng = y; nb = y; }
    else if (name === 'sepia') {
      nr = 0.393 * r + 0.769 * g + 0.189 * b;
      ng = 0.349 * r + 0.686 * g + 0.168 * b;
      nb = 0.272 * r + 0.534 * g + 0.131 * b;
    } else if (name === 'invert') { nr = 255 - r; ng = 255 - g; nb = 255 - b; }
    else if (name === 'posterize') {
      const step = 255 / (steps - 1);
      nr = Math.round(r / step) * step; ng = Math.round(g / step) * step; nb = Math.round(b / step) * step;
    }
    /* 세기(amount) = 원래 색과 얼마나 섞을지. 1 = 완전히 바뀜. */
    const mix = weight * Math.min(1, Math.max(0, amount));
    out.data[i] = clamp255(r + (clamp255(nr) - r) * mix);
    out.data[i + 1] = clamp255(g + (clamp255(ng) - g) * mix);
    out.data[i + 2] = clamp255(b + (clamp255(nb) - b) * mix);
  }
  return out;
}

/** 그림이 실제로 차지한 사각형 — 「빈 여백 잘라내기」의 근거. 전부 투명하면 null. */
export function contentBounds(surface: Surface, threshold = 4): Rect | null {
  let minX = surface.w; let minY = surface.h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < surface.h; y += 1) {
    for (let x = 0; x < surface.w; x += 1) {
      if (surface.data[(y * surface.w + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
