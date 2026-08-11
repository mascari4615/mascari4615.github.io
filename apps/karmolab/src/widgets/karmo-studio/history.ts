export interface HistoryResult<T> {
  value: T;
  changed: boolean;
}

export class ProjectHistory<T> {
  private readonly past: string[] = [];
  private readonly future: string[] = [];
  private current: string;
  private mergeKey = '';
  private mergeUntil = 0;

  constructor(initial: T, private readonly normalize: (input: unknown) => T, private readonly limit = 60) {
    this.current = JSON.stringify(initial);
  }

  record(value: T, mergeKey = '', now = Date.now()): boolean {
    const next = JSON.stringify(value);
    if (next === this.current) return false;
    const merge = Boolean(mergeKey) && mergeKey === this.mergeKey && now <= this.mergeUntil && this.past.length > 0;
    if (!merge) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = next;
    this.future.length = 0;
    this.mergeKey = mergeKey;
    this.mergeUntil = mergeKey ? now + 700 : 0;
    return true;
  }

  undo(value: T): HistoryResult<T> {
    return this.restore(value, this.past, this.future);
  }

  redo(value: T): HistoryResult<T> {
    return this.restore(value, this.future, this.past);
  }

  reset(value: T): void {
    this.current = JSON.stringify(value);
    this.past.length = 0;
    this.future.length = 0;
    this.mergeKey = '';
    this.mergeUntil = 0;
  }

  private restore(value: T, from: string[], to: string[]): HistoryResult<T> {
    const serialized = from.pop();
    if (!serialized) return { value, changed: false };
    to.push(this.current);
    this.current = serialized;
    this.mergeKey = '';
    this.mergeUntil = 0;
    return { value: this.normalize(JSON.parse(serialized)), changed: true };
  }
}
