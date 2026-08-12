/**
 * 소리 풍경 — 그 자리에서 만드는 배경음 (TASK-KL-248)
 *
 * **내려받는 음원이 0바이트다.** 잡음을 만들어 거르고, 몇 개의 진동을 겹치는 것으로 비·파도·
 * 모닥불이 된다. 그래서 용량이 안 늘고, 같은 소리가 두 번 반복되지 않는다(녹음은 반드시
 * 이음매가 들린다 — 오래 틀어 두는 소리에서 그 이음매가 가장 거슬리는 부분이다).
 *
 * 이 장치는 **화면도 지구본도 모른다.** 겹을 만들고 크기를 받을 뿐이다. 그래서 손잡이를
 * 누가 잡느냐만 다른 두 자리가 같은 엔진을 쓴다:
 *   - 지구본(`widgets/bluemarble/sound.ts`) — **자리**가 크기를 정한다(바다 위면 파도 크게)
 *   - 소리 풍경 도구(`widgets/tools/soundscape.ts`) — **사람**이 슬라이더로 정한다
 *
 * 규율 하나: 겹은 **늘 돌려 두고 크기만** 바꾼다. 껐다 켜면 이음매가 들린다.
 */

export type LayerId =
  | 'drone'
  | 'murmur'
  | 'pad'
  | 'wave'
  | 'wind'
  | 'rain'
  | 'fire'
  | 'brook'
  | 'hum';

export interface LayerSpec {
  id: LayerId;
  /** 이 겹이 낼 수 있는 가장 큰 크기. 겹마다 체감 크기가 달라 여기서 맞춘다. */
  max: number;
  /** 겹 하나를 짓는다. 돌려주는 마디에 크기를 걸어 조절한다. */
  build(ctx: AudioContext, out: GainNode, keep: (n: AudioNode) => void): GainNode;
}

/** 4초짜리 잡음 한 통을 만들어 무한 반복. 겹마다 새로 만든다(같은 통을 나눠 쓰면 겹쳐 들린다). */
function noiseSource(ctx: AudioContext, keep: (n: AudioNode) => void): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * 0.5;
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.loop = true;
  n.start();
  keep(n);
  return n;
}

function gain(ctx: AudioContext, v = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q?: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  if (q !== undefined) f.Q.value = q;
  return f;
}

/* ── 겹 아홉 ──────────────────────────────────────────────────────────── */

