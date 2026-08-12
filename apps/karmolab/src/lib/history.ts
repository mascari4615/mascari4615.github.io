/**
 * 되돌리기 — 커맨드 스택 (공용)
 *
 * 되돌리기를 **화면 통짜 스냅샷**으로 하면 4000×3000 한 장이 48MB 라 몇 단계 못 쌓고,
 * 「이름만 바꿨는데 48MB」 같은 낭비가 생긴다. 그래서 커맨드로 든다: 각 동작이 **자기가
 * 무엇을 되돌리는지** 안다.
 *
 * 여기 있는 것은 그림에도 도형에도 표에도 똑같이 맞는 부분뿐이다 — 무엇을 되돌리는지는
 * 커맨드가 알고, 이 스택은 순서와 묶기만 안다. 그림 전용(더러워진 사각형만 담기)은
 * `widgets/meok/history.ts` 에 남는다. 그건 픽셀 판을 알아야 하는 일이라 공용이 아니다.
 *
 * 브라우저를 모른다 — 화면 없이 검사한다.
 * (「먹」의 TASK-KL-240 에서 자라났고, TASK-KL-254 에서 공용으로 올렸다.)
 */

export interface Command {
  label: string;
  redo(): void;
  undo(): void;
  /**
   * 같은 열쇠가 이어지면 한 동작으로 묶는다(슬라이더를 끄는 동안 100단계가 쌓이지 않게).
   * 묶을 때 새 커맨드의 `redo` 만 살아남고, 되돌리기는 **처음 것**으로 돌아간다.
   */
  coalesceKey?: string;
}

export interface HistoryEntry {
  label: string;
  at: number;
}

export class History {
  private done: Command[] = [];
  private undone: Command[] = [];
  private limit: number;
  private lastKey = '';
  private lastAt = 0;
  /** 묶는 시간 창(ms). 이보다 오래 쉬면 같은 열쇠라도 새 단계. */
  private mergeWindow: number;
  private listeners: Array<() => void> = [];

  constructor(limit = 200, mergeWindow = 900) {
    this.limit = Math.max(1, limit);
    this.mergeWindow = mergeWindow;
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private emit(): void { this.listeners.forEach(fn => fn()); }

  /**
   * 이미 **적용된** 동작을 기록한다(다시 실행하지 않는다 — 화면은 벌써 그렇게 돼 있다).
   * 새 동작이 들어오면 앞으로가기(redo) 가지는 버린다.
   */
  push(command: Command, now = Date.now()): void {
    const key = command.coalesceKey;
    const merged = !!key
      && key === this.lastKey
      && now - this.lastAt <= this.mergeWindow
      && this.done.length > 0;
    if (merged) {
      /* 되돌리기는 처음 것으로, 다시하기는 마지막 것으로 — 둘을 한 커맨드로 꿰맨다. */
      const first = this.done[this.done.length - 1];
      this.done[this.done.length - 1] = {
        label: command.label,
        coalesceKey: key,
        redo: () => command.redo(),
        undo: () => first.undo()
      };
    } else {
      this.done.push(command);
      if (this.done.length > this.limit) this.done.shift();
    }
    this.undone.length = 0;
    this.lastKey = key || '';
    this.lastAt = now;
    this.emit();
  }

  /** 만들면서 바로 실행한다 — 「하기」와 「기록」을 두 번 안 적게. */
  run(command: Command, now = Date.now()): void {
    command.redo();
    this.push(command, now);
  }

  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }
  /** 다음에 되돌릴 동작 이름 — 「되돌리기: 붓」처럼 화면에 보여 준다. */
  get undoLabel(): string { return this.done.length ? this.done[this.done.length - 1].label : ''; }
  get redoLabel(): string { return this.undone.length ? this.undone[this.undone.length - 1].label : ''; }
  get depth(): number { return this.done.length; }

  undo(): boolean {
    const command = this.done.pop();
    if (!command) return false;
    command.undo();
    this.undone.push(command);
    this.lastKey = '';
    this.emit();
    return true;
  }

  redo(): boolean {
    const command = this.undone.pop();
    if (!command) return false;
    command.redo();
    this.done.push(command);
    this.lastKey = '';
    this.emit();
    return true;
  }

  clear(): void {
    this.done.length = 0;
    this.undone.length = 0;
    this.lastKey = '';
    this.emit();
  }
}

/* ===== 픽셀 편집 — 더러워진 사각형만 ===== */

/** 값 하나 바꾸기(이름·불투명도·블렌드…) — 되돌릴 것이 옛 값 하나뿐일 때. */
export function fieldChange<T, K extends keyof T>(
  target: T,
  key: K,
  next: T[K],
  label: string,
  coalesceKey?: string
): Command {
  const previous = target[key];
  return {
    label,
    coalesceKey,
    redo: () => { target[key] = next; },
    undo: () => { target[key] = previous; }
  };
}
