/**
 * 화면 조각에서 숫자 읽기. 지켜보기에서 뽑아낸 공용 부품
 *
 * - tesseract.js 는 동일 출처 vendor (`js/vendor/tesseract/`). 처음 한 번 6MB
 * - 읽기 전처리는 `regionwatch-core.binarize`: 키우고, 흰 여백을 두르고, 이진화. 글자 인식기는
 *   글자가 칸을 꽉 채우면 못 읽고 흰 바탕의 검은 글자에 제일 강함
 * - 한 페이지에 워커 하나. 부르는 도구가 여럿이어도 `ensureDigitReader` 는 같은 것을 반환
 */
import { binarize } from './regionwatch-core';

interface OcrWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}
interface TesseractLike {
  createWorker(lang: string, oem: number, opts: Record<string, unknown>): Promise<OcrWorker>;
}

const VENDOR = '/apps/karmolab/js/vendor/tesseract/';
const DEFAULT_WHITELIST = '0123456789:,.%-';

export interface DigitReader {
  /** 캔버스 한 장을 읽어 글자로 */
  recognize(canvas: HTMLCanvasElement): Promise<string>;
  terminate(): Promise<void>;
}

let shared: Promise<DigitReader | null> | null = null;

/**
 * 숫자 읽기 준비. 실패하면 null. 두 번째 부름부터는 같은 워커
 * `onStatus` 로 준비 중, 준비됨을 통지
 */
export function ensureDigitReader(onStatus?: (state: 'loading' | 'ready' | 'failed', detail?: string) => void, whitelist = DEFAULT_WHITELIST): Promise<DigitReader | null> {
  if (shared) return shared;
  onStatus?.('loading');
  shared = (async () => {
    try {
      await Toolbox.ensureScript('vendor/tesseract/tesseract.min');
      const T = (window as unknown as { Tesseract?: TesseractLike }).Tesseract;
      if (!T) throw new Error('Tesseract global');
      const w = await T.createWorker('eng', 1, {
        workerPath: VENDOR + 'worker.min.js',
        corePath: VENDOR + 'tesseract-core-simd-lstm.wasm.js',
        langPath: VENDOR + 'lang',
        workerBlobURL: false,
        gzip: true
      });
      await w.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: '7' });
      onStatus?.('ready');
      const reader: DigitReader = {
        async recognize(canvas) {
          try {
            return (await w.recognize(canvas)).data.text;
          } catch {
            return '';
          }
        },
        async terminate() {
          shared = null;
          await w.terminate();
        }
      };
      return reader;
    } catch (err) {
      shared = null;
      onStatus?.('failed', (err as Error).message);
      return null;
    }
  })();
  return shared;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 원본 캔버스의 영역을 읽기 좋은 그림으로 `out` 캔버스에.
 * 높이 약 96px 로 키우고(최대 6배), 40% 흰 여백, 이진화
 */
export function prepareForOcr(src: CanvasImageSource, r: Rect, out: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const k = Math.max(1, Math.min(6, Math.round(96 / Math.max(1, r.h))));
  const pad = Math.round(r.h * k * 0.4);
  const cw = r.w * k;
  const ch = r.h * k;
  out.width = cw + pad * 2;
  out.height = ch + pad * 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, r.x, r.y, r.w, r.h, pad, pad, cw, ch);
  const img = ctx.getImageData(pad, pad, cw, ch);
  binarize(img.data);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.putImageData(img, pad, pad);
}
