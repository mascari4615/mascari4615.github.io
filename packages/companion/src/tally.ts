import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 발동 기록 — 만든 게 실제로 도는지 세는 것.
 *
 * 지난 스무 회차 동안 같은 말을 다섯 번 적었다: **「단위 시험은 통과했는데 라이브에서 도는
 * 건 못 봤다.」** 화제 틀기(30·31), 붙들고 있음(34), 곁의 사람 안부(27), 바람 먼저 꺼내기(22),
 * 말버릇 잔소리(28). 전부 **드물게 열리는 조건**이라 확인할 방법이 없었다.
 *
 * 죽은 코드를 찾는 쪽에서 쓰는 방법은 단순하다: **의심되는 자리에 계측을 넣고, 얼마간 두고,
 * 실제로 몇 번 돌았는지 센다.** 안 돌면 조건이 틀렸거나 아무도 그 길을 안 지나는 것이다.
 * 「도는지 모름」과 「스무 번 중 0번 돌았음」은 완전히 다른 말이다.
 *
 * 그래서 **재료가 어떻게 됐는지를 넷으로 나눠 센다**:
 * - `실림` — 골라져서 실제로 두뇌에 갔다.
 * - `밀림` — 켜지긴 했는데 예산에 밀려 빠졌다.
 * - `꺼짐` — 조건이 안 맞아 아예 안 켜졌다.
 * - `빔` — 켜졌는데 내용이 비었다(만들 거리가 없었다).
 *
 * 이 넷을 가르는 게 핵심이다. **켜졌는데 밀린 것**과 **아예 안 켜진 것**은 고칠 데가 다르다 —
 * 앞은 예산이나 무게 문제고, 뒤는 조건이 틀렸거나 그런 상황이 안 오는 것이다.
 */
export type Fate = '실림' | '밀림' | '꺼짐' | '빔';

export interface Marks {
  /** 마지막으로 안 실렸을 때 왜 안 실렸나. 실리면 지워진다. */
  마지막왜?: string;
  실림: number;
  밀림: number;
  꺼짐: number;
  빔: number;
  /** 마지막으로 실린 때. 한 번도 안 실렸으면 0. */
  lastAt: number;
}

const 빈것 = (): Marks => ({ 실림: 0, 밀림: 0, 꺼짐: 0, 빔: 0, lastAt: 0 });

export interface TallyOptions {
  /** 어디에 남길지. 없으면 프로세스 안에서만 산다. */
  path?: string;
  /** 몇 번마다 파일에 쓸지. 매번 쓰면 디스크만 두드린다. */
  saveEvery?: number;
  now?: () => number;
}

/** 이름별로 발동을 세는 것. */
export class Tally {
  private marks = new Map<string, Marks>();
  private sinceSave = 0;

  constructor(private readonly options: TallyOptions = {}) {
    const path = options.path;
    if (path !== undefined && existsSync(path)) {
      try {
        const 읽은것 = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Marks>;
        for (const [name, m] of Object.entries(읽은것)) this.marks.set(name, { ...빈것(), ...m });
      } catch {
        this.marks = new Map();
      }
    }
  }

  /** 한 번 세다. */
  mark(name: string, fate: Fate, 왜?: string): void {
    const m = this.marks.get(name) ?? 빈것();
    m[fate] += 1;
    // 마지막으로 왜 안 실렸는지. 실린 순간에는 지운다 — 낡은 이유가 남아 헷갈린다.
    if (fate === '실림') delete m.마지막왜;
    else if (왜 !== undefined && 왜 !== '') m.마지막왜 = 왜;
    if (fate === '실림') m.lastAt = (this.options.now ?? (() => Date.now()))();
    this.marks.set(name, m);

    this.sinceSave += 1;
    if (this.sinceSave >= (this.options.saveEvery ?? 20)) {
      this.sinceSave = 0;
      this.save();
    }
  }

  /** 이 이름의 셈. */
  get(name: string): Marks {
    return { ...(this.marks.get(name) ?? 빈것()) };
  }

  /** 다 본다. */
  get all(): ReadonlyMap<string, Marks> {
    return this.marks;
  }

  /**
   * **한 번도 안 실린 것들.** 이게 이 파일을 만든 이유다.
   *
   * 몇 번은 지나가 봤는데 한 번도 안 실렸으면 그건 죽은 기능이다.
   */
  neverUsed(atLeastSeen = 10): string[] {
    const 죽은것: string[] = [];
    for (const [name, m] of this.marks) {
      const 지나감 = m.실림 + m.밀림 + m.꺼짐 + m.빔;
      if (지나감 >= atLeastSeen && m.실림 === 0) 죽은것.push(name);
    }
    return 죽은것.sort();
  }

  /** 지금 바로 남긴다 (끝낼 때). */
  save(): void {
    const path = this.options.path;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(Object.fromEntries(this.marks), null, 2), 'utf8');
  }
}

/**
 * 사람이 읽는 표.
 *
 * **한 번도 안 실린 것을 맨 위에 둔다** — 그게 봐야 할 것이다. 잘 도는 걸 위에 놓으면
 * 표를 봐도 아무것도 안 보인다.
 */
export function tallyReport(tally: Tally): string {
  const 줄들 = [...tally.all.entries()]
    .map(([name, m]) => ({ name, m, 지나감: m.실림 + m.밀림 + m.꺼짐 + m.빔 }))
    .sort((a, b) => (a.m.실림 - b.m.실림) || (b.지나감 - a.지나감));

  if (줄들.length === 0) return '아직 센 게 없다.';

  return 줄들
    .map(({ name, m, 지나감 }) => {
      const 상태 = m.실림 === 0 ? '● 한 번도 안 실림' : `실림 ${m.실림}`;
      // 왜 안 실렸는지를 같이 보여 준다 — 숫자만 보고는 조건 탓인지 만들 게 없어서인지 모른다.
      const 왜 = m.마지막왜 === undefined ? '' : `
${' '.repeat(10)}↳ ${m.마지막왜}`;
      return `${name.padEnd(8)} ${상태.padEnd(16)} (지나감 ${지나감} · 밀림 ${m.밀림} · 꺼짐 ${m.꺼짐} · 빔 ${m.빔})${왜}`;
    })
    .join('\n');
}
