import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryEntry } from '../types';

/**
 * 뜻으로 찾는 기억 — **낱말이 안 겹쳐도 찾는다.**
 *
 * 3회차에 옛 기억 회상을 만들 때 낱말로 찾게 했다. 한국어 어미 때문에 「먹는다고」로는
 * 「먹어」가 안 걸려서, 낱말을 뒤에서부터 깎아 가며 찾는 수를 얹었다. 그래도 **낱말이
 * 하나도 안 겹치면 영영 못 찾는다** — 「매운 거 싫어」와 「마라탕은 못 먹어」가 서로를
 * 못 부른다.
 *
 * 뉴로 쪽이 오래된 것을 꺼내 쓰는 방식이 벡터다. 실측(2026-08-08): 「마라탕은 매워서 못
 * 먹어」 ↔ 「매운 음식 싫어함」 = **0.78**, 딴 얘기 = 0.39. 낱말은 하나도 안 겹친다.
 *
 * 규율 둘:
 * - **기다리게 하지 않는다.** 모델은 처음 뜰 때 수십 초가 걸린다. 준비 안 됐으면 이번
 *   turn 은 낱말 회상만 쓰고 넘어간다 — 첫 소리까지가 이 프로젝트의 핵심 지표다(7·65회차).
 * - **없어도 굴러간다.** 모델을 못 불러오면 뜻 회상만 빠지고 나머지는 그대로다.
 */
export interface 뜻재기 {
  /** 글 하나를 벡터로. 못 재면 null. */
  measure: (content: string) => Promise<readonly number[] | null>;
}

export interface 뜻기억옵션 {
  /** 색인을 담아 둘 파일. 없으면 이 프로세스에서만 산다. */
  path?: string;
  measure: 뜻재기;
  /** 몇 개까지 담아 둘지. 오래된 것부터 빠진다. */
  max?: number;
  /** 이보다 안 닮았으면 안 꺼낸다. 낮추면 엉뚱한 게 딸려 온다. */
  문턱?: number;
  log?: (message: string) => void;
}

interface 담긴줄 {
  text: string;
  at: number;
  v: number[];
}

/** 두 벡터가 얼마나 닮았나 (둘 다 길이 1 로 맞춰져 있다고 본다). */
export function similarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

export class meaningMemory {
  private readonly stored: 담긴줄[] = [];
  private readonly max: number;
  private readonly 문턱: number;
  private readonly log: (message: string) => void;
  private storing = false;

  constructor(private readonly options: 뜻기억옵션) {
    this.max = options.max ?? 2000;
    this.문턱 = options.문턱 ?? 0.5;
    this.log = options.log ?? (() => {});
    this.read();
  }

  get 담긴수(): number {
    return this.stored.length;
  }

  private read(): void {
    const path = this.options.path;
    if (path === undefined || existsSync(path) === false) return;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as 담긴줄[];
      if (Array.isArray(parsed)) {
        for (const line of parsed) {
          if (typeof line?.text === 'string' && Array.isArray(line.v)) this.stored.push(line);
        }
      }
    } catch {
      // 깨진 색인 하나 때문에 얘가 못 뜨면 안 된다 — 없는 셈 치고 다시 담는다.
    }
  }

  private write(): void {
    const path = this.options.path;
    if (path === undefined) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(this.stored), 'utf8');
    } catch {
      // 못 남겨도 이번 판은 멀쩡하다.
    }
  }

  /** 이미 담긴 말인가. */
  private has(text: string): boolean {
    return this.stored.some((line2) => line2.text === text);
  }

  /**
   * 오간 말을 색인에 담는다. **뒤에서 돈다** — 부르는 쪽은 기다리지 않는다.
   *
   * 이미 담긴 것은 건너뛰므로 몇 번을 불러도 값이 안 든다.
   */
  async store(entries: readonly MemoryEntry[]): Promise<number> {
    if (this.storing) return 0;
    this.storing = true;
    let storedCount = 0;
    try {
      for (const e of entries) {
        const content2 = (e.text ?? '').trim();
        // 아주 짧은 말은 뜻이 없다 — 「응」 「뭐」가 색인을 채우면 아무거나 닮아 보인다.
        if (content2.length < 6 || this.has(content2)) continue;
        const v = await this.options.measure.measure(content2);
        if (v === null) break; // 재는 쪽이 아직 준비 안 됐다 — 다음에 다시.
        this.stored.push({ text: content2, at: e.at, v: [...v] });
        storedCount += 1;
      }
      if (this.stored.length > this.max) this.stored.splice(0, this.stored.length - this.max);
      if (storedCount > 0) {
        this.write();
        this.log(`뜻 색인에 ${storedCount}줄 담았다 (총 ${this.stored.length})`);
      }
    } finally {
      this.storing = false;
    }
    return storedCount;
  }

  /**
   * 뜻이 닮은 옛 말을 꺼낸다. 준비 안 됐거나 닮은 게 없으면 빈 목록.
   *
   * 방금 나눈 말은 뺀다 — 두뇌가 이미 보고 있는 걸 또 붙이면 자리만 먹는다.
   */
  async find(
    question: string,
    options: { count?: number; toDrop?: ReadonlySet<string> } = {},
  ): Promise<{ text: string; similar: number }[]> {
    const content3 = question.trim();
    if (content3.length < 2 || this.stored.length === 0) return [];
    const v = await this.options.measure.measure(content3);
    if (v === null) return [];

    const toDrop = options.toDrop ?? new Set<string>();
    return this.stored
      .filter((line3) => toDrop.has(line3.text) === false && line3.text !== content3)
      .map((line4) => ({ text: line4.text, similar: similarity(v, line4.v) }))
      .filter((r) => r.similar >= this.문턱)
      .sort((a, b) => b.similar - a.similar)
      .slice(0, options.count ?? 3);
  }
}

/**
 * 옆에 깔린 작은 모델로 뜻을 재는 자리.
 *
 * **처음 뜰 때 수십 초 걸린다**(실측 54초, 모델을 받아 오는 시간 포함). 그래서 부르는 쪽을
 * 기다리게 하지 않는다 — 준비될 때까지는 `null` 을 돌려주고, 준비되면 그때부터 잰다.
 * 91회차에서 목소리에 쓴 규율과 같다: 무거운 건 뒤에서 켜고, 그 사이엔 하던 대로 한다.
 */
export function measureWithSmallModel(options: { model?: string; log?: (m: string) => void } = {}): 뜻재기 {
  const model = options.model ?? 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const log = options.log ?? (() => {});
  let ready: ((content4: string, opts: unknown) => Promise<{ data: Float32Array }>) | null = null;
  let preparing = false;
  let unavailable = false;

  const prepare = (): void => {
    if (preparing || unavailable || ready !== null) return;
    preparing = true;
    const start = Date.now();
    void import('@huggingface/transformers')
      .then(({ pipeline }) => pipeline('feature-extraction', model))
      .then((p) => {
        ready = p as unknown as (content5: string, opts: unknown) => Promise<{ data: Float32Array }>;
        log(`뜻 재는 자리가 준비됐다 (${Math.round((Date.now() - start) / 1000)}초)`);
      })
      .catch((e) => {
        unavailable = true;
        log(`뜻을 못 재게 됐다 — 낱말로만 찾는다: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => {
        preparing = false;
      });
  };

  return {
    async measure(content6: string): Promise<readonly number[] | null> {
      if (ready === null) {
        prepare();
        return null;
      }
      try {
        const out = await ready(content6, { pooling: 'mean', normalize: true });
        return Array.from(out.data);
      } catch (e) {
        log(`뜻을 재다 실패했다: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
  };
}
