/**
 * 토너먼트 셈법 (TASK-KL-151 ⑫) — 화면 없이 도는 부분만.
 *
 * 왜 떼어 냈나: 월드컵 위젯이 700줄을 넘었다. 그 안에 **화면**(그림 두 장·단추)과
 * **셈**(대진 짜기·다음 판·부전승)과 **주고받기**(P2P)가 한 덩어리로 있었다. 다음 놀이가
 * 토너먼트를 쓰려면 그 덩어리를 복사하게 되고, 복사한 날부터 둘이 갈린다.
 *
 * 여기 있는 것은 전부 **순수 함수**다 — 화면도 저장도 안 건드린다. 그래서 시험이 쉽고,
 * 「같은 씨앗이면 같은 대진」 같은 약속을 눈이 아니라 값으로 확인할 수 있다.
 */
export interface Runner {
  name: string;
  img: string;
}

export interface Match {
  win: string;
  lose: string;
  /** 몇 강에서 붙었나 (16 = 16강). 「내가 고른 길」이 이걸로 선다. */
  round: number;
}

/**
 * 씨앗에서 나오는 난수 (mulberry32).
 *
 * 왜 필요한가: 둘이 같이 할 때 **양쪽이 같은 대진**을 얻어야 라운드끼리 맞댈 수 있다.
 * `Math.random` 은 그 약속을 못 한다.
 */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(list: T[], rand: () => number = Math.random): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 몇 강까지 할 수 있나 — 표 크기가 정한다. 넷은 되어야 놀이가 된다. */
export function roundChoices(count: number): number[] {
  const out: number[] = [];
  for (let size = 4; size <= 128; size *= 2) if (size <= count) out.push(size);
  return out;
}

/**
 * 한 판의 진행 상태.
 *
 * 왜 클래스가 아니라 값인가: 화면은 「지금 누구와 누구냐」만 물으면 되고, 상태를 두 곳에서
 * 고치면 그 순간부터 어긋난다. 여기서는 **다음 상태를 돌려주는** 식으로만 움직인다.
 */
export class Bracket {
  private queue: Runner[];
  private winners: Runner[] = [];
  private pair: [Runner, Runner] | null = null;
  readonly matches: Match[] = [];
  /** 지금 몇 강인가. */
  roundOf: number;

  constructor(runners: Runner[]) {
    this.queue = runners.slice();
    this.roundOf = this.queue.length;
    this.advance();
  }

  /** 지금 고를 두 쪽. 끝났으면 null. */
  get current(): [Runner, Runner] | null {
    return this.pair;
  }

  /** 다 끝났으면 우승자, 아니면 null. */
  get champion(): Runner | null {
    return this.pair === null && this.winners.length === 1 && this.queue.length === 0 ? this.winners[0] : null;
  }

  /** 이번 라운드에서 몇 번째 대결인가 (화면이 「3 / 8」로 쓴다). */
  get progress(): { index: number; total: number } {
    return { index: this.winners.length + 1, total: Math.max(1, Math.floor(this.roundOf / 2)) };
  }

  private advance(): void {
    if (this.queue.length >= 2) {
      this.pair = [this.queue.shift()!, this.queue.shift()!];
      return;
    }
    // 홀수로 남으면 부전승 — 대결이 아니므로 기록에 안 남긴다.
    if (this.queue.length === 1) this.winners.push(this.queue.shift()!);
    if (this.winners.length <= 1) {
      this.pair = null;
      return;
    }
    this.queue = this.winners;
    this.winners = [];
    this.roundOf = this.queue.length;
    this.advance();
  }

  /** 한쪽을 골랐다. 이긴 쪽만 올라간다. */
  choose(index: 0 | 1): void {
    if (!this.pair) return;
    const win = this.pair[index];
    const lose = this.pair[index === 0 ? 1 : 0];
    this.matches.push({ win: win.name, lose: lose.name, round: this.roundOf });
    this.winners.push(win);
    this.pair = null;
    this.advance();
  }
}

/**
 * 둘의 길을 견준다 — 같은 대진이라 라운드끼리 그대로 맞댈 수 있다.
 *
 * 「같은 갈림길」만 센다: 같은 라운드에서 **같은 둘**이 붙은 대결. 다른 대진에서 나온 판을
 * 섞어 세면 일치율이 아무 말도 안 하는 수가 된다.
 */
export function agreement(mine: Match[], theirs: Match[]): { same: number; compared: number; rate: number } {
  let same = 0;
  let compared = 0;
  for (const m of mine) {
    const twin = theirs.find(
      (t) =>
        t.round === m.round &&
        (t.win === m.win || t.win === m.lose) &&
        (t.lose === m.win || t.lose === m.lose)
    );
    if (!twin) continue;
    compared += 1;
    if (twin.win === m.win) same += 1;
  }
  return { same, compared, rate: compared ? Math.round((same / compared) * 100) : 0 };
}
