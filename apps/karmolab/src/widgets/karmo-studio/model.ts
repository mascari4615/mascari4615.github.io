export type TrackKind = 'audio' | 'midi';

export interface StudioNote {
  id: string;
  beat: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export interface StudioClip {
  id: string;
  trackId: string;
  kind: TrackKind;
  name: string;
  start: number;
  duration: number;
  offset: number;
  assetId?: string;
  /** 이 클립만 소리를 끈다 — 트랙 전체를 끄지 않고 한 부분만 빼 보려고. */
  mute: boolean;
  notes: StudioNote[];
  gain: number;
  fadeIn: number;
  fadeOut: number;
}

/** 자동화할 수 있는 값. 눈금 범위가 달라서 뷰·엔진이 이 이름으로 갈라진다. */
export type AutomationParam = 'volume' | 'pan';

export const AUTOMATION_RANGE: Record<AutomationParam, { min: number; max: number }> = {
  volume: { min: 0, max: 1.2 },
  pan: { min: -1, max: 1 }
};

export interface AutomationPoint {
  id: string;
  beat: number;
  /** 0~1.2 — 트랙 볼륨과 같은 눈금. */
  value: number;
}

export interface StudioTrack {
  id: string;
  kind: TrackKind;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  compressor: number;
  reverb: number;
  instrument: OscillatorType;
  clips: StudioClip[];
  /** 시간에 따라 움직이는 값들. 점이 0개인 항목은 트랙의 고정값을 그대로 쓴다. */
  automation: Record<AutomationParam, AutomationPoint[]>;
  /** 접으면 클립 미리보기 대신 얇은 띠만 남는다 — 곡이 길어지면 세로가 부족해진다. */
  folded: boolean;
}

export interface StudioAsset {
  id: string;
  name: string;
  type: string;
  duration: number;
  dataUrl?: string;
}

export interface StudioMarker {
  id: string;
  beat: number;
  name: string;
}

export interface StudioProject {
  version: 1;
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  masterVolume: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  snap: number;
  tracks: StudioTrack[];
  assets: StudioAsset[];
  /** 구간 이름표 — 곡의 어디쯤인지 표시하고 그 자리로 건너뛴다. */
  markers: StudioMarker[];
  updatedAt: string;
}

export type StudioSelection =
  | { type: 'track'; trackId: string }
  | { type: 'clip'; trackId: string; clipId: string }
  | { type: 'note'; trackId: string; clipId: string; noteId: string }
  | null;

const COLORS = ['#8b7cf6', '#42b9a8', '#ed8b55', '#e15d8a', '#5d9cec', '#c5a34e'];

export function studioId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function newTrack(kind: TrackKind, index: number): StudioTrack {
  return {
    id: studioId('track'), kind, name: kind === 'audio' ? `Audio ${index}` : `Instrument ${index}`,
    color: COLORS[(index - 1) % COLORS.length], volume: 0.82, pan: 0, mute: false, solo: false,
    eqLow: 0, eqMid: 0, eqHigh: 0, compressor: 0.25, reverb: 0.08,
    instrument: kind === 'midi' ? 'sawtooth' : 'sine', clips: [], automation: { volume: [], pan: [] }, folded: false
  };
}

export function newProject(): StudioProject {
  const midi = newTrack('midi', 1);
  const clip: StudioClip = {
    id: studioId('clip'), trackId: midi.id, kind: 'midi', name: 'First idea', start: 0, duration: 4,
    offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, mute: false, notes: [60, 64, 67, 72].map((pitch, index) => ({
      id: studioId('note'), beat: index, duration: 0.8, pitch, velocity: 0.78
    }))
  };
  midi.clips.push(clip);
  return {
    version: 1, id: studioId('project'), name: 'Untitled Song', bpm: 120, beatsPerBar: 4,
    masterVolume: 0.86, loop: true, loopStart: 0, loopEnd: 8, snap: 0.25,
    tracks: [midi, newTrack('audio', 2)], assets: [], markers: [], updatedAt: new Date().toISOString()
  };
}

export function snapBeat(value: number, snap: number): number {
  const unit = snap > 0 ? snap : 0.25;
  return Math.max(0, Math.round(value / unit) * unit);
}

export function projectLength(project: StudioProject): number {
  const clipEnd = project.tracks.flatMap((track) => track.clips).reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  return Math.max(project.beatsPerBar * 4, project.loopEnd, clipEnd + project.beatsPerBar);
}

export function findTrack(project: StudioProject, id: string): StudioTrack | undefined {
  return project.tracks.find((track) => track.id === id);
}

export function findClip(project: StudioProject, trackId: string, clipId: string): StudioClip | undefined {
  return findTrack(project, trackId)?.clips.find((clip) => clip.id === clipId);
}

export function cloneClip(source: StudioClip, start = source.start + source.duration): StudioClip {
  return {
    ...source, id: studioId('clip'), start,
    notes: source.notes.map((note) => ({ ...note, id: studioId('note') }))
  };
}

export function splitClip(source: StudioClip, atBeat: number): StudioClip | null {
  const local = atBeat - source.start;
  if (local <= 0.05 || local >= source.duration - 0.05) return null;
  const right = cloneClip(source, atBeat);
  right.name = `${source.name} B`;
  right.duration = source.duration - local;
  right.offset = source.offset + local;
  right.notes = source.notes
    .filter((note) => note.beat + note.duration > local)
    .map((note) => ({ ...note, id: studioId('note'), beat: Math.max(0, note.beat - local) }));
  source.duration = local;
  source.notes = source.notes.filter((note) => note.beat < local).map((note) => ({
    ...note, duration: Math.min(note.duration, local - note.beat)
  }));
  return right;
}

export function normalizeProject(input: unknown): StudioProject {
  if (!input || typeof input !== 'object') throw new Error('Invalid Karmo Studio project');
  const value = input as Partial<StudioProject>;
  if (!Array.isArray(value.tracks)) throw new Error('Project has no tracks');
  const project: StudioProject = {
    version: 1,
    id: typeof value.id === 'string' ? value.id : studioId('project'),
    name: typeof value.name === 'string' ? value.name : 'Imported Song',
    bpm: Math.max(30, Math.min(300, Number(value.bpm) || 120)),
    beatsPerBar: [3, 4, 5, 6, 7].includes(Number(value.beatsPerBar)) ? Number(value.beatsPerBar) : 4,
    masterVolume: Math.max(0, Math.min(1, Number(value.masterVolume) || 0.86)),
    loop: Boolean(value.loop), loopStart: Math.max(0, Number(value.loopStart) || 0),
    loopEnd: Math.max(1, Number(value.loopEnd) || 8), snap: Math.max(0.0625, Number(value.snap) || 0.25),
    tracks: [], assets: Array.isArray(value.assets) ? value.assets : [],
    markers: Array.isArray(value.markers)
      ? sortMarkers(value.markers
          .filter((marker) => marker && Number.isFinite(Number((marker as StudioMarker).beat)))
          .map((marker) => {
            const raw = marker as Partial<StudioMarker>;
            return {
              id: typeof raw.id === 'string' ? raw.id : studioId('marker'),
              beat: Math.max(0, Number(raw.beat) || 0),
              name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Section'
            };
          }))
      : [],
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  };
  project.tracks = value.tracks.map((raw, index) => {
    const source = raw as Partial<StudioTrack>;
    const track = { ...newTrack(source.kind === 'audio' ? 'audio' : 'midi', index + 1), ...source } as StudioTrack;
    track.folded = source.folded === true;
    /* 옛 저장본은 볼륨 자동화를 `volumeAutomation` 한 줄로 들고 있었다 — 새 자리로 옮겨 담는다. */
    const legacyVolume = (raw as { volumeAutomation?: unknown }).volumeAutomation;
    const storedAutomation = (source as { automation?: Partial<Record<AutomationParam, unknown>> }).automation;
    track.automation = {
      volume: cleanAutomation(storedAutomation?.volume ?? legacyVolume, 'volume'),
      pan: cleanAutomation(storedAutomation?.pan, 'pan')
    };
    track.clips = Array.isArray(source.clips) ? source.clips.map((rawClip) => {
      const clip = rawClip as Partial<StudioClip>;
      return {
        id: typeof clip.id === 'string' ? clip.id : studioId('clip'), trackId: track.id, kind: track.kind,
        name: typeof clip.name === 'string' ? clip.name : 'Clip', start: Math.max(0, Number(clip.start) || 0),
        duration: Math.max(0.0625, Number(clip.duration) || 1), offset: Math.max(0, Number(clip.offset) || 0),
        assetId: clip.assetId, mute: clip.mute === true, gain: Math.max(0, Math.min(2, Number(clip.gain) || 1)),
        fadeIn: Math.max(0, Number(clip.fadeIn) || 0), fadeOut: Math.max(0, Number(clip.fadeOut) || 0),
        notes: Array.isArray(clip.notes) ? clip.notes.map((note) => ({ ...note })) : []
      };
    }) : [];
    return track;
  });
  return project;
}

export function projectJson(project: StudioProject, pretty = true): string {
  return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, pretty ? 2 : 0);
}

