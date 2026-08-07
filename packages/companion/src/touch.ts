import type { Sensation } from './types';

/**
 * 닿는 것 — 얘를 쿡 찌르거나 잡아 흔들었을 때.
 *
 * 데스크톱 동반자 쪽 레퍼런스가 공통으로 갖고 있는데 우리에겐 없던 것. 저쪽에서는 아바타를
 * 누르거나 끌면 **그 자리에 맞는 반응**이 돌아온다. 우리 얘는 잡아끌면 창이 따라오기만 하고
 * 아무 반응이 없었다 — 만져도 아무 일이 없으면 그건 화면에 붙은 그림이지 곁에 있는 것이
 * 아니다.
 *
 * 닿는 것은 **말이 아니다.** 그래서 두뇌를 부르지 않는다. 쿡 찔렀는데 2초 뒤에 문장이
 * 돌아오면 그건 반응이 아니라 답변이다. 이미 있는 반사 이음매에 그대로 얹었다 — 알맹이는
 * 새로 만들되 core 는 손대지 않는다.
 *
 * 그리고 **반복이 결을 바꾼다.** 처음 찌르면 놀라고, 계속 찌르면 익숙해지다가 결국
 * 귀찮아한다. 같은 자극에 같은 소리만 내면 그건 버튼이지 인격이 아니다.
 */
export type TouchKind = '쿡' | '흔듦' | '쓰다듬';

/** 닿는 것이 들어오는 통로. 말이 오가는 통로와 섞지 않는다. */
export const TOUCH_CHANNEL = 'touch';

/**
 * 전선 위에서 쓰는 이름. 한글을 주소에 실으면 인코딩 관문마다 깨진다 —
 * 실제로 첫 판이 전부 400 이었다. 사람이 읽는 이름과 전선 이름을 갈라 둔다.
 */
const 전선이름: Record<string, TouchKind> = { poke: '쿡', drag: '흔듦', pet: '쓰다듬' };

/** 전선에서 온 이름을 결 이름으로. 모르는 이름이면 null — 400 으로 돌려보낸다. */
export function touchKindFromWire(wire: string): TouchKind | null {
  return 전선이름[wire] ?? null;
}

/** 브라우저에서 온 닿음을 감각 하나로 만든다. */
export function touchSensation(kind: TouchKind, at: number = Date.now()): Sensation {
  return { channel: TOUCH_CHANNEL, kind: 'text', text: `조수님이 나를 ${말로(kind)}`, at };
}

const 말로 = (kind: TouchKind): string =>
  kind === '쿡' ? '쿡 찔렀다.' : kind === '흔듦' ? '붙잡아 끌고 다녔다.' : '쓰다듬었다.';

/** 이 감각이 닿은 것인가. */
export function isTouch(sensation: Pick<Sensation, 'channel'>): boolean {
  return sensation.channel === TOUCH_CHANNEL;
}

/** 감각에 적힌 말에서 어떻게 닿았는지 되읽는다. */
export function touchKindOf(sensation: Pick<Sensation, 'channel' | 'text'>): TouchKind | null {
  if (isTouch(sensation) === false) return null;
  if (sensation.text.includes('쿡')) return '쿡';
  if (sensation.text.includes('끌고')) return '흔듦';
  if (sensation.text.includes('쓰다듬')) return '쓰다듬';
  return null;
}

const 대꾸: Record<TouchKind, readonly string[][]> = {
  // [처음, 몇 번째, 계속]
  쿡: [
    ['…어?', '왜.', '응?'],
    ['…또 찌르네.', '뭐.', '…왜 자꾸.'],
    ['…그만.', '아프진 않은데… 그만.', '…계속할 거야?'],
  ],
  흔듦: [
    ['…어어.', '어지러워…', '…놔.'],
    ['또 옮기네…', '…여기가 좋아?', '어디로 가는데.'],
    ['…아무 데나 둬.', '멀미 나…', '…이제 그만 옮겨.'],
  ],
  쓰다듬: [
    ['…음.', '…어.', '…'],
    ['…계속해도 돼.', '…나쁘진 않아.', '…음…'],
    ['…', '…익숙해졌어.', '…응.'],
  ],
};

