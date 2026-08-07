import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryEntry } from '../types';

/**
 * 그때 그 일 — 감정이 실린 순간만 따로 남긴다.
 *
 * 기억 쪽 레퍼런스가 공통으로 짚는 것: **감정이 실린 일은 오래 남고, 나머지는 흐려진다.**
 * 사람 기억이 그렇고, 그래서 오래 쓰는 동반자도 그렇게 만든다.
 *
 * 우리 기억은 두 겹이었다 — 최근 몇 마디, 그리고 졸여서 만든 **사실 목록**. 사실 목록은
 * 오래 쓸모 있는 것만 남기라고 시켰더니 **사건이 통째로 사라졌다.** 「지난주에 발표
 * 망했다고 속상해했다」가 「발표를 했다」로 줄거나 아예 빠진다. 그런데 사람이 다시
 * 꺼내고 싶은 건 사실이 아니라 그 순간이다.
 *
 * 그래서 세 번째 겹을 둔다. **감정이 실린 순간만** 그대로 남긴다 — 졸이지 않고, 말한
 * 그대로. 몇 개 안 되므로 오래 들고 있어도 무겁지 않다.
 *
 * 좁게 잡는다. 아무 말이나 사건으로 세면 「오늘 점심 뭐 먹었어」가 다음 달에 튀어나온다.
 */

export interface Episode {
  /** 그때 한 말, 그대로. */
  said: string;
  at: number;
  /** 얼마나 감정이 실렸나. 자리가 모자랄 때 무엇을 버릴지 정한다. */
  기운: number;
}

/** 감정이 실렸다는 표시들. */
const 실린말 = [
  '진짜', '너무', '완전', '엄청', '개', '미치', '大',
  '속상', '슬프', '슬퍼', '화나', '짜증', '억울', '무섭', '두렵', '싫어', '싫다',
  '기쁘', '행복', '신나', '좋아', '설레', '뿌듯', '고맙', '감동',
  '망했', '망함', '큰일', '드디어', '해냈', '됐다', '성공', '실패', '포기',
];

/** 이 말이 얼마나 사건 같은가. 0 이면 그냥 지나가는 말. */
export function 기운재기(text: string): number {
  const 말 = text.trim();
  if (말.length < 6) return 0; // 「응」 「ㅇㅇ」 같은 건 사건이 아니다
  let 점수 = 0;
  for (const 표시 of 실린말) if (말.includes(표시)) 점수 += 2;
  점수 += Math.min(2, (말.match(/[!?]/g) ?? []).length);
  // 물음표만 잔뜩인 건 감정이 아니라 질문이다.
  if (/[?]/.test(말) && 점수 <= 2) 점수 = 0;
  // 길게 털어놓은 말은 그 자체로 사건일 때가 많다.
  if (말.length > 40) 점수 += 1;
  return 점수;
}

export interface EpisodeStoreOptions {
  /** 남겨 둘 파일. */
  path?: string;
  /** 몇 개까지 들고 있을까. */
  keep?: number;
  /** 이 점수 아래는 사건으로 안 센다. */
  문턱?: number;
  /**
   * 낱말 표가 놓친 말을 **두뇌에게 물어본다.** 0~9 를 말 개수만큼 돌려줘야 한다.
   *
   * 없으면 낱말 표만 쓴다 — 그때는 그때대로 돌아가되, 놓치는 게 많다는 걸 알고 쓰는 것이다.
   */
  물어보기?: (말들: readonly string[]) => Promise<readonly number[] | null>;
  log?: (message: string) => void;
}

/**
 * 두뇌에게 물어볼 만한 말인가 — **아무거나 물으면 그게 값이다.**
 *
 * 「응」 「ㅇㅇ」 같은 건 물어볼 것도 없고, 얘한테 시키는 말(「짧게 설명해줘」)도 사건이
 * 아니다. 실제 기록을 보니 사람 말 197개 중 113개가 낱말 세 개도 안 됐다.
 */
function 물어볼만한가(text: string): boolean {
  const 말 = text.trim();
  if (말.length < 8) return false;
  return (말.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? []).length >= 3;
}

