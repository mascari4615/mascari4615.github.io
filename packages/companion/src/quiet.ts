/**
 * 조용히 있기 — 「지금은 좀」이라고 말할 수 있게.
 *
 * 데스크톱 동반자 쪽에서 오래 쓰이는 것들의 공통점: **끼어드는 것을 사람이 조절할 수 있다.**
 * 조용한 시간대를 정하고, 먼저 말 거는 간격에 쉼을 두고, 아예 말 없는 모드를 두기도 한다.
 * 집중을 깨는 동반자는 한 번 끄면 다시 안 켜진다.
 *
 * 우리 얘한테는 눈치(10회차)가 있다 — 자리에 없으면 안 걸고, 한창 손 놀리는 중이면 참는다.
 * 그런데 **조수님이 직접 말할 방법이 없었다.** 회의 들어가기 전에 「좀 있다 얘기해」라고
 * 하고 싶어도 방법이 창을 닫는 것뿐이었다.
 *
 * 핵심 하나: **조용히 하라고 해도 말을 걸면 답한다.** 조용히 있으라는 건 「먼저 걸지 마라」지
 * 「벙어리가 되라」가 아니다. 이걸 헷갈리면 얘가 말을 걸어도 대답을 안 하는 고장처럼 보인다.
 */
export interface QuietRequest {
  /** 얼마나 조용히 있어야 하나. */
  ms: number;
  /** 사람이 읽는 말 (얘가 대꾸할 때 쓴다). */
  says: string;
}

/**
 * 시간을 읽는다. 숫자만 보면 「한 시간」을 놓친다 — 사람은 그렇게 말한다.
 *
 * 「바쁘」만 넣으면 「바빠」를 못 알아듣는 것과 같은 부류다(ㅂ 불규칙). 실제로 둘 다 놓쳤다.
 */
const 한글숫자: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  십: 10, 이십: 20, 삼십: 30, 사십: 40, 오십: 50,
};
// 템플릿 문자열 안에서는 `\d` 가 그냥 `d` 가 된다 — 실제로 이걸로 아무것도 안 맞았다.
const 시간꼴 = new RegExp(`(\\d+|${Object.keys(한글숫자).join('|')})\\s*(분|시간)`);
const 조용히 = /(조용히|조용|가만히|말 걸지|말걸지|방해하지|나중에|이따|좀 있다|좀있다|집중|바쁘|바빠|바쁨|정신없)/;
const 다시 = /(이제 됐|다시 얘기|말해도|돌아왔|끝났|다 했)/;

/**
 * 이 말이 조용히 있으라는 뜻인가. 아니면 null.
 *
 * 「한 시간만 조용히」처럼 시간을 말하면 그만큼, 안 말하면 기본값만큼.
 */
export function asksForQuiet(text: string, defaultMs = 30 * 60_000): QuietRequest | null {
  const t = text.trim();
  if (조용히.test(t) === false) return null;
  // 「이제 됐어」류가 섞여 있으면 푸는 쪽이다.
  if (다시.test(t)) return null;

  const m = 시간꼴.exec(t);
  if (m === null) return { ms: defaultMs, says: '…응, 있다가.' };

  const 수 = 한글숫자[m[1]] ?? Number(m[1]);
  const ms = m[2] === '시간' ? 수 * 3600_000 : 수 * 60_000;
  return { ms: Math.max(60_000, ms), says: `…응. ${수}${m[2]} 뒤에.` };
}

/** 이 말이 「이제 됐다」는 뜻인가. */
export function asksToResume(text: string): boolean {
  return 다시.test(text.trim());
}

export interface QuietOptions {
  /**
   * 조용한 시간대 시작 (시). 안 주면 시간대 규칙 없음.
   *
   * **함수로도 줄 수 있다** — 설정을 창에서 바꿨을 때 재시작 없이 먹으려면 그때그때
   * 물어봐야 한다. 고정 숫자로 받으면 켤 때 값이 박혀 버린다(51회차).
   */
  fromHour?: number | (() => number);
  /** 조용한 시간대 끝 (시). */
  toHour?: number | (() => number);
  now?: () => number;
}

/**
 * 지금 조용히 있어야 하나를 들고 있는 것.
 *
 * 시간대와 부탁을 **따로** 둔다. 밤이라 조용한 것과 부탁받아 조용한 것은 다른 일이고,
 * 「이제 됐어」로 풀리는 것은 부탁 쪽뿐이다 — 한마디로 밤을 없앨 수는 없다.
 */
export class Quiet {
  private until = 0;

  constructor(private readonly options: QuietOptions = {}) {}

  private get now(): number {
    return (this.options.now ?? (() => Date.now()))();
  }

  /** 이만큼 조용히 있는다. */
  hushFor(ms: number): void {
    this.until = Math.max(this.until, this.now + ms);
  }

  /** 이제 됐다. 부탁만 푼다 — 시간대는 그대로다. */
  resume(): void {
    this.until = 0;
  }

  /** 부탁받아 조용히 있는 중인가. */
  get hushed(): boolean {
    return this.now < this.until;
  }

  /** 조용한 시간대인가. */
  get inQuietHours(): boolean {
    const 값 = (x: number | (() => number) | undefined): number | undefined =>
      typeof x === 'function' ? x() : x;
    const fromHour = 값(this.options.fromHour);
    const toHour = 값(this.options.toHour);
    if (fromHour === undefined || toHour === undefined || Number.isFinite(fromHour) === false
      || Number.isFinite(toHour) === false) return false;
    const h = new Date(this.now).getHours();
    // 밤을 넘어가는 구간(22시~7시)도 다뤄야 한다.
    return fromHour <= toHour ? h >= fromHour && h < toHour : h >= fromHour || h < toHour;
  }

  /** 지금 먼저 말을 걸어도 되나. */
  get maySpeakFirst(): boolean {
    return this.hushed === false && this.inQuietHours === false;
  }

  /** 언제까지 조용한지 (없으면 null). */
  get untilAt(): number | null {
    return this.hushed ? this.until : null;
  }

  /** 남은 시간을 사람 말로. */
  leftSay(): string {
    const 남음 = this.until - this.now;
    if (남음 <= 0) return '';
    const 분 = Math.ceil(남음 / 60_000);
    return 분 >= 60 ? `${Math.round(분 / 60)}시간쯤 더` : `${분}분쯤 더`;
  }
}

/**
 * 조용 중일 때 두뇌에 넘길 한 줄.
 *
 * **답은 하되 짧게.** 조용히 있으라고 했는데 답이 길면 그게 또 방해다.
 */
export function quietNote(quiet: Quiet): string {
  if (quiet.maySpeakFirst) return '';
  return quiet.hushed
    ? `조수님이 조용히 있으라고 했다 (${quiet.leftSay()}). 물으면 답하되 **아주 짧게**, 먼저 말 걸지 마라.`
    : '지금은 조용한 시간이다. 물으면 답하되 아주 짧게, 먼저 말 걸지 마라.';
}
