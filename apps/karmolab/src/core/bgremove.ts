/**
 * 배경 지우기 — 단색·비슷한 배경 (TASK-KL-316 / 26)
 *
 * **무엇을 하는지 이름부터 정확히 적는다.** 사람 형태를 알아보는 배경 제거는 학습 모형이 필요하고,
 * 그건 40MB 를 받아야 한다 — 이 사이트는 그런 걸 안 받는다(로컬 원칙·번들 예산).
 * 그래서 여기서는 **단색이나 비슷한 색 배경**만 지운다. 증명사진·상품 사진·스캔이 그 자리다.
 *
 * 어떻게: 가장자리에서 시작해 **이어진 비슷한 색만** 지운다(전역 색 지우기가 아니다).
 * 옷 색이 배경과 같아도 안쪽은 안 뚫린다 — 그 차이가 이 도구의 값어치다.
 * 그다음 가장자리를 부드럽게(페더) 하고, 배경색이 머리카락에 묻은 것을 걷어낸다(디스필).
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'bgremove',
  ops: {
    describe: {
      desc:
        'Explain what this tool does and does not do (solid or near-solid backgrounds only, no ML model).',
      in: {},
      out: 'string'
    }
  }
};

export interface Options {
  /** 색이 얼마나 달라도 배경으로 볼까 (0~255, 기본 32) */
  tolerance?: number;
  /** 가장자리를 몇 픽셀 부드럽게 (기본 2) */
  feather?: number;
  /** 배경색을 어디서 잡나 — 안 주면 네 모서리에서 */
  pick?: { x: number; y: number };
  /** 배경색이 남긴 물듦을 걷어낼까 */
  despill?: boolean;
}

const dist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number =>
  Math.sqrt((r1 - r2) * (r1 - r2) + (g1 - g2) * (g1 - g2) + (b1 - b2) * (b1 - b2));

/** 네 모서리에서 배경색을 짐작한다 — 가장 자주 나오는 색을 고른다(한 점만 보면 잡티에 속는다). */
export function guessBackground(pixels: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const votes = new Map<string, { n: number; r: number; g: number; b: number }>();
  const look = (x: number, y: number): void => {
    const at = (y * width + x) * 4;
    const key = (pixels[at] >> 3) + ',' + (pixels[at + 1] >> 3) + ',' + (pixels[at + 2] >> 3);
    const cur = votes.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++;
    cur.r += pixels[at];
    cur.g += pixels[at + 1];
    cur.b += pixels[at + 2];
    votes.set(key, cur);
  };
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  for (let x = 0; x < width; x += step) {
    look(x, 0);
    look(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    look(0, y);
    look(width - 1, y);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  for (const v of votes.values()) if (v.n > best.n) best = v;
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

/**
 * 가장자리에서 **이어진** 배경만 지운다. 되돌이 대신 손으로 쌓는다(큰 사진에서 스택이 터진다).
 * 결과는 0(배경) ~ 255(그대로) 의 알파 지도.
 */
export function maskOf(pixels: Uint8ClampedArray, width: number, height: number, options: Options = {}): Uint8ClampedArray {
  const tolerance = options.tolerance ?? 32;
  const [br, bg, bb] =
    options.pick === undefined
      ? guessBackground(pixels, width, height)
      : (() => {
          const at = (Math.floor(options.pick.y) * width + Math.floor(options.pick.x)) * 4;
          return [pixels[at], pixels[at + 1], pixels[at + 2]] as [number, number, number];
        })();

  const alpha = new Uint8ClampedArray(width * height).fill(255);
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (index: number): void => {
    if (seen[index] === 1) return;
    const at = index * 4;
    const d = dist(pixels[at], pixels[at + 1], pixels[at + 2], br, bg, bb);
    if (d > tolerance) return;
    seen[index] = 1;
    /* 딱 자르지 않고 **가까울수록 더 지운다** — 그래야 머리카락 언저리가 톱니가 안 된다. */
    alpha[index] = Math.round(Math.min(255, (d / Math.max(1, tolerance)) * 255));
    stack.push(index);
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  const feather = options.feather ?? 2;
  return feather > 0 ? blur(alpha, width, height, feather) : alpha;
}

/** 알파만 부드럽게 (상자 흐림 두 번 = 거의 가우시안). 색은 안 건드린다. */
export function blur(alpha: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  /* 받은 것을 그대로 쓰지 않고 **한 벌 뜬다** — 부르는 쪽의 배열을 우리가 흐리게 만들면 안 된다
     (타입도 그래야 맞는다: 받은 배열의 바탕 버퍼가 무엇인지 우리는 모른다). */
  let src = new Uint8ClampedArray(alpha);
  let dst = new Uint8ClampedArray(alpha.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += src[y * width + nx];
          n++;
        }
        dst[y * width + x] = Math.round(sum / n);
      }
    }
    const swap = src;
    src = dst;
    dst = swap;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0;
        let n = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          sum += src[ny * width + x];
          n++;
        }
        dst[y * width + x] = Math.round(sum / n);
      }
    }
    const swap2 = src;
    src = dst;
    dst = swap2;
  }
  return src;
}

/** 알파를 그림에 입힌다. `despill` 이면 반투명한 자리에서 배경색 기운을 걷어낸다. */
export function apply(pixels: Uint8ClampedArray, alpha: Uint8ClampedArray, options: Options = {}, background?: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  const bg = background;
  for (let i = 0; i < alpha.length; i++) {
    const at = i * 4;
    out[at + 3] = alpha[i];
    if (options.despill === true && bg !== undefined && alpha[i] > 0 && alpha[i] < 255) {
      /* 반투명한 자리는 배경색이 섞여 들어온 자리다 — 섞인 만큼 빼야 테두리에 색이 안 남는다. */
      const mix = 1 - alpha[i] / 255;
      out[at] = Math.round((pixels[at] - bg[0] * mix) / Math.max(0.15, 1 - mix));
      out[at + 1] = Math.round((pixels[at + 1] - bg[1] * mix) / Math.max(0.15, 1 - mix));
      out[at + 2] = Math.round((pixels[at + 2] - bg[2] * mix) / Math.max(0.15, 1 - mix));
    }
  }
  return out;
}

/** 지운 넓이 — 「아무 일도 안 일어난 것 같다」를 수치로 말해 준다. */
export function removedRatio(alpha: Uint8ClampedArray): number {
  let gone = 0;
  for (const a of alpha) if (a < 128) gone++;
  return alpha.length === 0 ? 0 : gone / alpha.length;
}

export const run: ToolRunner = (op) => {
  if (op !== 'describe') throw new Error('bgremove: 모르는 연산 ' + op);
  return [
    'Removes solid or near-solid backgrounds in the browser.',
    'It flood-fills from the edges, so a subject the same colour as the background is not punched through.',
    'It does NOT understand people or objects — that needs a machine-learning model this site does not ship.'
  ].join('\n');
};
