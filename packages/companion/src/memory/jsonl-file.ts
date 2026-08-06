import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
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
