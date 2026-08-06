import type { Body, Sensation, Sense, Utterance, Voice } from '../types';

export interface ClockBodyOptions {
  channel?: string;
  /** 몇 ms 마다 한 번 느낄까. */
  everyMs: number;
  /** tick 을 어떤 문장으로 느낄까. */
  describe?: (at: Date) => string;
  output?: NodeJS.WritableStream;
}

/**
 * 시계 몸 — 아무도 말을 걸지 않아도 스스로 주기적으로 느낀다.
 *
 * 이 몸이 존재하는 이유는 기능이 아니라 **증명**이다. 터미널 몸과 성격이 정반대인데도
 * (사람이 말을 거는 게 아니라 스스로 깨어남) 코어 코드를 한 줄도 안 고치고 붙는다.
 * 나중에 화면 감시·디스코드 몸이 들어올 자리의 모양이 바로 이것이다.
 */
export function clockBody(options: ClockBodyOptions): Body {
  const channel = options.channel ?? 'clock';
  const output = options.output ?? process.stdout;
  const describe = options.describe ?? ((at: Date) => `아무 일도 없이 ${at.toLocaleTimeString('ko-KR')} 이 되었다.`);

  let timer: NodeJS.Timeout | null = null;

  const sense: Sense = {
    name: `${channel}:sense`,
    start(emit: (sensation: Sensation) => void) {
      timer = setInterval(() => {
        const now = new Date();
        emit({ channel, kind: 'tick', text: describe(now), at: now.getTime() });
      }, options.everyMs);
      // 이 타이머 하나 때문에 프로세스가 안 죽는 일은 없게 한다.
      timer.unref?.();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };

  const voice: Voice = {
    name: `${channel}:voice`,
    speak(utterance: Utterance) {
      output.write(`\n동반자 (혼잣말) > ${utterance.text}\n`);
    },
  };

  return { name: channel, sense, voice };
}
