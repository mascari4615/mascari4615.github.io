/**
 * 흥. 내보내기 계산 (TASK-KL-220).
 *
 * 렌더된 표본을 두고 하는 판단(피크, 클리핑, 정규화, 모노 합치기)과 어디부터 어디까지 계산.
 * AudioBuffer 를 직접 만들지 않고 최소 모양(`PcmLike`)만 요구하므로 단위 테스트로 닫힌다.
 */

export interface PcmLike {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export type ExportRangeMode = 'song' | 'loop' | 'selection';

export interface BeatRange {
  from: number;
  to: number;
}

export interface PeakReport {
  /** 0 이상. 1 을 넘으면 깎인다. */
  peak: number;
  /** 1 을 넘은 표본 수. */
  clipped: number;
  dbfs: number;
}

const MIN_DB = -120;

export function toDbfs(peak: number): number {
  return peak > 0 ? Math.max(MIN_DB, 20 * Math.log10(peak)) : MIN_DB;
}

export function analysePeak(buffer: PcmLike): PeakReport {
  let peak = 0;
  let clipped = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      const value = Math.abs(data[index]);
      if (value > peak) peak = value;
      if (value > 1) clipped++;
    }
  }
  return { peak, clipped, dbfs: toDbfs(peak) };
}

/** 피크를 목표 dBFS 로 올리거나 내리는 배수. 무음이면 1 (0 으로 나누지 않는다). */
export function normalizeGain(peak: number, targetDb = -1): number {
  if (peak <= 0) return 1;
  return Math.pow(10, targetDb / 20) / peak;
}

/**
 * WAV 의 smpl 덩어리. 게임 엔진이 읽는 루프 지점.
 *
 * 단위는 초가 아니라 **표본 번호**. 손으로 적다 가장 많이 틀리는 자리라
 * 여기서 한 번만 엮는다. 36바이트 머리 + 루프 하나 24바이트.
 */
export function smplChunk(sampleRate: number, loopStartSample: number, loopEndSample: number, rootPitch = 60): Uint8Array {
  const start = Math.max(0, Math.floor(loopStartSample));
  const end = Math.max(start + 1, Math.floor(loopEndSample));
  const bytes = new Uint8Array(68);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string): void => { for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index)); };
  tag(0, 'smpl');
  view.setUint32(4, 60, true);
  view.setUint32(8, 0, true);
  view.setUint32(12, 0, true);
  view.setUint32(16, Math.round(1e9 / Math.max(1, sampleRate)), true);
  view.setUint32(20, Math.max(0, Math.min(127, Math.round(rootPitch))), true);
  view.setUint32(24, 0, true);
  view.setUint32(28, 0, true);
  view.setUint32(32, 0, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 0, true);
  view.setUint32(44, 0, true);
  view.setUint32(48, 0, true);
  view.setUint32(52, start, true);
  view.setUint32(56, end, true);
  view.setUint32(60, 0, true);
  view.setUint32(64, 0, true);
  return bytes;
}

/** 박을 표본 번호로. 게임에 넣는 루프 지점은 초가 아니라 표본으로 적는다 */
export function beatToSample(beat: number, bpm: number, sampleRate: number): number {
  return Math.round(beat * (60 / bpm) * sampleRate);
}

/** 인트로, 루프, 아웃트로 세 구간. 루프 구간이 곡 전체면 루프 하나만 나온다 */
export function loopSections(song: BeatRange, loop: BeatRange): { name: 'intro' | 'loop' | 'outro'; from: number; to: number }[] {
  const start = Math.max(song.from, Math.min(loop.from, song.to));
  const end = Math.min(song.to, Math.max(loop.to, start));
  const sections: { name: 'intro' | 'loop' | 'outro'; from: number; to: number }[] = [];
  if (start > song.from) sections.push({ name: 'intro', from: song.from, to: start });
  sections.push({ name: 'loop', from: start, to: Math.max(start + 0.001, end) });
  if (song.to > end) sections.push({ name: 'outro', from: end, to: song.to });
  return sections;
}

/** 여러 벌을 한 배수로 맞춘다. 트랙마다 따로 맞추면 트랙 사이 음량 관계가 깨진다 */
export function commonNormalizeGain(peaks: number[], targetDb = -1): number {
  const loudest = peaks.reduce((high, peak) => (peak > high ? peak : high), 0);
  return normalizeGain(loudest, targetDb);
}

/** 소리가 다 사라질 때까지 남길 시간(초). 가장 긴 꼬리와 잔향 중 큰 쪽 */
export function exportTailSeconds(releases: number[], anyReverb: boolean, reverbSeconds = 1.8): number {
  const longest = releases.reduce((high, release) => (release > high ? release : high), 0);
  return Math.max(longest, anyReverb ? reverbSeconds : 0) + 0.2;
}

export function applyGain(buffer: PcmLike, gain: number): void {
  if (gain === 1) return;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) data[index] *= gain;
  }
}

/** 1 을 넘는 표본을 잘라 낸다 (정규화를 껐을 때의 마지막 방어). */
export function clampBuffer(buffer: PcmLike): number {
  let clamped = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      if (data[index] > 1) { data[index] = 1; clamped++; }
      else if (data[index] < -1) { data[index] = -1; clamped++; }
    }
  }
  return clamped;
}

/**
 * 내보낼 구간. `selection` 은 고른 클립들이 덮는 범위이고, 고른 게 없으면 곡 전체로 접힌다.
 * 언제나 최소 한 박은 나오게 한다. 길이 0 짜리 파일을 내보내지 않는다.
 */
export function exportRange(
  mode: ExportRangeMode,
  song: BeatRange,
  loop: BeatRange,
  selection: { start: number; duration: number }[]
): BeatRange {
  const pick = (): BeatRange => {
    if (mode === 'loop') return loop;
    if (mode === 'selection' && selection.length) {
      return {
        from: Math.min(...selection.map((clip) => clip.start)),
        to: Math.max(...selection.map((clip) => clip.start + clip.duration))
      };
    }
    return song;
  };
  const range = pick();
  const from = Math.max(0, Math.min(range.from, range.to));
  const to = Math.max(from + 1, Math.max(range.from, range.to));
  return { from, to };
}

/** 파일 이름에 못 쓰는 글자를 걸러 낸다. 빈 이름이면 자리 번호로 대신한다. */
export function stemFileName(trackName: string, index: number): string {
  const clean = String(trackName ?? '').replace(/[\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 48);
  return `${String(index + 1).padStart(2, '0')}-${clean || 'track'}.wav`;
}

/** 같은 이름이 겹치면 뒤에 번호를 붙인다. ZIP 안에서 덮어써지면 트랙이 조용히 사라진다. */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const seen = used.get(name) ?? 0;
    used.set(name, seen + 1);
    if (!seen) return name;
    const dot = name.lastIndexOf('.');
    return dot < 0 ? `${name} (${seen + 1})` : `${name.slice(0, dot)} (${seen + 1})${name.slice(dot)}`;
  });
}

