import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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

  /** 지금 당장 한 번 졸인다 (테스트·종료 직전용). */
  async condense(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const fading = await this.options.inner.recent(this.options.batch);
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
      .map((e) => `${e.role === 'said' ? '나' : `[${e.channel}]`}: ${e.text}`)
      .join('\n');
    const head = known === '' ? '아직 아는 게 없다.' : `지금까지 아는 것:\n${known}`;
    const prompt =
      `${head}\n\n최근에 오간 말:\n${transcript}\n\n` +
      '위를 반영해서 「이 사람에 대해 아는 것」을 다시 써라. 규칙:\n' +
      '- 사실만. 이 사람이 누구고 뭘 하고 뭘 좋아하고 뭘 싫어하는지.\n' +
      '- 오래 쓸모 있는 것만. 지나가는 잡담은 버려라.\n' +
      '- 짧은 항목들로. 20줄을 넘기지 마라.\n' +
      '- 새로 안 게 없으면 지금까지 아는 것을 그대로 돌려줘라.\n' +
      '- 설명이나 머리말 없이 그 목록만.';
    return (await think(prompt)) ?? known;
  };
}
