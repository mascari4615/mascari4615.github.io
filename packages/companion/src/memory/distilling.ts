import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { conversationOnly } from '../conversation';
import type { Memory, MemoryEntry } from '../types';

/** 밀려난 대화를 받아 「아는 것」을 새로 써서 돌려준다. */
export type Distiller = (input: {
  /** 지금까지 아는 것 (처음엔 빈 문자열). */
  known: string;
  /** 이번에 밀려난 대화. */
  fading: readonly MemoryEntry[];
}) => Promise<string>;

export interface DistillingMemoryOptions {
  /** 실제로 대화를 담는 기억. */
  inner: Memory;
  /** 졸이는 일을 맡는 쪽 (보통 두뇌). */
  distill: Distiller;
  /** 이만큼 쌓이면 한 번 졸인다. */
  every?: number;
  /** 졸일 때 넘길 대화 개수. */
  batch?: number;
  /**
   * 쌓인 것 중 무엇을 재료로 쓸지 고른다. 기본은 「나눈 말만」.
   *
   * 기본을 「최근 N개 통째」로 두면 곁에서 본 것(화면·조용함)이 재료를 다 차지해
   * 사람에 대해 뽑을 게 남지 않는다 — 실측으로 342턴을 겪고도 아는 것이 텅 비었다.
   */
  pick?: (entries: readonly MemoryEntry[]) => readonly MemoryEntry[];
  /** 재료를 고르려고 훑어볼 범위. 고르고 나면 batch 개만 쓴다. */
  lookBack?: number;
  /** 「아는 것」을 남길 파일. 없으면 프로세스 안에서만 산다. */
  notePath?: string;
  log?: (message: string) => void;
}

/**
 * 졸이는 기억 — 대화가 쌓이면 오래된 쪽을 「아는 것」 한 장으로 접는다.
 *
 * 접는 일은 뒤에서 조용히 돌아간다. 말하는 도중에 멈춰 서서 회상하지 않도록.
 * 졸이기가 실패해도 대화 자체는 멀쩡하다 — 아는 것이 늦게 갱신될 뿐이다.
 */
export class DistillingMemory implements Memory {
  private readonly options: Required<Pick<DistillingMemoryOptions, 'every' | 'batch'>> & DistillingMemoryOptions;
  private sinceLast = 0;
  private known: string;
  private working = false;

  /** 안에 든 진짜 기억. 옛 대화를 뒤지려면 이쪽을 봐야 한다. */
  get inner(): Memory {
    return this.options.inner;
  }

  constructor(options: DistillingMemoryOptions) {
    this.options = { every: 30, batch: 40, ...options };
    this.known = options.notePath && existsSync(options.notePath)
      ? readFileSync(options.notePath, 'utf8').trim()
      : '';
  }

  async remember(entry: MemoryEntry): Promise<void> {
    await this.options.inner.remember(entry);
    this.sinceLast += 1;
    if (this.sinceLast >= this.options.every) {
      this.sinceLast = 0;
      void this.condense();
    }
  }

  recent(limit: number): readonly MemoryEntry[] | Promise<readonly MemoryEntry[]> {
    return this.options.inner.recent(limit);
  }

  longTerm(): string | null {
    return this.known === '' ? null : this.known;
  }

  /**
   * 「아는 것」에서 한 줄을 지운다. 잘못 알았거나 남기고 싶지 않은 것.
   *
   * 대화 쪽도 같이 지우려면 안쪽 기억의 지우기를 따로 부른다 — 여기서 한꺼번에 하지
   * 않는 이유는, 「아는 것만 고치고 싶은 때」와 「흔적까지 지우고 싶은 때」가 다르기 때문이다.
   */
  forgetKnown(line: string): boolean {
    const needle = line.trim();
    if (needle === '' || this.known === '') return false;
    const lines = this.known.split('\n');
    const kept = lines.filter((l) => l.trim() !== needle && l.includes(needle) === false);
    if (kept.length === lines.length) return false;
    this.known = kept.join('\n').trim();
    if (this.options.notePath) {
      mkdirSync(dirname(this.options.notePath), { recursive: true });
      writeFileSync(this.options.notePath, `${this.known}\n`, 'utf8');
    }
    this.options.log?.('아는 것에서 한 줄을 지웠다');
    return true;
  }

  /** 지금 당장 한 번 졸인다 (테스트·종료 직전용). */
  async condense(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      // 넓게 훑어서 나눈 말만 고른다 — 곁에서 본 것이 90% 를 차지하므로,
      // 좁게 떠 오면 재료가 전부 화면 로그가 된다.
      const pick = this.options.pick ?? ((es: readonly MemoryEntry[]) => conversationOnly(es));
      const window = await this.options.inner.recent(this.options.lookBack ?? this.options.batch * 8);
      const fading = pick(window).slice(-this.options.batch);
      if (fading.length === 0) return;
      const next = (await this.options.distill({ known: this.known, fading })).trim();
      if (next === '') return;
      this.known = next;
      if (this.options.notePath) {
        mkdirSync(dirname(this.options.notePath), { recursive: true });
        writeFileSync(this.options.notePath, `${next}\n`, 'utf8');
      }
      this.options.log?.(`아는 것을 갱신했다 (${next.length}자)`);
    } catch (e) {
      // 졸이기 실패는 대화를 막지 않는다 — 다음 기회에 다시 접는다.
      this.options.log?.(`아는 것을 갱신하지 못했다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.working = false;
    }
  }
}

/** 두뇌를 그대로 졸이는 데 쓰는 기본 방식. */
export function brainDistiller(think: (prompt: string) => Promise<string | null>): Distiller {
  return async ({ known, fading }) => {
    const transcript = fading
      // 화자를 또렷이 적는다. 「나」 와 「[web]」 만 있으면 두뇌가 누구 얘긴지 헷갈려
      // 얘 자신의 성향을 사람의 것인 양 적어 넣는다 (실측 16회차).
      .map((e) => `${e.role === 'said' ? '나(동반자)' : '조수님'}: ${e.text}`)
      .join('\n');
    const head = known === '' ? '아직 아는 게 없다.' : `지금까지 아는 것:\n${known}`;
    const prompt =
      `${head}\n\n최근에 오간 말:\n${transcript}\n\n` +
      '위를 반영해서 「조수님에 대해 아는 것」을 다시 써라. 규칙:\n' +
      '- **조수님에 대한 것만.** 「나(동반자)」 가 한 말은 조수님을 알아내는 단서로만 써라 — ' +
      '거기 드러난 내 성향을 조수님의 것으로 적지 마라.\n' +
      '- 사실만. 조수님이 누구고 뭘 하고 뭘 좋아하고 뭘 싫어하는지.\n' +
      '- 오래 쓸모 있는 것만. 지나가는 잡담은 버려라.\n' +
      '- 짧은 항목들로. 20줄을 넘기지 마라.\n' +
      '- 새로 안 게 없으면 지금까지 아는 것을 그대로 돌려줘라.\n' +
      '- 설명이나 머리말 없이 그 목록만. 「아는 것이 없습니다」 같은 말도 붙이지 마라 — ' +
      '적을 게 없으면 지금까지 아는 것을 그대로 두면 된다.';
    return (await think(prompt)) ?? known;
  };
}