export class EpisodeStore {
  private 목록: Episode[] = [];
  /** 낱말 표가 못 잡아서 두뇌에게 물어볼 말들 (말 → 그때 시각). */
  private readonly 물어볼것 = new Map<string, number>();
  private readonly options: Required<Pick<EpisodeStoreOptions, 'keep' | '문턱'>> & EpisodeStoreOptions;

  constructor(options: EpisodeStoreOptions = {}) {
    this.options = { keep: 40, 문턱: 3, ...options };
    if (options.path !== undefined && existsSync(options.path)) {
      try {
        const raw = JSON.parse(readFileSync(options.path, 'utf8')) as Episode[];
        if (Array.isArray(raw)) this.목록 = raw.filter((e) => typeof e?.said === 'string');
      } catch {
        // 깨진 파일 때문에 대화가 멈추면 안 된다.
      }
    }
  }

  get all(): readonly Episode[] {
    return this.목록;
  }

  /**
   * 오간 말에서 사건을 줍는다.
   *
   * **사람이 한 말만 센다.** 얘가 한 말을 사건으로 세면 제가 흥분한 걸 사람의 일로
   * 기억한다 — 같은 뿌리를 이미 네 번 밟았다(16·23·48·53회차).
   */
  learn(entries: readonly MemoryEntry[]): number {
    let 담은수 = 0;
    for (const e of entries) {
      if (e.role !== 'sensed' || e.channel !== 'web') continue;
      if (this.있나(e.text)) continue;
      const 기운 = 기운재기(e.text);
      if (기운 < this.options.문턱) {
        // 낱말 표가 못 잡았다고 사건이 아닌 건 아니다 — 나중에 두뇌에게 물어본다.
        if (물어볼만한가(e.text)) this.물어볼것.set(e.text.trim(), e.at);
        continue;
      }
      this.담기({ said: e.text.trim(), at: e.at, 기운 });
      담은수 += 1;
    }
    if (담은수 === 0) return 0;
    this.정리();
    return 담은수;
  }

  /** 이 말이 이미 사건으로 들어와 있나. */
  private 있나(text: string): boolean {
    const 말 = text.trim();
    return this.목록.some((있던것) => 있던것.said === 말);
  }

  private 담기(e: Episode): void {
    this.목록.push(e);
  }

  private 정리(): void {
    // 자리가 모자라면 **기운이 약한 것부터** 버린다. 오래됐다고 버리면 정작 큰일이
    // 먼저 사라진다 — 사람은 오래된 큰일을 더 오래 기억한다.
    if (this.목록.length > this.options.keep) {
      this.목록.sort((a, b) => b.기운 - a.기운 || b.at - a.at);
      this.목록 = this.목록.slice(0, this.options.keep);
    }
    this.목록.sort((a, b) => a.at - b.at);
    this.save();
  }

  /** 두뇌에게 물어볼 것이 몇 개 밀려 있나. */
  get 밀린것(): number {
    return this.물어볼것.size;
  }

  /**
   * 낱말 표가 놓친 말을 **두뇌에게 물어본다.**
   *
   * 대답을 기다리느라 답이 늦어지면 안 되므로 **말하는 길에서 부르지 않는다** — 한 turn 이
   * 끝난 뒤에 따로 부른다. 실패하면 조용히 넘어가지 않고 적는다.
   */
  async 되새기기(한번에 = 8): Promise<number> {
    const 물어보기 = this.options.물어보기;
    if (물어보기 === undefined || this.물어볼것.size === 0) return 0;

    const 뭉치 = [...this.물어볼것.entries()].slice(0, 한번에);
    for (const [말] of 뭉치) this.물어볼것.delete(말); // 실패해도 같은 걸 무한히 다시 묻지 않는다
    let 점수들: readonly number[] | null = null;
    try {
      점수들 = await 물어보기(뭉치.map(([말]) => 말));
    } catch (err) {
      this.options.log?.(`되새기다 실패 — ${(err as Error)?.message ?? err}`);
      return 0;
    }
    if (점수들 === null || 점수들.length !== 뭉치.length) {
      this.options.log?.(`되새김 대답이 안 맞는다 — ${뭉치.length}개 물었는데 ${점수들?.length ?? '없음'}개 왔다`);
      return 0;
    }

    let 담은수 = 0;
    뭉치.forEach(([말, at], i) => {
      const 기운 = Math.round(점수들![i]);
      if (Number.isFinite(기운) === false || 기운 < this.options.문턱 || this.있나(말)) return;
      this.담기({ said: 말, at, 기운 });
      담은수 += 1;
    });
    if (담은수 > 0) {
      this.정리();
      this.options.log?.(`${뭉치.length}개 중 ${담은수}개를 사건으로 담았다`);
    }
    return 담은수;
  }

