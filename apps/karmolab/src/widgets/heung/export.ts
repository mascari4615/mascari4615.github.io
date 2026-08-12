/**
 * 흥 — 내보내기 계산 (TASK-KL-220).
 *
 * 렌더된 표본을 두고 하는 판단(피크·클리핑·정규화·모노 합치기)과 「어디부터 어디까지」 계산.
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
 * 언제나 최소 한 박은 나오게 한다 — 길이 0 짜리 파일을 내보내지 않는다.
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

/** 같은 이름이 겹치면 뒤에 번호를 붙인다 — ZIP 안에서 덮어써지면 트랙이 조용히 사라진다. */
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

