import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { 어떤자리, type 자리 } from './room';

/**
 * 자리를 **배운다** — 표가 모르는 창은 두뇌에게 물어본다.
 *
 * 78회차에 지금 떠 있는 창을 실제로 세어 봤다. **아홉 중 여섯이 「모름」이었다.**
 *
 * ```
 * 모름   | 설정            읽는중 | GitHub Desktop
 * 모름   | 동반자          보는중 | … | YouTube Music …
 * 통화   | #일반 | KarmoLab - Discord
 * 모름   | NVIDIA GeForce Overlay      모름 | Windows 입력 환경
 * ```
 *
 * 「무슨 자리인지 모르겠다」가 기본값이면 상황 파악은 사실상 없는 것이다. 그런데 **표를 늘리는
 * 건 답이 아니다** — 오늘만 두 번 그러다 당했다(74회차 사건 줍기 · 76회차 메아리 문턱).
 * 사람이 쓰는 프로그램은 사람마다 다르고, 표는 만든 사람이 아는 것까지만 안다.
 *
 * 74회차에 통한 그 수를 그대로 쓴다. **표가 모르면 두뇌에게 물어본다.** 다른 점 하나: 창
 * 제목은 같은 게 계속 돌아오므로 **한 번 물으면 적어 두고 다시는 안 묻는다.** 그래서 물어보는
 * 값이 시간이 갈수록 0 에 수렴한다.
 */

const 갈래들: readonly Exclude<자리, null>[] = ['통화', '보는중', '만드는중', '읽는중', '노는중', '나를보는중'];

export interface 자리배움옵션 {
  path?: string;
  /** 두뇌에게 물어보는 자리. 없으면 표만 쓴다. */
  물어보기?: (제목들: readonly string[]) => Promise<readonly (자리 | null)[] | null>;
  log?: (message: string) => void;
}

export class 자리배움 {
  private readonly 배운것 = new Map<string, 자리>();
  private readonly 물어볼것 = new Set<string>();

  constructor(private readonly options: 자리배움옵션 = {}) {
    if (options.path !== undefined && existsSync(options.path)) {
      try {
        const raw = JSON.parse(readFileSync(options.path, 'utf8')) as Record<string, 자리>;
        for (const [제목, z] of Object.entries(raw ?? {})) this.배운것.set(제목, z);
      } catch {
        // 깨진 파일 때문에 상황 파악이 멈추면 안 된다.
      }
    }
  }

  /**
   * 이 창이 어떤 자리인가. **표 → 배운 것** 순으로 본다.
   *
   * 표가 먼저인 이유: 표는 우리가 뜻을 정해 둔 것이라 두뇌가 뒤집으면 안 된다(우리 창은
   * 우리가 안다). 둘 다 모르면 물어볼 것으로 담아 두고 지금은 모른다고 한다 —
   * **기다리게 하지 않는다.**
   */
  읽기(title: string | null | undefined): 자리 {
    const 제목 = (title ?? '').trim();
    if (제목 === '') return null;
    const 표 = 어떤자리(제목);
    if (표 !== null) return 표;
    const 배움 = this.배운것.get(짧게(제목));
    if (배움 !== undefined) return 배움;
    if (this.물어보기있나) this.물어볼것.add(짧게(제목));
    return null;
  }

  private get 물어보기있나(): boolean {
    return this.options.물어보기 !== undefined;
  }

  get 밀린것(): number {
    return this.물어볼것.size;
  }

  get 아는수(): number {
    return this.배운것.size;
  }