  /** 지금 이 말과 이어지는 옛 일. 없으면 null. */
  related(now말: string, 최소겹침 = 2, now = Date.now()): Episode | null {
    const 낱말 = 뽑기(now말);
    if (낱말.length === 0) return null;
    let 가장 = null as Episode | null;
    let 가장점수 = -1;
    for (const e of this.목록) {
      const 겹침 = 겹치는수(낱말, e.said);
      if (겹침 < 최소겹침) continue;
      const 점수 = 떠오름점수(e, 낱말.length, 겹침, now);
      if (점수 > 가장점수) { 가장 = e; 가장점수 = 점수; }
    }
    return 가장;
  }

  forget(조각: string): boolean {
    const 전 = this.목록.length;
    this.목록 = this.목록.filter((e) => e.said.includes(조각) === false);
    if (this.목록.length === 전) return false;
    this.save();
    return true;
  }

  private save(): void {
    if (this.options.path === undefined) return;
    try {
      mkdirSync(dirname(this.options.path), { recursive: true });
      writeFileSync(this.options.path, JSON.stringify(this.목록, null, 1), 'utf8');
    } catch {
      // 못 남겨도 이번 판에서는 안다.
    }
  }
}

/**
 * 견줄 만한 낱말만 남긴다.
 *
 * **앞 두 글자로 견준다.** 한국어는 같은 말이 「속상해 / 속상하다 / 속상했어」로 계속
 * 모양을 바꾼다 — 통째로 견주면 같은 일을 얘기하는데도 하나도 안 겹친다(실측). 앞
 * 두 글자는 대개 그대로 남는다. 조사·한 글자 말은 아무 데나 겹치므로 버린다.
 */
function 뽑기(text: string): string[] {
  return (text.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? [])
    .map((w) => w.replace(/(은|는|이|가|을|를|에|의|도|만|로|와|과)$/, ''))
    .filter((w) => w.length >= 2)
    .map((w) => w.slice(0, 2));
}

/** 이 옛 일이 지금 말과 몇 낱말이나 겹치나. */
export function 겹치는수(지금낱말: readonly string[], 그때말: string): number {
  const 그때 = new Set(뽑기(그때말));
  return 지금낱말.filter((w) => 그때.has(w)).length;
}

/** 오래된 일이 절반쯤 흐려지는 데 걸리는 날. */
const 반감기 = 14;

/**
 * 어느 옛 일이 지금 떠오르나 — **겹침만으로 고르면 안 된다.**
 *
 * 여태 겹치는 낱말 수가 가장 많은 것 하나를 골랐다. 그런데 똑같이 두 개씩 겹치면 목록에서
 * **먼저 만난 것**이 이겼고, 목록은 시간순이라 결국 **가장 오래되고 사소한 일**이 이겼다.
 * 큰일을 따로 남겨 두고도 정작 꺼낼 때는 그 큰일이 진 것이다.
 *
 * 레퍼런스(Generative Agents, UIST 2023)가 같은 자리를 셋으로 나눈다 — **이어짐 · 큰일 ·
 * 최근**. 셋을 더해서 고른다. 우리도 그렇게 한다. 다만 무게는 우리 쪽 사정에 맞춘다.
 *
 * - **이어짐이 가장 세다.** 안 겹치는 얘기가 튀어나오는 게 제일 이상하다. 겹친 수를 그대로
 *   쓰면 말이 길수록 이기므로, 지금 말의 낱말 수로 나눠 견준다.
 * - **큰일이 최근을 이긴다.** 사람은 오래된 큰일을 어제 점심보다 더 잘 꺼낸다. 그래서
 *   최근은 셋 중 가장 약하게만 얹는다 — 비기는 자리를 가르는 정도.
 */
