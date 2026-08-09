/**
 * 지구의 소리 (TASK-KL-206 단위 5)
 *
 * 자취방 창문이면 소리가 있어야 한다. 다만 **지구의 실제 소리는 없다** — 우주는 조용하고,
 * 위성은 소리를 보내지 않는다. 그러니 녹음을 가져다 트는 척은 안 한다. 대신 화면에서
 * 지금 일어나는 일을 **그 자리에서 합성**한다. 라디오를 틀면 그건 남의 방송이지 이 지구가 아니다.
 *
 * 넷을 쌓는다:
 *   드론  — 아주 낮은 두 음이 살짝 어긋나 맥놀이를 만든다. 「크고 조용한 것이 돌고 있다」
 *   웅성  — 밤이 된 쪽에 사람이 많을수록 커지는 걸러 낸 잡음. 도시의 기척
 *   지진  — 새 지진이 오면 한 번 낮게 운다
 *   오로라 — 자기장이 흔들리면 얇은 화음이 겹친다
 *
 * 소리는 **사용자가 켤 때만** 시작한다(브라우저가 그렇게 요구하기도 하고, 창문을 열었다고
 * 소리가 나면 그건 창문이 아니라 알람이다).
 */

export class EarthSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private murmurGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private nodes: AudioNode[] = [];

  get running(): boolean {
    return !!this.ctx;
  }

  /** 사용자 제스처 안에서 불러야 한다. */
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
    this.master = master;
    // 켜지자마자 최대로 나오면 놀란다 — 4초에 걸쳐 올라온다
    master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 4);

    /* 드론 — 55Hz 와 55.35Hz. 차이가 0.35Hz 라 3초에 한 번씩 부풀었다 줄어든다. */
    const drone = ctx.createGain();
    drone.gain.value = 0.075;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    drone.connect(lp).connect(master);
    for (const f of [55, 55.35, 110.2]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 100 ? 0.25 : 1;
      o.connect(g).connect(drone);
      o.start();
      this.nodes.push(o);
    }
    this.droneGain = drone;

    /* 웅성 — 잡음을 좁게 걸러 사람 목소리 대역만 남긴다. 크기는 밖에서 정해 준다. */
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.7;
    const murmur = ctx.createGain();
    murmur.gain.value = 0;
    noise.connect(bp).connect(murmur).connect(master);
    noise.start();
    this.murmurGain = murmur;
    this.nodes.push(noise);

    /* 오로라 — 얇은 화음. 평소엔 0 이고 자기장이 흔들릴 때만 올라온다. */
    const pad = ctx.createGain();
    pad.gain.value = 0;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 1200;
    pad.connect(padLp).connect(master);
    for (const f of [220, 277.18, 329.63]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g).connect(pad);
      o.start();
      this.nodes.push(o);
    }
    this.padGain = pad;
  }

  /** 화면 상태를 소리에 반영한다 (매 프레임 아니라 몇 초에 한 번이면 충분하다). */
  update(nightCityRatio: number, auroraStrength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.murmurGain || !this.padGain) return;
    const t = ctx.currentTime;
    this.murmurGain.gain.setTargetAtTime(Math.min(0.05, nightCityRatio * 0.06), t, 2);
    this.padGain.gain.setTargetAtTime(Math.min(0.045, auroraStrength * 0.05), t, 3);
  }

  /** 지진 — 한 번 낮게 운다. 규모가 클수록 낮고 길다. */
  quake(mag: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const dur = Math.min(4, 1.2 + mag * 0.28);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = Math.max(26, 78 - mag * 5);
    o.frequency.setValueAtTime(f0 * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.min(0.5, 0.12 + mag * 0.05), t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.master?.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    } catch (_) {
      /* 이미 닫혔으면 그만 */
    }
    const dead = ctx;
    window.setTimeout(() => void dead.close().catch(() => undefined), 1200);
    this.ctx = null;
    this.master = null;
    this.droneGain = null;
    this.murmurGain = null;
    this.padGain = null;
    this.nodes = [];
  }
}