export const LAYERS: LayerSpec[] = [
  {
    /** 낮은 울림 — 55Hz 와 55.35Hz. 0.35Hz 차이라 3초에 한 번 부풀었다 줄어든다(맥놀이). */
    id: 'drone',
    max: 0.09,
    build(ctx, out, keep) {
      const g = gain(ctx);
      const lp = filter(ctx, 'lowpass', 160);
      g.connect(lp).connect(out);
      for (const f of [55, 55.35, 110.2]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const a = gain(ctx, f > 100 ? 0.25 : 1);
        o.connect(a).connect(g);
        o.start();
        keep(o);
      }
      return g;
    }
  },
  {
    /** 사람 기척 — 잡음을 620Hz 좁게 걸러 목소리 대역만 남긴다. 말은 안 들리고 기척만 남는다. */
    id: 'murmur',
    max: 0.06,
    build(ctx, out, keep) {
      const g = gain(ctx);
      noiseSource(ctx, keep).connect(filter(ctx, 'bandpass', 620, 0.7)).connect(g).connect(out);
      return g;
    }
  },
  {
    /** 얇은 화음 — 220·277·330Hz 삼각파. 하늘이 흔들리는 느낌. */
    id: 'pad',
    max: 0.05,
    build(ctx, out, keep) {
      const g = gain(ctx);
      g.connect(filter(ctx, 'lowpass', 1200)).connect(out);
      for (const f of [220, 277.18, 329.63]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const a = gain(ctx, 0.33);
        o.connect(a).connect(g);
        o.start();
        keep(o);
      }
      return g;
    }
  },
  {
    /** 파도 — 저역 잡음이 8초에 한 번 밀려왔다 나간다. 그 숨이 없으면 그냥 소음이다. */
    id: 'wave',
    max: 0.07,
    build(ctx, out, keep) {
      const g = gain(ctx);
      const swell = gain(ctx, 0.5);
      noiseSource(ctx, keep).connect(filter(ctx, 'lowpass', 420)).connect(swell).connect(g).connect(out);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.125;
      const amt = gain(ctx, 0.42);
      lfo.connect(amt).connect(swell.gain);
      lfo.start();
      keep(lfo);
      return g;
    }
  },
  {
    /** 바람 — 900Hz 언저리만. 마른 땅 위에서 나는 소리. */
    id: 'wind',
    max: 0.05,
    build(ctx, out, keep) {
      const g = gain(ctx);
      noiseSource(ctx, keep).connect(filter(ctx, 'bandpass', 900, 0.5)).connect(g).connect(out);
      return g;
    }
  },
  {
    /** 비 — 고역 잡음. 굵기를 바꾸려면 자르는 자리를 옮긴다. */
    id: 'rain',
    max: 0.06,
    build(ctx, out, keep) {
      const g = gain(ctx);
      noiseSource(ctx, keep).connect(filter(ctx, 'highpass', 1800)).connect(g).connect(out);
      return g;
    }
  },
  {
    /**
     * 모닥불 — 낮게 거른 잡음(불길) 위에 **무작위로 탁탁**(장작 튀는 소리)을 얹는다.
     * 규칙적으로 튀면 불이 아니라 시계다. 그래서 다음 소리까지의 사이를 매번 새로 뽑는다.
     */
    id: 'fire',
    max: 0.08,
    build(ctx, out, keep) {
      const g = gain(ctx);
      noiseSource(ctx, keep).connect(filter(ctx, 'lowpass', 700)).connect(g).connect(out);

      const crackle = gain(ctx, 0.9);
      crackle.connect(g);
      const pop = (): void => {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 900 + Math.random() * 2200;
        const a = gain(ctx, 0);
        a.gain.setValueAtTime(0, t);
        a.gain.linearRampToValueAtTime(0.28 + Math.random() * 0.3, t + 0.004);
        a.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.07);
        o.connect(a).connect(crackle);
        o.start(t);
        o.stop(t + 0.2);
      };
      /* 타이머 하나가 스스로 다음 약속을 잡는다 — `setInterval` 이면 간격이 고정돼 불이 안 된다. */
      let timer = 0;
      const schedule = (): void => {
        timer = setTimeout(() => {
          pop();
          schedule();
        }, 90 + Math.random() * 700) as unknown as number;
      };
      schedule();
      /* 이 겹이 사라질 때 타이머도 같이 죽어야 한다 — 마디인 척하는 그릇에 담아 보낸다. */
      keep({ disconnect: () => clearTimeout(timer) } as unknown as AudioNode);
      return g;
    }
  },
  {
    /** 시냇물 — 중고역 잡음이 느리게 흔들린다. 비와 파도 사이가 비어 있었다. */
    id: 'brook',
    max: 0.055,
    build(ctx, out, keep) {
      const g = gain(ctx);
      const bp = filter(ctx, 'bandpass', 2400, 0.8);
      noiseSource(ctx, keep).connect(bp).connect(g).connect(out);
      // 물길이 흔들리듯 자르는 자리가 천천히 오간다
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.33;
      const amt = gain(ctx, 700);
      lfo.connect(amt).connect(bp.frequency);
      lfo.start();
      keep(lfo);
      return g;
    }
  },
  {
    /** 기계 웅웅 — 낮은 톱니를 깎아 낸 소리. 「방 안에 있다」는 느낌(카페·비행기). */
    id: 'hum',
    max: 0.05,
    build(ctx, out, keep) {
      const g = gain(ctx);
      g.connect(filter(ctx, 'lowpass', 320)).connect(out);
      for (const f of [98, 147]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const a = gain(ctx, f > 100 ? 0.18 : 0.4);
        o.connect(a).connect(g);
        o.start();
        keep(o);
      }
      return g;
    }
  }
];

export function layerIds(): LayerId[] {
  return LAYERS.map((l) => l.id);
}

/** 0~1 로 받은 값을 그 겹의 실제 크기로. 밖에서는 늘 0~1 만 쓴다. */
export function levelToGain(id: LayerId, level: number): number {
  const spec = LAYERS.find((l) => l.id === id);
  if (!spec) return 0;
  const v = Math.max(0, Math.min(1, level));
  /* 귀는 크기를 곱셈으로 느낀다 — 슬라이더를 반으로 내렸을 때 반만큼 작아지게 하려면 제곱이 필요하다. */
  return spec.max * v * v;
}

/* ── 장치 ─────────────────────────────────────────────────────────────── */

