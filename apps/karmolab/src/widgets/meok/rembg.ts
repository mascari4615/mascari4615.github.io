/**
 * 「먹」 — 배경 지우기 (TASK-KL-240 곁가지)
 *
 * 옛 편집 탭에 있던 기능을 이쪽으로 가져온다. 다른 점 하나가 전부다:
 * 옛 것은 **캔버스 한 장**을 통째로 바꿨고, 여기서는 **고른 레이어의 지금 셀**만 바꾼다.
 * 그래서 배경만 지운 뒤에도 밑그림·글자 레이어가 그대로 남는다.
 *
 * 계산은 브라우저 안에서 돈다(`@imgly/background-removal`). 처음 한 번은 모델을 받느라
 * 수십 초 걸리고, 그동안 화면이 멈추면 안 되므로 **워커**에 맡긴다. 워커가 막힌 환경
 * (모듈 워커를 못 만드는 곳)에서는 같은 일을 이 자리에서 한다 — 느리지만 되긴 된다.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

export type RembgModel = 'isnet' | 'isnet_fp16' | 'isnet_quint8';

export interface RembgProgress {
  /** 0..1 (모르면 -1) */
  ratio: number;
  key: string;
}

function workerCode(): string {
  return [
    'self.onmessage = async (event) => {',
    '  try {',
    '    const { blob, model } = event.data;',
    '    const mod = await import("' + CDN + '");',
    '    const run = mod.removeBackground || mod.default;',
    '    const progress = (key, current, total) => self.postMessage({ t: "p", key, current, total });',
    '    const options = (device) => ({ model, device, output: { format: "image/png", type: "foreground" }, progress });',
    '    let result;',
    '    try { result = await run(blob, options("gpu")); }',
    '    catch (_) { result = await run(blob, options("cpu")); }',
    '    self.postMessage({ t: "d", blob: result });',
    '  } catch (error) {',
    '    self.postMessage({ t: "e", message: (error && error.message) || String(error) });',
    '  }',
    '};'
  ].join('\n');
}

export interface RembgRun {
  promise: Promise<Blob>;
  cancel(): void;
}

/** 워커에 맡긴다. 취소하면 그 자리에서 워커를 죽인다(모델 내려받기도 함께 멈춘다). */
export function removeBackgroundInWorker(blob: Blob, model: RembgModel, onProgress: (p: RembgProgress) => void): RembgRun {
  const url = URL.createObjectURL(new Blob([workerCode()], { type: 'text/javascript' }));
  const worker = new Worker(url, { type: 'module' });
  let settled = false;
  const cleanup = (): void => {
    if (settled) return;
    settled = true;
    try { worker.terminate(); } catch { /* 이미 죽었으면 그만 */ }
    try { URL.revokeObjectURL(url); } catch { /* 마찬가지 */ }
  };
  const promise = new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { t: string; key?: string; current?: number; total?: number; blob?: Blob; message?: string };
      if (data.t === 'p') {
        onProgress({ key: data.key || '', ratio: data.total ? (data.current || 0) / data.total : -1 });
      } else if (data.t === 'd' && data.blob) {
        cleanup();
        resolve(data.blob);
      } else if (data.t === 'e') {
        cleanup();
        reject(new Error(data.message || 'rembg failed'));
      }
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'worker failed')); };
    worker.postMessage({ blob, model });
  });
  return { promise, cancel: cleanup };
}

/** 워커를 못 쓰는 곳에서의 뒷길 — 화면이 잠깐 멈춘다. */
export async function removeBackgroundHere(blob: Blob, model: RembgModel, onProgress: (p: RembgProgress) => void): Promise<Blob> {
  const mod = await import(/* @vite-ignore */ CDN) as {
    removeBackground?: (blob: Blob, options: unknown) => Promise<Blob>;
    default?: (blob: Blob, options: unknown) => Promise<Blob>;
  };
  const run = mod.removeBackground || mod.default;
  if (!run) throw new Error('rembg module missing');
  const options = (device: string): unknown => ({
    model, device,
    output: { format: 'image/png', type: 'foreground' },
    progress: (key: string, current: number, total: number) => onProgress({ key, ratio: total ? current / total : -1 })
  });
  try { return await run(blob, options('gpu')); }
  catch { return await run(blob, options('cpu')); }
}

/** 워커부터 해 보고, 막히면 이 자리에서 한다. 부르는 쪽은 어느 길로 갔는지 몰라도 된다. */
export function removeBackground(blob: Blob, model: RembgModel, onProgress: (p: RembgProgress) => void): RembgRun {
  try {
    return removeBackgroundInWorker(blob, model, onProgress);
  } catch {
    let cancelled = false;
    return {
      promise: removeBackgroundHere(blob, model, onProgress).then(result => {
        if (cancelled) throw new Error('cancelled');
        return result;
      }),
      cancel: () => { cancelled = true; }
    };
  }
}
