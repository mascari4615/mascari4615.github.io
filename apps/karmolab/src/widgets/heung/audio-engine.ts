import type { AutomationPoint, StudioAsset, StudioClip, StudioProject, StudioTrack } from './model';
import { automationValueAt, swingBeat } from './model';

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
  /** 미터용 — 실제 소리 길에 끼지 않고 output 을 엿듣는다. */
  analyser: AnalyserNode | null;
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
  /* 오프라인 렌더에는 미터가 필요 없다 — 표본을 읽는 노드를 달면 렌더만 느려진다. */
  let analyser: AnalyserNode | null = null;
  if (typeof (context as AudioContext).createAnalyser === 'function' && !('startRendering' in context)) {
    analyser = (context as AudioContext).createAnalyser();
    analyser.fftSize = 1024;
    output.connect(analyser);
  }
  return { input, low, mid, high, compressor, pan, output, reverbSend, analyser };
}

/**
 * 볼륨 자동화를 그래프에 그린다. 구간 안의 점마다 직선으로 잇고, 구간 시작값은 보간으로 채운다.
 * 점이 없으면 아무것도 안 한다 — 트랙 볼륨이 그대로 산다.
 */
function scheduleAutomation(graph: TrackGraph, track: StudioTrack, fromBeat: number, toBeat: number, fromTime: number, secondsPerBeat: number, muted: boolean): void {
  const draw = (points: AutomationPoint[], param: AudioParam, fallback: number): void => {
    if (!points.length) return;
    param.cancelScheduledValues(fromTime);
    param.setValueAtTime(automationValueAt(points, fromBeat, fallback), fromTime);
    for (const point of [...points].sort((a, b) => a.beat - b.beat)) {
      if (point.beat <= fromBeat || point.beat > toBeat) continue;
      param.linearRampToValueAtTime(point.value, fromTime + (point.beat - fromBeat) * secondsPerBeat);
    }
  };
  if (!muted) draw(track.automation.volume, graph.output.gain, track.volume);
  draw(track.automation.pan, graph.pan.pan, track.pan);
  draw(track.automation.reverb, graph.reverbSend.gain, track.reverb);
}

function updateTrackGraph(graph: TrackGraph, track: StudioTrack, muted: boolean, at: number): void {
  /* 자동화가 있는 트랙의 출력 볼륨은 scheduleAutomation 이 쥐고 있다 — 여기서 덮으면 자동화가 죽는다. */
  graph.low.gain.setTargetAtTime(track.eqLow, at, 0.015);
  graph.mid.gain.setTargetAtTime(track.eqMid, at, 0.015);
  graph.high.gain.setTargetAtTime(track.eqHigh, at, 0.015);
  graph.compressor.threshold.setTargetAtTime(-6-track.compressor*30, at, 0.015);
  graph.compressor.ratio.setTargetAtTime(1+track.compressor*11, at, 0.015);
  if(!track.automation.pan.length)graph.pan.pan.setTargetAtTime(track.pan, at, 0.015);
  if(!track.automation.volume.length||muted)graph.output.gain.setTargetAtTime(muted?0:track.volume, at, 0.01);
  if(!track.automation.reverb.length)graph.reverbSend.gain.setTargetAtTime(track.reverb, at, 0.015);
}

