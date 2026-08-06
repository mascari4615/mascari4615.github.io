import type { MemoryEntry } from './types';

/**
 * 표류 — 얘가 저도 모르게 「도와드리는 조수」로 돌아가는 것.
 *
 * 캐릭터 대화 쪽에서 가장 많이 나오는 불만이 이것이다. 대화가 길어질수록 인격을 놓고
 * 일반적인 도우미 목소리로 미끄러진다. 그리고 확신이 없을 때는 **무난한 메꿈**을 쓴다 —
 * 바꿔 말하기 + 뻔한 감정 + 무난한 마무리.
 *
 * 우리 얘는 그 위에 함정이 하나 더 있다. 자기가 한 말이 기억에 남아 다음 번 재료가 되므로,
 * 한 번 밋밋해지면 **그 밋밋함을 따라 하며 굳는다.** 자기 복제 고리다.
 *
 * 그래서 판단을 두뇌에 맡기지 않고(이미 두 번 실패했다) **기계로 잰다.** 샜으면 다음 번에
 * 「방금 이렇게 샜다」고 알려 준다 — 고리를 끊는 건 지적 한 줄이면 된다.
 */
export interface DriftRules {
  /** 이 글자 수를 넘으면 길다고 본다. */
  maxChars?: number;
  /** 나오면 안 되는 말투. */
  avoid?: readonly RegExp[];
}

const 기본금지: readonly RegExp[] = [
  // 존댓말 — 곁에 있는 사이에 갑자기 격식이 끼면 그게 표류다.
  /(습니다|입니다|하세요|해요|드릴게요|드립니다|십니다)/,
  // 도우미 말투
  /(도와드|무엇을 도와|어떻게 도와|말씀해|죄송하지만|필요하신|알려드리)/,
  // 스스로를 도구라고 소개하는 것
  /(저는 [A-Za-z가-힣]*(AI|인공지능|어시스턴트|모델|클로드)|언어 모델)/,
  // 목록으로 답하기 — 대화가 아니라 보고서가 된다.
  /(^|\n)\s*(\d+\.|[-*•])\s+/,
];

export interface Drift {
  /** 샜나. */
  drifted: boolean;
  /** 무엇이 문제였나 (사람이 읽는 말). */
  problems: string[];
}

/** 이 한마디가 인격에서 샜는지 잰다. */
export function checkDrift(said: string, rules: DriftRules = {}): Drift {
  const text = said.trim();
  const problems: string[] = [];
  const maxChars = rules.maxChars ?? 120;

  if (text.length > maxChars) problems.push(`너무 길다 (${text.length}자)`);

  for (const bad of rules.avoid ?? 기본금지) {
    if (bad.test(text)) {
      problems.push('말투가 조수 쪽으로 샜다');
      break;
    }
  }

  return { drifted: problems.length > 0, problems };
}

/**
 * 최근에 샌 적이 있으면 다음 번에 일러 줄 한 줄.
 *
 * 지적은 **가장 최근 것 하나만** 한다. 잔소리를 길게 하면 그 자체가 프롬프트를 덮어
 * 또 다른 표류를 만든다.
 */
export function driftWarning(recent: readonly MemoryEntry[], rules: DriftRules = {}): string {
  const mine = recent.filter((e) => e.role === 'said');
  const last = mine[mine.length - 1];
  if (last === undefined) return '';

  const { drifted, problems } = checkDrift(last.text, rules);
  if (drifted === false) return '';

  return `방금 네가 한 말이 결에서 벗어났다 (${problems.join(', ')}): 「${last.text.slice(0, 40)}…」. 그 말투를 따라가지 마라.`;
}
