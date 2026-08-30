import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { whichSlot, type slot } from './room';

/**
 * 자리를 **배운다**. 표가 모르는 창은 두뇌에게 물어본다.
 *
 * 78회차에 지금 떠 있는 창을 실제로 세어 봤다. **아홉 중 여섯이 모름이었다.**
 *
 * ```
 * 모름   | 설정            읽는중 | GitHub Desktop
 * 모름   | 동반자          보는중 | ... | YouTube Music ...
 * 통화   | #일반 | KarmoLab - Discord
 * 모름   | NVIDIA GeForce Overlay      모름 | Windows 입력 환경
 * ```
 *
 * 무슨 자리인지 모르겠다가 기본값이면 상황 파악은 사실상 없는 것이다. 그런데 **표를 늘리는
 * 건 답이 아니다**. 오늘만 두 번 그러다 당했다(74회차 사건 줍기, 76회차 메아리 문턱).
 * 사람이 쓰는 프로그램은 사람마다 다르고, 표는 만든 사람이 아는 것까지만 안다.
 *
 * 74회차에 통한 그 수를 그대로 쓴다. **표가 모르면 두뇌에게 물어본다.** 다른 점 하나: 창
 * 제목은 같은 게 계속 돌아오므로 **한 번 물으면 적어 두고 다시는 안 묻는다.** 그래서 물어보는
 * 값이 시간이 갈수록 0 에 수렴한다.
 */

const kinds: readonly Exclude<slot, null>[] = ['통화', '보는중', '만드는중', '읽는중', '노는중', '나를보는중'];

export interface SlotLearnOptions {
  path?: string;
  /** 두뇌에게 물어보는 slot. 없으면 표만 쓴다. */
  ask?: (titles: readonly string[]) => Promise<readonly (slot | null)[] | null>;
  log?: (message: string) => void;
}

export class learnSlot {
  private readonly learned = new Map<string, slot>();
  private readonly toAsk = new Set<string>();

  constructor(private readonly options: SlotLearnOptions = {}) {
    if (options.path !== undefined && existsSync(options.path)) {
      try {
        const raw = JSON.parse(readFileSync(options.path, 'utf8')) as Record<string, slot>;
        for (const [title, z] of Object.entries(raw ?? {})) this.learned.set(title, z);
      } catch {
        // 깨진 파일 때문에 상황 파악이 멈추면 안 된다.
      }
    }
  }

  /**
   * 이 창이 어떤 자리인가. **표 → 배운 것** 순으로 본다.
   *
   * 표가 먼저인 이유: 표는 우리가 뜻을 정해 둔 것이라 두뇌가 뒤집으면 안 된다(우리 창은
   * 우리가 안다). 둘 다 모르면 물어볼 것으로 담아 두고 지금은 모른다고 한다 . 
   * **기다리게 하지 않는다.**
   */
  read(title: string | null | undefined): slot {
    const title2 = (title ?? '').trim();
    if (title2 === '') return null;
    const table = whichSlot(title2);
    if (table !== null) return table;
    const learning = this.learned.get(brief(title2));
    if (learning !== undefined) return learning;
    if (this.hasAsk) this.toAsk.add(brief(title2));
    return null;
  }

  private get hasAsk(): boolean {
    return this.options.ask !== undefined;
  }

  get pending(): number {
    return this.toAsk.size;
  }

  get knownCount(): number {
    return this.learned.size;
  }

