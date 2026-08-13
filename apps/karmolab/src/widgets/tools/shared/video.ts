/**
 * 영상 도구가 함께 쓰는 것들 (TASK-KL-088)
 *
 * `seekTo` 는 세 도구에 똑같이 복사돼 있었다. 그런데 이건 **한 번 사고를 낸 코드**다 —
 * 이미 그 시각에 가 있으면 「옮겼다」 신호가 오지 않아, 기다리기만 하면 도구가 오류도 없이 멈춘다.
 * 손잡이를 끌어 구간을 잡으면 그 자리를 미리 보여 주느라 이미 도착해 있으므로, 바로 이어서 누르면
 * 그 상황이 된다. 복사본이 셋이면 그 함정도 셋이고, 한 곳만 고치면 나머지가 조용히 남는다.
 * 그래서 한 곳으로 모았다.
 *
 * **2026-08-13 (TASK-KL-268) 에 더 모았다.** 영상 도구 아홉을 재 보니 여전히 흩어져 있었다:
 * 파일을 영상으로 읽기 8/9 · 내려주기 8/9 · 길이·크기 알아내기 4/9 · 프레임 그리기 4/9 ·
 * 끌어다 놓기 7/9. 아래 손잡이들이 그 자리다.
 */

/**
 * 영상을 그 시각으로 옮기고, 옮겨질 때까지 기다린다.
 *
 * - 이미 도착해 있으면 **기다리지 않고 바로** 넘어간다 (신호가 오지 않기 때문)
 * - 신호가 끝내 안 와도 정해진 시간 뒤 진행한다 (영원히 멈추는 것보다 낫다)
 */
export function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.min(Math.max(0, time), Math.max(0, dur - 0.02));
    if (Math.abs(video.currentTime - target) < 0.01) return resolve();
    let timer = 0;
    const done = (): void => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    timer = window.setTimeout(done, timeoutMs);
    video.currentTime = target;
  });
}

/**
 * 이 브라우저가 담을 수 있는 형식 중 가장 나은 것.
 * 아무것도 안 되면 빈 문자열 — 부르는 쪽이 기본값에 맡기면 된다.
 */
export function pickRecordType(): string {
  const wanted = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const t of wanted) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

/* ── 2026-08-13 에 모은 것 (TASK-KL-268) ─────────────────────────── */

export interface VideoMeta {
  /** 길이(초) — 못 알아내면 0 */
  duration: number;
  width: number;
  height: number;
}

/**
 * 파일을 영상으로 읽는다. **길이를 알 때까지 기다린다** — 브라우저는 파일을 붙이자마자
 * `duration` 을 알려 주지 않아서, 바로 읽으면 `NaN` 이 나온다(도구마다 따로 겪던 자리다).
 *
 * 주소는 여기서 거둔다. 각자 거두다 잊으면 큰 파일이 그대로 메모리에 남는다.
 */
export function loadVideo(file: File | Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    const fail = (): void => {
      URL.revokeObjectURL(url);
      reject(new Error('이 영상은 못 읽습니다'));
    };
    v.onerror = fail;
    v.onloadedmetadata = (): void => {
      /* 어떤 webm 은 길이가 Infinity 로 온다 — 끝까지 한 번 밀어 보면 제대로 잡힌다 */
      if (!Number.isFinite(v.duration) || v.duration === 0) {
        v.currentTime = 1e101;
        v.ontimeupdate = (): void => {
          v.ontimeupdate = null;
          v.currentTime = 0;
          resolve(v);
        };
        return;
      }
      resolve(v);
    };
    v.src = url;
  });
}

export function metaOf(v: HTMLVideoElement): VideoMeta {
  return {
    duration: Number.isFinite(v.duration) ? v.duration : 0,
    width: v.videoWidth,
    height: v.videoHeight
  };
}

