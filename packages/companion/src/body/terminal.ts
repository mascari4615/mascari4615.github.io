import { createInterface, type Interface } from 'node:readline';

import type { Body, Sensation, Sense, Utterance, Voice } from '../types';

export interface TerminalBodyOptions {
  channel?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** 입력 줄 앞에 붙는 표시. */
  prompt?: string;
  /** 사용자가 입력을 끝냈을 때(Ctrl+D / Ctrl+C). */
  onClose?: () => void;
}

/**
 * 터미널 몸 — 키보드로 느끼고 화면으로 말한다.
 *
 * 가장 단순한 몸. 코어가 도는지 눈으로 확인하는 용도이자, 나중에 디스코드·화면 몸을
 * 붙일 때 「몸을 바꿔도 코어는 그대로」를 비교할 기준선.
 */
export function terminalBody(options: TerminalBodyOptions = {}): Body {
  const channel = options.channel ?? 'terminal';
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const prompt = options.prompt ?? '나 > ';

  let rl: Interface | null = null;

  const sense: Sense = {
    name: `${channel}:sense`,
    start(emit: (sensation: Sensation) => void) {
      rl = createInterface({ input, output: undefined, terminal: false });
      output.write(prompt);
      rl.on('line', (line) => {
        const text = line.trim();
        if (text === '') {
          output.write(prompt);
          return;
        }
        emit({ channel, kind: 'text', text, at: Date.now() });
      });
      rl.on('close', () => options.onClose?.());
    },
    stop() {
      rl?.close();
      rl = null;
    },
  };

  const voice: Voice = {
    name: `${channel}:voice`,
    speak(utterance: Utterance) {
      output.write(`\n동반자 > ${utterance.text}\n\n${prompt}`);
    },
  };

  return { name: channel, sense, voice };
}
