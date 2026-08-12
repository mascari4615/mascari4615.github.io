/**
 * 이미지 편집기 — 레이어 합성 (TASK-KL-240 · 1단계)
 *
 * 브라우저 캔버스의 `globalCompositeOperation` 에 맡기지 않고 **직접 섞는다**. 이유 셋:
 *  ① 화면 없이 검사할 수 있어야 한다 — 합성이 틀리면 그림 전체가 틀린다.
 *  ② 내보내기(PNG·GIF·스프라이트시트)와 화면이 **같은 답**을 내야 한다. 캔버스에 맡기면
 *     브라우저마다 반올림이 달라 「화면이랑 저장한 게 다르다」가 생긴다.
 *  ③ 클리핑·레이어 마스크는 캔버스 합성 연산에 아예 없다.
 *
 * 색은 straight alpha(0..255)로 들고, 섞을 때만 0..1 로 편다.
 * 합성 식은 W3C Compositing and Blending Level 1 의 것을 그대로 쓴다:
 *   Co = as·(1−ab)·Cs + as·ab·B(Cb,Cs) + (1−as)·ab·Cb      (미리 곱해진 결과)
 *   ao = as + ab·(1−as)
 */

import { celAt, cloneSurface, createSurface, type BlendMode, type Doc, type Layer, type Surface } from './doc';

type Blend = (b: number, s: number) => number;

const hardLight: Blend = (b, s) => (s <= 0.5 ? b * (2 * s) : 1 - (1 - b) * (2 - 2 * s));

