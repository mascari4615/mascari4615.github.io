import type { Hand } from '../hands';

/**
 * 손을 미리 써 두기 — 두뇌더러 고르라고 하지 않는다.
 *
 * 42회차에서 **손 열 개가 세 turn 동안 0회** 쓰인 것을 계측으로 확인했고, 인격만 빼고 재는
 * 대조 실험으로 원인까지 좁혔다: 이 얘 인격은 「짧고 흐느적거린다 · 길게 늘어놓지 마라」인데
 * **표(`[[시계: …]]`)를 적는 것이 그 지시와 정면으로 부딪힌다.** 손 설명 문구를 고쳐 봤지만
 * 여전히 0회였다 — **문구로는 안 된다.**
 *
 * 그래서 구조를 바꾼다. **얘한테 표를 적으라고 요구하지 않는다.** 조수님 말을 보고 **우리가**
 * 필요한 손을 미리 쓰고, 찾아온 것을 쥐여 준 채로 생각하게 한다. 얘는 그냥 제 말투로 답하면
 * 된다.
 *
 * 이건 이미 두 번 배운 것이다. 옛 대화 찾기(12회차)도, 궁금해하기(9회차)도 처음엔 두뇌더러
 * 하라고 시켰다가 **안 해서** 자동으로 바꿨다. **판단을 두뇌에 안 맡긴다** — 세 번째다.
 *
 * 대신 조심할 게 있다. 자동으로 쓰면 **안 물어봤는데도 쓰게 된다.** 그래서 힌트를 좁게 잡고,
 * 한 turn 에 **하나만** 쓴다. 여러 개를 미리 써서 들이밀면 그게 또 재료 과밀이다(29회차).
 */
export interface HandHint {
  /** 어떤 손을 쓸 것인가. */
  hand: string;
  /** 이런 말이 나오면. */
  when: RegExp;
  /** 손에 넘길 말을 어떻게 뽑나. 없으면 빈 말. */
  argument?: (said: string) => string;
}

/**
 * 기본 힌트 — 좁게 잡는다.
 *
 * 「지금 몇 시」는 시각을 묻는 게 확실하지만 「시간 없어」는 아니다. 넓게 잡으면 잡담마다
 * 손이 돌아 느려지고, 안 물어본 걸 들이밀게 된다.
 */
export const 기본힌트: readonly HandHint[] = [
  { hand: '시계', when: /(지금 몇 시|몇 시야|몇 시지|몇 시니|시간 좀|지금 시각|오늘 며칠|무슨 요일)/ },
  { hand: '창목록', when: /(무슨 창|어떤 창|창 열려|뭐 열려|뭐 켜|열려 ?있)/ },
  {
    hand: '적어둔것보기',
    when: /(뭐 적어|적어 ?둔 ?거|적어 ?뒀|메모 ?뭐|할 ?일 ?뭐|뭐 ?하기로)/,
    argument: () => '',
  },
  {
    // 「이거 적어 둬」 — 곁에 두는 존재한테 가장 자주 시키는 일인데 **길이 없었다.**
    // 발동 기록으로 확인: 손 아홉 개 중 다섯 개는 힌트가 아예 없어서 자동으로 쓰일
    // 방법이 없었다(꺼짐 36). 만들어 두고 아무 데도 안 붙인 것과 같다.
    hand: '적어두기',
    when: /(적어 ?둬|적어 ?놔|적어 ?줘|메모해|기억해 ?둬|잊지 ?말)/,
    argument: (said) => {
      // 「우유 사기 적어 둬」 → 우유 사기. 시키는 말은 떼어 낸다.
      const 벗긴것 = said
        .replace(/(적어 ?둬|적어 ?놔|적어 ?줘|메모해 ?줘|메모해|기억해 ?둬|잊지 ?말고?|잊지 ?마)/g, '')
        .replace(/^[\s,.]+|[\s,.]+$/g, '')
        .trim();
      return 벗긴것;
    },
  },
  {
    // 「그 파일 언제 바뀌었어」 — 파일 얘기 중에 자주 나온다.
    hand: '파일정보',
    when: /(언제 ?(바뀌|고쳤|수정)|얼마나 ?(커|크|무거)|크기 ?(얼마|어때))/,
    argument: (said) => (/([A-Za-z]:[^\s]+|[^\s]+\.[A-Za-z0-9]{1,5})/.exec(said)?.[1] ?? '').trim(),
  },
  {
    hand: '파일찾기',
    when: /(파일 찾|파일 어디|어디 ?있(어|지|나)|찾아 ?줘|찾아 ?봐)/,
    argument: (said) => {
      // 「companion 들어간 파일 찾아 줘」 → companion
      const m = /([A-Za-z0-9._-]{3,}|[가-힣]{2,})\s*(들어간|들어있는|이름의|라는)?\s*파일/.exec(said);
      return (m?.[1] ?? '').trim();
    },
  },
];

export interface AutoHandsOptions {
  hints?: readonly HandHint[];
  log?: (message: string) => void;
}

/**
 * 이 말에 쓸 손 하나를 고른다. 없으면 null.
 *
 * **앞에 적은 순서가 곧 우선순위다.** 둘이 걸리면 앞엣것을 쓴다 — 매번 다른 걸 고르면
 * 왜 그렇게 답했는지 알 수 없게 된다.
 */
export function pickHand(
  said: string,
  hands: readonly Hand[],
  hints: readonly HandHint[] = 기본힌트,
): { hand: Hand; argument: string } | null {
  const t = said.trim();
  for (const hint of hints) {
    if (hint.when.test(t) === false) continue;
    const hand = hands.find((h) => h.name === hint.hand);
    if (hand === undefined) continue; // 그 손이 없으면 조용히 넘어간다
    return { hand, argument: (hint.argument?.(t) ?? '').trim() };
  }
  return null;
}

/**
 * 말에 맞는 손을 미리 써서 찾아온 것을 돌려준다. 쓸 게 없으면 빈 목록.
 *
 * **손이 고장 나도 대화는 이어져야 한다** — 못 쓰면 그 사실만 남기고 빈손으로 돌아간다.
 */
export async function autoUse(
  said: string,
  hands: readonly Hand[],
  options: AutoHandsOptions = {},
): Promise<string[]> {
  const 고른것 = pickHand(said, hands, options.hints ?? 기본힌트);
  if (고른것 === null) return [];

  try {
    const 찾은것 = await 고른것.hand.run(고른것.argument);
    options.log?.(`미리 써 뒀다: ${고른것.hand.name}(${고른것.argument || '없음'})`);
    return [`${고른것.hand.name}: ${찾은것}`];
  } catch (e) {
    options.log?.(`${고른것.hand.name} 을 못 썼다: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
