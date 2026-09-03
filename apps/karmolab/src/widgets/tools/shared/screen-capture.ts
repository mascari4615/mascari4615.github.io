/**
 * 화면 공유 프레임 받기. 지켜보기에서 뽑아낸 공용 부품
 *
 * - `getDisplayMedia` 로 받은 트랙의 프레임을 오는 대로 넘긴다. `MediaStreamTrackProcessor` 가 있으면 시계 없이,
 *   없으면 영상 요소 + 워커 시계 (워커 시계는 덮어 둔 탭에서도 안 느려짐)
 * - 프레임은 그리는 함수로만 노출. 부르는 쪽이 자기 캔버스에 그린다. 화면은 어디로도 안 나감
 * - 브라우저의 공유 중지도 `onEnded` 로 통지
 */

interface VideoFrameLike {
  close(): void;
  displayWidth: number;
  displayHeight: number;
}
interface TrackProcessorLike {
  readable: ReadableStream<VideoFrameLike>;
}

export interface CaptureFrame {
  /** 이 프레임을 캔버스 (0,0) 에 그리기 */
  draw(ctx: CanvasRenderingContext2D): void;
  width: number;
  height: number;
}

export interface CaptureHandle {
  stream: MediaStream;
  stop(): void;
}

export interface CaptureOptions {
  frameRate?: number;
  /** 화면 소리(탭, 시스템)도 받을지. 녹화 도구용 */
  audio?: boolean;
  /** 워커 시계 간격(ms). 프로세서가 없는 브라우저에서만 */
  tickMs?: number;
  /** 프레임이 필요 없으면(녹화만) 생략. 그러면 스트림만 넘기고 프레임 루프는 안 돈다 */
  onFrame?(frame: CaptureFrame): void;
  onEnded?(): void;
}

export function displayCaptureSupported(): boolean {
  return !!navigator.mediaDevices?.getDisplayMedia;
}

/**
 * 화면 공유를 시작하고 프레임을 흘려 준다. 사용자가 창 고르기를 취소하면 `null`
 */
export async function startDisplayCapture(o: CaptureOptions): Promise<CaptureHandle | null> {
  if (!displayCaptureSupported()) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: o.frameRate ?? 10 }, audio: !!o.audio });
  } catch {
    return null;
  }
  const track = stream.getVideoTracks()[0];
  let alive = true;
  let stopFrames: (() => void) | null = null;

  const stop = (): void => {
    if (!alive) return;
    alive = false;
    stopFrames?.();
    stopFrames = null;
    stream.getTracks().forEach((tr) => tr.stop());
  };
  track.addEventListener('ended', () => {
    if (!alive) return;
    stop();
    o.onEnded?.();
  });

  const onFrame = o.onFrame;
  if (!onFrame) return { stream, stop };

  const Proc = (window as unknown as { MediaStreamTrackProcessor?: new (x: { track: MediaStreamTrack }) => TrackProcessorLike }).MediaStreamTrackProcessor;
  if (Proc) {
    const reader = new Proc({ track }).readable.getReader();
    stopFrames = (): void => {
      void reader.cancel().catch(() => undefined);
    };
    void (async () => {
      while (alive) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        try {
          onFrame({ draw: (ctx) => ctx.drawImage(value as unknown as CanvasImageSource, 0, 0), width: value.displayWidth, height: value.displayHeight });
        } finally {
          value.close();
        }
      }
    })();
    return { stream, stop };
  }

  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.srcObject = stream;
  await v.play().catch(() => undefined);
  const tick = o.tickMs ?? 250;
  const worker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${tick});`], { type: 'text/javascript' })));
  worker.onmessage = (): void => {
    if (!alive || !v.videoWidth) return;
    onFrame({ draw: (ctx) => ctx.drawImage(v, 0, 0), width: v.videoWidth, height: v.videoHeight });
  };
  stopFrames = (): void => {
    worker.terminate();
    v.srcObject = null;
  };
  return { stream, stop };
}
