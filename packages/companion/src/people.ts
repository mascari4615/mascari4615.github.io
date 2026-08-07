import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryEntry } from './types';

/**
 * 곁의 사람들 — 조수님이 얘기하는 다른 사람들.
 *
 * 레퍼런스에서 눈에 띄는 것: 저쪽은 **한 번 만난 사람을 오래 기억한다.** 몇 달 안 봐도
 * 이름을 꺼내고, 잘못 부르면 고쳐 부르겠다고 하고(그러고는 또 틀리지만), 아무튼 **그 사람이
 * 있었다는 걸 안다.**
 *
 * 우리 얘는 세상에 **조수님 한 사람만** 있었다. 「오늘 김 대리랑 회의했어」라고 해도 다음에
 * 김 대리 얘기가 또 나오면 처음 듣는 사람이다. 그건 곁에 있는 게 아니라 매번 처음 만나는
 * 것이다.
 *
 * 한국어에서 이름을 기계로 뽑는 건 쉽지 않다. 그래서 **욕심내지 않는다** — 부르는 말이
 * 붙은 것만 본다(「김 대리」 「지훈이」 「민수 씨」 「형」). 그리고 **한 번 나온 건 안 잡는다.**
 * 한 번은 스쳐 지나간 말일 수 있고, 잘못 잡은 이름을 「곁의 사람」이라고 우기는 게 못 잡는
 * 것보다 나쁘다.
 */
export interface Person {
  /** 부르는 이름 (조수님이 쓴 그대로). */
  name: string;
  /** 몇 번 나왔나. */
  times: number;
  /** 마지막으로 나온 때. */
  lastAt: number;
  /** 처음 나온 때. */
  firstAt: number;
}

/** 이름 뒤에 붙는 부르는 말. 이게 붙어야 사람으로 본다. */
const 부름 = '(대리|과장|차장|부장|팀장|사장|선배|후배|선생님|교수님|씨|님|이형|형|누나|언니|오빠|동생)';
/**
 * 부름 뒤에 올 수 있는 글자들.
 *
 * 조사를 빠뜨리면 조용히 안 잡힌다 — 처음엔 「민수 씨한테」 「팀장님께」가 통째로 빠졌다.
 * 그렇다고 아무 글자나 허용하면 「씨앗」이 사람이 된다. 그래서 **조사 첫 글자만** 열어 둔다.
 */
const 뒤에올것 = ['한', '께', '에', '보', '랑', '이', '가', '은', '는', '을', '를', '도', '만', '의', '와', '과', '님', '라', '야', '아', '요', '였'];
const 이름꼴 = new RegExp(`([가-힣]{1,4})\\s?${부름}(?=[\\s.,!?'"」)]|${뒤에올것.join('|')}|$)`, 'g');

/** 사람 이름이 아닌 게 뻔한 것들 — 이걸 안 막으면 온갖 말이 사람이 된다. */
const 사람아님 = new Set([
  '조수', '아무', '그', '저', '이', '무슨', '어느', '다른', '옛', '새', '우리',
  '오늘', '내일', '어제', '지금', '방금', '이번', '저번', '다음', '요즘',
]);

/**
 * 이 말에서 사람으로 보이는 것들을 뽑는다.
 *
 * 뽑히는 건 **부르는 말까지 포함한 통짜**다 — 「김 대리」를 「김」으로 줄이면 다음에 「김
 * 과장」이 나왔을 때 같은 사람으로 잘못 묶인다.
 */
export function peopleIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(이름꼴)) {
    const 이름 = m[1];
    if (사람아님.has(이름)) continue;
    if (이름.length < 1) continue;
    const 통짜 = `${이름}${m[2]}`;
    if (out.includes(통짜) === false) out.push(통짜);
  }
  return out;
}

export interface PeopleOptions {
  /** 어디에 남길지. */
  path?: string;
  /** 몇 번은 나와야 곁의 사람으로 치나. */
  needTimes?: number;
  /** 몇 명까지 들고 있을지. */
  keep?: number;
  log?: (message: string) => void;
}

