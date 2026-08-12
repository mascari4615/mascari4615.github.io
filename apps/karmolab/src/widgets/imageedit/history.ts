/**
 * 이미지 편집기 — 되돌리기 (TASK-KL-240 · 1단계)
 *
 * 지금까지의 되돌리기는 **화면 통짜 스냅샷**이었다. 4000×3000 한 장이 48MB 이므로 몇 단계
 * 못 쌓고, 「레이어 이름만 바꿨는데 48MB」 같은 낭비가 생긴다. 그래서 커맨드로 바꾼다:
 * 각 동작이 **자기가 무엇을 되돌리는지** 안다.
 *
 * 픽셀 편집은 여기에 더해 **더러워진 사각형만** 저장한다(`pixelPatch`). 1024² 판에 점 하나를
 * 찍으면 4MB 가 아니라 4바이트다. 획이 끝날 때 딱 한 번 굳히므로, 붓질 중에는 아무것도 안 쌓인다.
 *
 * 브라우저를 모른다 — 화면 없이 검사한다.
 */

import { type Surface } from './doc';

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

export interface Rect { x: number; y: number; w: number; h: number }

/** 두 판을 견줘 **달라진 사각형**을 찾는다. 같으면 null. */
export function dirtyRect(before: Surface, after: Surface): Rect | null {
  let minX = before.w, minY = before.h, maxX = -1, maxY = -1;
  const a = before.data;
  const b = after.data;
  for (let y = 0; y < before.h; y += 1) {
    const row = y * before.w * 4;
    for (let x = 0; x < before.w; x += 1) {
      const i = row + x * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 사각형만 떼어 낸다. */
export function cutRect(surface: Surface, rect: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const from = ((rect.y + y) * surface.w + rect.x) * 4;
    out.set(surface.data.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  return out;
}

/** 사각형을 도로 붙인다. */
export function pasteRect(surface: Surface, rect: Rect, pixels: Uint8ClampedArray): void {
  for (let y = 0; y < rect.h; y += 1) {
    const to = ((rect.y + y) * surface.w + rect.x) * 4;
    surface.data.set(pixels.subarray(y * rect.w * 4, (y + 1) * rect.w * 4), to);
  }
}

/**
 * 획 하나를 커맨드로 굳힌다.
 * `before` = 손대기 **전** 판의 사본, `surface` = 지금(이미 그려진) 판.
 * 달라진 데가 없으면 `null` — 빈 획으로 되돌리기 단계를 늘리지 않는다.
 */
export function pixelPatch(
  surface: Surface,
  before: Surface,
  label: string,
  coalesceKey?: string
): Command | null {
  const rect = dirtyRect(before, surface);
  if (!rect) return null;
  const oldPixels = cutRect(before, rect);
  const newPixels = cutRect(surface, rect);
  return {
    label,
    coalesceKey,
    redo: () => pasteRect(surface, rect, newPixels),
    undo: () => pasteRect(surface, rect, oldPixels)
  };
}

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
