import { brainSaid } from './rut';
import type { MemoryEntry } from './types';

/**
 * 텅 빈 대꾸 — 「…응…」 「어…」 만 이어지는 것.
 *
 * 대화 시스템 쪽에서 몰입이 깨지는 첫째 이유로 꼽히는 게 **최소한의 답**이다. 성의 없는
 * 대꾸가 이어지면 사람은 지루해하고, 그 순간 「말이 통하는 상대」가 아니게 된다.
 *
 * **먼저 재고 가설을 하나 버렸다.** 처음엔 그 자리에서 즉답하는 고정 대꾸(반사)가 대화를
 * 가로채는 줄 알았다. 실측(37회차): 얘 말 35개 중 반사는 9개(26%)고 **연달아 나간 건 최대
 * 한 번**이었다. 반사는 범인이 아니었다.
 *
 * 진짜는 **두뇌가 지은 말도 반사만큼 텅 비어 있다**는 것이다 — 「…응…」 「음…」 「어…」.
 * 앞서 잰 것과도 맞는다(30회차: 두뇌 말 평균 8.5자, 되물은 비율 13%).
 *
 * 조심할 게 하나 있다. **짧은 게 이 얘의 인격이다.** 늘 막으면 인격을 죽인다. 그래서
 * **연달아** 텅 빌 때만 잡는다 — 한 번은 그 얘답고, 세 번은 벽이다.
 *
 * 회피 감시(14회차)와 다른 자리다. 그건 다음 번에 「모른다고만 하지 마라」고 **잔소리**하고,
 * 이건 그 자리에서 **다시 시킨다.** 이미 뱉은 뒤의 지적은 늦다.
 */

/** 알맹이가 없는 대꾸 — 호응·머뭇거림뿐. */
const 텅빈꼴 = /^[…\s.]*(응|어|음|아|오|네|그래|그렇구나|그러게|그치|맞아|알겠|오케이|ㅇㅇ|글쎄|몰라|모르겠)[…\s.!?~]*$/;

/** 이 한마디가 텅 비었나. */
export function isHollow(text: string): boolean {
  const t = text.trim();
  if (t === '') return true;
  // 짧아도 뜻이 있으면 텅 빈 게 아니다 — 「소파…」는 답이다.
  return 텅빈꼴.test(t);
}

/**
 * 연달아 몇 번이나 텅 비었나 (지금 하려는 말은 안 센다).
 *
 * 두뇌가 지은 말만 센다. 고정 대꾸는 원래 짧게 정해진 것이라 그걸 같이 세면 찌르기만 해도
 * 벽으로 오진한다.
 */
export function hollowStreak(entries: readonly MemoryEntry[]): number {
  const 말들 = brainSaid(entries);
  let 셈 = 0;
  for (let i = 말들.length - 1; i >= 0; i -= 1) {
    if (isHollow(말들[i].text) === false) break;
    셈 += 1;
  }
  return 셈;
}

export interface HollowOptions {
  /** 연달아 이만큼 텅 비면 다시 시킨다. */
  atLeast?: number;
}

/**
 * 지금 하려는 말이 「또」 텅 비었으면 다시 시킬 이유를 준다. 아니면 null.
 *
 * **한 번은 그냥 둔다.** 「응」 한마디가 딱 맞는 자리도 있다.
 */
export function hollowReason(
  text: string,
  entries: readonly MemoryEntry[],
  options: HollowOptions = {},
): string | null {
  if (isHollow(text) === false) return null;

  const atLeast = options.atLeast ?? 2;
  const 이어진것 = hollowStreak(entries) + 1; // 이번 것까지
  if (이어진것 < atLeast) return null;

  return `${이어진것}번째 알맹이 없는 대꾸다 (「${text.trim()}」)`;
}

/**
 * 다시 시킬 때 두뇌에 넘길 말.
 *
 * **길게 말하라고 하지 않는다.** 길이를 시키면 얘가 수다스러워지고 그건 다른 인격이다.
 * 필요한 건 길이가 아니라 **알맹이 하나**다.
 */
export function hollowRetryNote(why: string): string {
  return (
    `${why}. 짧은 건 괜찮은데 알맹이가 없다. 길게 늘이지 말고, ` +
    '본 것·기억나는 것·궁금한 것 중 **하나만** 얹어라. 그래도 한두 마디면 된다.'
  );
}
