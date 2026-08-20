/**
 * 모양을 알아보고 배경 빼기 — 이음새 (흡혈 원장 14·15·16 / TASK-KL-238)
 *
 * `bgremove` 는 원래 **색**으로만 배경을 지웠다: 가장자리에서 이어진 비슷한 색을 훑어 나가는
 * 방식이라 증명사진·상품 사진에서는 잘 되고, 그 밖에서는 「되는 줄 알았는데 안 되는」 도구였다.
 * 도구 안내문에 「사람이나 물체의 모양을 알아보지는 않습니다 — 그건 학습 모형이 필요하고
 * 이 사이트는 그런 것을 받지 않습니다」라고 적혀 있었다. 그 한 줄이 **원장에서 셋(14·15·16)을
 * 묶어 막고 있던 것**이다.
 *
 * ★ 「모델을 어디에 둘까」는 새로 정할 게 없었다 — 이 저장소가 이미 정해 두었다
 * (`ai-engine.ts` 2026-08-10): **저장소에 안 넣는다. 켠 사람만 그때 받는다. 판은 못 박는다.**
 * 배경 빼기도 같은 자리에 선다. 그래서 이 도구를 안 켠 사람은 1바이트도 더 나르지 않는다.
 *
 * ★ 겹을 둘로 나눈 이유 (실측 2026-08-20, HEAD 로 잰 크기다)
 * - **사람** = MODNet · Apache-2.0 · fp16 13MB / q8 6.6MB. 가볍고 라이선스가 깨끗하다.
 * - **아무거나** = RMBG-1.4 · fp16 88MB / q8 44MB. 물건·동물까지 되지만 **비상업 라이선스**다.
 * 기본을 가벼운 쪽에 두고, 무거운 쪽은 사람이 알고 고르게 한다 — 44MB 를 말없이 받아 가는 건
 * 남의 데이터 요금이다. 라이선스도 화면에 적는다. 숨기면 나중에 우리가 곤란해진다.
 *
 * 이 파일에는 화면도 캔버스도 없다. 「어떤 모델을 · 어떤 모양으로 받아 · 어떻게 오려내나」만
 * 담는다. 그래야 모델 없이, GPU 없이, Node 에서 규칙을 잰다.
 */
import type { EngineModule } from './ai-engine';
import { t, loadNamespace } from './i18n';

/* 위젯이 아니라 셸·라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('aicutout');

/** 오려내기 겹. 화면은 이 이름만 알면 된다. */
export type CutoutKind = 'person' | 'anything';

export interface CutoutModel {
  kind: CutoutKind;
  /** 판을 박은 이름. 올릴 때는 여기 한 줄만 고친다. */
  repo: string;
  /** WebGPU 가 있을 때 받는 크기 (MB, fp16). */
  fp16Mb: number;
  /** WebGPU 가 없어 wasm 으로 돌 때 받는 크기 (MB, q8). */
  q8Mb: number;
  /** 라이선스 — **화면에 그대로 적는다.** */
  license: string;
  /** 상업적으로 써도 되나. `false` 면 화면이 그 사실을 말해야 한다. */
  commercial: boolean;
}

export const CUTOUT_MODELS: Record<CutoutKind, CutoutModel> = {
  person: {
    kind: 'person',
    repo: 'Xenova/modnet',
    fp16Mb: 13,
    q8Mb: 7,
    license: 'Apache-2.0',
    commercial: true
  },
  anything: {
    kind: 'anything',
    repo: 'briaai/RMBG-1.4',
    fp16Mb: 88,
    q8Mb: 44,
    license: 'BRIA RMBG-1.4 (비상업)',
    commercial: false
  }
};

/**
 * 이 브라우저에서 저 모델이 **실제로 받는 크기**.
 *
 * 「대략 44MB」라고 한 줄 박아 두면 반은 거짓말이 된다 — WebGPU 가 있는 자리와 없는 자리가
 * 두 배 넘게 차이 난다. 게이트는 *이 기기에서 진짜 받을 숫자*를 보여 줘야 한다.
 */
export function sizeMbFor(model: CutoutModel, webgpu: boolean): number {
  return webgpu ? model.fp16Mb : model.q8Mb;
}

/** 그 기기에서 쓸 수 판(dtype). WebGPU 는 fp16 을 그대로 먹고, wasm 은 q8 이 훨씬 빠르다. */
export function dtypeFor(webgpu: boolean): 'fp16' | 'q8' {
  return webgpu ? 'fp16' : 'q8';
}

/** 오려낸 결과 — 캔버스에 그대로 얹을 수 있는 RGBA 한 장. */
export interface Cutout {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * 모델이 내주는 그림의 모양이 판마다 다르다 — 회색 한 겹(마스크)일 때도, RGB 일 때도,
 * 이미 알파가 붙은 RGBA 일 때도 있다. **받은 것을 그대로 믿지 않고** 우리 모양으로 편다.
 *
 * 화면 세 곳이 각자 뜯으면 그중 한 곳이 반드시 틀린다. 그러니 여기 한 곳에서만 편다.
 */
export function toRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  channels: number
): Uint8ClampedArray {
  const count = width * height;
  if (data.length < count * channels) throw new Error(t('aicutout.err.short'));
  const out = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const s = i * channels;
    const d = i * 4;
    if (channels === 1) {
      /* 회색 한 겹은 **색이 아니라 마스크**다 — 흰 데를 남기고 검은 데를 지운다. */
      out[d] = out[d + 1] = out[d + 2] = 255;
      out[d + 3] = data[s];
    } else if (channels === 3) {
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = 255;
    } else {
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = data[s + 3];
    }
  }
  return out;
}

