import type { StudioAsset, StudioClip, StudioProject, StudioTrack } from './model';

type AudioContextLike = AudioContext | OfflineAudioContext;

export interface StudioAssetRuntime extends StudioAsset {
  buffer?: AudioBuffer;
}

interface TrackGraph {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  pan: StereoPannerNode;
  output: GainNode;
  reverbSend: GainNode;
}

function noteFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function makeImpulse(context: AudioContextLike, seconds = 1.8): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index++) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.8);
    }
  }
  return impulse;
}

function connectTrack(context: AudioContextLike, track: StudioTrack, destination: AudioNode, reverb: ConvolverNode): TrackGraph {
  const input = context.createGain();
  const low = context.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = track.eqLow;
  const mid = context.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.8; mid.gain.value = track.eqMid;
  const high = context.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5200; high.gain.value = track.eqHigh;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -6 - track.compressor * 30;
  compressor.ratio.value = 1 + track.compressor * 11;
  const pan = context.createStereoPanner(); pan.pan.value = track.pan;
  const output = context.createGain(); output.gain.value = track.mute ? 0 : track.volume;
  const reverbSend = context.createGain(); reverbSend.gain.value = track.reverb;
  input.connect(low).connect(mid).connect(high).connect(compressor).connect(pan).connect(output).connect(destination);
  pan.connect(reverbSend).connect(reverb);
  return { input, low, mid, high, compressor, pan, output, reverbSend };
}

function updateTrackGraph(graph: TrackGraph, track: StudioTrack, muted: boolean, at: number): void {
  graph.low.gain.setTargetAtTime(track.eqLow, at, 0.015);
  graph.mid.gain.setTargetAtTime(track.eqMid, at, 0.015);
  graph.high.gain.setTargetAtTime(track.eqHigh, at, 0.015);
  graph.compressor.threshold.setTargetAtTime(-6-track.compressor*30, at, 0.015);
  graph.compressor.ratio.setTargetAtTime(1+track.compressor*11, at, 0.015);
  graph.pan.pan.setTargetAtTime(track.pan, at, 0.015);
  graph.output.gain.setTargetAtTime(muted?0:track.volume, at, 0.01);
  graph.reverbSend.gain.setTargetAtTime(track.reverb, at, 0.015);
}

function scheduleMidi(context: AudioContextLike, input: AudioNode, track: StudioTrack, clip: StudioClip, fromBeat: number, toBeat: number, startTime: number, secondsPerBeat: number, sources: AudioScheduledSourceNode[]): void {
  for (const note of clip.notes) {
    const absoluteBeat = clip.start + note.beat;
    if (absoluteBeat + note.duration <= fromBeat || absoluteBeat >= toBeat) continue;
    const audibleStart = Math.max(absoluteBeat, fromBeat);
    const audibleEnd = Math.min(absoluteBeat + note.duration, toBeat);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = track.instrument;
    oscillator.frequency.value = noteFrequency(note.pitch);
    const at = startTime + (audibleStart - fromBeat) * secondsPerBeat;
    const end = startTime + (audibleEnd - fromBeat) * secondsPerBeat;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, note.velocity * clip.gain * 0.18), at + 0.008);
    gain.gain.setValueAtTime(Math.max(0.001, note.velocity * clip.gain * 0.13), Math.max(at + 0.01, end - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(input);
    oscillator.start(at); oscillator.stop(end + 0.01); sources.push(oscillator);
  }
}

