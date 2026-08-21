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
  /** 0(축 droop) ~ 1(생생함). */
  energy?: number;
  /** 직전에 반사로 한 말 — 같은 걸 연달아 하지 않게. */
  last?: string | null;
  roll?: () => number;
  /**
   * 미리 지어 둔 대사 창고. 있으면 여기서 먼저 꺼낸다.
   *
   * 여기도 후보가 셋뿐이라 결국 도는 말이 된다 — 실제 기록에서 「응.」 8번, 「뭐.」 8번.
   * 닿음 대꾸와 같은 자리를 쓴다(`stock.ts`). 비면 아래 표로 그냥 물러선다.
   */
  store?: { raise: (kind: string) => string | null };
}

/** 지금 기운이 어느 결인가 — droop / normal / vivid. */
export function reflexTone(energy: number): 'droop' | 'normal' | 'vivid' {
  return energy < 0.35 ? 'droop' : energy > 0.75 ? 'vivid' : 'normal';
}

/** 창고에서 이 자리를 부르는 name. 채우는 쪽과 꺼내는 쪽이 같은 이름을 써야 한다. */
export function reflexKind(kind2: string, tone: string): string {
  return `reflex:${kind2}:${tone}`;
}

/** 반사가 다루는 상황들 — 미리 채워 두려면 무엇이 있는지 밖에서 알아야 한다. */
export function reflexKinds(): readonly string[] {
  return Object.keys(reply);
}

/** 상황마다, 결마다 다른 대꾸. */
const reply: Record<string, { droop: readonly string[]; normal: readonly string[]; vivid: readonly string[] }> = {
  '인사': {
    droop: ['…응, 왔어.', '어… 왔네.', '음… 안녕.'],
    normal: ['응, 왔네.', '어, 안녕.', '왔어?'],
    vivid: ['오, 왔네!', '어 안녕.', '왔구나.'],
  },
  '작별': {
    droop: ['응… 잘 가.', '어… 나중에.', '음… 잘 자.'],
    normal: ['응, 잘 가.', '어, 나중에 봐.', '잘 자.'],
    vivid: ['그래, 잘 가.', '응 나중에!', '잘 자, 조수님.'],
  },
  '고마움': {
    droop: ['…응.', '뭘.', '음… 됐어.'],
    normal: ['응, 뭘.', '별거 아냐.', '됐어.'],
    vivid: ['응! 뭘 이런 걸로.', '별거 아니야.', '그래그래.'],
  },
  '호응': {
    droop: ['응…', '음…', '그래…'],
    normal: ['응.', '그래.', '음.'],
    vivid: ['응응.', '그래그래.', '오케이.'],
  },
};

/** 딱 이 말들만 반사한다. 조금이라도 넓히면 얘가 성의 없어진다. */
const rule: readonly { kind: keyof typeof reply; text: RegExp }[] = [
  { kind: '인사', text: /^(안녕|하이|안뇽|왔어|나 왔어|안녕\?|여보세요)[!?.…\s]*$/ },
  { kind: '작별', text: /^(잘\s?자|잘자|바이|굿나잇|자러\s?간다|나중에\s?봐|이따\s?봐|갔다\s?올게|다녀올게)[!?.…\s]*$/ },
  { kind: '고마움', text: /^(고마워|고맙다|감사|땡큐|ㄱㅅ|고마웡)[!?.…\s]*$/ },
  { kind: '호응', text: /^(응|ㅇㅇ|그래|ok|오케이|알겠어|넵|넹|ㅋㅋ+|ㅎㅎ+)[!?.…\s]*$/i },
];

/**
 * 생각 없이 답해도 되는 말인가. 아니면 null — 그럼 두뇌로 간다.
 */
export function reflexFor(said: string, options: ReflexOptions = {}): string | null {
  const text = said.trim();
  // 길면 사연이 있는 말이다. 반사로 때우지 않는다.
  if (text.length === 0 || text.length > 12) return null;

  const hit = rule.find((r) => r.text.test(text));
  if (hit === undefined) return null;

  const energy = options.energy ?? 0.5;
  const tone2 = reflexTone(energy);

  // 미리 지어 둔 것이 먼저다. 바로 앞것과 같으면 그건 안 쓴다.
  const prepared = options.store?.raise(reflexKind(hit.kind, tone2)) ?? null;
  if (prepared !== null && prepared !== options.last) return prepared;

  const set = reply[hit.kind] as { droop: readonly string[]; normal: readonly string[]; vivid: readonly string[] };
  const pool = set[tone2];

  const usable = pool.filter((p) => p !== options.last);
  const choices = usable.length > 0 ? usable : pool;
  const roll = options.roll ?? Math.random;
  const at = Math.min(choices.length - 1, Math.floor(roll() * choices.length));
  return choices[at] as string;
}
