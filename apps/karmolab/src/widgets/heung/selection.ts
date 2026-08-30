/**
 * 흥. multi-selection store (TASK-KL-220).
 *
 * 단일 `StudioSelection` 은 "지금 인스펙터가 보는 대상" 하나만 표현한다.
 * DAW 편집은 여러 clip / note 를 한 번에 옮기고 지우고 복제하므로,
 * focus 와 별개로 "표시된 묶음" 을 따로 들고 있어야 한다.
 *
 * 이 모듈은 DOM 을 모른다. 순수 자료구조 + 기하 판정이라 단위 테스트로 닫힌다.
 */

export interface ClipRef {
  trackId: string;
  clipId: string;
}

export interface NoteRef {
  clipId: string;
  noteId: string;
}

/** 좌클릭 = replace, Ctrl/Cmd = toggle, Shift = add. */
export type MarkMode = 'replace' | 'toggle' | 'add';

export function markMode(event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): MarkMode {
  if (event.ctrlKey || event.metaKey) return 'toggle';
  if (event.shiftKey) return 'add';
  return 'replace';
}

export function clipKey(ref: ClipRef): string {
  return `${ref.trackId}\0${ref.clipId}`;
}

export function noteKey(ref: NoteRef): string {
  return `${ref.clipId}\0${ref.noteId}`;
}

/** key 로 동일성을 판단하는 순서 보존 집합. */
export class RefMarks<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly key: (ref: T) => string) {}

  get size(): number {
    return this.entries.size;
  }

  has(ref: T): boolean {
    return this.entries.has(this.key(ref));
  }

  list(): T[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }

  add(ref: T): void {
    this.entries.set(this.key(ref), ref);
  }

  remove(ref: T): void {
    this.entries.delete(this.key(ref));
  }

  replace(refs: T[]): void {
    this.entries.clear();
    for (const ref of refs) this.add(ref);
  }

  /**
   * 클릭 1회의 결과를 적용한다. `replace` 로 이미 표시된 대상을 다시 클릭하면
   * 묶음을 유지한다. 묶음 drag 를 시작하려면 첫 pointerdown 이 묶음을 깨면 안 된다.
   */
  apply(ref: T, mode: MarkMode): void {
    if (mode === 'toggle') {
      if (this.has(ref)) this.remove(ref);
      else this.add(ref);
      return;
    }
    if (mode === 'add') {
      this.add(ref);
      return;
    }
    if (this.has(ref) && this.entries.size > 1) return;
    this.replace([ref]);
  }

  /** 프로젝트에서 사라진 참조를 떨어낸다 (삭제, undo 후). */
  prune(alive: (ref: T) => boolean): void {
    for (const [key, ref] of [...this.entries]) {
      if (!alive(ref)) this.entries.delete(key);
    }
  }
}

export function clipMarks(): RefMarks<ClipRef> {
  return new RefMarks<ClipRef>(clipKey);
}

export function noteMarks(): RefMarks<NoteRef> {
  return new RefMarks<NoteRef>(noteKey);
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** drag 시작점과 현재점으로 정규화된 사각형을 만든다 (역방향 drag 포함). */
export function dragRect(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    right: Math.max(ax, bx),
    bottom: Math.max(ay, by)
  };
}

export function rectOverlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** box selection 이 의미 있는 크기인지. 손떨림 클릭을 drag 로 오인하지 않는다. */
export function isBoxDrag(rect: Rect, threshold = 4): boolean {
  return rect.right - rect.left >= threshold || rect.bottom - rect.top >= threshold;
}
