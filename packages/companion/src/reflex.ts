/**
 * 반사 — 생각하기 전에 나가는 반응.
 *
 * AIRI 의 구조에는 「보기 → 반사 → 생각 → 행동」 순서가 있다. 우리 얘는 그 반사가 없어서
 * 「고마워」 한마디에도 두뇌를 부르고 10초를 기다렸다. 사람은 그러지 않는다 — 인사에는
 * 생각 없이 답한다.
 *
 * 이득은 셋이다. 즉답(0.03초) · 구독 할당량 절약 · 그리고 무엇보다 **대화의 결**.
 * 「잘 자」에 10초 뜸을 들이면 그건 대화가 아니다.
 *
 * 위험은 하나 — 정해진 말만 하면 그게 더 기계 같다. 그래서 **아주 좁게만** 잡고,
 * 결(기운)에 따라 다르게 고르고, 같은 말을 연달아 하지 않는다. 조금이라도 애매하면
 * 반사하지 않고 두뇌로 넘긴다.
 */

export interface ReflexOptions {
  /** 0(축 처짐) ~ 1(생생함). */
  energy?: number;
  /** 직전에 반사로 한 말 — 같은 걸 연달아 하지 않게. */
  last?: string | null;
  roll?: () => number;
}

/** 상황마다, 결마다 다른 대꾸. */
const 대꾸: Record<string, { 처짐: readonly string[]; 보통: readonly string[]; 생생: readonly string[] }> = {
  인사: {
    처짐: ['…응, 왔어.', '어… 왔네.', '음… 안녕.'],
    보통: ['응, 왔네.', '어, 안녕.', '왔어?'],
    생생: ['오, 왔네!', '어 안녕.', '왔구나.'],
  },
  작별: {
    처짐: ['응… 잘 가.', '어… 나중에.', '음… 잘 자.'],
    보통: ['응, 잘 가.', '어, 나중에 봐.', '잘 자.'],
    생생: ['그래, 잘 가.', '응 나중에!', '잘 자, 조수님.'],
  },
  고마움: {
    처짐: ['…응.', '뭘.', '음… 됐어.'],
    보통: ['응, 뭘.', '별거 아냐.', '됐어.'],
    생생: ['응! 뭘 이런 걸로.', '별거 아니야.', '그래그래.'],
  },
  호응: {
    처짐: ['응…', '음…', '그래…'],
    보통: ['응.', '그래.', '음.'],
    생생: ['응응.', '그래그래.', '오케이.'],
  },
};

/** 딱 이 말들만 반사한다. 조금이라도 넓히면 얘가 성의 없어진다. */
const 규칙: readonly { 종류: keyof typeof 대꾸; 말: RegExp }[] = [
  { 종류: '인사', 말: /^(안녕|하이|안뇽|왔어|나 왔어|안녕\?|여보세요)[!?.…\s]*$/ },
  { 종류: '작별', 말: /^(잘\s?자|잘자|바이|굿나잇|자러\s?간다|나중에\s?봐|이따\s?봐|갔다\s?올게|다녀올게)[!?.…\s]*$/ },
  { 종류: '고마움', 말: /^(고마워|고맙다|감사|땡큐|ㄱㅅ|고마웡)[!?.…\s]*$/ },
  { 종류: '호응', 말: /^(응|ㅇㅇ|그래|ok|오케이|알겠어|넵|넹|ㅋㅋ+|ㅎㅎ+)[!?.…\s]*$/i },
];

/**
 * 생각 없이 답해도 되는 말인가. 아니면 null — 그럼 두뇌로 간다.
 */
export function reflexFor(said: string, options: ReflexOptions = {}): string | null {
  const text = said.trim();
  // 길면 사연이 있는 말이다. 반사로 때우지 않는다.
  if (text.length === 0 || text.length > 12) return null;

  const hit = 규칙.find((r) => r.말.test(text));
  if (hit === undefined) return null;

  const energy = options.energy ?? 0.5;
  const set = 대꾸[hit.종류] as { 처짐: readonly string[]; 보통: readonly string[]; 생생: readonly string[] };
  const pool = energy < 0.35 ? set.처짐 : energy > 0.75 ? set.생생 : set.보통;

  const usable = pool.filter((p) => p !== options.last);
  const choices = usable.length > 0 ? usable : pool;
  const roll = options.roll ?? Math.random;
  const at = Math.min(choices.length - 1, Math.floor(roll() * choices.length));
  return choices[at] as string;
}
