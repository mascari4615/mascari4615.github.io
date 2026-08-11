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
  notes: StudioNote[];
  gain: number;
  fadeIn: number;
  fadeOut: number;
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
}

export interface StudioAsset {
  id: string;
  name: string;
  type: string;
  duration: number;
  dataUrl?: string;
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
    instrument: kind === 'midi' ? 'sawtooth' : 'sine', clips: []
  };
}

export function newProject(): StudioProject {
  const midi = newTrack('midi', 1);
  const clip: StudioClip = {
    id: studioId('clip'), trackId: midi.id, kind: 'midi', name: 'First idea', start: 0, duration: 4,
    offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes: [60, 64, 67, 72].map((pitch, index) => ({
      id: studioId('note'), beat: index, duration: 0.8, pitch, velocity: 0.78
    }))
  };
  midi.clips.push(clip);
  return {
    version: 1, id: studioId('project'), name: 'Untitled Song', bpm: 120, beatsPerBar: 4,
    masterVolume: 0.86, loop: true, loopStart: 0, loopEnd: 8, snap: 0.25,
    tracks: [midi, newTrack('audio', 2)], assets: [], updatedAt: new Date().toISOString()
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
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  };
  project.tracks = value.tracks.map((raw, index) => {
    const source = raw as Partial<StudioTrack>;
    const track = { ...newTrack(source.kind === 'audio' ? 'audio' : 'midi', index + 1), ...source } as StudioTrack;
    track.clips = Array.isArray(source.clips) ? source.clips.map((rawClip) => {
      const clip = rawClip as Partial<StudioClip>;
      return {
        id: typeof clip.id === 'string' ? clip.id : studioId('clip'), trackId: track.id, kind: track.kind,
        name: typeof clip.name === 'string' ? clip.name : 'Clip', start: Math.max(0, Number(clip.start) || 0),
        duration: Math.max(0.0625, Number(clip.duration) || 1), offset: Math.max(0, Number(clip.offset) || 0),
        assetId: clip.assetId, gain: Math.max(0, Math.min(2, Number(clip.gain) || 1)),
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
