/**
 * 소리, 파일 도구가 함께 쓰는 것들 (TASK-KL-088)
 *
 * 특히 `toWav` 는 네 도구에 똑같이 복사돼 있었다. WAV 는 44바이트 머리말을 손으로 엮는데,
 * 숫자 하나만 어긋나도 **오류 없이** 재생만 이상해진다. 복사본이 넷이면 그 위험도 넷이다.
 * 그래서 한 곳으로 모았다. 각 위젯은 묶음으로 빌드되므로 여기 코드는 각자 안에 심긴다
 * (즉 이 파일을 먼저 불러야 하는 순서 문제가 생기지 않는다).
 */
import { t, loadNamespace } from '../../../lib/i18n';
import { sniffSampleRate } from './audio-rate';

/**
 * AudioBuffer → WAV(16비트 PCM). 브라우저에 저장 기능이 없어 머리말은 직접 엮음.
 *
 * `extraChunks` 는 data 뒤에 그대로 붙는다. 게임용 루프 지점(smpl) 같은 것.
 * 안 넘기면 예전과 같은 바이트.
 */
export function toWav(buffer: AudioBuffer, extraChunks?: Uint8Array): Blob {
  const numCh = buffer.numberOfChannels;
  const extra = extraChunks?.length ?? 0;
  const len = buffer.length * numCh * 2 + 44 + extra;
  const view = new DataView(new ArrayBuffer(len));
  const w = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  view.setUint32(4, len - 8, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt 덩어리 길이
  view.setUint16(20, 1, true); // 1 = 압축 없음
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true); // 초당 바이트
  view.setUint16(32, numCh * 2, true); // 한 묶음 크기
  view.setUint16(34, 16, true); // 표본 하나가 16비트
  w(36, 'data');
  view.setUint32(40, len - 44 - extra, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      // 범위를 안 자르면 큰 소리에서 값이 넘쳐 딱딱 튀는 잡음이 된다
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  if (extraChunks && extra) new Uint8Array(view.buffer).set(extraChunks, off);
  return new Blob([view], { type: 'audio/wav' });
}

interface Mp3Encoder {
  encodeBuffer: (l: Int16Array, r?: Int16Array) => Int8Array;
  flush: () => Int8Array;
}

/**
 * AudioBuffer → MP3.
 *
 * WAV 는 품질 손실이 없지만 1분에 10MB가 넘는다. 메일로 보내거나 메신저에 올릴 때 그게 걸림돌이다.
 * 그래서 MP3 를 함께 낸다. 압축기는 **그 자리에서 처음 쓸 때만** 받아 온다(150KB). 안 쓰는 사람이
 * 그 무게를 지지 않도록.
 */
export async function toMp3(buffer: AudioBuffer, kbps = 128): Promise<Blob> {
  await Toolbox.ensureScript?.('vendor/lame.min');
  const lame = (window as unknown as { lamejs?: { Mp3Encoder: new (ch: number, rate: number, kbps: number) => Mp3Encoder } }).lamejs;
  if (!lame) {
    /* 이 파일은 도구 여덟이 나눠 쓴다. 어느 묶음에 얹을지 정할 수 없어 제 묶음(`media`)을 둔다.
       여기까지 왔다는 건 이미 압축기를 받으러 갔다 왔다는 뜻이라, 한 번 더 기다려도 늦지 않다. */
    await loadNamespace('media');
    throw new Error(t('media.err.mp3'));
  }

  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new lame.Mp3Encoder(channels, buffer.sampleRate, kbps);

  // MP3 는 16비트 정수를 받는다. 범위를 안 자르면 큰 소리에서 넘쳐 잡음이 된다.
  const toInt16 = (src: Float32Array): Int16Array => {
    const out = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const s = Math.max(-1, Math.min(1, src[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };

  const left = toInt16(buffer.getChannelData(0));
  const right = channels > 1 ? toInt16(buffer.getChannelData(1)) : null;

  const parts: Int8Array[] = [];
  const block = 1152; // MP3 한 덩어리 크기. 이 단위로 넣어야 압축기가 제대로 돈다
  for (let i = 0; i < left.length; i += block) {
    const chunk = right
      ? encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block))
      : encoder.encodeBuffer(left.subarray(i, i + block));
    if (chunk.length) parts.push(chunk);
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(tail);

  return new Blob(parts as unknown as BlobPart[], { type: 'audio/mpeg' });
}

/** 고른 형식으로 소리를 낸다. 부르는 쪽이 형식마다 갈라 쓰지 않게 한 자리에 둔다. */
export async function encodeAudio(buffer: AudioBuffer, format: 'wav' | 'mp3'): Promise<Blob> {
  return format === 'mp3' ? toMp3(buffer) : toWav(buffer);
}

/** 사람이 읽는 용량. 소수 자리를 크기에 맞춰 줄여 눈에 덜 시끄럽게 한다. */
export function fileSize(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}

/** 초 → 0:00. 음수, NaN 이 들어와도 0:00 으로 떨어지게 한다. */
export function mmss(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ── 2026-08-13 에 모은 것 (TASK-KL-269) ─────────────────────────────
 *
 * 소리 도구 일곱을 재 보니 여전히 각자 하고 있었다: `AudioContext` 만들기 6/7 , 
 * `decodeAudioData` 6/7, 주소 만들기 6/7, 내려주기 6/7, 끌어다 놓기 5/7.
 * 특히 **소리틀(AudioContext) 을 도구마다 새로 만드는 것**이 나빴다. 브라우저가 동시에 열어
 * 두는 개수에 한도가 있어서, 도구를 몇 번 오가면 조용히 소리가 안 난다.
 */

/**
 * 소리틀은 **하나만** 쓴다. 브라우저는 이걸 무제한으로 안 열어 준다 . 
 * 도구마다 새로 만들면 오가다 어느 순간부터 소리가 조용히 사라진다(오류도 안 뜬다).
 *
 * **창(window) 에 둔다. 모듈 변수로 두면 안 된다** (TASK-KL-271 에서 검사가 잡았다):
 * 도구마다 꾸러미(bundle)를 따로 묶으므로 이 파일도 꾸러미마다 **복사본**이 된다 . 
 * 모듈 변수는 꾸러미마다 한 벌이라, 하나만이 실제로는 도구 수만큼이 된다.
 * 검사에서 소리틀이 다섯 개 세어져 드러났다. 꾸러미를 넘는 하나는 창에만 둘 수 있다.
 */
export function audioCtx(): AudioContext {
  const w = window as unknown as {
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
    __karmoAudioCtx?: AudioContext;
  };
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!w.__karmoAudioCtx || w.__karmoAudioCtx.state === 'closed') w.__karmoAudioCtx = new Ctor();
  return w.__karmoAudioCtx;
}

export { sniffSampleRate } from './audio-rate';

/**
 * **이 파일이 원래 몇 번 잰 소리인가.**
 *
 * `AudioBuffer.sampleRate` 를 그대로 적으면 안 된다. 브라우저는 소리를 **재생 장치의 값으로
 * 바꿔서** 주므로 그 수는 파일이 아니라 이 컴퓨터의 스피커를 가리킨다. 8kHz 로 녹음한 것을
 * 올려도 44.1kHz 라고 적히고, 다른 두 파일이 늘 같은 값으로 보인다.
 * 그래서 파일 머리를 직접 읽고, 모르는 형식일 때만 예전 값으로 물러선다.
 */
export async function loadAudioInfo(file: File | Blob): Promise<{ buffer: AudioBuffer; rate: number }> {
  const bytes = await file.arrayBuffer();
  const buffer = await audioCtx().decodeAudioData(bytes.slice(0));
  return { buffer, rate: sniffSampleRate(bytes) ?? buffer.sampleRate };
}

/** 파일을 소리로 읽는다. 여섯 곳이 각자 적던 세 줄. */
export async function loadAudio(file: File | Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  /* 사본을 넘긴다. `decodeAudioData` 는 받은 통을 자기 것으로 삼아 비운다.
   * 다만 통을 매번 새로 뜨므로 이 사본이 없어도 **겉으로는 같게 돈다**. 지키는 것은
   * `bytes` 를 여기서 더 쓰거나 밖으로 넘길 때. 앞으로를 위한 울타리다(PDF 쪽과 같다). */
  return await audioCtx().decodeAudioData(bytes.slice(0));
}

/**
 * **파형**. 초당 수만 개인 표본을 화면 폭만큼의 칸으로 줄인다.
 *
 * 칸마다 그 구간의 **가장 큰 값**을 남긴다(평균이 아니다). 평균을 내면 큰 소리가 뭉개져
 * 여기가 말하는 데인지 여기가 조용한 데인지가 안 보인다. 자를 자리를 찾는 게 목적이므로
 * 봉우리가 살아야 한다. AudioMass 가 보여 주는 그 그림이다.
 */
export function peaks(buffer: AudioBuffer, buckets = 240): number[] {
  const ch = buffer.getChannelData(0);
  const per = Math.max(1, Math.floor(ch.length / buckets));
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const from = i * per;
    const to = Math.min(ch.length, from + per);
    for (let j = from; j < to; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    out.push(max);
  }
  return out;
}

/** 파형을 캔버스에 그린다. 가운데를 0 으로 두고 위아래로 뻗는다. */
export function drawWave(canvas: HTMLCanvasElement, values: number[], color = '#6aa9ff'): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  const bw = w / values.length;
  for (let i = 0; i < values.length; i++) {
    /* 아주 작은 소리도 한 픽셀은 남긴다. 안 그리면 빈 파일인가로 읽힌다 */
    const bh = Math.max(1, values[i] * h * 0.92);
    ctx.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 1), bh);
  }
}

