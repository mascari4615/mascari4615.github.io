import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 손 — 동반자가 말 말고 실제로 할 수 있는 일.
 *
 * 지금까지는 보고 말하기만 했다. 곁에 있는 존재와 같이 사는 존재를 가르는 건
 * 「해줄 수 있는 게 있느냐」다.
 *
 * 다만 손은 위험하다. 그래서 **할 수 있는 일을 하나씩 명시적으로 쥐여준다** — 아무거나
 * 실행하게 열어두지 않는다. 지금 쥐여준 것은 「적어두기」와 「알려주기」 둘뿐이고,
 * 둘 다 되돌릴 수 있거나 흔적만 남기는 일이다.
 */
export interface Hand {
  /** 두뇌가 부를 이름. */
  readonly name: string;
  /** 무슨 일인지 — 이 설명이 그대로 두뇌에 전달된다. */
  readonly what: string;
  /** 무엇을 넘겨야 하는지. */
  readonly needs: string;
  run(argument: string): Promise<string>;
}

/** 두뇌가 남긴 「이걸 해줘」 한 건. */
export interface HandRequest {
  name: string;
  argument: string;
}

/**
 * 말 속에서 「손을 쓰겠다」는 표시를 찾아낸다.
 *
 * 형식은 한 줄짜리로 아주 얕게 뒀다: `[[적어두기: 우유 사기]]`. 두뇌에게 새 형식을
 * 배우게 하는 비용이 낮고, 못 알아본 표시는 그냥 말로 남아 사고가 되지 않는다.
 */
export function findRequests(said: string): { clean: string; requests: HandRequest[] } {
  const requests: HandRequest[] = [];
  const clean = said
    .replace(/\[\[\s*([^:\]]+?)\s*:\s*([\s\S]*?)\s*\]\]/g, (_, name: string, argument: string) => {
      requests.push({ name: name.trim(), argument: argument.trim() });
      return '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { clean, requests };
}

/** 두뇌에게 「이런 걸 할 수 있다」고 알려 줄 문장. */
export function describeHands(hands: readonly Hand[]): string {
  if (hands.length === 0) return '';
  const lines = hands.map((h) => `- [[${h.name}: ${h.needs}]] — ${h.what}`).join('\n');
  return (
    '너는 이런 일들을 실제로 할 수 있다:\n' +
    `${lines}\n\n` +
    '규칙:\n' +
    '- 네가 모르는 사실(지금 시각, 파일 위치, 열린 창 같은 것)을 물으면 **반드시 해당 줄을 적어라.** ' +
    '「몰라」 라고 하거나 직접 확인해 보라고 떠넘기지 마라 — 확인할 수 있는 쪽은 너다.\n' +
    '- 적어 달라고 하면 적고, 열어 달라고 하면 연다.\n' +
    '- 적어둔 줄은 사람에게 안 보인다. 적었으면 말로 또 설명하지 마라.\n' +
    '- 필요 없으면 안 써도 된다. 잡담에까지 끌어다 쓰지 마라.'
  );
}

/** 표시된 일들을 실제로 한다. 하나가 실패해도 나머지는 한다. */
export async function useHands(
  hands: readonly Hand[],
  requests: readonly HandRequest[],
  log?: (message: string) => void,
): Promise<string[]> {
  const done: string[] = [];
  for (const request of requests) {
    const hand = hands.find((h) => h.name === request.name);
    if (hand === undefined) {
      log?.(`그런 손은 없다: ${request.name}`);
      continue;
    }
    try {
      done.push(await hand.run(request.argument));
    } catch (e) {
      log?.(`${hand.name} 하다 실패했다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return done;
}

/** 적어두기 — 한 줄씩 파일에 쌓는다. 사람이 나중에 그냥 열어 보면 된다. */
export function noteHand(path: string): Hand {
  return {
    name: '적어두기',
    what: '이 사람이 나중에 다시 봐야 할 것을 적어 둔다',
    needs: '적을 내용',
    async run(argument: string): Promise<string> {
      const when = new Date().toLocaleString('ko-KR');
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `- [${when}] ${argument}\n`, 'utf8');
      return `적어뒀다: ${argument}`;
    },
  };
}

/** 알려주기 — 나중에 한 번 말을 건다. */
export function remindHand(schedule: (afterMs: number, text: string) => void): Hand {
  return {
    name: '알려주기',
    what: '얼마 뒤에 다시 말을 걸어 알려준다',
    needs: '분 단위 시간 | 알릴 내용',
    async run(argument: string): Promise<string> {
      const [rawMinutes, ...rest] = argument.split('|');
      const minutes = Number(String(rawMinutes).trim());
      const text = rest.join('|').trim();
      if (Number.isFinite(minutes) === false || minutes <= 0 || text === '') {
        throw new Error(`알려줄 시간이나 내용을 못 읽었다: ${argument}`);
      }
      schedule(minutes * 60_000, text);
      return `${minutes}분 뒤에 알려주기로 했다: ${text}`;
    },
  };
}
