import { findRequests, useHands, type Hand } from './hands';
import type {
  Attention,
  Body,
  Brain,
  Character,
  CycleReport,
  Memory,
  Sensation,
  Utterance,
} from './types';

export interface CompanionOptions {
  /** 몸 — 여러 개 동시에 붙일 수 있다. 하나가 죽어도 나머지는 산다. */
  bodies: readonly Body[];
  brain: Brain;
  memory: Memory;
  attention: Attention;
  /** 두뇌에 넘길 최근 기억 개수. */
  recallSize?: number;
  /**
   * 누구인가. 코어는 내용을 해석하지 않고 두뇌에 그대로 넘긴다 — 인격이 코어에
   * 스며들면 「인격을 바꾸려면 코어를 고쳐야 하는」 구조가 되기 때문이다.
   */
  character?: Character;
  /**
   * 지금이 몇 시인지. 코어가 `Date.now()` 를 직접 부르지 않는 이유는, 시각이 판단 근거이기
   * 때문이다 — attention 이 「방금 말했나」를 기억의 시각으로 재므로, 시계를 주입할 수
   * 없으면 그 판단을 시험할 방법도 없다.
   */
  now?: () => number;
  /**
   * 말 말고 실제로 할 수 있는 일. 두뇌가 말 속에 표시를 남기면 코어가 걸러서 실행한다.
   * 표시는 사람에게 보이지 않는다 — 손을 쓴 흔적이 대화를 어지럽히지 않게.
   */
  hands?: readonly Hand[];
  /** 한 바퀴 돌 때마다 호출 — 로그·테스트 훅. */
  onCycle?: (report: CycleReport) => void;
}

/**
 * 동반자 코어.
 *
 * 한 바퀴: 감각 → 기억에 적음 → 지금 말할까 → (예면) 두뇌 → 기억에 적음 → 그 몸으로 표현.
 *
 * 코어가 **모르는 것**: 캐릭터가 누구인지, 어떤 LLM 을 쓰는지, 어느 플랫폼인지.
 * 전부 주입된 부품이 안다. 그래서 몸을 늘려도 이 파일은 그대로다.
 */
export class Companion {
  private readonly options: CompanionOptions;
  private readonly bodyByChannel = new Map<string, Body>();
  /** 감각이 몰려도 순서대로 한 번에 하나씩 처리 — 기억 타임라인이 엉키지 않게. */
  private queue: Promise<void> = Promise.resolve();
  private running = false;

  constructor(options: CompanionOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    for (const body of this.options.bodies) {
      this.bodyByChannel.set(body.name, body);
      await body.sense.start((sensation) => this.enqueue(body, sensation));
    }
  }

  async stop(): Promise<void> {
    if (this.running === false) return;
    this.running = false;
    for (const body of this.options.bodies) {
      await body.sense.stop?.();
      await body.voice.stop?.();
    }
    await this.queue;
  }

  /** 처리 중인 감각이 모두 끝날 때까지 대기 (테스트·데모 종료용). */
  async drain(): Promise<void> {
    await this.queue;
  }

  /** 몸 없이 감각 하나를 직접 밀어넣는다 — 테스트와 외부 트리거용. */
  feed(sensation: Sensation): Promise<void> {
    const body = this.bodyByChannel.get(sensation.channel) ?? null;
    return this.enqueue(body, sensation);
  }

  private enqueue(body: Body | null, sensation: Sensation): Promise<void> {
    this.queue = this.queue.then(() => this.cycle(body, sensation));
    return this.queue;
  }

  private async cycle(body: Body | null, sensation: Sensation): Promise<void> {
    const { brain, memory, attention, onCycle } = this.options;
    const recallSize = this.options.recallSize ?? 10;

    await memory.remember({
      role: 'sensed',
      channel: sensation.channel,
      text: sensation.text,
      at: sensation.at,
    });

    const recent = await memory.recent(recallSize);
    const longTerm = (await memory.longTerm?.()) ?? null;
    const input = { sensation, recent, longTerm, character: this.options.character };

    let decision;
    try {
      decision = await attention.shouldRespond(input);
    } catch (e) {
      onCycle?.({ sensation, decision: { respond: false, reason: 'attention 실패' }, utterance: null, error: asError(e) });
      return;
    }

    if (decision.respond === false) {
      onCycle?.({ sensation, decision, utterance: null });
      return;
    }

    const target = body ?? this.bodyByChannel.get(sensation.channel) ?? null;

    let text: string | null;
    try {
      // 흘려보낼 수 있는 두뇌 + 받아줄 수 있는 입이 둘 다 있을 때만 흐르게 한다.
      if (brain.thinkStream && target?.voice.partial) {
        let soFar = '';
        text = await brain.thinkStream(input, (chunk) => {
          soFar += chunk;
          void target.voice.partial?.(chunk, soFar, sensation.channel);
        });
      } else {
        text = await brain.think(input);
      }
    } catch (e) {
      onCycle?.({ sensation, decision, utterance: null, error: asError(e) });
      return;
    }

    // 말 속의 손 표시를 걷어내고, 걷어낸 일들을 실제로 한다.
    if (text !== null && this.options.hands && this.options.hands.length > 0) {
      const { clean, requests } = findRequests(text);
      if (requests.length > 0) {
        void useHands(this.options.hands, requests, (m) => onCycle?.({
          sensation,
          decision: { respond: false, reason: m },
          utterance: null,
        }));
        text = clean;
      }
    }

    if (text === null || text.trim() === '') {
      onCycle?.({ sensation, decision: { respond: false, reason: '두뇌가 침묵을 골랐다' }, utterance: null });
      return;
    }

    const now = this.options.now ?? Date.now;
    const utterance: Utterance = { text: text.trim(), channel: sensation.channel, at: now() };
    await memory.remember({ role: 'said', channel: utterance.channel, text: utterance.text, at: utterance.at });

    try {
      await target?.voice.speak(utterance);
    } catch (e) {
      onCycle?.({ sensation, decision, utterance, error: asError(e) });
      return;
    }

    onCycle?.({ sensation, decision, utterance });
  }
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