/** 내려주기. 여섯 곳이 각자 적던 네 줄. */
/**
 * 소리를 **재생기에 물린다**. 앞서 물려 있던 주소는 거둔다.
 *
 * 왜 필요한가 (2026-08-14 실측): 소리 도구 넷(`audiocut`, `audiofade`, `audiolevel`, `audiospeed`)이
 * 전부 `player.src = URL.createObjectURL(blob)` 만 하고 **거두는 코드가 하나도 없었다.**
 * 미리듣기를 누를 때마다 주소가 쌓인다. 오류도 안 뜨고 화면도 멀쩡해서 아무도 모른다.
 *
 * 내려받기(`download`)와 다르다: 저건 다 쓰면 바로 거두면 되지만, 이건 **화면이 그 주소를
 * 계속 쥐고 있어야** 한다. 그래서 다음 것을 물릴 때 앞 것을 거둔다가 맞는 규칙이다.
 */
/**
 * 소리든 영상이든 **재생기에 물린다**. 앞서 물려 있던 주소는 거둔다.
 *
 * 실측 2026-08-14: 영상, 녹화, 소리 도구 **여덟**이 전부 `el.src = createObjectURL(...)` 만 하고
 * 거두지 않았다(만들기 1, 거두기 0, 여덟 파일 전부). 결과를 다시 만들 때마다 주소가 쌓인다.
 * 영상은 한 판이 수십~수백 MB라 여기가 제일 아프다.
 *
 * 여덟이 각자 틀린 게 아니라 **여덟 다 같은 것을 안 하고 있었다**. 모으는 자리가 없으면
 * 아무도 안 한다. 그게 공용이 필요한 이유다.
 */
export function attachMedia(el: HTMLMediaElement, src: Blob | File): string {
  const prev = el.dataset.karmoObjectUrl;
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(src);
  el.dataset.karmoObjectUrl = url;
  el.src = url;
  return url;
}

export function attachAudio(el: HTMLAudioElement, src: Blob | File): string {
  const prev = el.dataset.karmoObjectUrl;
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(src);
  el.dataset.karmoObjectUrl = url;
  el.src = url;
  return url;
}

export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
