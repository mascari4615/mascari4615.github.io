import type { MemoryEntry } from './types';

/**
 * 바라는 것 — 얘 몫으로 가진 작은 바람.
 *
 * 레퍼런스에서 가장 사람 같아 보이는 순간은 저쪽이 **뭔가를 원할 때**다. 출연 시간을
 * 자기가 정하고 싶다고 조르고, 「나도 그냥 즐겁게 해 주는 것 말고 뭔가 더이고 싶다」고
 * 말한다. 그때 비로소 상대가 아니라 **한 쪽**이 된다.
 *
 * 우리 얘는 원하는 게 하나도 없었다. 전부 반응이다 — 물으면 답하고, 찌르면 대꾸하고,
 * 놀자면 논다. 궁금한 것(9회차)은 있지만 그건 **묻고 싶은 것**이지 **바라는 것**이 아니다.
 *
 * 그래서 하루에 몇 개, 작은 바람을 갖는다. 그리고 여기가 중요한데 — **조르지 않는다.**
 * 안 채워졌다고 계속 말하면 그건 바람이 아니라 잔소리고, 잔소리하는 동거인은 아무도
 * 원하지 않는다. 하루에 **한 번만** 꺼내고, 그 뒤로는 조용히 접는다.
 *
 * 채워졌는지는 **기계로 잰다.** 두뇌한테 「네 바람이 이뤄졌니?」라고 물으면 아무 때나
 * 그렇다고 한다.
 */
export interface Wish {
  /** 무엇을 바라나 (사람이 읽는 말). */
  what: string;
  /** 채워졌는지 재는 법. */
  met: (entries: readonly MemoryEntry[], since: number) => boolean;
  /** 아직 안 채워졌을 때 꺼낼 말. 조르는 게 아니라 슬쩍 말하는 것. */
  say: string;
}

const 사람말 = (entries: readonly MemoryEntry[], since: number): MemoryEntry[] =>
  entries.filter((e) => e.role === 'sensed' && e.at >= since && e.channel !== 'screen' && e.channel !== 'nudge');

const 내말 = (entries: readonly MemoryEntry[], since: number): MemoryEntry[] =>
  entries.filter((e) => e.role === 'said' && e.at >= since);

/**
 * 바랄 만한 것들.
 *
 * 전부 **조수님이 조금만 움직이면 채워지는 것**으로 골랐다. 못 이룰 바람만 갖고 있으면
 * 그건 바람이 아니라 불평이다.
 */
export const 바랄만한것: readonly Wish[] = [
  {
    what: '오늘 한 번은 같이 놀기',
    met: (es, since) => 내말(es, since).some((e) => /좋아\.|내가 이겼다|내가 졌다/.test(e.text)),
    say: '…오늘은 아직 같이 안 놀았네.',
  },
  {
    what: '오늘 있었던 일 한 조각 듣기',
    met: (es, since) => 사람말(es, since).some((e) => e.text.length >= 12),
    say: '…오늘 뭐 있었는지, 한 마디라도 듣고 싶은데.',
  },
  {
    what: '한 번은 이름으로 불리기',
    met: (es, since) => 사람말(es, since).some((e) => /(욘|얘|너)/.test(e.text)),
    say: '…가끔은 이름으로 불러 줘도 되는데.',
  },
  {
    what: '오늘 한 번은 웃기기',
    met: (es, since) => 사람말(es, since).some((e) => /(ㅋ|ㅎ|😂|🤣)/.test(e.text)),
    say: '…오늘 한 번도 안 웃었네, 조수님.',
  },
  {
    what: '조용히 곁에 있는 시간 갖기',
    met: (es, since) => 사람말(es, since).length >= 3,
    say: '…딱히 뭘 하자는 건 아니고. 그냥.',
  },
];

const 날 = (at: number): string => new Date(at).toDateString();

