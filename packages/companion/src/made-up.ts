import type { MemoryEntry } from './types';

/**
 * 지어낸 사실 — 안 보고 아는 척하는 것.
 *
 * 헛말이 나오는 까닭으로 한결같이 꼽히는 것: **「모른다」에는 점수가 0이라, 자신 있게 찍는
 * 쪽이 늘 이긴다.** 그래서 모델은 모르는 자리에서도 그럴듯한 값을 지어낸다.
 *
 * 40회차에 **안 한 걸 했다고 말하는 것**을 막았다. 이건 그 짝이다 — **안 본 걸 아는 척하는
 * 것.** 「10시 28분이야」는 시계를 봤으면 참이고, 안 봤으면 그냥 지어낸 숫자다. 조수님은
 * 그걸 믿고 지나간다.
 *
 * 기계로 잴 수 있다. 우리는 이번 turn 에 **무엇을 찾아봤는지**(미리 쓴 손)와 **무슨 말이
 * 오갔는지**를 안다. 얘가 구체적인 값을 말했는데 **어느 쪽에도 그 값이 없으면** 지어낸 것이다.
 *
 * 좁게 잡는다. 「좀 늦었네」는 사실 주장이 아니고 「10시 28분」이 사실 주장이다. 애매한 걸
 * 잡으면 얘가 아무 말도 못 하게 된다 — **못 잡는 쪽이 낫다.**
 */

/** 구체적인 값 — 이런 게 나오면 근거가 있어야 한다. */
const 사실꼴: readonly { pattern: RegExp; what: string }[] = [
  // 「11시 쯤」처럼 **분이 없어도** 시각 주장이다. 처음엔 「N시 N분」만 봐서 라이브에서
  // 「11시 쯤이었나…」가 그대로 새어 나갔다(실측 53회차).
  { pattern: /\d{1,2}\s*시(\s*\d{1,2}\s*분)?/, what: '시각' },
  { pattern: /\d{1,2}\s*월\s*\d{1,2}\s*일/, what: '날짜' },
  { pattern: /[\w가-힣-]+\.(md|json|ts|js|txt|png|jpg|cs|unity)/i, what: '파일 이름' },
  { pattern: /\d+\s*(개|번째|줄|바이트|메가|기가)/, what: '개수' },
];

/** 이 말에 든 구체적 값들. */
export function factClaims(said: string): { value: string; what: string }[] {
  const out: { value: string; what: string }[] = [];
  for (const { pattern, what } of 사실꼴) {
    const m = pattern.exec(said);
    if (m !== null) out.push({ value: m[0].trim(), what });
  }
  return out;
}

/** 값에서 숫자만 뽑는다 — 「10시 28분」과 「10시 28분입니다」가 같은 근거를 갖게. */
const 숫자들 = (text: string): string[] => text.match(/\d+/g) ?? [];

/**
 * 이 값이 어딘가에 근거가 있나.
 *
 * **찾아본 것**(손이 물어다 준 것)과 **오간 말**(조수님이 알려 준 것) 둘 다 본다 —
 * 조수님이 「3시에 회의야」라고 말해 준 걸 얘가 되뇌는 건 지어낸 게 아니다.
 */
function 근거있나(value: string, found: readonly string[], recent: readonly MemoryEntry[]): boolean {
  const 숫자 = 숫자들(value).map((n) => n.replace(/^0+(?=\d)/, ''));
  // **얘가 한 말은 근거가 아니다.**
  //
  // 안 빼면 **제가 지어낸 값을 제가 인용한다** — 라이브에서 실제로 그랬다(53회차: 한 번
  // 새어 나간 「11시 27분」이 다음 turn 의 근거가 되어 영영 통과했다). 근거가 될 수 있는
  // 것은 **찾아본 것**과 **조수님이 한 말**뿐이다.
  const 바탕 = [...found, ...recent.filter((e) => e.role === 'sensed').map((e) => e.text)]
    .join('\n')
    .replace(/0+(\d)/g, '$1');
  if (숫자.length === 0) return 바탕.includes(value);

  // **숫자는 붙어 있어야 근거다.**
  //
  // 처음엔 숫자를 따로따로 찾았는데, 「11」 같은 흔한 값은 아무 데나 있어서 「11시 27분」이
  // 그대로 통과했다(실측 53회차). 「11:27」 「11시 27분」처럼 **가까이 붙어 있을 때만**
  // 그 시각을 실제로 본 것이다. 앞에 붙은 0 은 같은 값으로 본다(「09:05」 = 「9시 5분」).
  return new RegExp(숫자.join('[^0-9]{0,4}')).test(바탕);
}

/**
 * 근거 없이 지어낸 값이 있나. 있으면 왜인지 돌려준다.
 *
 * **하나만 짚는다.** 여러 개를 늘어놓으면 다시 시키는 말이 길어지고, 길면 얘가 몸을 사린다.
 */
export function madeUpFact(
  said: string,
  found: readonly string[],
  recent: readonly MemoryEntry[],
): string | null {
  for (const claim of factClaims(said)) {
    if (근거있나(claim.value, found, recent)) continue;
    return `안 보고 ${claim.what}을 지어냈다 (「${claim.value}」)`;
  }
  return null;
}

/**
 * 다시 시킬 때 두뇌에 넘길 말.
 *
 * **모른다고 해도 된다**고 분명히 한다. 그게 이 문제의 뿌리다 — 「모른다」가 손해라고 여기면
 * 계속 찍는다.
 */
export function madeUpRetryNote(why: string): string {
  return (
    `${why}. 그 값을 확인한 적이 없다. 그럴듯한 숫자를 찍지 마라 — ` +
    '모르면 모른다고 하거나 그 얘기를 빼라. **모른다고 하는 게 손해가 아니다.**'
  );
}