/**
 * 소리 풍경 한 벌.
 *
 * 브라우저는 **사람이 누른 그 순간**이 아니면 소리를 안 내준다. 그래서 `start()` 는 반드시
 * 클릭 안에서 불러야 한다(지구본도 도구도 그렇게 하고 있다).
 */
export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gains = new Map<LayerId, GainNode>();
  private nodes: AudioNode[] = [];
  private levels = new Map<LayerId, number>();
  /** 밖에서 전체 크기를 잠깐 줄일 때(라디오가 울리는 동안 같은). */
  private ducked = false;

  constructor(private readonly which: LayerId[] = layerIds()) {}

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
    // 켜지자마자 최대로 나오면 놀란다 — 천천히 올라온다
    master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 3);

    const keep = (n: AudioNode): void => {
      this.nodes.push(n);
    };
    for (const spec of LAYERS) {
      if (!this.which.includes(spec.id)) continue;
      const g = spec.build(ctx, master, keep);
      this.gains.set(spec.id, g);
      // 켜기 전에 정해 둔 크기가 있으면 그대로 살린다
      const want = this.levels.get(spec.id);
      if (want) g.gain.value = levelToGain(spec.id, want);
    }
  }

  /** 겹 하나의 크기 (0~1). 꺼져 있어도 기억해 두었다가 켤 때 쓴다. */
  set(id: LayerId, level: number): void {
    this.levels.set(id, Math.max(0, Math.min(1, level)));
    const g = this.gains.get(id);
    const ctx = this.ctx;
    if (!g || !ctx) return;
    // 확 바뀌면 툭 소리가 난다 — 1.4초에 걸쳐 옮긴다
    g.gain.setTargetAtTime(levelToGain(id, level), ctx.currentTime, 1.4);
  }

  get(id: LayerId): number {
    return this.levels.get(id) ?? 0;
  }

  /** 지금 소리 내고 있는 겹들. */
  active(): LayerId[] {
    return [...this.levels.entries()].filter(([, v]) => v > 0.001).map(([k]) => k);
  }

  /** 다른 소리가 울리는 동안 밑으로 깔린다. 끄지 않는 이유 = 끊긴 순간의 무음이 더 거슬린다. */
  duck(on: boolean): void {
    this.ducked = on;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(on ? 0.12 : 0.85, ctx.currentTime, 2.2);
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  /**
   * 한 번 울리고 사라지는 낮은 소리 — 지진처럼 **일이 일어난 순간**을 알리는 것.
   * 겹(늘 도는 것)과 성격이 달라 따로 둔다.
   */
  impulse(freq: number, dur: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq), t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.max(0.01, Math.min(0.5, level)), t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 한 번에 여러 겹 — 프리셋을 얹을 때. */
  apply(mix: Partial<Record<LayerId, number>>): void {
    for (const [k, v] of Object.entries(mix)) this.set(k as LayerId, v as number);
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.master?.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    } catch {
      /* 이미 닫혔으면 그만 */
    }
    const dead = ctx;
    const dying = this.nodes;
    this.ctx = null;
    this.master = null;
    this.gains.clear();
    this.nodes = [];
    // 잦아들 시간을 준 뒤 정리한다 — 바로 끊으면 툭 소리가 난다
    setTimeout(() => {
      for (const n of dying) {
        try {
          (n as OscillatorNode).stop?.();
        } catch {
          /* 이미 멈춘 것 */
        }
        try {
          n.disconnect();
        } catch {
          /* 이미 끊긴 것 */
        }
      }
      void dead.close().catch(() => undefined);
    }, 700);
  }
}

/* ── 미리 섞어 둔 것 ──────────────────────────────────────────────────── */

export interface Preset {
  id: string;
  mix: Partial<Record<LayerId, number>>;
}

/** 손으로 섞기 전에 「그럴싸한 자리」부터 주는 편이 낫다 — 아홉 개 슬라이더는 시작점이 아니다. */
export const PRESETS: Preset[] = [
  { id: 'rainynight', mix: { rain: 0.55, drone: 0.35, hum: 0.2 } },
  { id: 'seaside', mix: { wave: 0.7, wind: 0.3, murmur: 0.08 } },
  { id: 'cafe', mix: { murmur: 0.5, hum: 0.35, brook: 0.05 } },
  { id: 'campfire', mix: { fire: 0.6, wind: 0.22, drone: 0.18 } },
  { id: 'forest', mix: { brook: 0.5, wind: 0.35, pad: 0.12 } },
  { id: 'deepwork', mix: { drone: 0.5, hum: 0.3, rain: 0.18 } }
];
