import type {
  Attention,
  Body,
  Brain,
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
   * 지금이 몇 시인지. 코어가 `Date.now()` 를 직접 부르지 않는 이유는, 시각이 판단 근거이기
   * 때문이다 — attention 이 「방금 말했나」를 기억의 시각으로 재므로, 시계를 주입할 수
   * 없으면 그 판단을 시험할 방법도 없다.
   */
  now?: () => number;
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
    const input = { sensation, recent };

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

    let text: string | null;
    try {
      text = await brain.think(input);
    } catch (e) {
      onCycle?.({ sensation, decision, utterance: null, error: asError(e) });
      return;
    }

    if (text === null || text.trim() === '') {
      onCycle?.({ sensation, decision: { respond: false, reason: '두뇌가 침묵을 골랐다' }, utterance: null });
      return;
    }

    const now = this.options.now ?? Date.now;
    const utterance: Utterance = { text: text.trim(), channel: sensation.channel, at: now() };
    await memory.remember({ role: 'said', channel: utterance.channel, text: utterance.text, at: utterance.at });

    const target = body ?? this.bodyByChannel.get(sensation.channel) ?? null;
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