function scheduleAudio(context: AudioContextLike, input: AudioNode, clip: StudioClip, asset: StudioAssetRuntime | undefined, fromBeat: number, toBeat: number, startTime: number, secondsPerBeat: number, sources: AudioScheduledSourceNode[]): void {
  if (!asset?.buffer) return;
  const clipEnd = clip.start + clip.duration;
  if (clipEnd <= fromBeat || clip.start >= toBeat) return;
  const audibleStart = Math.max(clip.start, fromBeat);
  const audibleEnd = Math.min(clipEnd, toBeat);
  const source = context.createBufferSource(); source.buffer = asset.buffer;
  const gain = context.createGain();
  const at = startTime + (audibleStart - fromBeat) * secondsPerBeat;
  const durationSeconds = (audibleEnd - audibleStart) * secondsPerBeat;
  const offsetSeconds = (clip.offset + audibleStart - clip.start) * secondsPerBeat;
  const level = Math.max(0.0001, clip.gain);
  gain.gain.setValueAtTime(clip.fadeIn > 0 && audibleStart === clip.start ? 0.0001 : level, at);
  if (clip.fadeIn > 0 && audibleStart === clip.start) gain.gain.linearRampToValueAtTime(level, at + Math.min(durationSeconds, clip.fadeIn * secondsPerBeat));
  if (clip.fadeOut > 0 && audibleEnd === clipEnd) {
    gain.gain.setValueAtTime(level, Math.max(at, at + durationSeconds - clip.fadeOut * secondsPerBeat));
    gain.gain.linearRampToValueAtTime(0.0001, at + durationSeconds);
  }
  source.connect(gain).connect(input);
  source.start(at, Math.min(offsetSeconds, Math.max(0, asset.buffer.duration - 0.001)), durationSeconds);
  sources.push(source);
}

function scheduleProject(context: AudioContextLike, project: StudioProject, assets: Map<string, StudioAssetRuntime>, fromBeat: number, toBeat: number, startTime: number, destination: AudioNode): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const secondsPerBeat = 60 / project.bpm;
  const master = context.createGain(); master.gain.value = project.masterVolume; master.connect(destination);
  const reverb = context.createConvolver(); reverb.buffer = makeImpulse(context); reverb.connect(master);
  const anySolo = project.tracks.some((track) => track.solo);
  for (const track of project.tracks) {
    const graph = connectTrack(context, { ...track, mute: track.mute || (anySolo && !track.solo) }, master, reverb);
    for (const clip of track.clips) {
      if (clip.kind === 'midi') scheduleMidi(context, graph.input, track, clip, fromBeat, toBeat, startTime, secondsPerBeat, sources);
      else scheduleAudio(context, graph.input, clip, clip.assetId ? assets.get(clip.assetId) : undefined, fromBeat, toBeat, startTime, secondsPerBeat, sources);
    }
  }
  return sources;
}

export class KarmoStudioEngine {
  private context: AudioContext | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private graphs = new Map<string, TrackGraph>();
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private startedAt = 0;
  private startedBeat = 0;
  private scheduledThroughBeat = 0;
  private playing = false;
  private schedulerTimer: number | undefined;
  private project: StudioProject | null = null;
  private assets = new Map<string, StudioAssetRuntime>();
  private scheduled = new Set<string>();
  onEnded: (() => void) | null = null;