function scheduleMidi(context: AudioContextLike, input: AudioNode, track: StudioTrack, clip: StudioClip, fromBeat: number, toBeat: number, startTime: number, secondsPerBeat: number, sources: AudioScheduledSourceNode[], swing = 0): void {
  for (const note of clip.notes) {
    /* 스윙은 **소리 낼 때만** 민다 — 저장된 위치는 그대로라 껐다 켜면 정박으로 돌아온다. */
    const absoluteBeat = swingBeat(clip.start + note.beat, swing);
    if (absoluteBeat + note.duration <= fromBeat || absoluteBeat >= toBeat) continue;
    const audibleStart = Math.max(absoluteBeat, fromBeat);
    const audibleEnd = Math.min(absoluteBeat + note.duration, toBeat);
    const at = startTime + (audibleStart - fromBeat) * secondsPerBeat;
    const end = startTime + (audibleEnd - fromBeat) * secondsPerBeat;
    const gain = context.createGain();
    /* 저역 통과 — 음을 칠 때 잠깐 열렸다 닫히면서 「띵」 하는 결이 생긴다. */
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.9;
    const base = Math.max(120, Math.min(18000, track.filter.cutoff));
    const open = Math.max(120, Math.min(18000, base * (1 + track.filter.envelope * note.velocity)));
    filter.frequency.setValueAtTime(open, at);
    filter.frequency.exponentialRampToValueAtTime(base, at + Math.max(0.02, track.envelope.decay));
    /* 두툼하게 — 살짝 어긋난 두 목소리. 0 이면 하나만 쓴다(옛 소리 그대로). */
    const voices: OscillatorNode[] = [];
    for (const cents of track.detune > 0 ? [-track.detune, track.detune] : [0]) {
      const oscillator = context.createOscillator();
      oscillator.type = track.instrument;
      oscillator.frequency.value = noteFrequency(note.pitch);
      oscillator.detune.value = cents;
      voices.push(oscillator);
    }
    const peak = Math.max(0.001, note.velocity * clip.gain * 0.18 / voices.length);
    const hold = Math.max(0.001, peak * Math.max(0.05, track.envelope.sustain));
    const attackEnd = at + Math.max(0.002, track.envelope.attack);
    const decayEnd = attackEnd + Math.max(0.005, track.envelope.decay);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, Math.min(attackEnd, Math.max(at + 0.002, end - 0.005)));
    gain.gain.exponentialRampToValueAtTime(hold, Math.min(decayEnd, Math.max(attackEnd + 0.005, end - 0.002)));
    gain.gain.setValueAtTime(hold, Math.max(at + 0.006, end));
    gain.gain.exponentialRampToValueAtTime(0.0001, end + Math.max(0.01, track.envelope.release));
    gain.connect(filter).connect(input);
    const tail = end + Math.max(0.01, track.envelope.release) + 0.01;
    for (const voice of voices) {
      voice.connect(gain);
      voice.start(at);
      voice.stop(tail);
      sources.push(voice);
    }
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
    const muted = track.mute || (anySolo && !track.solo);
    const graph = connectTrack(context, { ...track, mute: muted }, master, reverb);
    scheduleAutomation(graph, track, fromBeat, toBeat, startTime, secondsPerBeat, muted);
    for (const clip of track.clips) {
      if (clip.mute) continue;
      if (clip.kind === 'midi') scheduleMidi(context, graph.input, track, clip, fromBeat, toBeat, startTime, secondsPerBeat, sources, project.swing);
      else scheduleAudio(context, graph.input, clip, clip.assetId ? assets.get(clip.assetId) : undefined, fromBeat, toBeat, startTime, secondsPerBeat, sources);
    }
  }
  return sources;
}

export class HeungEngine {
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
  /** 박자 소리 — 녹음·연습용. 마디 첫 박은 높게 친다. */
  metronome = false;

