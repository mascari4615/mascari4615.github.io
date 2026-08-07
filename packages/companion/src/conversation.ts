import type { MemoryEntry } from './types';

/**
 * 나눈 말과 곁에서 본 것을 가른다.
 *
 * 기억에는 두 가지가 섞여 들어온다. **사람이 나에게 건넨 말**과, 얘가 **곁에서 혼자 본
 * 것**(앞에 뭐가 떠 있나, 조용한 지 얼마나 됐나)이다. 둘 다 있어야 곁에 있는 것이 되지만,
 * **같은 무게로 두면 본 것이 나눈 말을 삼킨다.**
 *
 * 실측(16회차): 342턴이 쌓인 기억에서 사람이 직접 한 말은 30개, 화면에서 온 것이 265개였다.
 * 90%다. 그래서
 * - 「아는 것」이 342턴을 겪고도 텅 비어 있었다 — 졸일 재료 마흔 개가 전부
 *   「화면을 봤다. 창은 …」였으니 사람에 대해 뽑을 게 없었다.
 * - 하루의 매듭(15회차)이 「마지막으로 나눈 얘기」로 화면 로그를 집었다. 인사가 부실했던 게
 *   문구 탓인 줄 알았는데, 재료가 처음부터 대화가 아니었다.
 *
 * 레퍼런스도 같은 자리를 짚는다 — 스트리머 AI 가 채팅 홍수에서 살아남는 방법은 더 많이
 * 기억하는 게 아니라 **무엇을 기억으로 올릴지 고르는 것**이다. 전부 기억하면 아무것도
 * 기억하지 못한다.
 *
 * 지우지는 않는다. 곁에서 본 것도 그 자리에선 쓸모가 있다(지금 뭘 하고 있나). 다만
 * **「우리가 나눈 얘기」를 물을 때는 나눈 말만 센다.**
 */

/** 사람이 건넨 게 아니라 얘가 혼자 주워 온 통로. */
export const AMBIENT_CHANNELS: readonly string[] = ['screen', 'nudge', 'idle', 'clock'];

export interface ConversationOptions {
  /** 곁에서 본 것으로 칠 통로. 몸을 새로 붙이면 여기 더한다. */
  ambient?: readonly string[];
}

/**
 * 이 한 줄이 「나눈 말」인가.
 *
 * 얘가 한 말은 언제나 나눈 말이다 — 혼잣말이어도 입 밖으로 낸 것이니 대화의 일부다.
 * 들어온 것은 통로를 본다.
 */
export function isConversation(entry: MemoryEntry, options: ConversationOptions = {}): boolean {
  const ambient = options.ambient ?? AMBIENT_CHANNELS;
  if (entry.role === 'said') return true;
  return ambient.includes(entry.channel) === false;
}

/** 나눈 말만 남긴다. 순서는 그대로. */
export function conversationOnly(
  entries: readonly MemoryEntry[],
  options: ConversationOptions = {},
): readonly MemoryEntry[] {
  return entries.filter((e) => isConversation(e, options));
}

/**
 * 얘가 혼자 본 것만 남긴다 — 「지금 뭐 하고 있나」를 물을 때 쓴다.
 *
 * 가르는 쪽이 있으면 반대쪽도 있어야 한다. 안 그러면 부르는 쪽마다 제 나름대로 걸러
 * 기준이 갈라진다.
 */
export function ambientOnly(
  entries: readonly MemoryEntry[],
  options: ConversationOptions = {},
): readonly MemoryEntry[] {
  return entries.filter((e) => isConversation(e, options) === false);
}
