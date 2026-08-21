/**
 * 무거운 자리에서만 큰 머리를 쓴다.
 *
 * 84회차에 「왜 늘 일고여덟 자로 답하나」를 실험으로 갈랐다. 같은 말을 넣고 조건만 바꿨다:
 *
 * ```
 * 지금 그대로   2자 | 또…
 * 인격 없이     2자 | 또?           ← 인격 탓이 아니다
 * 작은 머리    14자 | …좋아, 회의 힘들었겠네…
 * 큰 머리      33자 | 그거보다 재밌었단 회의 얘기가 더 궁금한데… 뭐가 재밌었어.
 * ```
 *
 * **재료는 양쪽 다 실렸다.** 인격도 아니고 재료도 아니었다 — **작은 머리가 못 따르는 것**
 * 이다. 69회차에 되묻기가 안 되던 것도, 83회차에 받아 주기가 안 되던 것도 전부 같은 자리
 * 였다. 한 줄짜리 지시를 재료로 얹는 방식 자체는 맞았고, 그걸 따를 머리가 아니었다.
 *
 * 그렇다고 늘 큰 머리를 쓸 수는 없다. 곁에 있는 존재는 **빨라야** 한다 — 첫 소리까지 13초
 * 걸리던 걸 0.8초로 줄이는 데 여러 회차를 썼고, 그건 큰 머리로 되돌리면 그대로 날아간다.
 * 맞장구 한마디에 큰 머리를 쓰는 건 낭비이기도 하다.
 *
 * 그래서 **자리를 보고 고른다.** 대부분은 작은 머리로 빠르게, 무거운 자리에서만 큰 머리로.
 * 무거운 자리는 이미 우리가 재고 있는 것들이다 — 길게 털어놨거나, 감정이 실렸거나, 공을
 * 돌려줄 자리거나, 옛일이 걸렸거나.
 */

export interface 머리고르기입력 {
  /** 받아 줄 자리인가 (길게 털어놨거나 감정이 실렸다). */
  acceptSlot?: boolean;
  /** 공을 돌려줄 자리인가 (대화가 식어 간다). */
  tossSlot?: boolean;
  /** 지난 일이 걸렸나. */
  hasPastEvent?: boolean;
  /** 조수님이 얘 자신에 대해 물었나. */
  selfTalk?: boolean;
}

export interface 머리크기옵션 {
  /** 평소에 쓸 머리. */
  smallHead?: string;
  /** 무거운 자리에 쓸 머리. */
  largeHead?: string;
}

/**
 * 지금 turn 에 어느 머리를 쓸까. 왜 그런지도 같이 돌려준다.
 *
 * **이유를 같이 낸다.** 「왜 이 turn 만 느렸지」를 나중에 알 수 없으면, 큰 머리를 쓰는 게
 * 고장으로 보인다(오늘까지 「왜」가 없어서 실험을 다시 돌린 자리가 넷이다).
 */
export function whichHead(input: 머리고르기입력, options: 머리크기옵션 = {}): { 머리: string; why: string } {
  const smallHead = options.smallHead ?? 'haiku';
  const largeHead = options.largeHead ?? 'sonnet';

  // 위에서부터 본다 — 여러 개가 겹쳐도 이유는 하나만 적는다.
  if (input.acceptSlot === true) return { 머리: largeHead, why: '길게 털어놨거나 감정이 실렸다' };
  if (input.tossSlot === true) return { 머리: largeHead, why: '대화가 식어 가 공을 돌려줄 자리다' };
  if (input.selfTalk === true) return { 머리: largeHead, why: '얘 자신에 대해 물었다' };
  if (input.hasPastEvent === true) return { 머리: largeHead, why: '지난 일이 걸렸다' };
  return { 머리: smallHead, why: '' };
}

/**
 * 머리를 바꿔 끼우는 자리 — **끝나면 반드시 되돌린다.**
 *
 * 안 되돌리면 무거운 turn 한 번이 그 뒤 모든 turn 을 느리게 만든다. 조용히 그렇게 되면
 * 「어느 순간부터 느려졌다」로만 보이고 원인을 못 찾는다.
 */
export function attachHead(
  brain: { currentModel?: () => string; useModel?: (name: string) => void },
  head: string,
  log?: (message: string) => void,
): () => void {
  const inUse = brain.currentModel?.();
  if (brain.useModel === undefined || inUse === undefined || inUse === head) return () => {};
  brain.useModel(head);
  return () => {
    brain.useModel?.(inUse);
    log?.(`머리를 ${inUse} 로 되돌렸다`);
  };
}