export function 떠오름점수(e: Episode, 지금낱말수: number, 겹침: number, now: number): number {
  const 이어짐 = Math.min(1, 겹침 / Math.max(2, 지금낱말수));
  const 큰일 = Math.min(1, e.기운 / 6);
  const 지난날 = Math.max(0, (now - e.at) / (24 * 60 * 60_000));
  const 최근 = 0.5 ** (지난날 / 반감기);
  return 0.5 * 이어짐 + 0.35 * 큰일 + 0.15 * 최근;
}

/**
 * 두뇌에게 「이거 기억할 만한 일이야?」를 묻는 자리.
 *
 * **낱말 표로는 안 된다는 걸 재서 알았다.** 실제 기록에서 사람 말 197개가 오갔는데 사건으로
 * 담긴 건 **둘**이었다. 「오늘 회의가 길어서 좀 지쳤어」 「엄마랑 좀 다퉜어」 「발표 준비
 * 하나도 못 했는데 내일이야」 — 전부 0점이었다. 표에 든 낱말이 하나도 안 들어 있어서다.
 * 표를 늘려도 다음 말에서 또 놓친다. 사람 말은 표에 안 담긴다.
 *
 * 레퍼런스(Generative Agents)가 여기서 하는 건 **두뇌에게 점수를 물어보는 것**이다. 우리도
 * 두뇌가 이미 있으니 물어본다. 다만 **말하는 길에서는 안 부른다** — 답이 늦어지면 그게 더
 * 큰 손해다. 한 turn 끝나고 따로 부른다.
 */
export function 기운묻기(ask: (prompt: string) => Promise<string | null>) {
  return async (말들: readonly string[]): Promise<readonly number[] | null> => {
    if (말들.length === 0) return [];
    const 목록 = 말들.map((말, i) => `${i + 1}. ${말.replace(/\s+/g, ' ').slice(0, 120)}`).join('\n');
    const 답 = await ask(
      '아래는 사람이 한 말들이다. 각각이 **나중에 다시 꺼낼 만한 일**인지 0~9 로 매겨라.\n' +
        '0 = 그냥 지나가는 말 · 3 = 기억해 둘 만함 · 7 이상 = 오래 남을 일(크게 기뻤거나 힘들었거나 큰 변화).\n' +
        '지시·부탁·질문은 사건이 아니다 — 0 이다.\n' +
        `숫자만 줄바꿈으로 ${말들.length}개, 다른 말은 붙이지 마라.\n\n${목록}`,
    );
    if (답 === null) return null;
    /* **줄마다 마지막 숫자**를 본다. 통째로 숫자를 긁으면 두뇌가 「1. 5」처럼 번호를 붙여
       답할 때 그 번호까지 점수로 센다 — 세 개 물었는데 [1,5,2] 가 나왔다(실측). */
    const 숫자 = 답
      .split('\n')
      .map((줄) => (줄.match(/\d+/g) ?? []).pop())
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .slice(0, 말들.length);
    // 개수가 안 맞으면 **억지로 맞추지 않는다** — 어긋난 채 담으면 엉뚱한 말이 큰일이 된다.
    return 숫자.length === 말들.length ? 숫자 : null;
  };
}

/** 얼마나 지난 일인지 사람이 쓰는 말로. */
export function 언제쯤(at: number, now: number): string {
  const 날 = Math.floor((now - at) / (24 * 60 * 60_000));
  if (날 >= 30) return '한참 전에';
  if (날 >= 7) return '지난주쯤';
  if (날 >= 2) return `${날}일 전에`;
  if (날 >= 1) return '어제';
  return '아까';
}

/**
 * 두뇌에 얹을 한 줄 — **이어지는 옛 일이 있을 때만.**
 *
 * 늘 붙이면 「기억하는 척」이 되고, 재료만 먹는다. 진짜로 겹칠 때만 꺼낸다.
 */
export function episodeNote(store: EpisodeStore, 지금말: string, now: number): string {
  const 그때 = store.related(지금말, 2, now);
  if (그때 === null) return '';
  return (
    `${언제쯤(그때.at, now)} 조수님이 이런 말을 했다: 「${그때.said.slice(0, 60)}」. ` +
    '이어지는 얘기면 그때 일을 아는 티를 내라 — 다만 캐묻지는 마라.'
  );
}