const BLEND: Record<BlendMode, Blend> = {
  'normal': (_b, s) => s,
  'multiply': (b, s) => b * s,
  'screen': (b, s) => b + s - b * s,
  'overlay': (b, s) => hardLight(s, b),
  'darken': (b, s) => Math.min(b, s),
  'lighten': (b, s) => Math.max(b, s),
  'color-dodge': (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  'color-burn': (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  'hard-light': hardLight,
  'soft-light': (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
  'difference': (b, s) => Math.abs(b - s),
  'exclusion': (b, s) => b + s - 2 * b * s
};

export interface CompositeOptions {
  /** 어니언스킨 — 앞/뒤 몇 프레임을 얼마나 옅게 깔지. 0 = 끔. */
  onionBefore?: number;
  onionAfter?: number;
  onionOpacity?: number;
  /** 이 레이어만 그린다(솔로). */
  soloLayer?: string | null;
  /** 합성에서 뺄 레이어(그리는 중인 획을 따로 얹을 때). */
  skipLayer?: string | null;
}

/** 한 장을 아래 그림(dst, 미리 곱해진 0..1 buffer) 위에 섞어 얹는다. */
function drawLayerInto(
  dst: Float32Array,
  layer: Layer,
  cel: Surface,
  alphaScale: number,
  clipAlpha: Float32Array | null
): void {
  const blend = BLEND[layer.blend] || BLEND.normal;
  const src = cel.data;
  const mask = layer.mask;
  const count = dst.length / 4;
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    let as = (src[i + 3] / 255) * layer.opacity * alphaScale;
    if (mask) as *= mask[p] / 255;
    if (clipAlpha) as *= clipAlpha[p];
    if (as <= 0) continue;

    const ab = dst[i + 3];
    const ao = as + ab * (1 - as);
    for (let c = 0; c < 3; c += 1) {
      const cs = src[i + c] / 255;
      /* 아래 색은 미리 곱해져 있으므로 풀어서 본다 — 알파 0 이면 섞을 색 자체가 없다. */
      const cb = ab > 0 ? dst[i + c] / ab : 0;
      const mixed = as * (1 - ab) * cs + as * ab * blend(cb, cs) + (1 - as) * ab * cb;
      dst[i + c] = mixed;
    }
    dst[i + 3] = ao;
  }
}

/** 그 레이어가 화면에 내는 알파만 따로 뽑는다 — 클리핑 밑판을 만들 때 쓴다. */
function alphaOf(layer: Layer, cel: Surface, out: Float32Array): void {
  const src = cel.data;
  const mask = layer.mask;
  for (let p = 0; p < out.length; p += 1) {
    let a = (src[p * 4 + 3] / 255) * layer.opacity;
    if (mask) a *= mask[p] / 255;
    out[p] = a;
  }
}

/**
 * 문서 한 프레임을 한 장으로 굽는다.
 * `only` 를 주면 그 레이어들만(순서 그대로) — `mergeDown` 이 두 장만 합칠 때 쓴다.
 */
export function composite(doc: Doc, frame: number, only?: Layer[], opts: CompositeOptions = {}): Surface {
  const out = createSurface(doc.w, doc.h);
  const count = doc.w * doc.h;
  const buf = new Float32Array(count * 4);

  const layers = only || doc.layers;
  const onionBefore = only ? 0 : Math.max(0, opts.onionBefore || 0);
  const onionAfter = only ? 0 : Math.max(0, opts.onionAfter || 0);
  const onionOpacity = opts.onionOpacity == null ? 0.28 : opts.onionOpacity;

  /* 어니언스킨을 **먼저** 깐다 — 앞뒤 프레임은 현재 프레임 밑에 옅게 눕는다. */
  const ghosts: Array<{ frame: number; alpha: number }> = [];
  for (let d = onionBefore; d >= 1; d -= 1) {
    if (frame - d >= 0) ghosts.push({ frame: frame - d, alpha: onionOpacity / d });
  }
  for (let d = onionAfter; d >= 1; d -= 1) {
    if (frame + d < doc.frames) ghosts.push({ frame: frame + d, alpha: onionOpacity / d });
  }

  const paint = (atFrame: number, alphaScale: number): void => {
    let clipAlpha: Float32Array | null = null;
    layers.forEach(layer => {
      if (!layer.visible) return;
      if (opts.soloLayer && layer.id !== opts.soloLayer) return;
      if (opts.skipLayer && layer.id === opts.skipLayer) return;
      const cel = celAt(layer, atFrame);
      if (!cel) return;
      if (layer.clip) {
        /* 끼워 붙인 레이어 — 밑판 모양 밖은 안 보인다. 밑판이 없으면 그냥 보통 레이어. */
        drawLayerInto(buf, layer, cel, alphaScale, clipAlpha);
      } else {
        drawLayerInto(buf, layer, cel, alphaScale, null);
        clipAlpha = new Float32Array(count);
        alphaOf(layer, cel, clipAlpha);
      }
    });
  };

  ghosts.forEach(g => paint(g.frame, g.alpha));
  paint(frame, 1);

  /* 미리 곱해진 값을 되돌려 8비트로 굳힌다. */
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const a = buf[i + 3];
    if (a <= 0) continue;
    out.data[i] = Math.round((buf[i] / a) * 255);
    out.data[i + 1] = Math.round((buf[i + 1] / a) * 255);
    out.data[i + 2] = Math.round((buf[i + 2] / a) * 255);
    out.data[i + 3] = Math.round(a * 255);
  }
  return out;
}

/** 모든 프레임을 구워 낸다 — GIF·스프라이트시트 내보내기의 입구. */
export const compositeAll = (doc: Doc): Surface[] =>
  Array.from({ length: doc.frames }, (_unused, f) => composite(doc, f));

/** 스프라이트시트 한 장 — 가로로 이어 붙인다(cols 를 주면 격자). */
export function spriteSheet(doc: Doc, cols?: number, scale = 1): Surface {
  const frames = compositeAll(doc);
  const columns = Math.max(1, cols || frames.length);
  const rows = Math.ceil(frames.length / columns);
  const zoom = Math.max(1, scale | 0);
  const sheet = createSurface(doc.w * columns * zoom, doc.h * rows * zoom);
  frames.forEach((frame, index) => {
    const ox = (index % columns) * doc.w * zoom;
    const oy = Math.floor(index / columns) * doc.h * zoom;
    for (let y = 0; y < doc.h * zoom; y += 1) {
      for (let x = 0; x < doc.w * zoom; x += 1) {
        const s = (Math.floor(y / zoom) * doc.w + Math.floor(x / zoom)) * 4;
        const d = ((oy + y) * sheet.w + (ox + x)) * 4;
        sheet.data[d] = frame.data[s];
        sheet.data[d + 1] = frame.data[s + 1];
        sheet.data[d + 2] = frame.data[s + 2];
        sheet.data[d + 3] = frame.data[s + 3];
      }
    }
  });
  return sheet;
}

export { cloneSurface };
