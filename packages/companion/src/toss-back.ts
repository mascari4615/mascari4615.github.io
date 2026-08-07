import type { MemoryEntry } from './types';

/**
 * 공을 돌려주기 — 대화가 한쪽으로만 흐르지 않게.
 *
 * 조수님이 오늘 대화 목록을 붙여 놓고 「대화가 되는 느낌이 아니다」라고 했다. 67회차에
 * 원인 하나(밤이라 짧게 답하라는 지시)를 걷어냈는데, **남은 절반은 이거다 — 얘가 공을
 * 안 돌려준다.** 스무 마디 중 되묻는 말이 하나였다.
 *
 * 레퍼런스 쪽에서 「말을 잘한다」로 꼽히는 것들의 공통점이 되받아치기와 되묻기다. 답만
 * 하면 그건 대답이지 대화가 아니다 — 사람은 곧 물어볼 말이 떨어지고, 그러면 끝난다.
 *
 * **다만 매번 되물으면 취조다.** 그래서 좁게 잡는다.
 *
 * - **대화가 식어 갈 때만.** 오간 말이 짧아지고 있으면 공이 굴러가다 멈추는 중이다.
 * - **방금 되물었으면 안 한다.** 두 번 이어 물으면 그게 취조다.
 * - **사람이 물어본 turn 에는 안 한다.** 물음에 물음으로 답하는 건 회피다.
 */

/** 이 말이 묻는 말인가. */
export function 묻는말인가(text: string): boolean {
  const 말 = text.trim();
  if (말 === '') return false;
  return /[?？]\s*$/.test(말) || /(뭐야|뭔데|어때|어땠|있어\?|없어\?|할래|갈래|맞아\?)\s*$/.test(말);
}

export interface TossBackInput {
  /** 최근 오간 말 (오래된 것부터). */
  recent: readonly MemoryEntry[];
  /** 방금 조수님이 한 말. */
  방금: string;
}

/**
 * 지금 공을 돌려줘야 하나. 아니면 빈 말.
 *
 * 재료로 얹을 한 줄을 돌려준다 — 무엇을 물으라고까지 정해 주지는 않는다. 물을 거리는
 * 대화에서 나와야지, 우리가 정해 주면 그게 설문지다.
 */
export function tossBackNote(input: TossBackInput): string {
  const 대화 = input.recent.filter((e) => e.channel === 'web');
  const 사람말 = 대화.filter((e) => e.role === 'sensed');
  const 얘말 = 대화.filter((e) => e.role === 'said');
  // 아직 말이 몇 마디 안 오갔으면 그냥 둔다 — 처음부터 되물으면 낯설다.
  if (사람말.length < 2 || 얘말.length < 2) return '';

  // 물음에 물음으로 답하는 건 회피다.
  if (묻는말인가(input.방금)) return '';

  // 방금 되물었으면 또 안 한다. 두 번 이어 물으면 취조다.
  const 마지막얘말 = 얘말[얘말.length - 1];
  if (마지막얘말 !== undefined && 묻는말인가(마지막얘말.text)) return '';

  // 대화가 식어 가는가 — 최근 말이 그 앞보다 짧아지고 있으면 공이 멈추는 중이다.
  const 길이 = (es: readonly MemoryEntry[]) =>
    es.length === 0 ? 0 : es.reduce((a, e) => a + e.text.trim().length, 0) / es.length;
  const 최근 = 길이(사람말.slice(-2));
  const 그전 = 길이(사람말.slice(-5, -2));
  const 식는중 = 그전 > 0 ? 최근 < 그전 * 0.8 : 최근 < 12;
  if (식는중 === false) return '';

  return (
    '대화가 식어 가고 있다. 답만 하지 말고 **공을 돌려줘라** — 방금 나온 얘기에서 ' +
    '한 가지를 골라 되물어라. 새 주제를 꺼내라는 게 아니라, 하던 얘기를 이어 가라는 것이다.'
  );
}

/**
 * 얼마나 자주 공을 돌려줬나 — 재는 자리.
 *
 * 「되묻게 했다」는 만든 사람 말이고, **몇 번 중 몇 번인가**가 결과다. 이걸 안 세면
 * 재료만 얹어 놓고 됐다고 하게 된다(오늘만 그런 자리를 셋 찾았다).
 */
export function 되물은비율(said: readonly MemoryEntry[]): { 전체: number; 되물음: number } {
  const 말들 = said.filter((e) => e.role === 'said');
  return { 전체: 말들.length, 되물음: 말들.filter((e) => 묻는말인가(e.text)).length };
}