/**
 * 음 편집 연산 — 피아노롤 도구가 쓰는 순수 변형.
 * 전부 제자리 변형이지만 프로젝트/DOM 을 모르므로 단위 테스트로 닫힌다.
 */

/** 시작 위치를 격자로 당긴다. strength 0~1 = 얼마나 당길지 (1 = 완전히 붙임). */
export function quantizeNotes(notes: StudioNote[], snap: number, strength = 1): number {
  const unit = snap > 0 ? snap : 0.25;
  const amount = Math.max(0, Math.min(1, strength));
  let moved = 0;
  for (const note of notes) {
    const target = Math.max(0, Math.round(note.beat / unit) * unit);
    const next = note.beat + (target - note.beat) * amount;
    if (Math.abs(next - note.beat) > 1e-9) moved++;
    note.beat = next;
  }
  return moved;
}

/** 음높이를 옮긴다. MIDI 범위를 벗어나면 묶음 전체가 그만큼만 움직인다 (모양 보존). */
export function transposeNotes(notes: StudioNote[], semitones: number, low = 0, high = 127): number {
  if (!notes.length || !semitones) return 0;
  const lowest = Math.min(...notes.map((note) => note.pitch));
  const highest = Math.max(...notes.map((note) => note.pitch));
  const shift = semitones > 0
    ? Math.min(semitones, high - highest)
    : Math.max(semitones, low - lowest);
  if (!shift) return 0;
  for (const note of notes) note.pitch += shift;
  return shift;
}

