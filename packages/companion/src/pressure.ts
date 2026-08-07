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

export interface 밀린생각옵션 {
  /** 한 번 밀릴 때마다 얼마나 세지나. */
  계단?: number;
  /** 아무리 밀려도 이 이상은 안 세진다. 안 그러면 오래된 것이 영영 1등이라 새 것이 굶는다. */
  상한?: number;
  /** 이만큼 지나도록 다시 안 밀리면 잊는다 — 지나간 관심이다. */
  잊는턴?: number;
}

interface 눌림 {
  횟수: number;
  마지막턴: number;
}

/**
 * 어느 재료가 얼마나 참고 있나.
 *
 * 예산 고르는 자리가 **모든 재료가 지나가는 유일한 길목**이라, 거기 달린 표시(실림/밀림/
 * 꺼짐/빔)를 그대로 받아 적으면 따로 배선할 데가 없다.
 */
export class 밀린생각 {
  private readonly 계단: number;
  private readonly 상한: number;
  private readonly 잊는턴: number;
  private readonly 눌린것 = new Map<string, 눌림>();
  private 턴 = 0;

  constructor(options: 밀린생각옵션 = {}) {
    this.계단 = options.계단 ?? 3;
    this.상한 = options.상한 ?? 9;
    this.잊는턴 = options.잊는턴 ?? 8;
  }

  /** 한 turn 이 끝났다. 다음 겨룸으로 넘어간다. */
  다음턴(): void {
    this.턴 += 1;
    for (const [이름, v] of [...this.눌린것]) {
      if (this.턴 - v.마지막턴 >= this.잊는턴) this.눌린것.delete(이름);
    }
  }

  /**
   * 예산 자리에서 온 표시를 받아 적는다. `mark` 에 그대로 물리면 된다.
   *
   * - **밀림** = 하고 싶었는데 못 했다 → 세진다.
   * - **실림** = 말했다 → 풀린다.
   * - **꺼짐/빔** = 지금 자리에 없는 얘기다 → 쌓아 두면 엉뚱한 때 튀어나온다. 지운다.
   */
  적기 = (이름: string, 됨: '실림' | '밀림' | '꺼짐' | '빔'): void => {
    if (됨 !== '밀림') { this.눌린것.delete(이름); return; }
    const 이전 = this.눌린것.get(이름);
    this.눌린것.set(이름, { 횟수: (이전?.횟수 ?? 0) + 1, 마지막턴: this.턴 });
  };

  /** 이 재료가 몇 번이나 참았나 — 「이제 그만 꺼내라」를 정할 때 쓴다(87회차). */
  얼마나참았나(이름: string): number {
    return this.눌린것.get(이름)?.횟수 ?? 0;
  }

  /** 가장 오래 참은 것부터. */
  참은순서(): { 이름: string; 횟수: number }[] {
    return [...this.눌린것.entries()]
      .map(([이름, v]) => ({ 이름, 횟수: v.횟수 }))
      .sort((a, b) => b.횟수 - a.횟수);
  }

  /** 지금 이 재료에 얹어 줄 무게. */
  더할무게(이름: string): number {
    const v = this.눌린것.get(이름);
    if (v === undefined) return 0;
    return Math.min(v.횟수 * this.계단, this.상한);
  }

  /** 재료 목록에 참은 만큼을 얹어 돌려준다. 원본은 안 건드린다. */
  덧입히기(all: readonly Ingredient[]): Ingredient[] {
    return all.map((x) => {
      const 덧 = this.더할무게(x.name);
      return 덧 === 0 ? x : { ...x, weight: x.weight + 덧 };
    });
  }

  /** 지금 뭐가 얼마나 참고 있나 — 기록용. 참는 게 없으면 빈 말. */
  요약(): string {
    const 것들 = [...this.눌린것.entries()]
      .filter(([이름]) => this.더할무게(이름) > 0)
      .sort((a, b) => b[1].횟수 - a[1].횟수)
      .slice(0, 5)
      .map(([이름, v]) => `${이름}+${this.더할무게(이름)}(${v.횟수}번)`);
    return 것들.join(' · ');
  }
}
