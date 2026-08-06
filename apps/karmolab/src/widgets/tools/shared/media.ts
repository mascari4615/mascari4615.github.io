/**
 * 소리·파일 도구가 함께 쓰는 것들 (TASK-KL-088)
 *
 * 특히 `toWav` 는 네 도구에 똑같이 복사돼 있었다. WAV 는 44바이트 머리말을 손으로 엮는데,
 * 숫자 하나만 어긋나도 **오류 없이** 재생만 이상해진다 — 복사본이 넷이면 그 위험도 넷이다.
 * 그래서 한 곳으로 모았다. 각 위젯은 묶음으로 빌드되므로 여기 코드는 각자 안에 심긴다
 * (즉 이 파일을 먼저 불러야 하는 순서 문제가 생기지 않는다).
 */

/** AudioBuffer → WAV(16비트 PCM). 브라우저에 저장 기능이 없어 머리말을 직접 엮는다. */
export function toWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
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
  view.setUint32(40, len - 44, true);

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
  return new Blob([view], { type: 'audio/wav' });
}

interface Mp3Encoder {
  encodeBuffer: (l: Int16Array, r?: Int16Array) => Int8Array;
  flush: () => Int8Array;
}

/**
 * AudioBuffer → MP3.
 *
 * WAV 는 품질 손실이 없지만 1분에 10MB가 넘는다 — 메일로 보내거나 메신저에 올릴 때 그게 걸림돌이다.
 * 그래서 MP3 를 함께 낸다. 압축기는 **그 자리에서 처음 쓸 때만** 받아 온다(150KB) — 안 쓰는 사람이
 * 그 무게를 지지 않도록.
 */
export async function toMp3(buffer: AudioBuffer, kbps = 128): Promise<Blob> {
  await Toolbox.ensureScript?.('vendor/lame.min');
  const lame = (window as unknown as { lamejs?: { Mp3Encoder: new (ch: number, rate: number, kbps: number) => Mp3Encoder } }).lamejs;
  if (!lame) throw new Error('MP3 압축기를 불러오지 못했습니다');

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
  const block = 1152; // MP3 한 덩어리 크기 — 이 단위로 넣어야 압축기가 제대로 돈다
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

/** 초 → 0:00. 음수·NaN 이 들어와도 0:00 으로 떨어지게 한다. */
export function mmss(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
