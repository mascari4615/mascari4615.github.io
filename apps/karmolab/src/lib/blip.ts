/**
 * 소리 한 방울 — 눌렀다는 것, 이겼다는 것 (TASK-KL-264)
 *
 * 이미 있는 소리 장치 둘은 **배경음**이다: `lib/soundscape.ts`(비·파도·모닥불)와
 * 정원의 소리(판이 내는 폴리리듬). 둘 다 「계속 흐르는 것」이라 **눌렀다** 를 말해 주지 못한다.
 * 놀이에 필요한 건 그 반대 — 짧고, 즉시고, 겹쳐도 안 시끄러운 소리다. 그래서 따로 둔다.
 *
 * **음원 파일 0바이트.** 진동자 하나에 봉투(소리가 커졌다 사그라드는 모양)를 씌우면 끝이라
 * 내려받을 것이 없다. 51개 게임에 소리를 붙이는 데 든 용량이 이 파일 하나다.
 *
 * 규율:
 *  ① **처음 누를 때 깨운다.** 브라우저는 사람이 손대기 전에는 소리를 못 내게 막는다(막아야 한다).
 *  ② **켜고 끄는 것은 이 브라우저에만 남는다.** 기본은 켜짐 — 놀이에서 소리는 장식이 아니라
 *     알림이다(제기가 발에 닿는 순간, 눈치에서 겹친 순간).
 *  ③ **한 번에 하나씩 짧게.** 겹쳐 울리면 소리가 아니라 소음이 된다.
 */

/** 어떤 순간인가. 게임마다 다른 소리를 고르지 않는다 — 51개가 같은 말을 쓰게 한다. */
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
 * 한 방울 울린다. 꺼져 있거나 소리를 못 내는 자리면 **아무 일도 안 일어난다** —
 * 부르는 쪽이 소리가 되는지 안 되는지 신경 쓰지 않게 한다.
 */
export function blip(kind: BlipKind): void {
  if (!soundOn()) return;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    /* 손댄 뒤에야 깨어난다 — 그 전에 만들면 잠든 채로 남는다. */
    if (ctx.state === 'suspended') void ctx.resume();

    const s = SHAPES[kind];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.hz[0], now);
    if (s.hz.length === 2) osc.frequency.exponentialRampToValueAtTime(s.hz[1], now + s.ms / 1000);

    /* 봉투 — 뚝 끊으면 「딱」 하는 잡음이 난다(스피커가 튀는 소리다). */
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