/**
 * 원본 색 + 모델이 준 알파. 모델이 알파만 주는 경우(마스크)를 위한 자리다.
 *
 * 원본 색을 버리고 모델이 낸 그림을 그대로 쓰면 **줄어든 크기로 돌아온 사진**을 쓰게 된다
 * (모델은 대개 1024 같은 고정 크기로 본다). 색은 원본에서, 모양만 모델에서 — 그게 맞다.
 */
export function applyAlpha(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const count = rgba.length / 4;
  if (alpha.length !== count) throw new Error(t('aicutout.err.mismatch'));
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  for (let i = 0; i < count; i++) out[i * 4 + 3] = alpha[i];
  return out;
}

/** 알파 한 겹만 뽑아낸다 (지우개·영상 겹이 다시 쓴다). */
export function alphaOf(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 3];
  return out;
}

/**
 * 알파 한 겹을 다른 크기로 옮긴다.
 *
 * 모델은 자기가 보기 좋은 크기로 그림을 본다. 대개는 원래 크기로 돌려주지만 **판에 따라
 * 안 그럴 때가 있고**, 그때 크기를 안 맞추면 알파가 한 칸씩 밀려 사람 옆에 유령이 생긴다.
 * 가까운 점을 그대로 집는다 — 알파는 색이 아니라 **가리개**라, 부드럽게 섞으면 오히려
 * 테두리에 반투명한 띠가 생긴다.
 */
export function resampleAlpha(
  alpha: Uint8ClampedArray | Uint8Array,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): Uint8ClampedArray {
  if (fromW === toW && fromH === toH) return new Uint8ClampedArray(alpha);
  if (fromW <= 0 || fromH <= 0 || toW <= 0 || toH <= 0) throw new Error(t('aicutout.err.mismatch'));
  const out = new Uint8ClampedArray(toW * toH);
  for (let y = 0; y < toH; y++) {
    const sy = Math.min(fromH - 1, Math.floor((y * fromH) / toH));
    for (let x = 0; x < toW; x++) {
      const sx = Math.min(fromW - 1, Math.floor((x * fromW) / toW));
      out[y * toW + x] = alpha[sy * fromW + sx];
    }
  }
  return out;
}

/**
 * 얼마나 남았나 (0~1). 「지웠다」가 아니라 **「남았다」**를 센다.
 *
 * 0 에 가까우면 모델이 아무것도 못 찾은 것이고, 1 에 가까우면 아무것도 안 지운 것이다.
 * 둘 다 사람에게는 「안 됐다」로 보이지만 **고칠 방법이 정반대**라 갈라서 말해야 한다.
 */
export function keptRatio(alpha: Uint8ClampedArray | Uint8Array): number {
  if (alpha.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) sum += alpha[i];
  return sum / (alpha.length * 255);
}

/**
 * 남은 것을 감싸는 네모. 「여백까지 잘라 주기」에 쓴다.
 *
 * 아무것도 안 남았으면 `null` 이다 — 0×0 짜리 네모를 돌려주면 부르는 쪽이 캔버스를 0 으로
 * 만들어 버리고, 그건 오류 없이 사라지는 종류의 사고다.
 */
export function trimBox(
  alpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 8
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export interface CutoutOptions {
  /** 0~100. 모델 받기·처리 진행률. */
  onProgress?: (pct: number) => void;
  /** WebGPU 를 쓰나. 크기·판(dtype)이 여기서 갈린다. */
  webgpu?: boolean;
}

/** 모델에게 그림을 넘기는 모양. 브라우저에서는 blob/data 주소 한 줄이면 된다. */
export type CutoutSource = string;

/**
 * 실제로 오려낸다.
 *
 * 엔진(`ai-engine`)을 **밖에서 받는다** — 이 파일이 스스로 9MB 를 데려오면 시험이 못 돈다.
 * 그리고 그 편이 맞다: 도구 하나가 엔진을 언제 데려올지는 도구가 정한다.
 */
export async function cutout(
  engine: EngineModule,
  source: CutoutSource,
  kind: CutoutKind = 'person',
  opts: CutoutOptions = {}
): Promise<Cutout> {
  const model = CUTOUT_MODELS[kind];
  const webgpu = opts.webgpu === true;

  const pipe = (await engine.pipeline('background-removal', model.repo, {
    device: webgpu ? 'webgpu' : 'wasm',
    dtype: dtypeFor(webgpu),
    progress_callback: (p: { progress?: number }) => {
      if (typeof p?.progress === 'number') opts.onProgress?.(Math.round(p.progress));
    }
  })) as (input: CutoutSource) => Promise<unknown>;

  const raw = await pipe(source);
  return normalize(raw);
}

interface RawImageLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  channels: number;
}

/**
 * 모델이 낸 것을 우리 모양으로. 판마다 **한 장**을 주기도 하고 **한 장짜리 배열**을 주기도 한다.
 * 여기서 한 번만 갈라 둔다 — 도구 쪽에 `Array.isArray` 가 흩어지면 곧 한 곳이 틀린다.
 */
export function normalize(raw: unknown): Cutout {
  const first = (Array.isArray(raw) ? raw[0] : raw) as RawImageLike | undefined;
  if (
    first === undefined ||
    typeof first.width !== 'number' ||
    typeof first.height !== 'number' ||
    first.data === undefined
  ) {
    throw new Error(t('aicutout.err.shape'));
  }
  const channels = typeof first.channels === 'number' ? first.channels : first.data.length / (first.width * first.height);
  return {
    width: first.width,
    height: first.height,
    rgba: toRgba(first.data, first.width, first.height, Math.round(channels))
  };
}
