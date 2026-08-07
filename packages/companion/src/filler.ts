/**
 * 기다리는 티 — 답이 오기 전에 먼저 내는 소리.
 *
 * 사람은 생각할 때 「음…」 하고 뜸을 들인다. 그 소리가 없으면 상대는 못 들었나, 고장 났나
 * 싶어진다. 연구도 같은 말을 한다 — 같은 지연이라도 이런 소리가 있으면 **절반쯤으로
 * 느껴지고**, 8초를 넘기면 평가가 바닥으로 떨어진다. 우리 답은 지금 그 구간에 있다(8~18초).
 *
 * 답 자체를 빠르게 만드는 건 우리 손 밖이었다(9회차: 우리 몫은 30ms, 나머지는 저쪽).
 * 그렇다면 **비어 있는 그 시간을 죽어 있지 않게** 만드는 게 우리가 할 수 있는 일이다.
 */

/** 결마다 다른 뜸. 늘어진 애가 「어, 잠깐만!」 하면 그건 다른 사람이다. */
const 뜸 = {
  나른함: ['음…', '으음…', '아…', '흐음…'],
  보통: ['음.', '응…', '그게…', '어…'],
  깨어있음: ['음,', '아 그거,', '잠깐,', '어디 보자,'],
} as const;

export interface FillerOptions {
  /** 0(축 처짐) ~ 1(생생함). 없으면 보통으로 본다. */
  energy?: number;
  /** 직전에 낸 뜸 — 같은 걸 연달아 내면 그게 더 기계 같다. */
  last?: string | null;
  roll?: () => number;
}

/** 지금 낼 뜸 하나. */
/**
 * 뜸으로 쓰일 수 있는 말 전부.
 *
 * **미리 만들어 두려고** 밖으로 내놓는다. 흉내 낸 목소리는 소리 하나에 1~2초가 걸리고
 * 한 번에 하나씩만 만든다 — 뜸이 그 줄에 서면 진짜 대답이 뒤에서 기다린다. 기다림을
 * 메우라고 만든 것이 기다림을 만든다(실측 4~6초). 몇 마디 안 되니 미리 만들어 둔다.
 */
export function 모든뜸(): readonly string[] {
  return Object.values(뜸).flat();
}

export function pickFiller(options: FillerOptions = {}): string {
  const energy = options.energy ?? 0.5;
  const pool = energy < 0.35 ? 뜸.나른함 : energy > 0.75 ? 뜸.깨어있음 : 뜸.보통;
  const roll = options.roll ?? Math.random;

  const usable = pool.filter((f) => f !== options.last);
  const choices = usable.length > 0 ? usable : pool;
  const at = Math.min(choices.length - 1, Math.floor(roll() * choices.length));
  return choices[at] as string;
}
