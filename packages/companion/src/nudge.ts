import type { Sensation, Sense } from './types';

/**
 * 스스로 말 걸기 — 아무도 안 물었을 때.
 *
 * 뉴로사마는 묻지 않아도 스스로 말한다. 우리 얘는 화면을 봤을 때만 입을 열었고, 혼잣말은
 * 아예 꺼 두고 있었다. 켜 봐야 시계가 무작정 깨우는 것이라 방해가 되기 쉬웠다.
 *
 * 그래서 시간이 아니라 **이유**로 깨운다. 이유가 없으면 조용히 넘어간다 — 할 말 없는데
 * 말 거는 건 곁에 있는 게 아니라 성가신 것이다.
 */
export interface Reason {
  /** 왜 지금 말을 거나 (두뇌에 그대로 넘어간다). */
  why: string;
  /** 같은 이유로 다시 깨우지 않게 하는 표식. */
  key: string;
}

export interface NudgeInput {
  /** 사람과 마지막으로 말을 나눈 뒤 흐른 시간(ms). 없으면 null. */
  sinceTalkedMs: number | null;
  /** 아직 못 물어본 궁금증 하나. 없으면 null. */
  wondering: string | null;
  /** 지금 앞에 있는 창 제목. 모르면 null. */
  windowTitle: string | null;
  /** 아까 봤던 창 제목. */
  lastWindowTitle: string | null;
  /** 지금 몇 시인지 (0~23). */
  hour: number;
}

const 시간 = 60 * 60_000;

/**
 * 지금 말 걸 이유가 있나.
 *
 * 이유는 하나만 고른다 — 여러 개를 한꺼번에 쏟으면 그건 대화가 아니라 알림이다.
 * 급한 것부터 본다.
 */
export function reasonToSpeak(input: NudgeInput): Reason | null {
  const { sinceTalkedMs, wondering, windowTitle, lastWindowTitle, hour } = input;
  const alone = sinceTalkedMs ?? Number.POSITIVE_INFINITY;

  // 방금까지 얘기하던 참이면 끼어들지 않는다.
  if (alone < 10 * 60_000) return null;

  // 새벽까지 안 자고 있으면 그건 말 걸 만한 일이다. 하루 한 번만.
  if (hour >= 2 && hour < 5 && alone > 30 * 60_000) {
    return { why: '조수님이 이 시간까지 안 자고 있다. 걱정하는 티는 조금만 내고 짧게.', key: `밤샘-${new Date().toDateString()}` };
  }

  // 하던 일이 바뀌었으면 눈에 밟힌다.
  if (windowTitle !== null && windowTitle !== '' && windowTitle !== lastWindowTitle && alone > 20 * 60_000) {
    return {
      why: `조수님이 하던 걸 바꿨다 — 지금은 「${windowTitle.slice(0, 60)}」 를 보고 있다. 한마디만.`,
      key: `창-${windowTitle.slice(0, 40)}`,
    };
  }

  // 담아 둔 궁금증이 있고 한참 조용하면 그때 꺼낸다.
  if (wondering !== null && alone > 40 * 60_000) {
    return { why: `전부터 궁금했던 걸 지금 물어봐도 될 것 같다: ${wondering}`, key: `궁금-${wondering.slice(0, 40)}` };
  }

  // 아주 오래 못 봤으면 그냥 아는 척 한 번.
  if (alone > 6 * 시간) {
    return { why: '오랜만이다. 별일 없었는지 짧게 한마디.', key: `오랜만-${Math.floor(Date.now() / (6 * 시간))}` };
  }

  return null;
}

export interface NudgeSenseOptions {
  channel?: string;
  /** 얼마나 자주 「이유가 있나」 살펴볼까. */
  everyMs?: number;
  /** 지금 이유가 있나. */
  reason: () => Reason | null;
  log?: (message: string) => void;
}

/**
 * 이유가 있을 때만 깨우는 감각.
 *
 * 같은 이유로는 다시 깨우지 않는다 — 창을 안 바꾸고 계속 있다고 계속 말 걸면 그건
 * 곁에 있는 게 아니라 쫓아다니는 것이다.
 */
export function nudgeSense(options: NudgeSenseOptions): Sense {
  const channel = options.channel ?? 'nudge';
  const everyMs = options.everyMs ?? 5 * 60_000;
  const log = options.log ?? (() => {});
  const alreadySaid = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  return {
    name: `${channel}:sense`,
    start(emit: (sensation: Sensation) => void) {
      timer = setInterval(() => {
        let reason: Reason | null = null;
        try {
          reason = options.reason();
        } catch (e) {
          log(`말 걸 이유를 못 봤다: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        if (reason === null || alreadySaid.has(reason.key)) return;
        alreadySaid.add(reason.key);
        // 너무 오래 쌓이면 옛것부터 잊는다 — 하루 종일 켜 두는 물건이다.
        if (alreadySaid.size > 200) alreadySaid.delete([...alreadySaid][0] as string);
        log(`말 걸 이유가 생겼다: ${reason.key}`);
        emit({ channel, kind: 'nudge', text: reason.why, at: Date.now() });
      }, everyMs);
      timer.unref?.();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