/** 그 시각의 한 장면을 그린다. `maxW` 는 **긴 변** 기준으로 줄인다. */
export async function frameAt(v: HTMLVideoElement, time: number, maxW = 320): Promise<HTMLCanvasElement> {
  await seekTo(v, time);
  const k = Math.min(1, maxW / (v.videoWidth || maxW));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((v.videoWidth || maxW) * k));
  c.height = Math.max(1, Math.round((v.videoHeight || maxW) * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스를 못 씁니다');
  ctx.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

/**
 * **필름 스트립** — 영상 전체에서 고르게 몇 장을 뽑는다.
 *
 * 첫 장면 하나만 보여 주면 「이 영상이 맞나」밖에 못 판단한다. 어디를 자를지·어디서 GIF 를
 * 만들지는 **흐름이 보일 때** 정해진다(Clideo·Kapwing 의 타임라인이 하는 일).
 * 맨 끝은 검은 화면일 때가 많아 조금 앞에서 뽑는다.
 */
export async function filmstrip(
  v: HTMLVideoElement,
  count = 8,
  maxW = 220,
  each?: (i: number, canvas: HTMLCanvasElement, at: number) => void
): Promise<HTMLCanvasElement[]> {
  const dur = metaOf(v).duration;
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    const at = dur > 0 ? (dur * (i + 0.5)) / count : 0;
    try {
      const c = await frameAt(v, at, maxW);
      out.push(c);
      each?.(i, c, at);
    } catch {
      /* 한 장 못 뽑아도 나머지는 보여 준다 */
    }
  }
  return out;
}

/** 내려주기 — 여덟 곳이 각자 적던 네 줄. */
export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * **이미 있는 주소**를 내려준다 (dataURL, 또는 다른 데서도 쓰는 objectURL).
 *
 * `download(blob, name)` 과 갈라 둔 이유는 **거두느냐**다 — 이쪽 주소는 화면이 계속 쓰고 있어서
 * 거두면 그 자리 그림이 깨진다. 한 함수에 섞으면 어느 쪽인지 부르는 쪽이 매번 판단해야 한다.
 */
export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/**
 * **화면의 `<video>` 에 파일을 물린다** (TASK-KL-281).
 *
 * `loadVideo` 는 안 보이는 요소를 새로 만든다. 그런데 도구들은 대개 **화면에 이미 있는** 재생기에
 * 물려야 한다(사람이 보면서 구간을 잡으니까). 그래서 같은 함정을 여기서도 넘겨야 한다:
 *
 * `MediaRecorder` 로 만든 webm(= 우리 「화면 녹화」가 만드는 것)은 길이가 안 적혀 있어
 * `duration` 이 `Infinity` 로 오는 판이 있다. 끝까지 한 번 밀어 보면 그때 제대로 잡힌다.
 *
 * ⚠ **지금 Chromium 에서는 그 일이 안 일어난다** (2026-08-13 실측: 되감기를 빼도 검사가 안 빨개진다).
 * 그러니 이 되감기는 **고장을 고친 줄이 아니라 다른 판을 위한 울타리**다 — 도구들을 여기로 모은
 * 값어치는 「같은 배선을 네 곳에 두지 않는다」쪽이다. 과장해서 적지 않는다
 * (`rules/quality.md § 설명문이 거짓말이면 아무 검사에도 안 걸린다`).
 */
export function attachVideo(el: HTMLVideoElement, file: File | Blob, timeoutMs = 8000): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (ok) resolve(metaOf(el));
      else {
        URL.revokeObjectURL(url);
        reject(new Error('이 영상은 못 읽습니다'));
      }
    };
    const timer = window.setTimeout(() => finish(Number.isFinite(el.duration)), timeoutMs);
    el.onerror = (): void => finish(false);
    el.onloadedmetadata = (): void => {
      if (Number.isFinite(el.duration) && el.duration > 0) return finish(true);
      /* 길이를 안 적어 둔 판 — 끝까지 밀었다가 돌아오면 그제야 길이가 잡힌다 */
      el.ontimeupdate = (): void => {
        el.ontimeupdate = null;
        el.currentTime = 0;
        finish(true);
      };
      el.currentTime = 1e101;
    };
    el.src = url;
  });
}
