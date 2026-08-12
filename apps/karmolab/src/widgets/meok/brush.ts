/**
 * 「먹」 — 붓 (TASK-KL-240 · 2단계)
 *
 * 붓의 어려움은 「점을 찍는 것」이 아니라 **한 획이 한 겹으로 보이는 것**이다.
 * 도장을 그때그때 캔버스에 겹쳐 찍으면, 천천히 그은 자리마다 도장이 여러 번 겹쳐 진해진다
 * (반투명 붓으로 그으면 바로 티가 난다). 그래서 포토샵·클립스튜디오가 하는 대로 한다:
 *
 *   ① 획 하나 동안은 캔버스가 아니라 **획 마스크**(픽셀당 0..1)에 `max` 로 쌓는다 → 겹쳐도 안 진해진다
 *   ② 화면에 보일 때만 「원본 + 획 마스크 × 불투명도」를 합성한다
 *   ③ 손을 떼면 그 합성 결과가 그대로 굳는다
 *
 * 그리는 사람이 느끼는 것 셋도 여기 있다:
 *   - **흐름(flow)** — 한 도장이 마스크에 더하는 양. 낮으면 여러 번 지나야 진해진다.
 *   - **손떨림 보정(smoothing)** — 실제 커서를 바로 안 따라가고 끌려온다.
 *   - **필압** — 굵기·짙기에 각각 얼마나 반영할지 따로 고른다.
 *
 * 브라우저를 모른다 — 판(`Surface`)만 받는다.
 */

import { cloneSurface, type Surface } from './doc';

export type BrushMode = 'paint' | 'erase';

export interface BrushSettings {
  /** 지름(px) */
  size: number;
  /** 0 = 완전히 흐릿, 1 = 딱 떨어지는 가장자리 */
  hardness: number;
  /** 획 전체의 짙기 0..1 */
  opacity: number;
  /** 도장 한 번이 쌓는 양 0..1 */
  flow: number;
  /** 지름 대비 도장 간격 0.01..1 */
  spacing: number;
  /** 손떨림 보정 0(없음)..0.95 */
  smoothing: number;
  mode: BrushMode;
  /** 픽셀 모드 — 도장이 안티에일리어싱 없는 정사각형이고 격자에 붙는다. */
  pixel: boolean;
  /** 픽셀 모드 격자 한 칸(px). 1 = 원본 해상도. */
  grid: number;
  color: [number, number, number];
  /** 필압이 굵기/짙기에 미치는 정도 0..1 */
  pressureSize: number;
  pressureFlow: number;
}

export const defaultBrush = (): BrushSettings => ({
  size: 24, hardness: 0.8, opacity: 1, flow: 1, spacing: 0.12, smoothing: 0.4,
  mode: 'paint', pixel: false, grid: 1, color: [24, 24, 32],
  pressureSize: 1, pressureFlow: 0.35
});

export interface StrokePoint { x: number; y: number; pressure?: number }

export interface Rect { x: number; y: number; w: number; h: number }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 획 하나. `begin` → `move`* → `end`.
 * 캔버스를 직접 안 만진다: 원본 사본을 들고, 그릴 때마다 **더러워진 자리만** 다시 합성한다.
 */
export class Stroke {
  readonly surface: Surface;
  readonly base: Surface;
  private settings: BrushSettings;
  /** 획 마스크 — 이 획이 각 픽셀을 얼마나 덮었나 0..1 */
  private mask: Float32Array;
  private last: StrokePoint | null = null;
  /** 보정된(끌려오는) 커서 자리 */
  private eased: StrokePoint | null = null;
  /** 도장 간격을 채우고 남은 거리 */
  private carry = 0;
  private minX = Infinity; private minY = Infinity; private maxX = -Infinity; private maxY = -Infinity;

  /** 고른 자리 밖에는 안 그린다(픽셀당 0..255). 없으면 판 전체가 대상. */
  private selection: Uint8Array | null;

  constructor(surface: Surface, settings: BrushSettings, selection?: Uint8Array | null) {
    this.surface = surface;
    this.base = cloneSurface(surface);
    this.settings = { ...settings };
    this.mask = new Float32Array(surface.w * surface.h);
    this.selection = selection && selection.length === surface.w * surface.h ? selection : null;
  }

  /** 이 획이 건드린 사각형. 아무것도 안 그렸으면 null. */
  get dirty(): Rect | null {
    if (this.maxX < this.minX) return null;
    return { x: this.minX, y: this.minY, w: this.maxX - this.minX + 1, h: this.maxY - this.minY + 1 };
  }

  begin(point: StrokePoint): void {
    const start = this.snap(point);
    this.last = start;
    this.eased = start;
    this.carry = 0;
    this.stamp(start);
    this.flush();
  }

  move(point: StrokePoint): void {
    if (!this.last || !this.eased) return this.begin(point);
    const target = this.snap(point);
    /* 손떨림 보정 — 커서를 바로 안 쫓고 끌려온다. 값이 클수록 선이 매끈해지고 반응이 늦다. */
    const k = 1 - Math.min(0.95, Math.max(0, this.settings.smoothing));
    const eased: StrokePoint = {
      x: this.eased.x + (target.x - this.eased.x) * k,
      y: this.eased.y + (target.y - this.eased.y) * k,
      pressure: target.pressure
    };
    this.eased = eased;
    this.line(this.last, this.settings.pixel ? this.snap(eased) : eased);
    this.last = this.settings.pixel ? this.snap(eased) : eased;
    this.flush();
  }

  /** 손을 뗀다. 굳힌 결과는 이미 `surface` 에 들어 있다. */
  end(): void {
    this.last = null;
    this.eased = null;
  }

