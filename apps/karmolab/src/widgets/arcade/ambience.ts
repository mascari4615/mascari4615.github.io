/**
 * 방 표현의 소리. 매미, 바람, 풍경, 그리고 알이 판에 닿는 소리
 *
 * `lib/blip.ts` 는 눌렀다는 한 방울, `lib/soundscape.ts` 는 도구용 배경음(비, 파도)
 * 오목 방에 필요한 건 그 사이. **여름 오후 툇마루** 한 벌이 계속 깔리고, 알을 두면 딱 소리.
 * 그림과 같은 규율로 **음원 파일 0**. 잡음 한 통과 진동자로 전부
 *
 * 규율:
 *  ① 소리 스위치(`soundOn`)를 따름. 꺼져 있으면 아무것도 안 만듦
 *  ② 사람이 손대기 전에는 못 낸다. 첫 pointerdown 에서 깨운다(`wake`)
 *  ③ 판을 떠나면 반드시 멈춘다. 매미가 로비까지 따라오면 안 된다. 주인 요소가 문서에서
 *     빠지면 스스로 끔(화면은 dispose 를 안 부름)
 */
import { soundOn } from '../../lib/blip';

export interface Ambience {
  /** 사용자 제스처 안에서. 이미 깨어 있으면 아무 일도 없다 */
  wake(): void;
  /** 알이 판에 닿는 소리 */
  stone(): void;
  /** 마지막 10초의 초침. 작은 나무 딱 */
  tick(): void;
  stop(): void;
}

/** 4초짜리 흰 잡음 한 통, 무한 반복 */
function noise(ctx: AudioContext): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
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

/* 풍경 음. 높은 오음계. 낮으면 종이고, 이 높이라야 풍경이다 */
const CHIME = [1568, 1760, 2093, 2349, 2637];

export function roomAmbience(host: HTMLElement): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer = 0;
  const started: AudioScheduledSourceNode[] = [];

  const cicadaVoice = (out: AudioNode, center: number, buzzHz: number, level: number): GainNode => {
    const c = ctx as AudioContext;
    const src = noise(c);
    const band = filter(c, 'bandpass', center, 9);
    /* 매미 특유의 지지직은 잡음에 빠른 떨림을 곱한 것 */
    const buzz = c.createOscillator();
    buzz.type = 'square';
    buzz.frequency.value = buzzHz;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    const ring = c.createGain();
    ring.gain.value = 0.5;
    buzz.connect(depth).connect(ring.gain);
    const env = c.createGain();
    env.gain.value = 0;
    src.connect(band).connect(ring).connect(env).connect(out);
    src.start();
    buzz.start();
    started.push(src, buzz);
    /* 울음 하나. 커졌다 한참 이어지다 사그라든다 */
    const cry = (): void => {
      const now = c.currentTime;
      const hold = 2 + Math.random() * 3;
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(env.gain.value, now);
      env.gain.linearRampToValueAtTime(level, now + 1.2);
      env.gain.setValueAtTime(level, now + 1.2 + hold);
      env.gain.linearRampToValueAtTime(0, now + 1.2 + hold + 1.6);
    };
    (env as GainNode & { cry?: () => void }).cry = cry;
    return env;
  };

  const chime = (out: AudioNode): void => {
    const c = ctx as AudioContext;
    const notes = 2 + Math.floor(Math.random() * 3);
    let at = c.currentTime;
    for (let k = 0; k < notes; k += 1) {
      const f = CHIME[Math.floor(Math.random() * CHIME.length)];
      /* 한 음은 기음과 비화성 배음 둘. 금속은 배음이 정수배가 아니다 */
      for (const [mul, g] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as Array<[number, number]>) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const a = c.createGain();
        a.gain.setValueAtTime(0.0001, at);
        a.gain.exponentialRampToValueAtTime(0.035 * g, at + 0.006);
        a.gain.exponentialRampToValueAtTime(0.0001, at + 2.2 / mul);
        o.connect(a).connect(out);
        o.start(at);
        o.stop(at + 2.4);
      }
      at += 0.12 + Math.random() * 0.35;
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

    /* 바람. 낮은 잡음이 아주 천천히 부풀었다 꺼진다 */
    const wind = noise(c);
    const low = filter(c, 'lowpass', 380, 0.7);
    const windGain = c.createGain();
    windGain.gain.value = 0.11;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 160;
    lfo.connect(lfoDepth).connect(low.frequency);
    wind.connect(low).connect(windGain).connect(master);
    wind.start();
    lfo.start();
    started.push(wind, lfo);

    /* 매미 둘. 음높이와 떨림이 달라야 두 마리다 */
    const near = cicadaVoice(master, 5200, 46, 0.05);
    const far = cicadaVoice(master, 4400, 37, 0.028);
    const voices = [near, far] as Array<GainNode & { cry?: () => void }>;

    /* 시간표. 매미는 몇 초에 한 번 울고, 풍경은 드문드문. 주인이 문서에서 빠지면 끈다 */
    let nextCry = c.currentTime + 1;
    let nextChime = c.currentTime + 4 + Math.random() * 6;
    timer = window.setInterval(() => {
      if (!host.isConnected) {
        stop();
        return;
      }
      if (master) master.gain.setTargetAtTime(soundOn() && !document.hidden ? 0.9 : 0, c.currentTime, 0.4);
      const now = c.currentTime;
      if (now >= nextCry) {
        voices[Math.floor(Math.random() * voices.length)].cry?.();
        nextCry = now + 5 + Math.random() * 9;
      }
      if (now >= nextChime) {
        chime(master as GainNode);
        nextChime = now + 7 + Math.random() * 14;
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

  const stone = (): void => {
    if (!soundOn() || !ctx || !master) return;
    try {
      const c = ctx;
      const now = c.currentTime;
      /* 딱. 짧은 잡음에 나무 울림 한 번 */
      const burst = noise(c);
      const band = filter(c, 'bandpass', 2600, 1.4);
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.5, now);
      bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      burst.connect(band).connect(bg).connect(master);
      burst.start(now);
      burst.stop(now + 0.05);
      const knock = c.createOscillator();
      knock.type = 'sine';
      knock.frequency.setValueAtTime(820, now);
      knock.frequency.exponentialRampToValueAtTime(240, now + 0.05);
      const kg = c.createGain();
      kg.gain.setValueAtTime(0.28, now);
      kg.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      knock.connect(kg).connect(master);
      knock.start(now);
      knock.stop(now + 0.1);
    } catch {
      /* 위와 같다 */
    }
  };

  const tick = (): void => {
    if (!soundOn() || !ctx || !master) return;
    try {
      const c = ctx;
      const now = c.currentTime;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, now);
      o.frequency.exponentialRampToValueAtTime(700, now + 0.03);
      const g = c.createGain();
      g.gain.setValueAtTime(0.09, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + 0.06);
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

  return { wake, stone, tick, stop };
}