  setAssets(assets: Map<string, StudioAssetRuntime>): void { this.assets = assets; }
  /** 트랙별 지금 소리 크기 — 0~1 의 peak/rms. 재생 중이 아니면 빈 값. */
  levels(): Map<string, { peak: number; rms: number }> {
    const out = new Map<string, { peak: number; rms: number }>();
    if (!this.playing) return out;
    for (const [id, graph] of this.graphs) {
      const analyser = graph.analyser;
      if (!analyser) continue;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let peak = 0; let sum = 0;
      for (let index = 0; index < data.length; index++) { const value = Math.abs(data[index]); if (value > peak) peak = value; sum += data[index] * data[index]; }
      out.set(id, { peak, rms: Math.sqrt(sum / data.length) });
    }
    return out;
  }
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
    const clip: StudioClip = { id: 'preview', trackId: track.id, kind: 'midi', name: '', start: 0, duration: 1, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, mute: false, locked: false, notes: [{ id: 'note', beat: 0, duration: 0.35, pitch, velocity }] };
    scheduleProject(context, { ...({} as StudioProject), bpm: 120, masterVolume: 0.8, tracks: [{ ...track, clips: [clip] }] }, new Map(), 0, 1, context.currentTime + 0.01, context.destination);
    window.setTimeout(() => void context.close(), 700);
  }
  dispose(): void { this.stop(); }

  private scheduleTick(): void {
    const context=this.context,project=this.project;if(!this.playing||!context||!project)return;
    const beat=this.currentBeat();const endBeat=this.endBeat(project);
    if(beat>=endBeat-.001){if(project.loop){for(const source of this.sources){try{source.stop();}catch(_){}}this.sources=[];this.scheduled.clear();this.startedBeat=project.loopStart;this.startedAt=context.currentTime+0.012;this.scheduledThroughBeat=project.loopStart;}else{this.stop();this.onEnded?.();return;}}
    const secondsPerBeat=60/project.bpm;const horizonBeat=Math.min(endBeat,this.currentBeat()+0.24/secondsPerBeat);const from=Math.max(this.scheduledThroughBeat,this.currentBeat());if(horizonBeat<=from)return;const fromTime=this.startedAt+(from-this.startedBeat)*secondsPerBeat;
    for(const track of project.tracks){const graph=this.graphs.get(track.id);if(!graph)continue;for(const clip of track.clips){if(clip.mute)continue;if(clip.kind==='audio'){const key=`audio:${clip.id}`;if(this.scheduled.has(key)||clip.start+clip.duration<=from||clip.start>=horizonBeat)continue;this.scheduled.add(key);scheduleAudio(context,graph.input,clip,clip.assetId?this.assets.get(clip.assetId):undefined,from,endBeat,fromTime,secondsPerBeat,this.sources);}else for(const note of clip.notes){const absolute=clip.start+note.beat;const key=`note:${clip.id}:${note.id}`;if(this.scheduled.has(key)||absolute+note.duration<=from||absolute>=horizonBeat)continue;this.scheduled.add(key);scheduleMidi(context,graph.input,track,{...clip,notes:[note]},from,endBeat,fromTime,secondsPerBeat,this.sources,project.swing);}}}
    for(const track of project.tracks){const graph=this.graphs.get(track.id);if(!graph||!(['volume','pan','reverb'] as const).some((key)=>track.automation[key].length))continue;const anySolo=project.tracks.some((item)=>item.solo);scheduleAutomation(graph,track,from,horizonBeat,fromTime,secondsPerBeat,track.mute||(anySolo&&!track.solo));}
    if(this.metronome){
      for(let beat=Math.ceil(from-1e-6);beat<horizonBeat;beat++){
        const key=`click:${beat}`;if(this.scheduled.has(key))continue;this.scheduled.add(key);
        this.click(context,fromTime+(beat-from)*secondsPerBeat,beat%Math.max(1,project.beatsPerBar)===0);
      }
    }
    this.scheduledThroughBeat=horizonBeat;
  }

  /** 짧은 딸깍 — 트랙 그래프를 안 거치고 마스터로 바로 간다 (믹서에 안 섞인다). */
  private click(context: AudioContext, when: number, accent: boolean): void {
    const osc=context.createOscillator();const gain=context.createGain();
    osc.type='square';osc.frequency.value=accent?1600:1000;
    gain.gain.setValueAtTime(0.0001,when);
    gain.gain.exponentialRampToValueAtTime(accent?0.32:0.18,when+0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001,when+0.055);
    osc.connect(gain);gain.connect(this.master||context.destination);
    osc.start(when);osc.stop(when+0.07);
    this.sources.push(osc);
  }

  private endBeat(project: StudioProject): number {
    return project.loop?project.loopEnd:Math.max(project.loopEnd,...project.tracks.flatMap((track)=>track.clips.map((clip)=>clip.start+clip.duration)),this.startedBeat+1);
  }
}

export async function renderProject(project: StudioProject, assets: Map<string, StudioAssetRuntime>, fromBeat: number, toBeat: number, sampleRate = 44100, channels = 2): Promise<AudioBuffer> {
  const duration = Math.max(0.1, (toBeat - fromBeat) * (60 / project.bpm) + 1.8);
  const context = new OfflineAudioContext(Math.max(1, Math.min(2, channels)), Math.ceil(duration * sampleRate), sampleRate);
  scheduleProject(context, project, assets, fromBeat, toBeat, 0, context.destination);
  return context.startRendering();
}
