import type { MemoryEntry } from './types';

/**
 * **제 성적을 얘가 본다.**
 *
 * 115, 116(회상), 125, 126(인격), 128(누르기). 점수판을 셋이나 지었는데 전부 **우리가** 재는
 * 것이다. 얘 자신은 제가 어떤지 모른다. 밖에서 이걸 **아는 것과 하는 것의 틈**이라 부르고,
 * 모델이 제 능력을 물으면 **체계적으로 과신**한다는 게 결론이다(MIRROR, 원장 2026-08-21).
 * 122회차에 누를게라고 말만 하고 안 누른 것이 우리 판의 그 틈이다.
 *
 * 그래서 방금 한 말들을 세어 **한 줄**로 돌려준다. 세 가지에 조심했다:
 *
 * - **잔소리는 그 자체로 표류를 만든다.** 87회차에 강제 재시도가 멀쩡한 답을 무대 뒤
 *   얘기로 바꿔 놓는 걸 두 번 봤다. 그래서 **말할 게 없으면 아무 말도 안 한다**(빈 글).
 * - **표본이 적으면 아무 말이나 하게 된다.** 넉 마디 미만이면 안 잰다.
 * - **한 가지만 말한다.** 여럿을 늘어놓으면 그게 프롬프트를 덮는다(`driftWarning` 과 같은 규율).
 *
 * 파일을 안 읽는다. 점수판 스크립트는 수 초가 걸리고, 이건 매 turn 도는 자리다.
 * 재료는 이미 손에 있는 최근 기억뿐이다.
 */
export interface SelfScoreOptions {
  /** 몇 마디까지 볼까. */
  howMany?: number;
  /** 이보다 적으면 안 잰다. */
  atLeast?: number;
  /** 되풀이가 이 비율을 넘으면 말한다. */
  repeatOver?: number;
  /** 평균이 이 글자 수를 넘으면 말한다. */
  longOver?: number;
}

export function selfScore(recent: readonly MemoryEntry[], options: SelfScoreOptions = {}): string {
  const howMany = options.howMany ?? 12;
  const atLeast = options.atLeast ?? 4;
  const repeatOver = options.repeatOver ?? 0.3;
  const longOver = options.longOver ?? 90;

  /* **이건 제 성적이다.** 사람이 한 말은 안 센다. */
  const mine = recent
    .filter((entry) => entry.role === 'said')
    .map((entry) => entry.text.trim())
    .filter((text) => text !== '')
    .slice(-howMany);
  if (mine.length < atLeast) return '';

  const seen = new Map<string, number>();
  let repeated = 0;
  for (const text of mine) {
    const count = (seen.get(text) ?? 0) + 1;
    if (count > 1) repeated += 1;
    seen.set(text, count);
  }

  /* 되풀이가 먼저다. 같은 말을 또 한다가 사람이 가장 먼저 질리는 자리다(89회차). */
  if (repeated / mine.length > repeatOver) {
    return `방금 ${mine.length}마디 중 ${repeated}마디가 아까 한 말과 똑같다. 또 그 말로 가지 마라.`;
  }

  const average = mine.reduce((sum, text) => sum + text.length, 0) / mine.length;
  if (average > longOver) {
    return `방금 몇 마디가 평균 ${Math.round(average)}자다. 길어지고 있다. 짧게 말해라.`;
  }

  return '';
}
