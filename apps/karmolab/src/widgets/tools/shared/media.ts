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
