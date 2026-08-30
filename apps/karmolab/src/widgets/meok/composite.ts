/**
 * 먹. 레이어 합성 (TASK-KL-240, 1단계)
 *
 * 브라우저 캔버스의 `globalCompositeOperation` 에 맡기지 않고 **직접 섞는다**. 이유 셋:
 *  ① 화면 없이 검사할 수 있어야 한다. 합성이 틀리면 그림 전체가 틀린다.
 *  ② 내보내기(PNG, GIF, 스프라이트시트)와 화면이 **같은 답**을 내야 한다. 캔버스에 맡기면
 *     브라우저마다 반올림이 달라 화면이랑 저장한 게 다르다가 생긴다.
 *  ③ 클리핑, 레이어 마스크는 캔버스 합성 연산에 아예 없다.
 *
 * 색은 straight alpha(0..255)로 들고, 섞을 때만 0..1 로 편다.
 * 합성 식은 W3C Compositing and Blending Level 1 의 것을 그대로 쓴다:
 *   Co = as, (1−ab), Cs + as, ab, B(Cb,Cs) + (1−as), ab, Cb      (미리 곱해진 결과)
 *   ao = as + ab, (1−as)
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

export interface CompositeRect { x: number; y: number; w: number; h: number }

export interface CompositeOptions {
  /** 어니언스킨. 앞/뒤 몇 프레임을 얼마나 옅게 깔지. 0 = 끔. */
  onionBefore?: number;
  onionAfter?: number;
  onionOpacity?: number;
  /** 이 레이어만 그린다(솔로). */
  soloLayer?: string | null;
  /** 합성에서 뺄 레이어(그리는 중인 획을 따로 얹을 때). */
  skipLayer?: string | null;
  /**
   * 이 사각형만 다시 섞는다. 붓질 한 번에 4000×3000 전체를 다시 섞으면 손이 끊긴다 . 
   * 실제로 더러워진 자리는 붓 크기만 하다.
   */
  rect?: CompositeRect;
  /** 결과를 새로 만들지 말고 이 판의 그 자리에 덮어쓴다(화면 갱신용). */
  into?: Surface;
}

/**
 * 한 장을 아래 그림(dst, 미리 곱해진 0..1 buffer) 위에 섞어 얹기. 사각형 안만.
 *
 * `dst` 와 `clipAlpha` 는 **사각형 크기**로 잡힌 판. 원래 픽셀(`cel`, `mask`)은 문서 좌표.
 * 두 좌표계를 섞지 마라. 예전에는 둘 다 문서 크기여서 64x64 만 다시 섞어도 4096^2 문서면
 * 268MB 를 새로 잡았음.
 */
function drawLayerInto(
  dst: Float32Array,
  width: number,
  rect: CompositeRect,
  layer: Layer,
  cel: Surface,
  alphaScale: number,
  clipAlpha: Float32Array | null
): void {
  const blend = BLEND[layer.blend] || BLEND.normal;
  const src = cel.data;
  const mask = layer.mask;
  /* 자리 셈은 **줄마다 한 번**. 픽셀마다 곱하면 4096^2 다섯 장에서 2억 번이 넘는 곱셈이 늘고,
     그것만으로 전체 합성이 눈에 띄게 느려진다 (2026-08-29 실측). */
  for (let ry = 0; ry < rect.h; ry += 1) {
    let p = (rect.y + ry) * width + rect.x;
    let q = ry * rect.w;
    for (let rx = 0; rx < rect.w; rx += 1, p += 1, q += 1) {
      const i = p * 4;
      const j = q * 4;
      let as = (src[i + 3] / 255) * layer.opacity * alphaScale;
      if (mask) as *= mask[p] / 255;
      if (clipAlpha) as *= clipAlpha[q];
      if (as <= 0) continue;

      const ab = dst[j + 3];
      const ao = as + ab * (1 - as);
      for (let c = 0; c < 3; c += 1) {
        const cs = src[i + c] / 255;
        /* 아래 색은 미리 곱해져 있으므로 풀어서 본다. 알파 0 이면 섞을 색 자체가 없다. */
        const cb = ab > 0 ? dst[j + c] / ab : 0;
        dst[j + c] = as * (1 - ab) * cs + as * ab * blend(cb, cs) + (1 - as) * ab * cb;
      }
      dst[j + 3] = ao;
    }
  }
}

/** 그 레이어가 화면에 내는 알파만 따로 뽑는다. 클리핑 밑판을 만들 때 쓴다. `out` 은 사각형 크기. */
function alphaOf(layer: Layer, cel: Surface, width: number, rect: CompositeRect, out: Float32Array): void {
  const src = cel.data;
  const mask = layer.mask;
  for (let ry = 0; ry < rect.h; ry += 1) {
    let p = (rect.y + ry) * width + rect.x;
    let q = ry * rect.w;
    for (let rx = 0; rx < rect.w; rx += 1, p += 1, q += 1) {
      let a = (src[p * 4 + 3] / 255) * layer.opacity;
      if (mask) a *= mask[p] / 255;
      out[q] = a;
    }
  }
}