  /**
   * 밀린 제목들을 두뇌에게 물어 적어 둔다. **말하는 길에서 부르지 않는다.**
   *
   * 모른다고 답한 것도 적어 둔다. 안 적으면 같은 창을 영원히 다시 묻는다.
   */
  async reflect(atOnce = 10): Promise<number> {
    const ask2 = this.options.ask;
    if (ask2 === undefined || this.toAsk.size === 0) return 0;
    const bundle = [...this.toAsk].slice(0, atOnce);
    for (const title3 of bundle) this.toAsk.delete(title3); // 실패해도 무한히 다시 묻지 않는다

    let answer: readonly (slot | null)[] | null = null;
    try {
      answer = await ask2(bundle);
    } catch (err) {
      this.options.log?.(`자리를 못 물어봤다. ${(err as Error)?.message ?? err}`);
      return 0;
    }
    if (answer === null || answer.length !== bundle.length) {
      this.options.log?.(`slot 대답이 안 맞는다. ${bundle.length}개 물었는데 ${answer?.length ?? '없음'}개 왔다`);
      return 0;
    }

    let learnedCount = 0;
    bundle.forEach((title4, i) => {
      const z = answer![i];
      this.learned.set(title4, z === undefined ? null : z);
      if (z !== null && z !== undefined) learnedCount += 1;
    });
    this.save();
    if (learnedCount > 0) this.options.log?.(`창 ${bundle.length}개 중 ${learnedCount}개가 무슨 자리인지 알았다`);
    return learnedCount;
  }

  private save(): void {
    if (this.options.path === undefined) return;
    try {
      mkdirSync(dirname(this.options.path), { recursive: true });
      writeFileSync(this.options.path, JSON.stringify(Object.fromEntries(this.learned), null, 1), 'utf8');
    } catch {
      // 못 남겨도 이번 판에서는 안다.
    }
  }
}

/**
 * 창 제목에서 **바뀌는 부분을 떼어 낸다.**
 *
 * Bad Taste ft. Kasane Teto | YouTube Music ...과 다른 노래 | YouTube Music ...은 같은
 * 자리인데 제목이 다르다. 통째로 열쇠를 삼으면 노래를 바꿀 때마다 새로 물어본다. 물어보는
 * 값이 영영 안 줄어든다. **뒤쪽**(프로그램 이름이 붙는 slot)만 남긴다.
 *
 * 대시 두 종류는 유니코드 이스케이프로 적는다. 글자 그대로 두면 AI 티 문자 스윕이
 * 정규식 안까지 바꿔 문자 클래스가 깨진다 (2026-08-29, TS1517 로 빌드 중단).
 */
export function brief(title5: string): string {
  const chunk = title5.split(/\s[|\u2013\u2014-]\s/).map((x) => x.trim()).filter((x) => x !== '');
  const after = chunk.length >= 2 ? chunk.slice(-2).join(' - ') : (chunk[0] ?? title5);
  return after.slice(0, 60);
}

/** 두뇌에게 이 창은 뭐 하는 자리야?를 묻는 slot. */
export function askSlot(ask: (prompt: string) => Promise<string | null>) {
  return async (titles2: readonly string[]): Promise<readonly (slot | null)[] | null> => {
    if (titles2.length === 0) return [];
    const list = titles2.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, ' ').slice(0, 80)}`).join('\n');
    const answer2 = await ask(
      '아래는 컴퓨터에 떠 있는 창 제목들이다. 각각이 **그 사람이 지금 뭘 하는 slot**인지 골라라.\n' +
        `${kinds.join(', ')}, 모름\n\n` +
        '- 통화 = 사람과 통화, 회의 중(끼어들면 안 되는 slot)\n' +
        '- 보는중 = 영상, 방송을 보는 중, 노는중 = 게임\n' +
        '- 만드는중 = 코드, 그림, 글을 만드는 중, 읽는중 = 문서, 웹을 읽는 중\n' +
        '- 나를보는중 = 그 사람의 AI 동반자 창\n' +
        '- 시스템 설정창, 알림창처럼 뭘 하는 중이라 할 수 없으면 모름\n\n' +
        `한 줄에 하나씩 ${titles2.length}개, 낱말만. 다른 말은 붙이지 마라.\n\n${list}`,
    );
    if (answer2 === null) return null;
    const line = answer2.split('\n').map((x) => x.trim()).filter((x) => x !== '');
    const picked = line
      .map((x) => kinds.find((z) => x.includes(z)) ?? (x.includes('모름') ? null : undefined))
      .filter((x) => x !== undefined) as (slot | null)[];
    // 개수가 안 맞으면 통째로 버린다. 어긋난 채 적으면 엉뚱한 창이 통화가 되어 입을 닫는다.
    return picked.length === titles2.length ? picked : null;
  };
}
