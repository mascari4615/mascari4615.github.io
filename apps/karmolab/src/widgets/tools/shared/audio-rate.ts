/**
 * **파일이 원래 몇 번 잰 소리인가**. 재생 장치가 아니라 *파일*의 표본률 (TASK-KL-269).
 *
 * 왜 따로 읽나: 브라우저의 `decodeAudioData` 는 소리를 **재생 장치의 표본률로 바꿔서** 준다.
 * 그래서 `AudioBuffer.sampleRate` 는 늘 이 컴퓨터 스피커의 값이다 . 
 * 8kHz 로 녹음한 파일을 올려도 44.1kHz 라고 적히고, 서로 다른 두 파일이 언제나 같은 값으로 보인다.
 * 표본률이라 적어 놓고 파일과 상관없는 수를 보여 주고 있었던 셈이다.
 * 실제로 검사 하나가 그 자리에서 컴퓨터마다 다른 답을 내며 빨강이 됐다(장치가 달라서).
 *
 * 그래서 **파일 머리를 직접 읽는다**. 모르는 형식이면 `null`. 부르는 쪽이 예전 값으로 물러선다.
 * 여기에는 브라우저 것이 하나도 안 들어간다(순수 함수). 그래서 브라우저 없이 시험할 수 있다.
 */

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};
const u32le = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);

/** 어디에 있는지 모르는 네 글자를 앞쪽에서만 찾는다 (통째로 훑으면 큰 파일에서 느리다). */
function find(b: Uint8Array, s: string, limit: number): number {
  const end = Math.min(b.length - s.length, limit);
  for (let i = 0; i <= end; i++) if (ascii(b, i, s)) return i;
  return -1;
}

const MP3_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000] // MPEG-2.5
};

/**
 * 파일 머리에서 표본률을 읽는다. WAV, FLAC, MP3, Ogg(Vorbis/Opus), MP4/M4A.
 * @returns Hz, 또는 모르면 `null`
 */
export function sniffSampleRate(input: ArrayBuffer | Uint8Array): number | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 16) return null;

  /* WAV. `fmt ` 덩이를 따라간다. 덩이 순서는 정해져 있지 않아 앞에서부터 걷는다. */
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) {
    let at = 12;
    while (at + 8 <= b.length) {
      const size = u32le(b, at + 4);
      if (ascii(b, at, 'fmt ')) return u32le(b, at + 12) || null;
      at += 8 + size + (size & 1); // 덩이는 짝수 자리에서 시작한다
    }
    return null;
  }

  /* FLAC. 첫 덩이(STREAMINFO) 안, 앞에서 80비트 뒤의 20비트가 표본률이다. */
  if (ascii(b, 0, 'fLaC') && b.length > 21) {
    const s = 8; // 4(fLaC) + 4(덩이 머리)
    return ((b[s + 10] << 12) | (b[s + 11] << 4) | (b[s + 12] >> 4)) || null;
  }

  /* Ogg. 첫 쪽(page) 안에 어떤 소리인지가 적혀 있다. */
  if (ascii(b, 0, 'OggS')) {
    const opus = find(b, 'OpusHead', 4096);
    if (opus >= 0) return u32le(b, opus + 12) || null; // 원래 녹음한 값 (풀 때는 48k 로 나온다)
    const vorbis = find(b, 'vorbis', 4096);
    if (vorbis >= 0) return u32le(b, vorbis + 11) || null; // 'vorbis' 뒤 version(4)+channels(1)
    return null;
  }

  /* MP4/M4A(그리고 소리를 품은 mp4 영상). 소리 칸(`mp4a`) 머리의 16.16 고정소수 */
  if (ascii(b, 4, 'ftyp')) {
    const at = find(b, 'mp4a', 1 << 20);
    if (at >= 0 && at + 34 <= b.length) return ((b[at + 24] << 8) | b[at + 25]) || null;
    return null;
  }

  /* MP3. ID3 꼬리표를 건너뛰고 첫 마디 머리를 읽는다. */
  {
    let at = 0;
    if (ascii(b, 0, 'ID3') && b.length > 10) {
      /* 크기가 **7비트씩** 적혀 있다 (동기화 바이트와 안 겹치게 하려고) */
      at = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
    }
    const end = Math.min(b.length - 4, at + (1 << 16));
    for (let i = at; i <= end; i++) {
      if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
      const ver = (b[i + 1] >> 3) & 3;
      const idx = (b[i + 2] >> 2) & 3;
      const table = MP3_RATES[ver];
      if (table && idx < 3) return table[idx];
    }
  }

  /* 무엇인지 못 알아봤다. 모른다와 없다는 다르다. 부르는 쪽이 정하게 둔다. */
  return null;
}
