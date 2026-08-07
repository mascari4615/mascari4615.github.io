import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Memory, MemoryEntry } from '../types';

/**
 * 파일에 한 줄씩 쌓는 기억 — 프로세스를 껐다 켜도 이어진다.
 *
 * 형식이 JSONL 인 이유: 이어붙이기만 하면 되므로 여러 몸이 동시에 써도 서로를 덮지 않는다.
 */
export class JsonlFileMemory implements Memory {
  private readonly path: string;
  private cache: MemoryEntry[] | null = null;

  constructor(path: string) {
    this.path = path;
  }

  remember(entry: MemoryEntry): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, 'utf8');
    if (this.cache !== null) this.cache.push(entry);
  }

  recent(limit: number): readonly MemoryEntry[] {
    if (limit <= 0) return [];
    return this.load().slice(-limit);
  }

  /**
   * 낱말이 든 옛 대화를 찾는다. 최신 것부터.
   *
   * 대단한 검색은 아니다 — 낱말이 들어 있으면 걸린다. 그래도 「저번에 그거」에
   * 답하려면 이게 있어야 한다. 없으면 최근 몇 마디 밖은 영영 모른다.
   */
  search(keyword: string, limit = 6): MemoryEntry[] {
    const needle = keyword.trim().toLowerCase();
    if (needle === '') return [];
    const found: MemoryEntry[] = [];
    const all = this.load();
    for (let i = all.length - 1; i >= 0 && found.length < limit; i -= 1) {
      const entry = all[i] as MemoryEntry;
      if (entry.text.toLowerCase().includes(needle)) found.push(entry);
    }
    return found;
  }

  /**
   * 그 낱말이 든 대화를 **지운다**. 몇 줄 지웠는지 돌려준다.
   *
   * 잘못 알게 된 것, 하지 말았어야 할 말, 남기고 싶지 않은 것 — 사람이 지울 수 없는
   * 기억은 기억이 아니라 기록이다. 뉴로사마가 들은 걸 그대로 삼켜 굳은 뒤에야 고쳤던
   * 일이 보여주듯, 지우는 길은 나중에 만들면 늦다.
   */
  forget(keyword: string): number {
    const needle = keyword.trim().toLowerCase();
    if (needle === '') return 0;
    const all = this.load();
    const kept = all.filter((e) => e.text.toLowerCase().includes(needle) === false);
    const removed = all.length - kept.length;
    if (removed === 0) return 0;
    mkdirSync(dirname(this.path), { recursive: true });
    const body = kept.map((e) => JSON.stringify(e)).join('\n');
    writeFileSync(this.path, kept.length > 0 ? `${body}\n` : '', 'utf8');
    this.cache = kept;
    return removed;
  }

  private load(): MemoryEntry[] {
    if (this.cache !== null) return this.cache;
    if (existsSync(this.path) === false) {
      this.cache = [];
      return this.cache;
    }
    const parsed: MemoryEntry[] = [];
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        parsed.push(JSON.parse(trimmed) as MemoryEntry);
      } catch {
        // 깨진 줄 하나가 기억 전체를 못 읽게 만들지 않는다 — 건너뛴다.
      }
    }
    this.cache = parsed;
    return parsed;
  }
}
