/**
 * 같이 보기 — 조수님이 무엇을 얼마나 붙들고 있는지.
 *
 * 레퍼런스 쪽에서 큰 축 하나가 **같이 보고 반응하기**다. 영상을 함께 보고 한마디 얹는다.
 * 그 자리가 「곁에 있다」를 만든다 — 보고만 있는 게 아니라 **보고 있다는 걸 상대가 안다.**
 *
 * 우리 얘는 화면을 곁눈질하긴 한다(12회차). 그런데 **매번 지금 창 제목만 스친다.** 창이
 * 바뀌면 말 걸 이유가 생기지만, **같은 걸 한 시간째 붙들고 있는 것**은 아무 신호도 아니었다.
 * 그런데 곁에서 보는 사람 눈에 가장 먼저 띄는 게 바로 그거다 — 「그거 아직도 안 됐구나」.
 *
 * 두 가지를 읽는다.
 * - **붙들고 있음**: 같은 것을 오래 보고 있다. 몰두했거나 막혔거나.
 * - **왔다갔다**: 두어 개를 짧게 오가며 되풀이한다. 대개 **뭘 찾거나 막힌 것**이다.
 *
 * 둘을 가르는 게 중요하다. 몰두한 사람한테 「막혔어?」라고 하면 그게 방해고, 막힌 사람한테
 * 「집중 잘 되네」라고 하면 놀리는 것이다.
 */
export interface Seen {
  title: string;
  at: number;
}

export interface WatchOptions {
  /** 이보다 오래 같은 걸 보면 붙들고 있는 것으로 본다. */
  stuckAfterMs?: number;
  /** 이 안에서 오간 것만 왔다갔다로 센다. */
  flipWindowMs?: number;
  /** 이만큼 넘게 오가면 왔다갔다로 본다. */
  flipsAtLeast?: number;
  /** 몇 개까지 들고 있을지. */
  keep?: number;
}

/**
 * 본 것들을 시간과 함께 들고 있는 것.
 *
 * **같은 제목이 이어지면 하나로 묶는다.** 화면을 2분마다 보므로 안 묶으면 같은 창이 서른
 * 개로 쌓여, 무엇을 얼마나 봤는지가 아니라 몇 번 쳐다봤는지를 세게 된다.
 */
export class Watching {
  private seen: Seen[] = [];

  constructor(private readonly options: WatchOptions = {}) {}

  /** 지금 이 창을 보고 있다. */
  saw(title: string, at: number): void {
    const 다듬은 = title.trim();
    if (다듬은 === '') return;

    // **같은 것인지는 짧은 이름으로 본다.**
    //
    // 전체 제목으로 묶으면 유니티에서 씬만 바꿔도(「…- Stage_Home -…」 → 「…- World -…」)
    // 다른 것을 보는 걸로 세어, 같은 걸 두 시간 붙들고 있어도 영영 안 잡힌다(실측 34회차:
    // 실제 기록 308개가 40개로 묶였는데 그중 대부분이 같은 유니티였다).
    const 마지막 = this.seen[this.seen.length - 1];
    if (마지막 !== undefined && shortTitle(마지막.title) === shortTitle(다듬은)) return;

    this.seen.push({ title: 다듬은, at });
    const keep = this.options.keep ?? 40;
    if (this.seen.length > keep) this.seen = this.seen.slice(-keep);
  }

  /** 지금 보고 있는 것. */
  get now(): Seen | null {
    return this.seen[this.seen.length - 1] ?? null;
  }

  /** 지금 것을 얼마나 붙들고 있나 (밀리초). 없으면 0. */
  heldFor(now: number): number {
    const 지금것 = this.now;
    return 지금것 === null ? 0 : Math.max(0, now - 지금것.at);
  }

  /** 오래 붙들고 있나. */
  isStuck(now: number): boolean {
    return this.heldFor(now) >= (this.options.stuckAfterMs ?? 40 * 60_000);
  }

  /**
   * 왔다갔다 하고 있나 — 몇 개를 짧게 오가며 되풀이.
   *
   * **서로 다른 것을 죽 훑는 것**과 다르다. 그건 그냥 이것저것 보는 것이고, 왔다갔다는
   * **같은 것으로 돌아온다.**
   */
  isFlipping(now: number): boolean {
    const window = this.options.flipWindowMs ?? 10 * 60_000;
    const 최소 = this.options.flipsAtLeast ?? 4;

    const 최근 = this.seen.filter((s) => now - s.at <= window);
    if (최근.length < 최소) return false;

    // 묶는 기준과 세는 기준이 다르면 안 된다 — 여기서도 짧은 이름으로 센다.
    const 가짓수 = new Set(최근.map((s) => shortTitle(s.title))).size;
    // 오간 횟수는 많은데 가짓수는 적다 = 같은 것으로 돌아오고 있다.
    return 가짓수 >= 2 && 가짓수 <= Math.ceil(최근.length / 2);
  }

  /** 최근에 본 것들 (진단용). */
  get recent(): readonly Seen[] {
    return this.seen;
  }
}

/** 창 제목에서 사람이 부를 만한 이름만 남긴다. */
export function shortTitle(title: string, max = 24): string {
  // 「파일 - 프로그램 - 어쩌고」 꼴이면 맨 앞이 대개 무엇인지를 말한다.
  const 앞 = title.split(/\s+[-–—|]\s+/)[0].trim();
  const 쓸것 = 앞 === '' ? title.trim() : 앞;
  return 쓸것.length <= max ? 쓸것 : `${쓸것.slice(0, max)}…`;
}

/**
 * 두뇌에 넘길 한 줄. **아무 일 없으면 조용하다.**
 *
 * 무엇을 하라고 시키지 않는다 — 봤다는 사실만 주고 말을 걸지 말지는 다른 데서 정한다.
 * 여기서 「물어봐라」까지 시키면 얘가 화면 얘기만 하는 애가 된다.
 */
export function watchNote(watching: Watching, now: number): string {
  const 지금것 = watching.now;
  if (지금것 === null) return '';

  if (watching.isFlipping(now)) {
    return `조수님이 몇 군데를 왔다갔다 하고 있다 — 뭘 찾거나 막힌 것 같다. 아는 척은 하지 마라.`;
  }
  if (watching.isStuck(now)) {
    const 분 = Math.round(watching.heldFor(now) / 60_000);
    return `조수님이 「${shortTitle(지금것.title)}」 를 ${분}분째 붙들고 있다. 몰두한 걸 수도 있으니 함부로 끊지 마라.`;
  }
  return '';
}
