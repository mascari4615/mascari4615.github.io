/**
 * 이미지를 다루는 **한 자리** (TASK-KL-261)
 *
 * 이미지 도구 열하나가 각자 이렇게 하고 있었다(2026-08-13 실측):
 *   - `new Image()` + `URL.createObjectURL` 로 파일 읽기 — **8/11**
 *   - `canvas.getContext('2d')` 로 다시 그리기 — **9/11**
 *   - `toBlob` 로 내보내기 — **7/11**
 *   - `a.download` 로 내려주기 — **9/11**
 *   - 끌어다 놓기(`dragover`) 배선 — **8/11**
 *
 * 같은 것을 아홉 번 적으면 **아홉 곳이 서로 다르게 낡는다**. 한 곳에서 「WebP 도 내보내기」나
 * 「HEIC 는 못 읽는다고 말하기」를 배워도 나머지 여덟은 모른다. 그래서 여기 하나만 둔다.
 *
 * [[TASK-KL-258]] 의 `shared/pdf.ts` 와 같은 이치다 — 다만 이쪽은 **바깥 라이브러리가 없다**.
 * 브라우저의 캔버스가 곧 엔진이라, 여기 모이는 것은 「어떻게 부르는가」의 되풀이다.
 */

/** 파일·blob 을 그림으로 읽는다. objectURL 은 **여기서 거둔다** — 각자 거두다 잊으면 샌다. */
export async function loadImage(src: File | Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = (): void => res(img);
      img.onerror = (): void => rej(new Error('이 그림은 못 읽습니다'));
      img.decoding = 'async';
      img.src = url;
    });
  } finally {
    if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** 원본 크기 — 「1920×1080」 한 줄을 위해 파일마다 다시 읽지 않게. */
export async function sizeOf(src: File | Blob): Promise<{ w: number; h: number }> {
  const img = await loadImage(src);
  return { w: img.naturalWidth, h: img.naturalHeight };
}

/**
 * 캔버스에 옮겨 그린다. `fit` 이 있으면 **비율을 지키며** 그 안에 들어가게 줄인다.
 * (늘리지는 않는다 — 작은 그림을 크게 그려 봤자 흐려지기만 한다.)
 */
export function toCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  fit?: { w?: number; h?: number }
): HTMLCanvasElement {
  const sw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const sh = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  let k = 1;
  if (fit?.w) k = Math.min(k, fit.w / sw);
  if (fit?.h) k = Math.min(k, fit.h / sh);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스를 못 씁니다');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export type ImageFormat = 'png' | 'jpeg' | 'webp';

/**
 * 내보내기. **JPEG 는 투명을 못 담아** 그냥 넘기면 투명한 데가 검게 나온다 —
 * 그래서 바탕을 먼저 깔고 그린다(각 도구가 저마다 잊던 자리다).
 */
export async function encode(
  canvas: HTMLCanvasElement,
  format: ImageFormat = 'png',
  quality = 0.9,
  background = '#fff'
): Promise<Blob> {
  let src = canvas;
  if (format === 'jpeg') {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('캔버스를 못 씁니다');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, 0);
    src = c;
  }
  return await new Promise<Blob>((res, rej) => {
    src.toBlob((b) => (b ? res(b) : rej(new Error('내보내지 못했습니다'))), `image/${format}`, quality);
  });
}

/** 이름 짓기 — 「사진.png」 + 「-작게」 → 「사진-작게.webp」 */
export function renameTo(original: string, suffix: string, format?: ImageFormat): string {
  const stem = original.replace(/\.[^.]+$/, '') || 'image';
  const ext = format ? (format === 'jpeg' ? 'jpg' : format) : original.split('.').pop() || 'png';
  return `${stem}${suffix}.${ext}`;
}

/** 내려주기 — 아홉 곳이 각자 적던 네 줄. */
export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
