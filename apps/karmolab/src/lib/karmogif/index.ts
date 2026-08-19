/**
 * `lib/karmogif/` — GIF 인코더의 **약속(타입)과 받는 창구** 한 곳.
 *
 * 왜 여기 있나 (2026-08-19 판정, `lib/README.md` 3조건):
 *   만드는 곳은 `widgets/tools/gifenc.ts` 하나인데 쓰는 곳이 `asciiart`·`video2gif` **둘**이다
 *   (= 표면 2). 그런데 약속이 코드에 없어서 **쓰는 쪽마다 `GifApi` 를 따로 적어** 두었고,
 *   두 선언은 이미 서로 달랐다(`onProgress` 인자 이름). 한쪽이 인코더를 고치면 다른 쪽은
 *   컴파일러가 아무 말도 안 해 준다 — 그 틈을 없앤다.
 *
 * ★ 인코더 **코드**는 여기로 안 옮긴다. `window.KarmoGif` 는 게으름이 아니라 **일부러 늦게
 *   받는 통로**다(`widgets-lazy-meta.ts` 의 `tools/gifenc`). 정적 import 로 바꾸면 두 위젯
 *   번들이 인코더만큼(수십 KB) 커진다 — 위젯당 64KB 예산이 있는 곳이다.
 *   그래서 **약속은 여기, 코드는 늦게**가 이 파일의 존재 이유다.
 */

/** 한 장 = 픽셀 + 이 장을 얼마나 보여 줄지(ms). */
export interface KarmoGifFrame {
  data: Uint8ClampedArray;
  delayMs: number;
}

export interface KarmoGifOptions {
  width: number;
  height: number;
  frames: KarmoGifFrame[];
  /** 색 수 상한 (기본은 인코더가 정한다). */
  maxColors?: number;
  dither?: boolean;
  /** 0~1. 긴 굽기에서 화면이 멈춘 것처럼 보이지 않게 한다. */
  onProgress?: (ratio: number) => void;
}

export interface KarmoGifApi {
  encode: (o: KarmoGifOptions) => Blob;
  /** 장 사이에 숨 쉴 틈을 준다 — 화면이 안 얼어붙는다. */
  encodeAsync: (o: KarmoGifOptions) => Promise<Blob>;
}

/**
 * 지금 받아져 있으면 인코더를, 아니면 `undefined`.
 *
 * `undefined` 를 그대로 돌려준다 — 여기서 몰래 받아 오면 「굽기 단추를 눌렀는데 몇 초 뒤에야
 * 반응」이 된다. 받는 시점을 정하는 것은 부르는 화면의 몫이다.
 */
export function getKarmoGif(): KarmoGifApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { KarmoGif?: KarmoGifApi }).KarmoGif;
}
