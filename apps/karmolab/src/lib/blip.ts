/**
 * 소리 한 방울. 눌렀다는 것, 이겼다는 것 (TASK-KL-264)
 *
 * 이미 있는 소리 장치 둘은 **배경음**이다: `lib/soundscape.ts`(비, 파도, 모닥불)와
 * 정원의 소리(판이 내는 폴리리듬). 둘 다 계속 흐르는 것이라 **눌렀다** 를 말해 주지 못한다.
 * 놀이에 필요한 건 그 반대. 짧고, 즉시고, 겹쳐도 안 시끄러운 소리다. 그래서 따로 둔다.
 *
 * **음원 파일 0바이트.** 진동자 하나에 봉투(소리가 커졌다 사그라드는 모양)를 씌우면 끝이라
 * 내려받을 것이 없다. 51개 게임에 소리를 붙이는 데 든 용량이 이 파일 하나다.
 *
 * 규율:
 *  ① **처음 누를 때 깨운다.** 브라우저는 사람이 손대기 전에는 소리를 못 내게 막는다(막아야 한다).
 *  ② **켜고 끄는 것은 이 브라우저에만 남는다.** 기본은 켜짐. 놀이에서 소리는 장식이 아니라
 *     알림이다(제기가 발에 닿는 순간, 눈치에서 겹친 순간).
 *  ③ **한 번에 하나씩 짧게.** 겹쳐 울리면 소리가 아니라 소음이 된다.
 */

/** 어떤 순간인가. 게임마다 다른 소리를 고르지 않는다. 51개가 같은 말을 쓰게 한다. */
export type BlipKind = 'tap' | 'good' | 'bad' | 'start' | 'win' | 'lose';

interface Shape {
  /** 헤르츠. 둘이면 앞 음에서 뒤 음으로 미끄러진다. */
  hz: [number] | [number, number];
  ms: number;
  type: OscillatorType;
  gain: number;
}

/* 낮은 소리 = 나쁜 일, 높은 소리 = 좋은 일. 배우지 않아도 아는 규칙이라 설명이 필요 없다. */
const SHAPES: Record<BlipKind, Shape> = {
  tap: { hz: [520], ms: 45, type: 'square', gain: 0.05 },
  good: { hz: [660, 990], ms: 110, type: 'triangle', gain: 0.07 },
  bad: { hz: [220, 150], ms: 180, type: 'sawtooth', gain: 0.06 },
  start: { hz: [440, 660], ms: 150, type: 'triangle', gain: 0.07 },
  win: { hz: [660, 1320], ms: 320, type: 'triangle', gain: 0.09 },
  lose: { hz: [330, 160], ms: 380, type: 'sine', gain: 0.08 }
};

const KEY = 'karmolab.sound';
let ctx: AudioContext | null = null;
let on: boolean | null = null;

/**
 * 목소리. 같은 여섯 순간을 **다른 소리**로
 * 기본은 전자음(진동자 하나). `room` 은 나무와 쇠. 오목 방(다다미, 툇마루)에서 전자 비프가 나면
 * 그 방이 깨짐(사용자 지적). 방 판이 켜지면 오락실이 목소리를 바꾸고 로비로 나오면 원래대로
 */
export type BlipVoice = 'default' | 'room';
let voice: BlipVoice = 'default';

export function setBlipVoice(v: BlipVoice): void {
  voice = v;
}

/* 풍경 한 음. 기음과 비화성 배음 둘. 금속은 배음이 정수배가 아니다 */
function chime(c: AudioContext, at: number, hz: number, gain: number): void {
  for (const [mul, g] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as Array<[number, number]>) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz * mul;
    const a = c.createGain();
    a.gain.setValueAtTime(0.0001, at);
    a.gain.exponentialRampToValueAtTime(gain * g, at + 0.006);
    a.gain.exponentialRampToValueAtTime(0.0001, at + 1.8 / mul);
    o.connect(a).connect(c.destination);
    o.start(at);
    o.stop(at + 2);
  }
}

/* 나무 두드림. 짧은 잡음 + 내려앉는 사인 */
function knock(c: AudioContext, at: number, hz: number, gain: number, ms: number): void {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.03), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  const n = c.createBufferSource();
  n.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = hz * 3;
  band.Q.value = 1.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(gain * 1.6, at);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
  n.connect(band).connect(ng).connect(c.destination);
  n.start(at);
  n.stop(at + 0.04);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(hz, at);
  o.frequency.exponentialRampToValueAtTime(hz * 0.3, at + ms / 1000);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + ms / 1000 + 0.02);
}

function roomBlip(c: AudioContext, kind: BlipKind): void {
  const now = c.currentTime;
  switch (kind) {
    case 'tap':
      knock(c, now, 700, 0.14, 70);
      break;
    case 'start':
      chime(c, now, 2093, 0.05);
      break;
    case 'good':
      chime(c, now, 1760, 0.045);
      chime(c, now + 0.16, 2349, 0.045);
      break;
    case 'bad':
      knock(c, now, 220, 0.12, 160);
      break;
    case 'win':
      chime(c, now, 1568, 0.05);
      chime(c, now + 0.18, 2093, 0.05);
      chime(c, now + 0.36, 2637, 0.05);
      break;
    case 'lose':
      knock(c, now, 200, 0.12, 200);
      knock(c, now + 0.28, 150, 0.1, 260);
      break;
    default:
      break;
  }
}

export function soundOn(): boolean {
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) !== 'off';
    } catch {
      on = true;
    }
  }
  return on;
}

export function setSoundOn(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    /* 못 적어도 이 판에는 적용된다 */
  }
}

/**
 * 한 방울 울린다. 꺼져 있거나 소리를 못 내는 자리면 **아무 일도 안 일어난다** . 
 * 부르는 쪽이 소리가 되는지 안 되는지 신경 쓰지 않게 한다.
 */
export function blip(kind: BlipKind): void {
  if (!soundOn()) return;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    /* 손댄 뒤에야 깨어난다. 그 전에 만들면 잠든 채로 남는다. */
    if (ctx.state === 'suspended') void ctx.resume();
    if (voice === 'room') {
      roomBlip(ctx, kind);
      return;
    }

    const s = SHAPES[kind];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.hz[0], now);
    if (s.hz.length === 2) osc.frequency.exponentialRampToValueAtTime(s.hz[1], now + s.ms / 1000);

    /* 봉투. 뚝 끊으면 딱 하는 잡음이 난다(스피커가 튀는 소리다). */
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(s.gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + s.ms / 1000);

    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + s.ms / 1000 + 0.02);
  } catch {
    /* 소리는 없어도 놀이는 돌아야 한다 */
  }
}
