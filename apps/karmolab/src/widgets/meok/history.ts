/**
 * 「먹」 — 되돌리기 중 **그림에만 있는 부분** (TASK-KL-240 · 1단계 / KL-254 에서 분리)
 *
 * 커맨드 스택 자체는 `lib/history` 로 옮겼다 — 그림이든 도형이든 똑같은 일이기 때문이다.
 * 여기 남은 것은 픽셀 판을 알아야만 할 수 있는 것: **더러워진 사각형만** 담기(`pixelPatch`).
 * 1024² 판에 점 하나를 찍으면 4MB 가 아니라 4바이트다. 획이 끝날 때 딱 한 번 굳히므로
 * 붓질 중에는 아무것도 안 쌓인다.
 *
 * 브라우저를 모른다 — 화면 없이 검사한다.
 */

import { type Surface } from './doc';
import { type Command } from '../../lib/history';

// 쓰던 곳들이 계속 이 파일 하나만 보면 되게 다시 내보낸다(부르는 자리를 흔들지 않는다).
export { History, fieldChange, type Command, type HistoryEntry } from '../../lib/history';

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
