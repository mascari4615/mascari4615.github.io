/**
 * Karmo Studio — 끌기 한 판을 맡는 자리 (TASK-KL-220 분리 4단).
 *
 * 전에는 끌기마다(클립·피아노 box·note·자동화 점·세기 막대) 각자 리스너를 달고 각자
 * 「지금 취소할 것」을 덮어썼다. 두 끌기가 겹치면 앞의 것은 취소할 방법을 잃었다.
 * 여기서 한 번에 하나만 살아 있게 하고, 끝맺음(성공/취소)을 정확히 한 번만 부른다.
 */

export interface DragTarget {
  addEventListener(type: string, listener: (event: PointerEvent) => void): void;
  removeEventListener(type: string, listener: (event: PointerEvent) => void): void;
  setPointerCapture?(pointerId: number): void;
  isConnected?: boolean;
}

export interface DragHandlers {
  /** 포인터가 움직일 때마다. */
  move(event: PointerEvent): void;
  /** 손을 뗐을 때. */
  commit?(event: PointerEvent): void;
  /** 취소 — pointercancel · 포인터 뺏김 · Escape · 새 끌기가 시작될 때. */
  cancel?(): void;
}

export interface DragRequest extends DragHandlers {
  /**
   * 이 요소로 pointer capture 를 잡고 리스너도 여기에 단다.
   * 없으면 창에 단다 (요소가 다시 그려져도 끌기가 안 끊긴다).
   */
  capture?: DragTarget | null;
  pointerId?: number;
}

interface Bindings {
  target: DragTarget;
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
  abort: () => void;
  onCancel?: () => void;
}

export class GestureHost {
  private live: Bindings | null = null;

  constructor(private readonly fallback: DragTarget) {}

  get active(): boolean {
    return this.live !== null;
  }

  /**
   * 새 끌기를 시작한다. 앞 끌기가 살아 있으면 **취소하고** 시작한다.
   * capture 요소가 화면에서 빠졌거나 capture 가 실패하면 시작하지 않고 `false` 를 돌려준다.
   */
  begin(request: DragRequest): boolean {
    this.cancel();
    const captureTarget = request.capture ?? null;
    if (captureTarget && captureTarget.isConnected === false) return false;
    if (captureTarget && request.pointerId !== undefined && captureTarget.setPointerCapture) {
      try {
        captureTarget.setPointerCapture(request.pointerId);
      } catch (_) {
        return false;
      }
    }
    const target = captureTarget ?? this.fallback;
    const move = (event: PointerEvent): void => { request.move(event); };
    const up = (event: PointerEvent): void => { this.release(); request.commit?.(event); };
    const abort = (): void => { this.release(); request.cancel?.(); };
    this.live = { target, move, up, abort, onCancel: request.cancel };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', abort);
    target.addEventListener('lostpointercapture', abort);
    return true;
  }

  /** 살아 있는 끌기를 되돌린다. 되돌릴 게 있었으면 `true`. */
  cancel(): boolean {
    const live = this.live;
    if (!live) return false;
    this.release();
    live.onCancel?.();
    return true;
  }

  /** 리스너만 뗀다 — 끝맺음 호출은 부르는 쪽이 한다. */
  private release(): void {
    const live = this.live;
    if (!live) return;
    this.live = null;
    live.target.removeEventListener('pointermove', live.move);
    live.target.removeEventListener('pointerup', live.up);
    live.target.removeEventListener('pointercancel', live.abort);
    live.target.removeEventListener('lostpointercapture', live.abort);
  }
}