/**
 * 문서 한 프레임을 한 장으로 굽는다.
 * `only` 를 주면 그 레이어들만(순서 그대로). `mergeDown` 이 두 장만 합칠 때 쓴다.
 */
export function composite(doc: Doc, frame: number, only?: Layer[], opts: CompositeOptions = {}): Surface {
  const out = opts.into && opts.into.w === doc.w && opts.into.h === doc.h ? opts.into : createSurface(doc.w, doc.h);
  /* 손댈 자리. 안 주면 판 전체. 판 밖으로 나가지 않게 잘라 둔다. */
  const rx = Math.max(0, Math.min(doc.w - 1, opts.rect ? opts.rect.x | 0 : 0));
  const ry = Math.max(0, Math.min(doc.h - 1, opts.rect ? opts.rect.y | 0 : 0));
  const rect: CompositeRect = {
    x: rx, y: ry,
    w: Math.max(0, Math.min(doc.w - rx, opts.rect ? opts.rect.w | 0 : doc.w)),
    h: Math.max(0, Math.min(doc.h - ry, opts.rect ? opts.rect.h | 0 : doc.h))
  };
  if (rect.w <= 0 || rect.h <= 0) return out;

  /* 섞는 판은 **사각형 크기**로만. 문서 크기로 잡으면 붓 자리 하나를 다시 섞는 데도
     4096^2 문서에서 268MB 를 새로 얻고 0 으로 채우게 됨. */
  const area = rect.w * rect.h;
  const buf = new Float32Array(area * 4);

  const layers = only || doc.layers;
  const onionBefore = only ? 0 : Math.max(0, opts.onionBefore || 0);
  const onionAfter = only ? 0 : Math.max(0, opts.onionAfter || 0);
  const onionOpacity = opts.onionOpacity == null ? 0.28 : opts.onionOpacity;

  /* 어니언스킨을 **먼저** 깐다. 앞뒤 프레임은 현재 프레임 밑에 옅게 눕는다. */
  const ghosts: Array<{ frame: number; alpha: number }> = [];
  for (let d = onionBefore; d >= 1; d -= 1) {
    if (frame - d >= 0) ghosts.push({ frame: frame - d, alpha: onionOpacity / d });
  }
  for (let d = onionAfter; d >= 1; d -= 1) {
    if (frame + d < doc.frames) ghosts.push({ frame: frame + d, alpha: onionOpacity / d });
  }

  /* 클리핑 밑판. **끼워 붙인 레이어가 실제로 있을 때만** 만들고, 만든 판은 재사용.
     예전에는 clip 이 하나도 없는 문서에서도 보통 레이어마다 문서 크기 배열을 새로 얻음
     (1024^2 에 20장이면 rect 합성 한 번에 80MB). */
  const anyClip = layers.some(layer => layer.clip);
  let clipBuf: Float32Array | null = null;

  const paint = (atFrame: number, alphaScale: number): void => {
    let clipAlpha: Float32Array | null = null;
    layers.forEach(layer => {
      if (!layer.visible) return;
      if (opts.soloLayer && layer.id !== opts.soloLayer) return;
      if (opts.skipLayer && layer.id === opts.skipLayer) return;
      const cel = celAt(layer, atFrame);
      if (!cel) return;
      if (layer.clip) {
        /* 끼워 붙인 레이어. 밑판 모양 밖은 안 보인다. 밑판이 없으면 그냥 보통 레이어. */
        drawLayerInto(buf, doc.w, rect, layer, cel, alphaScale, clipAlpha);
      } else {
        drawLayerInto(buf, doc.w, rect, layer, cel, alphaScale, null);
        if (!anyClip) return;
        if (!clipBuf) clipBuf = new Float32Array(area);
        alphaOf(layer, cel, doc.w, rect, clipBuf);
        clipAlpha = clipBuf;
      }
    });
  };

  ghosts.forEach(g => paint(g.frame, g.alpha));
  paint(frame, 1);

  /* 미리 곱해진 값을 되돌려 8비트로 굳힌다. 넘겨받은 판이면 그 자리를 **덮어쓴다** . 
     지운 자리가 옛 그림으로 남으면 안 되므로 알파 0 도 그대로 쓴다. */
  for (let ry = 0; ry < rect.h; ry += 1) {
    let pixel = (rect.y + ry) * doc.w + rect.x;
    let local = ry * rect.w;
    for (let rx = 0; rx < rect.w; rx += 1, pixel += 1, local += 1) {
      const i = pixel * 4;
      const j = local * 4;
      const a = buf[j + 3];
      if (a <= 0) {
        out.data[i] = 0; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 0;
        continue;
      }
      out.data[i] = Math.round((buf[j] / a) * 255);
      out.data[i + 1] = Math.round((buf[j + 1] / a) * 255);
      out.data[i + 2] = Math.round((buf[j + 2] / a) * 255);
      out.data[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/** 모든 프레임을 구워 낸다. GIF, 스프라이트시트 내보내기의 입구. */
export const compositeAll = (doc: Doc): Surface[] =>
  Array.from({ length: doc.frames }, (_unused, f) => composite(doc, f));

/** 스프라이트시트 한 장. 가로로 이어 붙인다(cols 를 주면 격자). */
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
