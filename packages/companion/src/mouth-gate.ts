import { checkDrift, type DriftRules } from './drift';

/**
 * 입 앞의 관문 — 새는 말을 **말하기 전에** 잡는다.
 *
 * 레퍼런스 쪽에서는 두뇌가 뱉은 것과 실제로 나가는 소리 사이에 층이 하나 더 있다. 거기서
 * 걸린 것은 아예 나가지 않는다.
 *
 * 우리에겐 그 층이 없었다. 표류 감시(11회차)는 **새고 나서 다음 번에** 짚어 준다 — 그건
 * 이미 조수님이 그 말을 들은 뒤다. 그리고 새 말이 기억에 남아 다음 번 재료가 되니, 한 번
 * 미끄러지면 그 미끄러짐을 따라 하며 굳는다.
 *
 * 여기서는 세 걸음으로 막는다.
 * 1. 새지 않았으면 그대로 보낸다 (거의 모든 경우 — 관문은 조용해야 한다).
 * 2. 샜으면 **한 번만 다시 시킨다.** 무엇이 문제였는지 콕 집어서.
 * 3. 다시 시킨 것도 새면 그 말을 버리고 **짧은 말 한마디**로 때운다. 새는 말을 하느니
 *    「…」 한 글자가 낫다. 다만 입을 완전히 다물지는 않는다 — 침묵은 고장처럼 보인다.
 *
 * 다시 시키는 것은 **한 번뿐**이다. 계속 다시 시키면 대답이 몇 초씩 늦어지고, 늦은 대답은
 * 그 자체로 곁에 있는 느낌을 깬다.
 */
export interface MouthGateOptions {
  /** 무엇을 샌 것으로 볼지. 인격마다 다르다. */
  rules?: DriftRules;
  /**
   * 다시 시키기. 무엇이 문제였는지 적어 넘긴다. 없으면 다시 시키지 않고 바로 3번으로 간다.
   */
  retry?: (why: string) => Promise<string | null>;
  /**
   * 표류 말고 **또 다른 이유로** 다시 시킬 자리. 이유를 돌려주면 다시 시킨다.
   *
   * 표류(조수 말투로 샘)와 텅 빔(알맹이 없음)은 다른 문제라 검사도 따로 둔다. 다만 **다시
   * 시키는 길은 하나**여야 한다 — 둘로 나누면 한 turn 에 두 번 다시 시켜 대답이 늦어진다.
   */
  alsoRetryWhen?: (text: string) => string | null;
  /** 끝내 안 되면 낼 소리. 결에 맞는 짧은 말. */
  fallbacks?: readonly string[];
  /** 고르는 손. 시험에서 고정한다. */
  roll?: () => number;
  log?: (message: string) => void;
}

export interface MouthGate {
  (text: string): Promise<string | null>;
  /** 몇 번 걸렀나 — 관문이 실제로 일하는지 밖에서 볼 수 있어야 한다. */
  readonly stopped: () => number;
}

const 기본때움: readonly string[] = ['…', '…음.', '…아니다.'];

/** 입 앞의 관문을 만든다. */
export function mouthGate(options: MouthGateOptions = {}): MouthGate {
  const fallbacks = options.fallbacks ?? 기본때움;
  const roll = options.roll ?? Math.random;
  let stopped = 0;

  const gate = async (text: string): Promise<string | null> => {
    const 첫판 = checkDrift(text, options.rules);
    const 딴이유 = 첫판.drifted ? null : (options.alsoRetryWhen?.(text) ?? null);
    if (첫판.drifted === false && 딴이유 === null) return text;

    stopped += 1;
    const why = 딴이유 ?? 첫판.problems.join(', ');
    options.log?.(`입 앞에서 걸렀다 (${why}): 「${text.slice(0, 30)}」`);

    if (options.retry !== undefined) {
      let 다시: string | null = null;
      try {
        다시 = await options.retry(why);
      } catch {
        다시 = null;
      }
      const 다시괜찮나 = 다시 !== null && 다시.trim() !== ''
        && checkDrift(다시, options.rules).drifted === false
        && (options.alsoRetryWhen?.(다시) ?? null) === null;
      if (다시괜찮나) {
        options.log?.('다시 시켜서 통과했다');
        return (다시 as string).trim();
      }
    }

    options.log?.('끝내 안 돼서 짧게 넘긴다');
    return fallbacks[Math.floor(roll() * fallbacks.length) % fallbacks.length];
  };

  return Object.assign(gate, { stopped: () => stopped });
}

/**
 * 다시 시킬 때 두뇌에 넘길 말.
 *
 * 원래 한 말을 **보여 주지 않는다.** 보여 주면 그걸 조금 고쳐 오는데, 미끄러진 문장을 조금
 * 고친 것은 여전히 미끄러진 문장이다. 무엇이 문제였는지만 말하고 다시 하게 한다.
 */
export function retryNote(why: string): string {
  return (
    `방금 하려던 말이 결에서 벗어났다 (${why}). 그 말은 버리고, 같은 뜻을 네 결로 다시 해라. ` +
    '고쳐 쓰지 말고 처음부터 다시. 짧아도 된다.'
  );
}
