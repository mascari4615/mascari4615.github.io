import type { Memory, MemoryEntry } from '../types';

/** 프로세스가 살아있는 동안만 남는 기억. 기본값. */
export class InMemoryMemory implements Memory {
  private readonly entries: MemoryEntry[] = [];
  private readonly cap: number;

  constructor(cap = 500) {
    this.cap = cap;
  }

  remember(entry: MemoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.cap) this.entries.splice(0, this.entries.length - this.cap);
  }

  recent(limit: number): readonly MemoryEntry[] {
    if (limit <= 0) return [];
    return this.entries.slice(-limit);
  }

  /** 전부 (테스트·디버깅용). */
  all(): readonly MemoryEntry[] {
    return this.entries.slice();
  }
}