  /**
   * 밀린 제목들을 두뇌에게 물어 적어 둔다. **말하는 길에서 부르지 않는다.**
   *
   * 모른다고 답한 것도 적어 둔다 — 안 적으면 같은 창을 영원히 다시 묻는다.
   */
  async 되새기기(한번에 = 10): Promise<number> {
    const 물어보기 = this.options.물어보기;
    if (물어보기 === undefined || this.물어볼것.size === 0) return 0;
    const 뭉치 = [...this.물어볼것].slice(0, 한번에);
    for (const 제목 of 뭉치) this.물어볼것.delete(제목); // 실패해도 무한히 다시 묻지 않는다

    let 답: readonly (자리 | null)[] | null = null;
    try {
      답 = await 물어보기(뭉치);
    } catch (err) {
      this.options.log?.(`자리를 못 물어봤다 — ${(err as Error)?.message ?? err}`);
      return 0;
    }
    if (답 === null || 답.length !== 뭉치.length) {
      this.options.log?.(`자리 대답이 안 맞는다 — ${뭉치.length}개 물었는데 ${답?.length ?? '없음'}개 왔다`);
      return 0;
    }

    let 배운수 = 0;
    뭉치.forEach((제목, i) => {
      const z = 답![i];
      this.배운것.set(제목, z === undefined ? null : z);
      if (z !== null && z !== undefined) 배운수 += 1;
    });
    this.save();
    if (배운수 > 0) this.options.log?.(`창 ${뭉치.length}개 중 ${배운수}개가 무슨 자리인지 알았다`);
    return 배운수;
  }

  private save(): void {
    if (this.options.path === undefined) return;
    try {
      mkdirSync(dirname(this.options.path), { recursive: true });
      writeFileSync(this.options.path, JSON.stringify(Object.fromEntries(this.배운것), null, 1), 'utf8');
    } catch {
      // 못 남겨도 이번 판에서는 안다.
    }
  }
}

/**
 * 창 제목에서 **바뀌는 부분을 떼어 낸다.**
 *
 * 「Bad Taste ft. Kasane Teto | YouTube Music …」과 「다른 노래 | YouTube Music …」은 같은
 * 자리인데 제목이 다르다. 통째로 열쇠를 삼으면 노래를 바꿀 때마다 새로 물어본다 — 물어보는
 * 값이 영영 안 줄어든다. **뒤쪽**(프로그램 이름이 붙는 자리)만 남긴다.
 */
export function 짧게(제목: string): string {
  const 조각 = 제목.split(/\s[|–—-]\s/).map((x) => x.trim()).filter((x) => x !== '');
  const 뒤 = 조각.length >= 2 ? 조각.slice(-2).join(' - ') : (조각[0] ?? 제목);
  return 뒤.slice(0, 60);
}

/** 두뇌에게 「이 창은 뭐 하는 자리야?」를 묻는 자리. */
export function 자리묻기(ask: (prompt: string) => Promise<string | null>) {
  return async (제목들: readonly string[]): Promise<readonly (자리 | null)[] | null> => {
    if (제목들.length === 0) return [];
    const 목록 = 제목들.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, ' ').slice(0, 80)}`).join('\n');
    const 답 = await ask(
      '아래는 컴퓨터에 떠 있는 창 제목들이다. 각각이 **그 사람이 지금 뭘 하는 자리**인지 골라라.\n' +
        `${갈래들.join(' · ')} · 모름\n\n` +
        '- 통화 = 사람과 통화·회의 중(끼어들면 안 되는 자리)\n' +
        '- 보는중 = 영상·방송을 보는 중 · 노는중 = 게임\n' +
        '- 만드는중 = 코드·그림·글을 만드는 중 · 읽는중 = 문서·웹을 읽는 중\n' +
        '- 나를보는중 = 그 사람의 AI 동반자 창\n' +
        '- 시스템 설정창·알림창처럼 「뭘 하는 중」이라 할 수 없으면 모름\n\n' +
        `한 줄에 하나씩 ${제목들.length}개, 낱말만. 다른 말은 붙이지 마라.\n\n${목록}`,
    );
    if (답 === null) return null;
    const 줄 = 답.split('\n').map((x) => x.trim()).filter((x) => x !== '');
    const 고른것 = 줄
      .map((x) => 갈래들.find((z) => x.includes(z)) ?? (x.includes('모름') ? null : undefined))
      .filter((x) => x !== undefined) as (자리 | null)[];
    // 개수가 안 맞으면 통째로 버린다 — 어긋난 채 적으면 엉뚱한 창이 「통화」가 되어 입을 닫는다.
    return 고른것.length === 제목들.length ? 고른것 : null;
  };
}
