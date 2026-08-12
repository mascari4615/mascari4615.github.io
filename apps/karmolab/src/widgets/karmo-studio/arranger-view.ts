/**
 * Karmo Studio — 타임라인(arranger) 뷰 (TASK-KL-220 분리 3단).
 *
 * piano-view 와 같은 규칙: DOM 도 프로젝트 상태도 모른다. 판정과 자료를 주입받아 문자열만 낸다.
 * 오디오 표본 읽기만 바깥에서 넣는다 — `AudioBuffer` 는 브라우저 것이라 여기 들이면
 * 단위 테스트가 막힌다.
 */

import { AUTOMATION_RANGE, type AutomationParam, type AutomationPoint, type StudioClip, type StudioTrack } from './model';

/** 자동화 줄 높이 — 뷰와 제스처가 같은 숫자를 본다. 값의 범위는 항목마다 다르다. */
export const AUTOMATION_GEOMETRY = { height: 46 } as const;

/** 값 → 화면 y. 항목의 최소~최대를 줄 높이에 편다 (볼륨 0~1.2, 팬 -1~1). */
export function automationY(value: number, param: AutomationParam = 'volume'): number {
  const { height } = AUTOMATION_GEOMETRY;
  const { min, max } = AUTOMATION_RANGE[param];
  const ratio = (Math.max(min, Math.min(max, value)) - min) / (max - min);
  return height - ratio * height;
}

/** 화면 y → 값 — 제스처가 쓰는 반대 방향. */
export function automationValue(ratioFromTop: number, param: AutomationParam = 'volume'): number {
  const { min, max } = AUTOMATION_RANGE[param];
  return min + (1 - Math.max(0, Math.min(1, ratioFromTop))) * (max - min);
}

/** 표본 한 줄에서 96칸의 최소/최대를 뽑아 SVG path 로. 소리 자료가 없으면 빈 문자열. */
export interface WaveSamples {
  data: Float32Array | number[];
  /** 그릴 구간 (표본 인덱스). */
  start: number;
  end: number;
}

export function waveformPath(samples: WaveSamples, columns = 96): string {
  const { data, start, end } = samples;
  if (end <= start || columns < 2) return '';
  let path = '';
  for (let column = 0; column < columns; column++) {
    const from = Math.floor(start + (end - start) * column / columns);
    const to = Math.max(from + 1, Math.floor(start + (end - start) * (column + 1) / columns));
    let low = 1;
    let high = -1;
    for (let index = from; index < to; index++) {
      const value = data[index] || 0;
      if (value < low) low = value;
      if (value > high) high = value;
    }
    const x = column / (columns - 1) * 100;
    path += `M${x.toFixed(2)} ${(16 - high * 14).toFixed(2)}L${x.toFixed(2)} ${(16 - low * 14).toFixed(2)}`;
  }
  return path;
}

export function waveformSvg(path: string, label: string, className = ''): string {
  return `<svg class="ks-wave-svg ${className}" viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="${label} 파형"><path d="${path}"></path></svg>`;
}

export function waveMissing(decoding: boolean): string {
  return `<div class="ks-wave-missing">${decoding ? 'DECODING…' : 'AUDIO MISSING'}</div>`;
}

export interface ClipViewInput {
  track: StudioTrack;
  clip: StudioClip;
  pxPerBeat: number;
  selected: boolean;
  /** 오디오 클립의 속 그림 — 본체가 파형이든 「없음」이든 만들어 넣는다. */
  audioBody: () => string;
  esc: (value: unknown) => string;
}

/**
 * 클립 속 미리보기는 몇 밀리미터짜리 그림이다. 폭보다 촘촘한 음은 겹쳐서 안 보이는데
 * DOM 만 늘린다 — 폭에 맞춰 고르게 솎는다(4px 에 하나, 최소 8·최대 64).
 */
export function previewNotes<T>(notes: T[], widthPx: number): T[] {
  const cap = Math.max(8, Math.min(64, Math.round(widthPx / 4)));
  if (notes.length <= cap) return notes;
  const step = notes.length / cap;
  const out: T[] = [];
  for (let index = 0; index < cap; index++) out.push(notes[Math.floor(index * step)]);
  return out;
}

