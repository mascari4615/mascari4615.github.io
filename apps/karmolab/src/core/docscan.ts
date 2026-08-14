/**
 * 사진을 스캔처럼 — 비뚤어진 종이를 반듯하게 (TASK-KL-316 / 28)
 *
 * 책상 위 서류를 찍으면 **사다리꼴**이 된다. 그걸 접수처에 내면 되돌아온다.
 * 네 모서리를 알면 반듯한 직사각형으로 되돌릴 수 있다 — 그게 원근 되돌리기(homography)다.
 *
 * 모서리는 **사람이 끌어서** 잡는다. 자동으로 찾는 건 조명·무늬에 잘 속고, 한 번 어긋나면
 * 사람이 왜 틀렸는지 알 수 없다. 네 점을 끄는 건 3초면 되고 늘 맞는다.
 *
 * 그다음 「스캔처럼」 보이게 손본다: 회색으로 바꾸고 **자리마다 밝기 기준을 따로** 잡는다
 * (책 그림자 아래도 안 뭉개지게 — 한 기준으로 자르면 그림자 쪽이 통째로 까맣게 된다).
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'docscan',
  ops: {
    describe: {
      desc: 'Explain the steps: pick four corners, undo the perspective, clean it up like a scan.',
      in: {},
      out: 'string'
    }
  }
};

export type Point = { x: number; y: number };
/** 왼위 · 오른위 · 오른아래 · 왼아래 */
export type Corners = [Point, Point, Point, Point];

/** 여덟 개 미지수를 푸는 작은 가우스 소거 — 라이브러리를 들일 만한 크기가 아니다. */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-9) throw new Error('네 점이 한 줄에 가깝습니다 (모서리를 다시 잡으세요)');
    const swap = a[col];
    a[col] = a[pivot];
    a[pivot] = swap;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** 네 점 → 직사각형으로 보내는 셈(3×3). 되돌릴 때 쓰려고 **거꾸로**(결과→원본) 만든다. */
export function homography(corners: Corners, width: number, height: number): number[] {
  const dst: Corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = dst[i];
    const d = corners[i];
    rows.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    rhs.push(d.x);
    rows.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    rhs.push(d.y);
  }
  const h = solve(rows, rhs);
  return [...h, 1];
}

/** 네 점이 이루는 종이의 대략적인 크기 — 결과 크기를 여기서 정한다(늘어나 보이지 않게). */
export function guessSize(corners: Corners): { width: number; height: number } {
  const len = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
  const width = Math.round(Math.max(len(corners[0], corners[1]), len(corners[3], corners[2])));
  const height = Math.round(Math.max(len(corners[0], corners[3]), len(corners[1], corners[2])));
  return { width: Math.max(16, width), height: Math.max(16, height) };
}

/** 원근을 되돌린다. 사이 값은 가까운 네 점을 섞어 쓴다(계단이 안 지게). */
export function warp(pixels: Uint8ClampedArray, srcW: number, srcH: number, corners: Corners, outW: number, outH: number): Uint8ClampedArray {
  const h = homography(corners, outW, outH);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denominator = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / denominator;
      const sy = (h[3] * x + h[4] * y + h[5]) / denominator;
      const at = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= srcW - 1 || sy >= srcH - 1) {
        out[at] = 255;
        out[at + 1] = 255;
        out[at + 2] = 255;
        out[at + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = pixels[(y0 * srcW + x0) * 4 + c];
        const p10 = pixels[(y0 * srcW + x0 + 1) * 4 + c];
        const p01 = pixels[((y0 + 1) * srcW + x0) * 4 + c];
        const p11 = pixels[((y0 + 1) * srcW + x0 + 1) * 4 + c];
        out[at + c] = Math.round(p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy);
      }
      out[at + 3] = 255;
    }
  }
  return out;
}

export type Look = 'color' | 'gray' | 'scan';

/**
 * 스캔처럼 보이게. `scan` 은 **자리마다 기준을 따로** 잡는다 —
 * 한 기준으로 자르면 그림자 쪽이 통째로 까맣게 된다(책 사진에서 늘 그렇다).
 */
export function enhance(pixels: Uint8ClampedArray, width: number, height: number, look: Look, strength = 12): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  if (look === 'color') return out;

  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const at = i * 4;
    gray[i] = 0.299 * pixels[at] + 0.587 * pixels[at + 1] + 0.114 * pixels[at + 2];
  }
  if (look === 'gray') {
    for (let i = 0; i < gray.length; i++) {
      const at = i * 4;
      const v = Math.round(gray[i]);
      out[at] = v;
      out[at + 1] = v;
      out[at + 2] = v;
    }
    return out;
  }

  /* 둘레의 평균보다 어두우면 글씨, 밝으면 종이 (적응형 이진화). */
  const radius = Math.max(4, Math.round(Math.min(width, height) / 40));
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      sums[(y + 1) * (width + 1) + (x + 1)] = sums[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const areaMean = (x0: number, y0: number, x1: number, y1: number): number => {
    const a = sums[y0 * (width + 1) + x0];
    const b = sums[y0 * (width + 1) + x1];
    const c = sums[y1 * (width + 1) + x0];
    const d = sums[y1 * (width + 1) + x1];
    const n = Math.max(1, (x1 - x0) * (y1 - y0));
    return (d - b - c + a) / n;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const y0 = Math.max(0, y - radius);
      const x1 = Math.min(width, x + radius);
      const y1 = Math.min(height, y + radius);
      const mean = areaMean(x0, y0, x1, y1);
      const value = gray[y * width + x] < mean - strength ? 0 : 255;
      const at = (y * width + x) * 4;
      out[at] = value;
      out[at + 1] = value;
      out[at + 2] = value;
    }
  }
  return out;
}

/** A4 에 얹을 때의 크기(mm) — 긴 쪽을 맞추고 비율은 지킨다. */
export function fitA4(width: number, height: number): { widthMm: number; heightMm: number; landscape: boolean } {
  const landscape = width > height;
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const margin = 10;
  const scale = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
  return { widthMm: Math.round(width * scale), heightMm: Math.round(height * scale), landscape };
}

export const run: ToolRunner = (op) => {
  if (op !== 'describe') throw new Error('docscan: 모르는 연산 ' + op);
  return [
    'Pick the four corners of the page, and the perspective is undone into a flat rectangle.',
    'The scan look uses a local threshold, so a shadow across the page does not turn half of it black.',
    'Corners are picked by hand on purpose: automatic detection fails on patterned desks and you cannot see why.'
  ].join('\n');
};
