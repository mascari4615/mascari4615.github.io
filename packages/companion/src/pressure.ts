import type { Ingredient } from './budget';

/**
 * 밀린 생각은 사라지지 않는다 — 쌓여서 다음에 더 세게 겨룬다.
 *
 * **72회차 방향 점검에서 나온 것이다.** 여태 회차마다 재료를 하나씩 더 만들었다. 지금 재료
 * 만드는 자리가 쉰 곳이 넘는데, 한 turn 에 실리는 건 여섯 줄뿐이다. 나머지는 「밀림」으로
 * 찍히고 **그대로 증발한다.** 다음 turn 은 아무것도 기억하지 못한 채 처음부터 다시 추첨한다.
 *
 * 그래서 무게가 어중간한 재료는 *영영* 안 실린다 — 만들어 놓고 안 붙인 것과 같다. 오늘
 * 되묻기 하나로 여섯 회차를 쓰고도 라이브에서 못 본 것도 결국 이 자리 문제였다.
 *
 * 사람 머리는 안 그렇다. **못 한 말은 남아서 더 하고 싶어진다.** 참을수록 세지고, 말하고
 * 나면 풀리고, 때를 놓치면 식는다. 그 세 가지를 그대로 옮긴다.
 *
 * 레퍼런스(Inner Thoughts, CHI 2025)도 같은 곳을 짚는다 — 겉으로 오가는 말과 나란히
 * *속으로 도는 생각*이 있고, 각 생각이 「말하고 싶은 정도」를 들고 때를 기다린다. 그쪽은
 * 생각을 따로 지어내지만, 우리는 이미 쉰 곳에서 생각을 만들고 있다. 없던 건 **기다리는
 * 자리**다.
 */

export interface PendingThoughtOptions {
  /** 한 번 밀릴 때마다 얼마나 세지나. */
  step?: number;
  /** 아무리 밀려도 이 이상은 안 세진다. 안 그러면 오래된 것이 영영 1등이라 새 것이 굶는다. */
  cap?: number;
  /** 이만큼 지나도록 다시 안 밀리면 잊는다 — 지나간 관심이다. */
  forgetTurn?: number;
}

interface pressed {
  count: number;
  lastTurn: number;
}

/**
 * 어느 재료가 얼마나 참고 있나.
 *
 * 예산 고르는 자리가 **모든 재료가 지나가는 유일한 길목**이라, 거기 달린 표시(실림/밀림/
 * 꺼짐/빔)를 그대로 받아 적으면 따로 배선할 데가 없다.
 */
export class pendingThoughts {
  private readonly step: number;
  private readonly cap: number;
  private readonly forgetTurn: number;
  private readonly pressed = new Map<string, pressed>();
  private turn = 0;

  constructor(options: PendingThoughtOptions = {}) {
    this.step = options.step ?? 3;
    this.cap = options.cap ?? 9;
    this.forgetTurn = options.forgetTurn ?? 8;
  }

  /** 한 turn 이 끝났다. 다음 겨룸으로 넘어간다. */
  nextTurn(): void {
    this.turn += 1;
    for (const [name, v] of [...this.pressed]) {
      if (this.turn - v.lastTurn >= this.forgetTurn) this.pressed.delete(name);
    }
  }

  /**
   * 예산 자리에서 온 표시를 받아 적는다. `mark` 에 그대로 물리면 된다.
   *
   * - **밀림** = 하고 싶었는데 못 했다 → 세진다.
   * - **실림** = 말했다 → 풀린다.
   * - **꺼짐/빔** = 지금 자리에 없는 얘기다 → 쌓아 두면 엉뚱한 때 튀어나온다. 지운다.
   */
  write = (name2: string, ok: 'loaded' | 'queued' | 'off' | 'blank'): void => {
    if (ok !== 'queued') { this.pressed.delete(name2); return; }
    const previous = this.pressed.get(name2);
    this.pressed.set(name2, { count: (previous?.count ?? 0) + 1, lastTurn: this.turn });
  };

  /** 이 재료가 몇 번이나 참았나 — 「이제 그만 꺼내라」를 정할 때 쓴다(87회차). */
  heldFor(name3: string): number {
    return this.pressed.get(name3)?.count ?? 0;
  }

  /** 가장 오래 참은 것부터. */
  heldOrder(): { name: string; count: number }[] {
    return [...this.pressed.entries()]
      .map(([name, v]) => ({ name, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }

  /** 지금 이 재료에 얹어 줄 무게. */
  addedWeight(name4: string): number {
    const v = this.pressed.get(name4);
    if (v === undefined) return 0;
    return Math.min(v.count * this.step, this.cap);
  }

  /** 재료 목록에 참은 만큼을 얹어 돌려준다. 원본은 안 건드린다. */
  overlay(all: readonly Ingredient[]): Ingredient[] {
    return all.map((x) => {
      const extra = this.addedWeight(x.name);
      return extra === 0 ? x : { ...x, weight: x.weight + extra };
    });
  }

  /** 지금 뭐가 얼마나 참고 있나 — 기록용. 참는 게 없으면 빈 말. */
  summary(): string {
    const items = [...this.pressed.entries()]
      .filter(([name]) => this.addedWeight(name) > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, v]) => `${name}+${this.addedWeight(name)}(${v.count}번)`);
    return items.join(' · ');
  }
}