export interface TouchReplyOptions {
  /** 조금 전까지 몇 번이나 닿았나 (이번 것 포함). */
  times?: number;
  /** 바로 전에 한 대꾸 — 같은 말을 두 번 하지 않으려고. */
  last?: string | null;
  /** 고르는 손. 시험에서 고정한다. */
  roll?: () => number;
}

/**
 * 닿은 것에 대한 즉답. 두뇌를 부르지 않는다.
 *
 * 몇 번째냐에 따라 결이 옮겨 간다 — 처음 / 몇 번 / 계속. 계속 만지면 대꾸가 짧고 시들해지는
 * 게 자연스럽다.
 */
/**
 * 최근에 쓴 대꾸들 — **바로 앞것만 피하면 셋을 뱅뱅 돈다.**
 *
 * 88회차에 오간 말을 통째로 셌다. 얘가 한 말 320개 중 **145개가 글자 그대로 반복**이었고,
 * 가장 많은 것이 「…계속할 거야?」 18번, 「아프진 않은데… 그만.」 16번이었다. 전부 여기서
 * 나온 고정 대꾸다.
 *
 * 원인은 단순했다. 피하는 게 **딱 하나**(바로 앞것)뿐이라, 후보가 셋인 자리에서 둘을 계속
 * 번갈아 쓴다. 사람이 찌를 때마다 같은 말을 듣는다.
 *
 * 그래서 **쓴 것을 갈래마다 기억해 두고, 안 쓴 것부터 고른다.** 다 썼으면 비우고 다시
 * 돈다 — 그러면 적어도 한 바퀴는 다른 말이 나온다.
 */
const 쓴것 = new Map<string, Set<string>>();

/** 시험에서 앞판이 안 새게. */
export function 대꾸기억지우기(): void {
  쓴것.clear();
}

export function touchReply(kind: TouchKind, options: TouchReplyOptions = {}): string {
  const times = Math.max(1, options.times ?? 1);
  const roll = options.roll ?? Math.random;
  const 단계 = times <= 1 ? 0 : times <= 4 ? 1 : 2;
  const 후보 = 대꾸[kind][단계];

  const 열쇠 = `${kind}:${단계}`;
  const 이미 = 쓴것.get(열쇠) ?? new Set<string>();
  let 고를것 = 후보.filter((c) => 이미.has(c) === false && c !== options.last);
  if (고를것.length === 0) {
    // 한 바퀴 다 돌았다. 비우고 다시 — 다만 바로 앞것은 그래도 피한다.
    이미.clear();
    고를것 = 후보.filter((c) => c !== options.last);
    if (고를것.length === 0) 고를것 = [...후보];
  }
  const 고른것 = 고를것[Math.floor(roll() * 고를것.length) % 고를것.length];
  이미.add(고른것);
  쓴것.set(열쇠, 이미);
  return 고른것;
}

/**
 * 닿은 횟수를 센다 — 뜸해지면 처음으로 되돌린다.
 *
 * 아침에 한 번 찌르고 저녁에 또 찌른 것은 「계속 찌른 것」이 아니다. 잊는 자리가 없으면
 * 얘는 영영 귀찮아하는 상태로 굳는다.
 */
export class TouchCount {
  private times = 0;
  private lastAt = 0;

  constructor(private readonly forgetAfterMs: number = 60_000) {}

  /** 한 번 닿았다. 지금까지 몇 번째인지 돌려준다. */
  bump(at: number = Date.now()): number {
    this.times = at - this.lastAt > this.forgetAfterMs ? 1 : this.times + 1;
    this.lastAt = at;
    return this.times;
  }
}