  /** 픽셀 모드면 격자 한가운데로 붙인다. */
  private snap(point: StrokePoint): StrokePoint {
    if (!this.settings.pixel) return point;
    const g = Math.max(1, this.settings.grid | 0);
    return {
      x: Math.floor(point.x / g) * g + g / 2,
      y: Math.floor(point.y / g) * g + g / 2,
      pressure: point.pressure
    };
  }

  /** 두 점 사이를 간격만큼 띄워 도장으로 채운다 — 빠르게 그어도 점선이 안 된다. */
  private line(from: StrokePoint, to: StrokePoint): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) return;
    const step = Math.max(
      this.settings.pixel ? Math.max(1, this.settings.grid) : 0.5,
      this.settings.size * Math.max(0.01, this.settings.spacing)
    );
    let travelled = step - this.carry;
    while (travelled <= distance) {
      const t = travelled / distance;
      this.stamp({
        x: from.x + dx * t,
        y: from.y + dy * t,
        pressure: (from.pressure ?? 1) + ((to.pressure ?? 1) - (from.pressure ?? 1)) * t
      });
      travelled += step;
    }
    this.carry = distance - (travelled - step);
  }

  /** 도장 한 번 — 획 마스크에 `max` 로 쌓는다(겹쳐도 안 진해진다). */
  private stamp(point: StrokePoint): void {
    const s = this.settings;
    const pressure = clamp01(point.pressure ?? 1);
    const sizeScale = 1 - s.pressureSize + s.pressureSize * pressure;
    const radius = Math.max(s.pixel ? Math.max(1, s.grid) / 2 : 0.5, (s.size * sizeScale) / 2);
    const flow = clamp01(s.flow * (1 - s.pressureFlow + s.pressureFlow * pressure));
    if (flow <= 0) return;

    const x0 = Math.max(0, Math.floor(point.x - radius));
    const x1 = Math.min(this.surface.w - 1, Math.ceil(point.x + radius));
    const y0 = Math.max(0, Math.floor(point.y - radius));
    const y1 = Math.min(this.surface.h - 1, Math.ceil(point.y + radius));
    /* 부드러움이 시작되는 반지름 — hardness 1 이면 가장자리까지 꽉 찬다. */
    const inner = radius * clamp01(s.hardness);

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        let cover: number;
        if (s.pixel) {
          /* 픽셀 모드 — 네모 도장, 흐림 없음. 격자 칸 전체를 채운다. */
          const g = Math.max(1, s.grid | 0);
          const cx = Math.floor(point.x / g) * g;
          const cy = Math.floor(point.y / g) * g;
          cover = x >= cx && x < cx + g && y >= cy && y < cy + g ? 1 : 0;
        } else {
          const distance = Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y);
          if (distance > radius) continue;
          cover = radius <= inner ? 1 : clamp01((radius - distance) / Math.max(0.0001, radius - inner));
          /* 가장자리 한 픽셀은 부드럽게 — 딱딱한 붓도 계단이 안 지게. */
          if (s.hardness >= 1) cover = clamp01(radius + 0.5 - distance);
        }
        if (cover <= 0) continue;
        const index = y * this.surface.w + x;
        /* 선택영역 밖은 붓이 안 닿는다 — 가장자리가 부드러운 선택이면 그만큼만 묻는다. */
        if (this.selection) {
          cover *= this.selection[index] / 255;
          if (cover <= 0) continue;
        }
        const next = Math.max(this.mask[index], cover * flow);
        if (next === this.mask[index]) continue;
        this.mask[index] = next;
        if (x < this.minX) this.minX = x;
        if (x > this.maxX) this.maxX = x;
        if (y < this.minY) this.minY = y;
        if (y > this.maxY) this.maxY = y;
      }
    }
  }

  /** 더러워진 자리를 「원본 + 획 마스크」로 다시 굽는다. */
  private flush(): void {
    const rect = this.dirty;
    if (!rect) return;
    const s = this.settings;
    const [r, g, b] = s.color;
    const out = this.surface.data;
    const base = this.base.data;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        const p = y * this.surface.w + x;
        const alpha = clamp01(this.mask[p] * s.opacity);
        const i = p * 4;
        if (alpha <= 0) {
          out[i] = base[i]; out[i + 1] = base[i + 1]; out[i + 2] = base[i + 2]; out[i + 3] = base[i + 3];
          continue;
        }
        if (s.mode === 'erase') {
          /* 지우개 — 색은 그대로 두고 알파만 깎는다. */
          out[i] = base[i]; out[i + 1] = base[i + 1]; out[i + 2] = base[i + 2];
          out[i + 3] = base[i + 3] * (1 - alpha);
          continue;
        }
        const ab = (base[i + 3] / 255);
        const ao = alpha + ab * (1 - alpha);
        out[i] = ((r * alpha + base[i] * ab * (1 - alpha)) / ao);
        out[i + 1] = ((g * alpha + base[i + 1] * ab * (1 - alpha)) / ao);
        out[i + 2] = ((b * alpha + base[i + 2] * ab * (1 - alpha)) / ao);
        out[i + 3] = ao * 255;
      }
    }
  }
}

/** 스포이드 — 그 자리 색. 판 밖이면 null. */
export function pickColor(surface: Surface, x: number, y: number): [number, number, number, number] | null {
  const px = Math.floor(x); const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= surface.w || py >= surface.h) return null;
  const i = (py * surface.w + px) * 4;
  return [surface.data[i], surface.data[i + 1], surface.data[i + 2], surface.data[i + 3]];
}