/** 세기를 한 번에 맞춘다. */
export function setNoteVelocity(notes: StudioNote[], velocity: number): void {
  const value = Math.max(0.05, Math.min(1, velocity));
  for (const note of notes) note.velocity = value;
}

/** 앞 음의 끝을 다음 음의 시작까지 늘린다 (같은 음높이 줄 기준). */
export function legatoNotes(notes: StudioNote[], limit: number): number {
  const ordered = [...notes].sort((a, b) => a.beat - b.beat);
  let changed = 0;
  for (let index = 0; index < ordered.length; index++) {
    const note = ordered[index];
    const next = ordered.slice(index + 1).find((item) => item.beat > note.beat);
    const end = next ? next.beat : limit;
    const duration = Math.max(0.0625, end - note.beat);
    if (Math.abs(duration - note.duration) > 1e-9) changed++;
    note.duration = duration;
  }
  return changed;
}

/** 점을 시간순으로 세운다 — 편집이 어디에 점을 놓든 읽는 쪽은 정렬을 전제한다. */
/** 저장본에서 온 점들을 값 범위에 맞춰 걸러 낸다. 숫자가 아닌 위치는 버린다. */
export function cleanAutomation(input: unknown, param: AutomationParam): AutomationPoint[] {
  if (!Array.isArray(input)) return [];
  const range = AUTOMATION_RANGE[param];
  return sortAutomation(input
    .filter((point) => point && Number.isFinite(Number((point as AutomationPoint).beat)))
    .map((point) => {
      const raw = point as Partial<AutomationPoint>;
      return {
        id: typeof raw.id === 'string' ? raw.id : studioId('auto'),
        beat: Math.max(0, Number(raw.beat) || 0),
        value: Math.max(range.min, Math.min(range.max, Number(raw.value) ?? 0))
      };
    }));
}

