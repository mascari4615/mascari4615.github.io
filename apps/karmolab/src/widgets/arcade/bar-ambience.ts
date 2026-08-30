/**
 * 바 카운터의 소리. 낮은 웅성거림, 유리잔 부딪는 소리, 그리고 주사위
 *
 * `ambience.ts` 는 여름 툇마루(매미, 풍경). 주사위 방은 밤의 바, 다른 소리
 * 규율은 같음. 음원 파일 0, 소리 스위치 따름, 첫 손길에 깨어남, 주인이 문서에서 빠지면 멈춤
 *
 * 주사위 소리 셋:
 *  `rattle`  컵 안에서 흔들리는 소리. 잔 딱딱이 여러 번
 *  `clatter` 쟁반에 떨어져 구르는 소리. 세기 인자(높이 떨어질수록 큼)
 *  `scratch` 연필로 적는 소리
 */
import { soundOn } from '../../lib/blip';

export interface BarAmbience {
  wake(): void;
  rattle(): void;
  clatter(force: number): void;
  slide(): void;
  scratch(): void;
  stop(): void;
}

function noise(ctx: AudioContext, seconds = 4): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.loop = true;
  return n;
}

function filter(ctx: AudioContext, type: BiquadFilterType, hz: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

export function barAmbience(host: HTMLElement): BarAmbience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer = 0;
  const started: AudioScheduledSourceNode[] = [];

  /* 잔 부딪는 소리. 유리는 배음이 높고 길다 */
  const clink = (out: AudioNode): void => {
    const c = ctx as AudioContext;
    const at = c.currentTime;
    const f = 2400 + Math.random() * 1800;
    for (const [mul, g] of [[1, 1], [2.32, 0.4], [3.9, 0.15]] as Array<[number, number]>) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const a = c.createGain();
      a.gain.setValueAtTime(0.0001, at);
      a.gain.exponentialRampToValueAtTime(0.02 * g, at + 0.004);
      a.gain.exponentialRampToValueAtTime(0.0001, at + 1.4 / mul);
      o.connect(a).connect(out);
      o.start(at);
      o.stop(at + 1.6);
    }
  };

  const build = (): void => {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const c = new Ctor();
    ctx = c;
    master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    master.gain.linearRampToValueAtTime(0.9, c.currentTime + 2.5);

    /* 방의 웅성거림. 중간 대역 잡음이 천천히 부풀었다 꺼진다. 말은 안 들리고 사람만 있다 */
    const murmur = noise(c);
    const band = filter(c, 'bandpass', 420, 0.9);
    const mg = c.createGain();
    mg.gain.value = 0.045;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = c.createGain();
    depth.gain.value = 0.02;
    lfo.connect(depth).connect(mg.gain);
    murmur.connect(band).connect(mg).connect(master);
    murmur.start();
    lfo.start();
    started.push(murmur, lfo);

    /* 낮은 웅. 냉장고와 환풍기. 60Hz 근처 */
    const hum = c.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 58;
    const hg = c.createGain();
    hg.gain.value = 0.018;
    hum.connect(hg).connect(master);
    hum.start();
    started.push(hum);

    let nextClink = c.currentTime + 3 + Math.random() * 6;
    timer = window.setInterval(() => {
      if (!host.isConnected) {
        stop();
        return;
      }
      if (master) master.gain.setTargetAtTime(soundOn() && !document.hidden ? 0.9 : 0, c.currentTime, 0.4);
      const now = c.currentTime;
      if (now >= nextClink) {
        clink(master as GainNode);
        nextClink = now + 6 + Math.random() * 16;
      }
    }, 500);
  };

  const wake = (): void => {
    if (!soundOn()) return;
    try {
      if (!ctx) build();
      if (ctx?.state === 'suspended') void ctx.resume();
    } catch {
      /* 소리는 없어도 판은 돈다 */
    }
  };

  /* 짧은 딱. 주사위가 무엇에 닿는 소리. 세기와 높이를 받는다 */
  const knock = (at: number, force: number, hz: number): void => {
    const c = ctx as AudioContext;
    const out = master as GainNode;
    const burst = noise(c, 0.1);
    const band = filter(c, 'bandpass', hz, 2.2);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.35 * force, at);
    bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
    burst.connect(band).connect(bg).connect(out);
    burst.start(at);
    burst.stop(at + 0.05);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz * 0.6, at);
    o.frequency.exponentialRampToValueAtTime(hz * 0.25, at + 0.04);
    const g = c.createGain();
    g.gain.setValueAtTime(0.16 * force, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.08);
  };

  const rattle = (): void => {
    if (!soundOn() || !ctx || !master) return;
    try {
      const now = ctx.currentTime;
      /* 컵 안에서 열 번 남짓. 간격이 고르면 기계다 */
      let at = now;
      for (let i = 0; i < 11; i += 1) {
        knock(at, 0.35 + Math.random() * 0.4, 1800 + Math.random() * 1400);
        at += 0.025 + Math.random() * 0.03;
      }
    } catch {
      /* 위와 같다 */
    }
  };

  const clatter = (force: number): void => {
    if (!soundOn() || !ctx || !master) return;
    try {
      knock(ctx.currentTime, Math.min(1, force), 1100 + Math.random() * 900);
    } catch {
      /* 위와 같다 */
    }
  };

  const slide = (): void => {
    if (!soundOn() || !ctx || !master) return;
    try {
      const c = ctx;
      const now = c.currentTime;
      const s = noise(c, 0.3);
      const band = filter(c, 'bandpass', 900, 0.8);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      s.connect(band).connect(g).connect(master);
      s.start(now);
      s.stop(now + 0.22);
    } catch {
      /* 위와 같다 */
    }
  };

  const scratch = (): void => {
    if (!soundOn() || !ctx || !master) return;
    try {
      const c = ctx;
      const now = c.currentTime;
      const s = noise(c, 0.5);
      const band = filter(c, 'bandpass', 3200, 1.4);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.02);
      g.gain.linearRampToValueAtTime(0.03, now + 0.16);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      s.connect(band).connect(g).connect(master);
      s.start(now);
      s.stop(now + 0.32);
    } catch {
      /* 위와 같다 */
    }
  };

  const stop = (): void => {
    if (timer) window.clearInterval(timer);
    timer = 0;
    const c = ctx;
    ctx = null;
    if (!c) return;
    try {
      master?.gain.setTargetAtTime(0, c.currentTime, 0.15);
      window.setTimeout(() => {
        started.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* 이미 멈춘 것 */
          }
        });
        started.length = 0;
        void c.close();
      }, 700);
    } catch {
      void c.close();
    }
    master = null;
  };

  return { wake, rattle, clatter, slide, scratch, stop };
}
