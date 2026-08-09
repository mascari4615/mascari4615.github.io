/**
 * 정원의 소리 (TASK-KL-211)
 *
 * 배경음을 깔지 않는다. **판이 내는 소리**를 만든다 — 그러려면 무엇이 소리를 낼지 정해야 한다.
 *
 * 정원에는 이미 박자가 있다. 진동자는 「몇 세대마다 제 모습으로 돌아오는 것」이고, 그건 곧
 * **주기**다. 주기 2짜리와 주기 15짜리가 한 판에 같이 있으면 그 자체로 폴리리듬이다.
 * 그래서 도감이 찾아낸 개체의 주기를 그대로 박자로 쓴다 — 화면이 그 박자로 뛰고 있으니
 * 소리와 그림이 어긋날 수가 없다.
 *
 * 나머지는 두 겹:
 *   드론  — 살아 있는 칸 수. 많을수록 밝고 두껍다.
 *   스침  — 태어나고 죽는 양(churn). 판이 부산할수록 잡음이 커진다.
 *
 * 사건(절멸·굳음)은 한 번 울리고 만다. 소리는 **사용자가 켤 때만** 시작한다.
 */

/** 주기 → 음. 짧은 주기가 높은 음이다(빠른 것이 높게 들리는 쪽이 자연스럽다). */
const SCALE = [880, 783.99, 659.25, 587.33, 523.25, 440, 392, 329.63, 293.66, 261.63, 220, 196];
const pitchFor = (period: number): number => SCALE[Math.min(SCALE.length - 1, Math.max(0, period - 2))];

export class GardenSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private bustle: GainNode | null = null;
  /** 주기마다 마지막으로 울린 시각 */
  private lastHit = new Map<number, number>();

  get running(): boolean {
    return !!this.ctx;
  }

  start(): void {
    if (this.ctx) return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 3);
    this.master = master;

    // 드론 — 판이 살아 있다는 낮은 웅웅
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 65.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    osc.connect(lp).connect(g).connect(master);
    osc.start();
    this.droneOsc = osc;
    this.droneFilter = lp;

    // 스침 — 태어나고 죽는 소리
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2400;
    hp.Q.value = 0.6;
    const bg = ctx.createGain();
    bg.gain.value = 0;
    noise.connect(hp).connect(bg).connect(master);
    noise.start();
    this.bustle = bg;
  }

  /** 판 상태를 소리에 반영한다. `alive` = 살아 있는 비율, `churn` = 매 세대 뒤집히는 비율. */
  update(alive: number, churn: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneFilter || !this.bustle) return;
    const t = ctx.currentTime;
    // 살아 있는 칸이 많을수록 드론이 밝아진다
    this.droneFilter.frequency.setTargetAtTime(180 + Math.min(1, alive * 3) * 900, t, 1.5);
    this.bustle.gain.setTargetAtTime(Math.min(0.035, churn * 0.6), t, 0.8);
  }

  /**
   * 주기 하나를 울린다. 같은 주기를 너무 자주 치지 않는다 —
   * 주기 2짜리는 초당 아홉 번 돌아오는데 그대로 치면 소리가 아니라 톱니가 된다.
   */
  tick(period: number, now: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const gap = Math.max(280, period * 90);
    const last = this.lastHit.get(period) ?? -1e9;
    if (now - last < gap) return;
    this.lastHit.set(period, now);

    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = pitchFor(period);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
  }

  /** 우주선이 지나갈 때 — 짧게 스치는 소리. */
  swoosh(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  }

  /** 사건 — 낮게 한 번. */
  toll(low = true): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = low ? 98 : 146.83;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 2.5);
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.master?.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    } catch (_) {
      /* 이미 닫혔으면 그만 */
    }
    const dead = ctx;
    window.setTimeout(() => void dead.close().catch(() => undefined), 1000);
    this.ctx = null;
    this.master = null;
    this.droneOsc = null;
    this.droneFilter = null;
    this.bustle = null;
    this.lastHit.clear();
  }
}