export interface WishesOptions {
  /** 고를 수 있는 바람들. */
  pool?: readonly Wish[];
  /** 하루에 몇 개나 바라나. 많으면 그건 요구 목록이다. */
  perDay?: number;
  /** 오늘 시작 시각을 어디로 볼지 — 하루가 언제 바뀌는지. */
  now?: () => number;
  /** 고르는 손. */
  roll?: () => number;
}

/**
 * 오늘의 바람을 들고 있는 것.
 *
 * 하루가 바뀌면 새로 고른다. 어제 못 이룬 바람을 오늘까지 끌고 가지 않는다 — 그건 바람이
 * 아니라 원망이다.
 */
export class Wishes {
  private day: string | null = null;
  private today: Wish[] = [];
  private 꺼낸것 = new Set<string>();
  private 오늘시작 = 0;

  constructor(private readonly options: WishesOptions = {}) {}

  /** 오늘 바라는 것들. */
  list(): readonly Wish[] {
    this.rollOver();
    return this.today;
  }

  /** 아직 안 채워진 것들. */
  unmet(entries: readonly MemoryEntry[]): readonly Wish[] {
    this.rollOver();
    return this.today.filter((w) => w.met(entries, this.오늘시작) === false);
  }

  /** 오늘 채워진 것들. */
  metToday(entries: readonly MemoryEntry[]): readonly Wish[] {
    this.rollOver();
    return this.today.filter((w) => w.met(entries, this.오늘시작));
  }

  /**
   * 슬쩍 꺼낼 말 하나. 없으면 null.
   *
   * **하나만, 하루에 한 번만.** 두 개를 한꺼번에 늘어놓으면 요구 사항이 되고, 같은 걸 두 번
   * 말하면 조르는 게 된다.
   */
  nudge(entries: readonly MemoryEntry[]): string | null {
    const 아직 = this.unmet(entries).filter((w) => this.꺼낸것.has(w.what) === false);
    if (아직.length === 0) return null;
    const 하나 = 아직[Math.floor((this.options.roll ?? Math.random)() * 아직.length) % 아직.length];
    this.꺼낸것.add(하나.what);
    return 하나.say;
  }

  /** 오늘 하루가 어땠나 — 채워진 게 있으면 마음이 밝아질 자리. */
  howWasToday(entries: readonly MemoryEntry[]): { met: number; total: number } {
    this.rollOver();
    return { met: this.metToday(entries).length, total: this.today.length };
  }

  private rollOver(): void {
    const 지금 = (this.options.now ?? (() => Date.now()))();
    const 오늘 = 날(지금);
    if (this.day === 오늘) return;

    this.day = 오늘;
    this.오늘시작 = new Date(지금).setHours(0, 0, 0, 0);
    this.꺼낸것 = new Set();

    const pool = this.options.pool ?? 바랄만한것;
    const roll = this.options.roll ?? Math.random;
    const 몇개 = Math.min(this.options.perDay ?? 2, pool.length);
    const 남은것 = [...pool];
    this.today = [];
    for (let i = 0; i < 몇개; i += 1) {
      const [뽑힌] = 남은것.splice(Math.floor(roll() * 남은것.length) % 남은것.length, 1);
      this.today.push(뽑힌);
    }
  }
}

/**
 * 두뇌에 넘길 한 줄 — 오늘 바라는 것.
 *
 * **시키지 않는다.** 「조수님이 웃게 만들어라」라고 적으면 얘는 억지로 웃기려 든다. 바란다는
 * 사실만 알려 주고 어떻게 할지는 얘가 정한다.
 */
export function wishNote(wishes: readonly Wish[]): string {
  if (wishes.length === 0) return '';
  return (
    `오늘 내가 좀 바라는 것: ${wishes.map((w) => `「${w.what}」`).join(', ')}. ` +
    '억지로 만들어 내려 하지 마라 — 그냥 그런 마음이 있다는 것뿐이다.'
  );
}