/** MIDI 클립은 음을 작게 깔고, 오디오 클립은 주입받은 속 그림을 쓴다. */
export function clipHtml(input: ClipViewInput): string {
  const { track, clip, pxPerBeat, selected, audioBody, esc } = input;
  let body: string;
  if (clip.notes.length) {
    const pitches = clip.notes.map((item) => item.pitch);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches, low + 1);
    const preview = previewNotes(clip.notes, clip.duration * pxPerBeat);
    body = `<div class="ks-midi-notes">${preview.map((note) => `<i class="ks-midi-note" style="left:${note.beat / clip.duration * 100}%;width:${Math.max(1, note.duration / clip.duration * 100)}%;bottom:${(note.pitch - low) / (high - low) * 90}%"></i>`).join('')}</div>`;
  } else {
    body = audioBody();
  }
  return `<div class="ks-clip${selected ? ' is-selected' : ''}${clip.mute ? ' is-muted' : ''}${clip.locked ? ' is-locked' : ''}" data-clip="${clip.id}" data-track="${track.id}" style="--clip:${clip.color || track.color};left:${clip.start * pxPerBeat}px;width:${clip.duration * pxPerBeat}px"><div class="ks-clip-name">${esc(clip.name)}</div>${body}<div class="ks-handle" data-resize="1"></div></div>`;
}

export interface AutomationViewInput {
  trackId: string;
  param: AutomationParam;
  points: AutomationPoint[];
  /** 점이 없을 때 그릴 평평한 선의 높이 = 트랙 볼륨. */
  fallback: number;
  pxPerBeat: number;
  width: number;
  projectBeats: number;
  beatLabel: (beat: number) => string;
}

export function automationHtml(input: AutomationViewInput): string {
  const { trackId, param, fallback, pxPerBeat, width, projectBeats, beatLabel } = input;
  const y = (value: number): number => automationY(value, param);
  const points = [...input.points].sort((a, b) => a.beat - b.beat);
  const line = points.length
    ? `M0,${y(points[0].value)} ` + points.map((point) => `L${point.beat * pxPerBeat},${y(point.value)}`).join(' ') + ` L${width},${y(points[points.length - 1].value)}`
    : `M0,${y(fallback)} L${width},${y(fallback)}`;
  const label = (value: number): string => param === 'pan'
    ? (Math.abs(value) < 0.02 ? '가운데' : `${value < 0 ? 'L' : 'R'}${Math.round(Math.abs(value) * 100)}`)
    : `${Math.round(value * 100)}%`;
  const NAMES: Record<AutomationParam, string> = { volume: 'VOLUME', pan: 'PAN', reverb: 'REVERB' };
  const KOREAN: Record<AutomationParam, string> = { volume: '볼륨', pan: '팬', reverb: '리버브' };
  const dots = points.map((point) => `<i data-auto-point="${point.id}" data-track="${trackId}" style="left:${point.beat * pxPerBeat}px;top:${y(point.value)}px" title="${beatLabel(point.beat)} · ${label(point.value)}"></i>`).join('');
  const name = NAMES[param];
  const tag = points.length ? ` · ${points.length}점` : ` · 점 없음(트랙 ${KOREAN[param]} 그대로)`;
  const SHORT: Record<AutomationParam, string> = { volume: 'VOL', pan: 'PAN', reverb: 'REV' };
  const pick = (['volume', 'pan', 'reverb'] as AutomationParam[]).map((option) => `<button class="ks-mini${option === param ? ' is-on' : ''}" data-auto-param="${option}" data-track="${trackId}">${SHORT[option]}</button>`).join('');
  return `<div class="ks-auto" data-auto="${trackId}" data-auto-kind="${param}" style="width:${width}px" title="빈 곳 클릭 = 점 추가 · 점 드래그 = 이동 · 우클릭 = 삭제"><svg viewBox="0 0 ${Math.max(1, projectBeats * pxPerBeat)} ${AUTOMATION_GEOMETRY.height}" preserveAspectRatio="none"><path d="${line}"></path></svg><span class="ks-auto-tag">${name}${tag}</span><span class="ks-auto-pick">${pick}</span>${dots}</div>`;
}

/**
 * 지금 화면에 걸리는 클립만 고른다. 화면 밖 클립까지 다 그리면 곡이 커질수록 편집 한 번이
 * 통째로 멈춘다(16트랙×80클립에서 220ms 실측). 양옆 여유를 둬서 스크롤 중 빈칸이 안 보이게 한다.
 */
export function visibleClips<T extends { start: number; duration: number }>(
  clips: T[],
  fromBeat: number,
  toBeat: number,
  marginBeats = 0
): T[] {
  const from = Math.min(fromBeat, toBeat) - marginBeats;
  const to = Math.max(fromBeat, toBeat) + marginBeats;
  return clips.filter((clip) => clip.start + clip.duration > from && clip.start < to);
}

