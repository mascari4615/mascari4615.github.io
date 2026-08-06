/**
 * 동반자 코어 — 계약(seam) 정의.
 *
 * 설계 원칙: **코어는 인격을 모른다.** 여기엔 캐릭터·말투·이름이 한 글자도 없다.
 * 코어가 아는 것은 「무언가를 느꼈다 → 응답할까 → 무슨 말 → 어디로 내보낸다」 뿐이다.
 *
 * 갈아끼우는 자리는 5개다:
 *   Sense(감각) · Attention(지금 말할까) · Brain(무슨 말) · Memory(기억) · Voice(표현)
 * 「몸」(터미널 / 디스코드 / 화면)은 Sense + Voice 한 쌍일 뿐이며, 코어를 건드리지 않는다.
 */

/** 동반자가 받은 감각 한 조각. 어느 몸에서 왔든 이 모양으로 코어에 들어온다. */
export interface Sensation {
  /** 어느 몸에서 왔나. 'terminal' | 'clock' | 'discord' | 'screen' ... 자유 문자열. */
  channel: string;
  /** 무엇을 느꼈나. 'text' | 'tick' | 'image' ... 자유 문자열. */
  kind: string;
  /** 사람이 읽을 수 있는 형태의 내용. 이미지·소리도 설명 문자열로 넣는다. */
  text: string;
  /** epoch ms. */
  at: number;
  /** 몸이 덧붙이는 부가 정보 (코어는 해석하지 않고 두뇌에 넘긴다). */
  meta?: Readonly<Record<string, unknown>>;
}

/** 동반자가 내보내는 말 한 마디. */
export interface Utterance {
  text: string;
  /** 어느 몸으로 내보낼까. 보통 감각이 들어온 채널과 같다. */
  channel: string;
  at: number;
}

/** 기억에 남는 한 줄. 감각과 발화를 같은 타임라인에 섞어 저장한다. */
export interface MemoryEntry {
  role: 'sensed' | 'said';
  channel: string;
  text: string;
  at: number;
}

/** 감각 기관. start 로 시작하고, 느낄 때마다 emit 을 부른다. */
export interface Sense {
  readonly name: string;
  start(emit: (sensation: Sensation) => void): void | Promise<void>;
  stop?(): void | Promise<void>;
}

/** 표현 기관. */
export interface Voice {
  readonly name: string;
  speak(utterance: Utterance): void | Promise<void>;
  /** 아직 다 만들어지지 않은 말 조각. 구현하면 말이 흐르듯 나온다. */
  partial?(chunk: string, soFar: string, channel: string): void | Promise<void>;
  stop?(): void | Promise<void>;
}

/** 몸 = 감각 + 표현 한 쌍. 이 묶음을 갈아끼우면 동반자가 다른 곳에 나타난다. */
export interface Body {
  readonly name: string;
  readonly sense: Sense;
  readonly voice: Voice;
}

/**
 * 인격 — 누구인가. **코어는 이 안을 들여다보지 않는다.** 통째로 두뇌에 넘길 뿐이다.
 *
 * 비워두면 아무도 아닌 채로 답한다. 파일 하나 갈아끼우면 다른 사람이 된다.
 */
export interface Character {
  /** 화면에 표시할 이름. */
  name: string;
  /** 두뇌에 그대로 넘어가는 지침 본문. */
  instruction: string;
}

/** 두뇌가 받는 재료. */
export interface ThinkInput {
  /** 방금 느낀 것. */
  sensation: Sensation;
  /** 최근 기억 (오래된 것 → 최신 순). */
  recent: readonly MemoryEntry[];
  /** 오래 남는 앎 — 이 사람에 대해 아는 것. 없으면 없는 채로. */
  longTerm?: string | null;
  /** 누구로서 답하나. 없으면 아무도 아닌 채로. */
  character?: Character;
}

/** 두뇌. null 을 돌려주면 「할 말 없음」 = 침묵. */
export interface Brain {
  readonly name: string;
  think(input: ThinkInput): Promise<string | null>;
  /**
   * 말이 만들어지는 대로 조각을 흘려보낸다. 구현하면 코어가 이쪽을 쓴다.
   *
   * 다 만들어진 뒤에 한꺼번에 내놓으면 몇 초 동안 아무 일도 안 일어나는 것처럼 보인다 —
   * 살아있는 느낌을 가장 많이 깎아먹는 게 그 침묵이다.
   */
  thinkStream?(input: ThinkInput, onDelta: (chunk: string) => void): Promise<string | null>;
}

/**
 * 기억. 두 층이다.
 *
 * `recent` = 방금 오간 말. 시간이 지나면 밀려난다.
 * `longTerm` = 밀려난 말에서 건져 올린 「이 사람에 대해 아는 것」. 대화가 길어져도 남는다.
 *
 * 두 층으로 나눈 이유: 최근 대화만 넘기면 어제 한 말을 오늘 모르고, 전부 넘기면
 * 대화가 길어질수록 감당이 안 된다. 사람의 기억도 이 둘로 갈린다.
 */
export interface Memory {
  remember(entry: MemoryEntry): void | Promise<void>;
  /** 최근 limit 개, 오래된 것 → 최신 순. */
  recent(limit: number): readonly MemoryEntry[] | Promise<readonly MemoryEntry[]>;
  /** 오래 남는 앎. 없으면 구현하지 않아도 된다. */
  longTerm?(): string | null | Promise<string | null>;
}

/** 「지금 말 걸어도 되나」 판단 결과. */
export interface AttentionDecision {
  respond: boolean;
  /** 사람이 읽을 수 있는 사유 — 로그·디버깅용. */
  reason: string;
}

/** 발화 여부 판단기. 두뇌를 부르기 *전* 에 걸러서 비용과 수다를 동시에 줄인다. */
export interface Attention {
  readonly name: string;
  shouldRespond(input: ThinkInput): AttentionDecision | Promise<AttentionDecision>;
}

/** 코어가 한 바퀴 돌 때마다 밖으로 알리는 신호 (로그·시각화·테스트용). */
export interface CycleReport {
  sensation: Sensation;
  decision: AttentionDecision;
  /** 두뇌가 침묵했거나 attention 이 막았으면 null. */
  utterance: Utterance | null;
  /** 두뇌·표현 도중 터진 에러 (코어는 죽지 않고 여기로만 알린다). */
  error?: Error;
}
