import type { MemoryEntry } from './types';

/**
 * 말버릇 — 같은 식으로 자꾸 시작하는 것.
 *
 * 동반자 앱을 그만두는 가장 큰 이유로 꼽히는 것이 **반복**이다. 처음 며칠은 신기한데, 곧
 * 「같은 문구를 돌려 쓴다」는 게 보이고 그 순간 상대가 아니라 기계로 보인다. 진짜 이유는
 * 답이 짧아서가 아니라 **패턴이 눈에 띄어서**다.
 *
 * 우리 얘한테도 잔소리 한 줄은 있었다(최근 네 마디의 첫머리를 보여 주고 「같은 식으로 또
 * 시작하지 마라」). 그런데 **재료가 틀렸다.** 닿음 대꾸(「…또 찌르네」)와 놀이 판정
 * (「내가 이겼다」)은 원래 정해진 문구인데 그게 최근 목록을 다 차지해서, 두뇌가 실제로
 * 반복하는 말버릇은 목록에 오르지도 못했다. 실측: 얘가 한 말 107개 중 똑같이 두 번 이상
 * 한 말이 22번인데, 그중 대부분이 고정 문구였다. 그리고 「또 」로 시작한 말이 7번이었다.
 *
 * 그래서 **두뇌가 지은 말만** 본다. 그리고 잔소리를 세게 하는 대신 **실제로 굳었을 때만**
 * 짚는다 — 늘 짚으면 그 잔소리 자체가 또 하나의 반복이다.
 */

/** 두뇌가 지은 말만 남긴다. 어디서 왔는지 모르는 옛 기록은 안 센다. */
export function brainSaid(entries: readonly MemoryEntry[]): MemoryEntry[] {
  return entries.filter((e) => e.role === 'said' && e.via === 'brain');
}

/**
 * 말의 첫머리 — 말버릇을 세는 단위.
 *
 * **낱말 하나**가 기본이다. 처음엔 두 낱말로 셌는데 「또 그거네」 「또 그거야」 「또 그러네」가
 * 전부 다른 것으로 세져 아무것도 안 잡혔다. 실제로 눈에 띄는 버릇은 **첫 낱말**이다.
 */
export function opener(text: string, words = 1): string {
  return text
    .trim()
    .replace(/^[…\s.,]+/, '')
    .split(/\s+/)
    .slice(0, words)
    .join(' ')
    .replace(/[.…,!?]+$/, '');
}

export interface Rut {
  /** 굳은 첫머리. */
  opener: string;
  /** 최근 몇 마디 중 몇 번이나. */
  times: number;
  of: number;
}

export interface RutOptions {
  /** 최근 몇 마디를 볼지. */
  window?: number;
  /** 몇 번 넘게 겹치면 굳은 것으로 볼지. */
  atLeast?: number;
}

/**
 * 굳은 말버릇을 찾는다. 없으면 null.
 *
 * 두 번은 우연이다 — 사람도 그 정도는 한다. **세 번부터** 굳은 것으로 본다.
 */
export function findRut(entries: readonly MemoryEntry[], options: RutOptions = {}): Rut | null {
  const window = options.window ?? 8;
  const atLeast = options.atLeast ?? 3;

  const 말들 = brainSaid(entries).slice(-window).map((e) => opener(e.text)).filter((o) => o !== '');
  if (말들.length < atLeast) return null;

  const 셈 = new Map<string, number>();
  for (const o of 말들) 셈.set(o, (셈.get(o) ?? 0) + 1);

  let 최고: Rut | null = null;
  for (const [o, n] of 셈) {
    if (n < atLeast) continue;
    if (최고 === null || n > 최고.times) 최고 = { opener: o, times: n, of: 말들.length };
  }
  return 최고;
}

/**
 * 같은 말을 통째로 되풀이했나 — 첫머리보다 더 나쁜 신호다.
 *
 * 첫머리가 겹치는 건 말투지만, 문장이 통째로 같은 건 **아무 생각 없이 뱉은 것**이다.
 */
export function findEcho(entries: readonly MemoryEntry[], window = 8): string | null {
  const 말들 = brainSaid(entries).slice(-window).map((e) => e.text.trim());
  const 본것 = new Set<string>();
  for (const t of 말들) {
    if (t === '') continue;
    if (본것.has(t)) return t;
    본것.add(t);
  }
  return null;
}

/**
 * 두뇌에 넘길 한 줄. **굳었을 때만** 나온다.
 *
 * 늘 짚으면 그 잔소리 자체가 또 하나의 반복이 되고, 재료가 하나 늘 때마다 얘가 몸을
 * 사린다(15회차에서 배웠다). 그래서 평소엔 조용하다.
 */
export function rutWarning(entries: readonly MemoryEntry[], options: RutOptions = {}): string {
  const 통째 = findEcho(entries, options.window ?? 8);
  if (통째 !== null) {
    return `방금 「${통째.slice(0, 24)}」 를 아까도 똑같이 했다. 같은 문장을 또 뱉지 마라 — 다른 각도로 열어라.`;
  }

  const rut = findRut(entries, options);
  if (rut === null) return '';
  return (
    `최근 ${rut.of}마디 중 ${rut.times}번을 「${rut.opener}…」 로 시작했다. ` +
    '말투가 굳었다 — 이번엔 다른 데서 시작해라.'
  );
}