/**
 * 곁의 사람들을 들고 있는 것.
 *
 * 자주 나오는 순이 아니라 **최근에 나온 순**으로 남긴다. 삼 년 전 사람보다 지난주 사람이
 * 지금 대화에 쓸모 있다.
 */
export class People {
  private folks: Person[] = [];

  constructor(private readonly options: PeopleOptions = {}) {
    const path = options.path;
    if (path !== undefined && existsSync(path)) {
      try {
        this.folks = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        this.folks = [];
      }
    }
  }

  /** 곁의 사람으로 인정된 이들 (최근 나온 순). */
  get known(): readonly Person[] {
    const need = this.options.needTimes ?? 2;
    return this.folks.filter((p) => p.times >= need).sort((a, b) => b.lastAt - a.lastAt);
  }

  /** 아직 한 번밖에 안 나와 지켜보는 중인 이들 (진단용). */
  get watching(): readonly Person[] {
    const need = this.options.needTimes ?? 2;
    return this.folks.filter((p) => p.times < need);
  }

  /** 오간 말에서 사람을 줍는다. 새로 인정된 사람 수를 돌려준다. */
  learn(entries: readonly MemoryEntry[]): number {
    const need = this.options.needTimes ?? 2;
    let 새로인정 = 0;
    for (const e of entries) {
      // **조수님이 한 말만** 본다. 얘가 한 말에서 주우면 제가 지어낸 이름을 제가 배운다.
      if (e.role !== 'sensed' || e.channel === 'screen' || e.channel === 'nudge') continue;
      for (const 이름 of peopleIn(e.text)) {
        const 있던것 = this.folks.find((p) => p.name === 이름);
        if (있던것 === undefined) {
          this.folks.push({ name: 이름, times: 1, firstAt: e.at, lastAt: e.at });
          continue;
        }
        // 같은 말 안에서 여러 번 세지 않으려고 시각이 같으면 넘어간다.
        if (있던것.lastAt === e.at) continue;
        있던것.times += 1;
        있던것.lastAt = e.at;
        if (있던것.times === need) 새로인정 += 1;
      }
    }

    const keep = this.options.keep ?? 12;
    if (this.folks.length > keep) {
      this.folks = [...this.folks].sort((a, b) => b.lastAt - a.lastAt).slice(0, keep);
    }
    this.save();
    if (새로인정 > 0) this.options.log?.(`곁의 사람 ${새로인정}명을 새로 알았다`);
    return 새로인정;
  }

  /** 잘못 주운 사람을 지운다 — 사람이 아닌 게 끼면 얘가 헛소리를 한다. */
  forget(name: string): boolean {
    const 전 = this.folks.length;
    this.folks = this.folks.filter((p) => p.name !== name);
    if (this.folks.length === 전) return false;
    this.save();
    return true;
  }

  /**
   * 한동안 얘기 안 나온 사람 하나 — 안부를 물을 자리.
   *
   * 방금 나온 사람은 안 고른다. 「아까 그 김 대리는 요즘 어때?」는 이상하다.
   */
  whoToAskAbout(now: number, quietForMs = 7 * 86_400_000): Person | null {
    const 오래된것 = this.known.filter((p) => now - p.lastAt >= quietForMs);
    if (오래된것.length === 0) return null;
    // 가장 오래 안 나온 사람.
    return [...오래된것].sort((a, b) => a.lastAt - b.lastAt)[0];
  }

  private save(): void {
    const path = this.options.path;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.folks, null, 2), 'utf8');
  }
}

/**
 * 두뇌에 넘길 한 줄.
 *
 * **누구인지는 안 적는다.** 「김 대리 = 직장 동료」처럼 단정하면 틀렸을 때 그대로 굳는다.
 * 이름이 나왔다는 사실만 주고 나머지는 대화에서 알게 둔다.
 */
export function peopleNote(folks: readonly Person[], howMany = 4): string {
  const 보일것 = folks.slice(0, howMany);
  if (보일것.length === 0) return '';
  return (
    `조수님이 얘기했던 사람들: ${보일것.map((p) => p.name).join(', ')}. ` +
    '누군지 아는 척하지 마라 — 이름이 나왔다는 것만 안다. 다시 나오면 처음 듣는 척은 말고.'
  );
}