export function sortAutomation(points: AutomationPoint[]): AutomationPoint[] {
  return [...points].sort((a, b) => a.beat - b.beat);
}

/**
 * 어느 박에서의 값. 점 사이는 직선으로 잇고, 양 끝은 가장 가까운 점 값을 유지한다.
 * 점이 없으면 `fallback`(트랙 볼륨) 을 그대로 돌려준다.
 */
export function automationValueAt(points: AutomationPoint[], beat: number, fallback: number): number {
  if (!points.length) return fallback;
  const sorted = sortAutomation(points);
  if (beat <= sorted[0].beat) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (beat >= last.beat) return last.value;
  for (let index = 1; index < sorted.length; index++) {
    const right = sorted[index];
    if (beat > right.beat) continue;
    const left = sorted[index - 1];
    const span = right.beat - left.beat;
    if (span <= 0) return right.value;
    return left.value + (right.value - left.value) * ((beat - left.beat) / span);
  }
  return last.value;
}

/** 같은 자리에 점을 겹쳐 놓지 않는다 — 가까우면 그 점의 값을 바꾼다. */
export function putAutomationPoint(points: AutomationPoint[], beat: number, value: number, param: AutomationParam = 'volume', tolerance = 0.05): AutomationPoint[] {
  const range = AUTOMATION_RANGE[param];
  const clean = Math.max(0, beat);
  const level = Math.max(range.min, Math.min(range.max, value));
  const existing = points.find((point) => Math.abs(point.beat - clean) <= tolerance);
  if (existing) { existing.value = level; return sortAutomation(points); }
  points.push({ id: studioId('auto'), beat: clean, value: level });
  return sortAutomation(points);
}

/**
 * 트랙 순서 바꾸기 — 잡은 자리에서 놓은 자리로 옮긴다.
 * 범위를 벗어난 자리는 양 끝으로 접고, 제자리면 원래 배열을 그대로 돌려준다.
 */
export function moveTrack(tracks: StudioTrack[], from: number, to: number): StudioTrack[] {
  if (from < 0 || from >= tracks.length) return tracks;
  const target = Math.max(0, Math.min(tracks.length - 1, to));
  if (target === from) return tracks;
  const next = [...tracks];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

export function sortMarkers(markers: StudioMarker[]): StudioMarker[] {
  return [...markers].sort((a, b) => a.beat - b.beat);
}

/** 같은 자리에 겹쳐 놓지 않는다 — 가까우면 이름만 바꾼다. */
export function putMarker(markers: StudioMarker[], beat: number, name: string, tolerance = 0.05): StudioMarker[] {
  const at = Math.max(0, beat);
  const existing = markers.find((marker) => Math.abs(marker.beat - at) <= tolerance);
  if (existing) { existing.name = name; return sortMarkers(markers); }
  markers.push({ id: studioId('marker'), beat: at, name });
  return sortMarkers(markers);
}

/**
 * 지금 자리에서 앞/뒤 이름표. 없으면 `null` — 곡 처음/끝으로 튕기지 않는다.
 * 바로 그 자리에 있는 이름표는 「같은 자리」로 보고 건너뛴다.
 */
export function stepMarker(markers: StudioMarker[], beat: number, direction: 1 | -1, tolerance = 0.001): StudioMarker | null {
  const sorted = sortMarkers(markers);
  if (direction > 0) return sorted.find((marker) => marker.beat > beat + tolerance) ?? null;
  for (let index = sorted.length - 1; index >= 0; index--) {
    if (sorted[index].beat < beat - tolerance) return sorted[index];
  }
  return null;
}

