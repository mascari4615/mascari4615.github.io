/**
 * 이미지 편집기 — 보기 (TASK-KL-240 · 2b)
 *
 * 화면에 닿는 첫 파일. 하는 일은 셋뿐이다:
 *  ① 문서 크기의 **속판**(buffer canvas)을 들고, 합성 결과를 그 위에 얹는다 — 붓질마다
 *     더러워진 사각형만 얹으므로 4000×3000 짜리도 손이 안 끊긴다.
 *  ② 속판을 확대/이동해서 큰 캔버스에 그린다. 확대할 때는 뭉개지 않는다(픽셀 아트가 흐려지면 끝).
 *  ③ 화면 좌표 ↔ 그림 좌표를 옮긴다. 붓은 그림 좌표만 안다.
 *
 * 격자·투명 바탕(체크무늬)도 여기서 그린다 — 그림 데이터에 섞이면 안 되는 것들이다.
 */

import { type Surface } from './doc';

export interface ViewRect { x: number; y: number; w: number; h: number }

export class CanvasView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bufferCtx: CanvasRenderingContext2D;
  private image: ImageData;
  /** 확대율 (1 = 원본 크기) */
  scale = 1;
  /** 그림 왼쪽 위가 화면 어디에 오나(CSS px) */
  offsetX = 0;
  offsetY = 0;
  /** 픽셀 격자를 그릴 칸 크기. 0 = 안 그림. */
  grid = 0;
  private dpr = 1;
  private frame = 0;
  /** 고른 자리의 경계 픽셀 — 「달리는 개미」 테두리를 그린다. */
  private selectionEdges: Array<[number, number]> = [];
  /** 개미가 흐르는 위치. 올릴 때마다 점선이 한 칸씩 움직인다. */
  antPhase = 0;

  setSelectionEdges(edges: Array<[number, number]>): void {
    this.selectionEdges = edges;
  }

  get hasSelectionEdges(): boolean { return this.selectionEdges.length > 0; }

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.buffer = document.createElement('canvas');
    this.buffer.width = w;
    this.buffer.height = h;
    this.bufferCtx = this.buffer.getContext('2d') as CanvasRenderingContext2D;
    this.image = this.bufferCtx.createImageData(w, h);
  }

  get docW(): number { return this.buffer.width; }
  get docH(): number { return this.buffer.height; }

  /** 문서 크기가 바뀌면 속판도 새로 뜬다. */
  resizeDoc(w: number, h: number): void {
    if (this.buffer.width === w && this.buffer.height === h) return;
    this.buffer.width = w;
    this.buffer.height = h;
    this.image = this.bufferCtx.createImageData(w, h);
  }

  /** 화면 크기(CSS px)를 캔버스에 맞춘다. 고해상도 화면에서 흐려지지 않게 dpr 을 곱한다. */
  resizeViewport(width: number, height: number, dpr = 1): void {
    this.dpr = Math.max(1, dpr);
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  get viewW(): number { return this.canvas.width / this.dpr; }
  get viewH(): number { return this.canvas.height / this.dpr; }

  /** 그림 전체가 보이게 맞춘다. */
  fit(padding = 24): void {
    const scale = Math.min(
      (this.viewW - padding * 2) / this.docW,
      (this.viewH - padding * 2) / this.docH
    );
    this.scale = Math.max(0.02, Math.min(64, scale));
    this.center();
  }

  center(): void {
    this.offsetX = (this.viewW - this.docW * this.scale) / 2;
    this.offsetY = (this.viewH - this.docH * this.scale) / 2;
  }

  /** 화면의 한 점을 붙잡은 채 확대한다 — 커서 밑 그림이 안 미끄러진다. */
  zoomAt(viewX: number, viewY: number, factor: number): void {
    const before = this.toDoc(viewX, viewY);
    this.scale = Math.max(0.02, Math.min(64, this.scale * factor));
    const after = this.toDoc(viewX, viewY);
    this.offsetX += (after.x - before.x) * this.scale;
    this.offsetY += (after.y - before.y) * this.scale;
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** 화면 좌표(CSS px, 캔버스 기준) → 그림 좌표. */
  toDoc(viewX: number, viewY: number): { x: number; y: number } {
    return { x: (viewX - this.offsetX) / this.scale, y: (viewY - this.offsetY) / this.scale };
  }

  /** 합성 결과를 속판에 얹는다. `rect` 를 주면 그 자리만. */
  blit(flat: Surface, rect?: ViewRect): void {
    this.image.data.set(flat.data);
    if (rect) {
      this.bufferCtx.putImageData(this.image, 0, 0, rect.x, rect.y, rect.w, rect.h);
    } else {
      this.bufferCtx.putImageData(this.image, 0, 0);
    }
  }

  /** 다음 화면 새로고침 때 한 번만 다시 그린다(붓질 중 그리기 요청이 몰려도 한 번). */
  invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  paint(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    const w = this.docW * this.scale;
    const h = this.docH * this.scale;

    /* 투명한 자리 — 체크무늬. 그림에 섞이지 않는 화면만의 것. */
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.offsetX, this.offsetY, w, h);
    ctx.clip();
    const cell = 14;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(this.offsetX, this.offsetY, w, h);
    ctx.fillStyle = '#e8ebf0';
    const startX = Math.floor(this.offsetX / cell) * cell;
    const startY = Math.floor(this.offsetY / cell) * cell;
    for (let y = startY; y < this.offsetY + h; y += cell) {
      for (let x = startX; x < this.offsetX + w; x += cell) {
        if (((x / cell) + (y / cell)) % 2 === 0) ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.restore();

    /* 그림. 크게 볼 때는 **뭉개지 않는다** — 픽셀 아트가 흐려지면 도구로서 끝이다. */
    ctx.imageSmoothingEnabled = this.scale < 1;
    ctx.drawImage(this.buffer, this.offsetX, this.offsetY, w, h);

    /* 격자 — 칸이 8px 보다 좁아지면 그물처럼 보여 그림을 가리므로 안 그린다. */
    if (this.grid > 0 && this.grid * this.scale >= 8) {
      ctx.save();
      ctx.strokeStyle = 'rgba(120,140,170,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= this.docW; x += this.grid) {
        const sx = Math.round(this.offsetX + x * this.scale) + 0.5;
        ctx.moveTo(sx, this.offsetY);
        ctx.lineTo(sx, this.offsetY + h);
      }
      for (let y = 0; y <= this.docH; y += this.grid) {
        const sy = Math.round(this.offsetY + y * this.scale) + 0.5;
        ctx.moveTo(this.offsetX, sy);
        ctx.lineTo(this.offsetX + w, sy);
      }
      ctx.stroke();
      ctx.restore();
    }

    /* 고른 자리 테두리 — 「달리는 개미」. 점선이 흐르는 것 자체가 「여기까지만 손댄다」는 신호다.
       경계 픽셀만 그린다(안쪽은 안 칠한다 — 그림이 가려지면 고른 의미가 없다). */
    if (this.selectionEdges.length) {
      const step = Math.max(1, Math.ceil(this.selectionEdges.length / 30000));
      const size = Math.max(1, this.scale);
      for (let i = 0; i < this.selectionEdges.length; i += step) {
        const point = this.selectionEdges[i];
        const sx = this.offsetX + point[0] * this.scale;
        const sy = this.offsetY + point[1] * this.scale;
        ctx.fillStyle = ((point[0] + point[1] + this.antPhase) % 8) < 4 ? '#101418' : '#f4f7ff';
        ctx.fillRect(sx, sy, size, size);
      }
    }

    /* 그림 테두리 — 흰 배경 위 흰 그림도 어디까지가 판인지 보이게. */
    ctx.strokeStyle = 'rgba(90,110,140,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(this.offsetX) + 0.5, Math.round(this.offsetY) + 0.5, Math.round(w), Math.round(h));
  }
}