  setAssets(assets: Map<string, StudioAssetRuntime>): void { this.assets = assets; }
  isPlaying(): boolean { return this.playing; }
  updateProject(project: StudioProject): void {
    this.project=project;
    if(!this.context||!this.master||!this.reverb)return;
    const anySolo=project.tracks.some((track)=>track.solo);
    const liveIds=new Set(project.tracks.map((track)=>track.id));
    for(const [id,graph] of this.graphs){if(!liveIds.has(id)){graph.input.disconnect();graph.output.disconnect();graph.reverbSend.disconnect();this.graphs.delete(id);}}
    for(const track of project.tracks){let graph=this.graphs.get(track.id);if(!graph){graph=connectTrack(this.context,track,this.master,this.reverb);this.graphs.set(track.id,graph);}updateTrackGraph(graph,track,track.mute||(anySolo&&!track.solo),this.context.currentTime);}
    this.master.gain.setTargetAtTime(project.masterVolume,this.context.currentTime,0.01);
  }
  play(project: StudioProject, beat: number): void {
    this.stop();
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.context = new AC();this.master=this.context.createGain();this.master.connect(this.context.destination);this.reverb=this.context.createConvolver();this.reverb.buffer=makeImpulse(this.context);this.reverb.connect(this.master);this.playing=true;this.startedBeat=beat;this.startedAt=this.context.currentTime+0.04;this.scheduledThroughBeat=beat;this.scheduled.clear();this.updateProject(project);this.scheduleTick();this.schedulerTimer=window.setInterval(()=>this.scheduleTick(),40);
  }
  currentBeat(): number {
    if (!this.playing || !this.context || !this.project) return this.startedBeat;
    return this.startedBeat + Math.max(0, this.context.currentTime - this.startedAt) / (60 / this.project.bpm);
  }
  stop(): void {
    this.playing = false;
    if (this.schedulerTimer !== undefined) window.clearInterval(this.schedulerTimer);
    this.schedulerTimer = undefined;
    for (const source of this.sources) { try { source.stop(); } catch (_) { /* already stopped */ } }
    this.sources = [];this.scheduled.clear();this.graphs.clear();this.master=null;this.reverb=null;
    if (this.context) void this.context.close();
    this.context = null;
  }
  async preview(track: StudioTrack, pitch: number, velocity = 0.8): Promise<void> {
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = new AC();
    const clip: StudioClip = { id: 'preview', trackId: track.id, kind: 'midi', name: '', start: 0, duration: 1, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes: [{ id: 'note', beat: 0, duration: 0.35, pitch, velocity }] };
    scheduleProject(context, { ...({} as StudioProject), bpm: 120, masterVolume: 0.8, tracks: [{ ...track, clips: [clip] }] }, new Map(), 0, 1, context.currentTime + 0.01, context.destination);
    window.setTimeout(() => void context.close(), 700);
  }
  dispose(): void { this.stop(); }

  private scheduleTick(): void {
    const context=this.context,project=this.project;if(!this.playing||!context||!project)return;
    const beat=this.currentBeat();const endBeat=this.endBeat(project);
    if(beat>=endBeat-.001){if(project.loop){for(const source of this.sources){try{source.stop();}catch(_){}}this.sources=[];this.scheduled.clear();this.startedBeat=project.loopStart;this.startedAt=context.currentTime+0.012;this.scheduledThroughBeat=project.loopStart;}else{this.stop();this.onEnded?.();return;}}
    const secondsPerBeat=60/project.bpm;const horizonBeat=Math.min(endBeat,this.currentBeat()+0.24/secondsPerBeat);const from=Math.max(this.scheduledThroughBeat,this.currentBeat());if(horizonBeat<=from)return;const fromTime=this.startedAt+(from-this.startedBeat)*secondsPerBeat;
    for(const track of project.tracks){const graph=this.graphs.get(track.id);if(!graph)continue;for(const clip of track.clips){if(clip.kind==='audio'){const key=`audio:${clip.id}`;if(this.scheduled.has(key)||clip.start+clip.duration<=from||clip.start>=horizonBeat)continue;this.scheduled.add(key);scheduleAudio(context,graph.input,clip,clip.assetId?this.assets.get(clip.assetId):undefined,from,endBeat,fromTime,secondsPerBeat,this.sources);}else for(const note of clip.notes){const absolute=clip.start+note.beat;const key=`note:${clip.id}:${note.id}`;if(this.scheduled.has(key)||absolute+note.duration<=from||absolute>=horizonBeat)continue;this.scheduled.add(key);scheduleMidi(context,graph.input,track,{...clip,notes:[note]},from,endBeat,fromTime,secondsPerBeat,this.sources);}}}
    this.scheduledThroughBeat=horizonBeat;
  }

  private endBeat(project: StudioProject): number {
    return project.loop?project.loopEnd:Math.max(project.loopEnd,...project.tracks.flatMap((track)=>track.clips.map((clip)=>clip.start+clip.duration)),this.startedBeat+1);
  }
}

export async function renderProject(project: StudioProject, assets: Map<string, StudioAssetRuntime>, fromBeat: number, toBeat: number, sampleRate = 44100): Promise<AudioBuffer> {
  const duration = Math.max(0.1, (toBeat - fromBeat) * (60 / project.bpm) + 1.8);
  const context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  scheduleProject(context, project, assets, fromBeat, toBeat, 0, context.destination);
  return context.startRendering();
}
