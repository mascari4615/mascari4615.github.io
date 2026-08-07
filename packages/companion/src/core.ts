import { findRequests, useHands, type Hand } from './hands';
import type {
  Attention,
  Body,
  Brain,
  Character,
  CycleReport,
  Memory,
  MemoryEntry,
  Sensation,
  ThinkInput,
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
  /**
   * 이 채널에서 말이 들어오면 하던 말을 끊는다.
   *
   * 사람이 말을 거는데 계속 떠드는 건 대화가 아니다. 곁에 있는 존재라면 말을 멈추고
   * 새로 듣는다 — 실제 대화가 그렇다.
   */
  interruptChannels?: readonly string[];
  /**
   * 끊어도 되는지 **내용까지** 보고 정한다. 안 주면 통로만 본다(예전 그대로).
   *
   * 통로만 보면 「응」 한마디에도 하던 말이 잘린다 — 맞장구는 말을 끊으려는 게 아니라
   * 듣고 있다는 신호다(47회차).
   */
  urgentWhen?: (sensation: Sensation) => boolean;
  /**
   * 지금 기분을 한 줄로 만들어 주는 쪽. 없으면 기분 없이 간다.
   *
   * 「대화가 매번 똑같다」가 동반자 앱 이탈 1위 이유다(조사). 기억을 잘해도 매번 같은
   * 상태로 같은 말을 하면 살아 있다고 느껴지지 않는다.
   */
  mood?: (recent: readonly MemoryEntry[]) => string;
  /**
   * 옛 기억을 **자동으로** 찾아 붙인다.
   *
   * 두뇌더러 「필요하면 찾아봐라」 하는 방식은 실패했다 — 안내를 아무리 조여도 안 썼고,
   * 인격을 빼도 마찬가지였다(실측). 찾을지 말지를 판단에 맡기지 않고 매번 찾아서
   * 재료로 얹는다. 없으면 빈 손으로 돌아올 뿐이라 손해가 없다.
   */
  /**
   * 두뇌를 부르기 **전에** 미리 찾아 두는 자리.
   *
   * 옛 대화를 뒤지는 데 쓰다가, 손도 여기로 온다(43회차) — 두뇌더러 표를 적어 손을 부르라고
   * 하면 인격과 부딪혀 아예 안 쓴다. 그래서 **판단을 두뇌에 안 맡기고** 여기서 미리 쓴다.
   * 손은 시간이 걸리므로 기다릴 수 있어야 한다.
   */
  recall?: (
    sensation: Sensation,
    recent: readonly MemoryEntry[],
  ) => readonly string[] | Promise<readonly string[]>;
  /**
   * 답이 늦어질 때 낼 뜸을 골라 준다. 없으면 뜸을 안 낸다.
   *
   * 답을 빠르게 만드는 건 우리 손 밖이었다. 비어 있는 시간을 죽어 있지 않게 하는 건
   * 우리 몫이다 — 같은 지연도 뜸이 있으면 절반쯤으로 느껴진다.
   */
  /**
   * 생각하기 전에 나가는 반응. 답을 돌려주면 두뇌를 아예 안 부른다.
   *
   * 「고마워」 한마디에 10초를 기다리는 건 대화가 아니다. 사람은 인사에 생각 없이 답한다.
   * 조금이라도 애매하면 null 을 돌려주고 두뇌로 넘겨야 한다 — 정해진 말만 하면 그게 더
   * 기계 같다.
   */
  reflex?: (sensation: Sensation) => string | null;
  /**
   * 입 앞의 관문 — 말하기 전에 한 번 거친다. null 을 돌려주면 그 말은 안 한다.
   *
   * 기억에 남기기도 **전에** 부른다. 안 할 말을 기억에 남기면 다음 번 재료가 되어 굳는다.
   */
  beforeSpeak?: (
    text: string,
    context: {
      sensation: Sensation;
      input: ThinkInput;
      usedHands: readonly string[];
      /** 이번에 미리 찾아본 것 — 「안 보고 지어낸 값」을 가리려면 이게 있어야 한다. */
      found: readonly string[];
    },
  ) => string | null | Promise<string | null>;
  filler?: () => string | null;
  /** 이만큼 지나도 답이 안 나오면 뜸을 낸다. 빨리 오면 안 낸다. */
  fillerAfterMs?: number;
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
  /**
   * 기다리는 감각들. 한 번에 하나씩 처리한다 — 기억 타임라인이 엉키지 않게.
   *
   * 다만 **사람이 건넨 말은 맨 앞에 세운다.** 화면을 보는 일처럼 오래 걸리는 것이 돌고
   * 있으면 내 말이 그 뒤에서 기다렸다(실측: 첫 소리까지 35초). 곁에 있는 사람이 딴 일
   * 하느라 내 말을 못 듣는 건 곁에 있는 게 아니다.
   */
  private waiting: { body: Body | null; sensation: Sensation; done: () => void; urgent: boolean }[] = [];
  private working = false;
  private running = false;
  /** 지금 처리 중인 바퀴. 끊겼으면 그 결과를 내보내지 않는다. */
  private inFlight: { cancelled: boolean } | null = null;

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
    await this.drain();
  }

  /** 처리 중인 감각이 모두 끝날 때까지 대기 (테스트·데모 종료용). */
  async drain(): Promise<void> {
    while (this.working || this.waiting.length > 0) {
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  /** 지금 누구인가. */
  get character(): Character | undefined {
    return this.options.character;
  }

  /**
   * 누구인지 바꾼다. 기억은 그대로 둔다 — 인격이 바뀌었다고 함께 지낸 시간까지
   * 없던 일이 되지는 않는다.
   */
  setCharacter(character: Character | undefined): void {
    this.options.character = character;
  }

  /** 몸 없이 감각 하나를 직접 밀어넣는다 — 테스트와 외부 트리거용. */
  feed(sensation: Sensation): Promise<void> {
    const body = this.bodyByChannel.get(sensation.channel) ?? null;
    return this.enqueue(body, sensation);
  }

  private enqueue(body: Body | null, sensation: Sensation): Promise<void> {
    const interrupts = this.options.interruptChannels ?? [];
    const urgent = interrupts.includes(sensation.channel)
      && (this.options.urgentWhen?.(sensation) ?? true);

    if (urgent && this.inFlight !== null) {
      // 하던 말은 버린다. 이미 나간 소리도 멈춘다.
      this.inFlight.cancelled = true;
      this.options.brain.abort?.();
      for (const body of this.options.bodies) void body.voice.hush?.();
    }

    return new Promise<void>((done) => {
      const item = { body, sensation, done, urgent };
      if (urgent) {
        // 사람 말은 기다리는 줄 맨 앞으로. 다만 사람 말끼리는 온 순서를 지킨다.
        let after = -1;
        for (let i = this.waiting.length - 1; i >= 0; i -= 1) {
          if (this.waiting[i]?.urgent === true) {
            after = i;
            break;
          }
        }
        this.waiting.splice(after + 1, 0, item);
      } else {
        this.waiting.push(item);
      }
      void this.pump();
    });
  }

  /** 줄 선 것을 하나씩 처리한다. */
  private async pump(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      while (this.waiting.length > 0) {
        const next = this.waiting.shift();
        if (next === undefined) break;
        await this.cycle(next.body, next.sensation);
        next.done();
      }
    } finally {
      this.working = false;
    }
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
    const input = {
      sensation,
      recent,
      longTerm,
      character: this.options.character,
      mood: this.options.mood?.(recent),
      found: await this.options.recall?.(sensation, recent),
    };

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

    // 생각 없이 답해도 되는 말이면 여기서 끝낸다 — 두뇌를 안 부르므로 즉답이고,
    // 구독 할당량도 안 먹는다.
    const knee = this.options.reflex?.(sensation) ?? null;
    if (knee !== null && knee !== '') {
      const at = (this.options.now ?? Date.now)();
      await memory.remember({ role: 'said', channel: sensation.channel, text: knee, at, via: 'reflex' });
      try {
        await target?.voice.speak({ text: knee, channel: sensation.channel, at });
      } catch (e) {
        onCycle?.({ sensation, decision, utterance: null, error: asError(e) });
        return;
      }
      onCycle?.({ sensation, decision, utterance: { text: knee, channel: sensation.channel, at } });
      return;
    }

    const mine = { cancelled: false };
    this.inFlight = mine;

    /* 답이 늦으면 뜸을 낸다 — 빨리 오면 아무 일도 안 일어난다.
       뜸이 늘 나오면 그게 더 기계 같으므로, 실제로 늦을 때만. */
    let hummed = false;
    const fillerTimer = this.options.filler === undefined || target?.voice.filler === undefined
      ? null
      : setTimeout(() => {
          if (mine.cancelled) return;
          const hum = this.options.filler?.();
          if (hum === null || hum === undefined || hum === '') return;
          hummed = true;
          void target.voice.filler?.(hum, sensation.channel);
        }, this.options.fillerAfterMs ?? 700);

    const stopHumming = () => {
      if (fillerTimer !== null) clearTimeout(fillerTimer);
    };

    let text: string | null;
    try {
      // 흘려보낼 수 있는 두뇌 + 받아줄 수 있는 입이 둘 다 있을 때만 흐르게 한다.
      if (brain.thinkStream && target?.voice.partial) {
        let soFar = '';
        text = await brain.thinkStream(input, (chunk) => {
          stopHumming(); // 진짜 말이 나오기 시작했으면 뜸은 그만
          soFar += chunk;
          void target.voice.partial?.(chunk, soFar, sensation.channel);
        });
      } else {
        text = await brain.think(input);
      }
    } catch (e) {
      stopHumming();
      this.inFlight = null;
      // 끊긴 바퀴가 남긴 에러는 사고가 아니다 — 우리가 끊었으니까.
      if (mine.cancelled === false) onCycle?.({ sensation, decision, utterance: null, error: asError(e) });
      return;
    }

    stopHumming();
    this.inFlight = null;
    if (mine.cancelled) {
      onCycle?.({ sensation, decision: { respond: false, reason: '말하는 중에 말을 걸어와 그만뒀다' }, utterance: null });
      return;
    }

    // 말 속의 손 표시를 걷어내고, 걷어낸 일들을 실제로 한다.
    //
    // **무슨 손을 썼는지 기억해 둔다.** 입 앞 관문이 「안 한 걸 했다고 말하는지」를 보려면
    // 이걸 알아야 한다 — 표는 여기서 이미 걷어내지므로 뒤에서는 알 길이 없다.
    const 쓴손: string[] = [];
    const hands = this.options.hands ?? [];
    if (text !== null && hands.length > 0) {
      const { clean, requests } = findRequests(text);
      쓴손.push(...requests.map((r) => r.name));
      if (requests.length > 0) {
        const note = (m: string) => onCycle?.({
          sensation, decision: { respond: false, reason: m }, utterance: null,
        });
        // 찾아온 것을 보고 다시 답해야 하는 손이 섞였는지 본다.
        const feedback = requests.filter((r) => hands.find((h) => h.name === r.name)?.feedsBack === true);
        if (feedback.length > 0) {
          const found = await useHands(hands, feedback, note);
          // 나머지(하고 끝나는 일)는 뒤에서 처리한다.
          const rest = requests.filter((r) => feedback.includes(r) === false);
          if (rest.length > 0) void useHands(hands, rest, note);
          try {
            // 한 번만 더 생각한다. 더 돌리면 스스로에게 되묻는 굴레에 빠진다.
            const again = await brain.think({ ...input, found });
            text = again === null ? clean : findRequests(again).clean;
          } catch (e) {
            onCycle?.({ sensation, decision, utterance: null, error: asError(e) });
            return;
          }
        } else {
          void useHands(hands, requests, note);
          text = clean;
        }
      }
    }

    if (text === null || text.trim() === '') {
      onCycle?.({ sensation, decision: { respond: false, reason: '두뇌가 침묵을 골랐다' }, utterance: null });
      return;
    }

    // 입 앞의 관문 — 말하기 **전에** 한 번 거친다.
    //
    // 표류 감시는 새고 나서 다음 번에 짚어 준다. 그건 이미 조수님이 그 말을 들은 뒤다.
    // 여기서 막으면 애초에 그 말이 나가지 않는다. 관문이 없으면 그냥 지나간다.
    if (this.options.beforeSpeak !== undefined) {
      try {
        const 거른것 = await this.options.beforeSpeak(text.trim(), { sensation, input, usedHands: 쓴손, found: input.found ?? [] });
        if (거른것 === null || 거른것.trim() === '') {
          onCycle?.({ sensation, decision: { respond: false, reason: '입 앞에서 걸렀다' }, utterance: null });
          return;
        }
        text = 거른것;
      } catch (e) {
        // 관문이 고장 나도 입을 막지는 않는다 — 말 못 하는 것보다 새는 편이 낫다.
        onCycle?.({ sensation, decision, utterance: null, error: asError(e) });
      }
    }

    const now = this.options.now ?? Date.now;
    const utterance: Utterance = { text: text.trim(), channel: sensation.channel, at: now() };
    await memory.remember({ role: 'said', channel: utterance.channel, text: utterance.text, at: utterance.at, via: 'brain' });

    try {
      await target?.voice.speak(utterance);
    } catch (e) {
      onCycle?.({ sensation, decision, utterance, error: asError(e) });
      return;
    }

    onCycle?.({ sensation, decision, utterance, hummed });
  }
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
