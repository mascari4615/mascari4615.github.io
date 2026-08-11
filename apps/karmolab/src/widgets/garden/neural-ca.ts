export type NeuralShape = 'flower' | 'butterfly' | 'star' | 'leaf';
export const NEURAL_SHAPES: NeuralShape[] = ['flower', 'butterfly', 'star', 'leaf'];
export function neuralShapeForDay(day: string): NeuralShape { let hash = 2166136261; for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619); return NEURAL_SHAPES[(hash >>> 0) % NEURAL_SHAPES.length]; }

export interface NeuralStats { step: number; mass: number; similarity: number; missing: number; excess: number; }

/**
 * A target-conditioned Neural CA inference model.
 * Every cell runs the same 4→6→1 ReLU MLP over local perception
 * [self, Moore mean, Laplacian, morphogen target]. The target channel is an environmental morphogen;
 * damage erases only living state, so recovery still has to propagate locally from surviving cells.
 */
export class NeuralCA {
  readonly w: number; readonly h: number; readonly shape: NeuralShape;
  cells: Float32Array; target: Float32Array; private next: Float32Array;
  stepNo = 0;
  // Hand-selected inference weights, kept explicit and versionable like a tiny embedded model.
  private readonly w1 = new Float32Array([
     0.0, 2.0, 0.0, 1.0,
     1.0, 0.0, 0.0,-1.1,
     1.0, 0.0, 0.0, 0.0,
     0.0, 0.0, 0.0, 0.0,
     0.0, 0.0, 0.0, 0.0,
     0.0, 0.0, 0.0, 0.0
  ]);
  private readonly b1 = new Float32Array([-1.16, 0, -0.75, -1, -1, -1]);
  private readonly w2 = new Float32Array([0.42, -0.70, -0.32, 0, 0, 0]);
  private readonly b2 = -0.004;

  constructor(w: number, h: number, shape: NeuralShape) {
    this.w = w; this.h = h; this.shape = shape; this.cells = new Float32Array(w * h); this.target = new Float32Array(w * h); this.next = new Float32Array(w * h); this.buildTarget();
  }

  seed(): void {
    this.cells.fill(0); this.stepNo = 0;
    const cx = this.w >> 1, cy = this.h >> 1;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) this.cells[(cy + y) * this.w + cx + x] = 1;
  }

  step(random: () => number): NeuralStats {
    const { w, h, cells, next, target } = this;
    for (let y = 0; y < h; y++) {
      const up = ((y - 1 + h) % h) * w, mid = y * w, down = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const left = (x - 1 + w) % w, right = (x + 1) % w, i = mid + x;
        const mean = (cells[up + left] + cells[up + x] + cells[up + right] + cells[mid + left] + cells[i] + cells[mid + right] + cells[down + left] + cells[down + x] + cells[down + right]) / 9;
        const lap = cells[mid + left] + cells[mid + right] + cells[up + x] + cells[down + x] - cells[i] * 4;
        const input = [cells[i], mean, lap, target[i]];
        let output = this.b2;
        for (let n = 0; n < 6; n++) { let hidden = this.b1[n]; for (let q = 0; q < 4; q++) hidden += input[q] * this.w1[n * 4 + q]; output += Math.max(0, hidden) * this.w2[n]; }
        // Stochastic asynchronous updates are standard in NCA and make the model robust to update order.
        next[i] = random() < 0.82 ? Math.max(0, Math.min(1, cells[i] + output * 0.16)) : cells[i];
      }
    }
    this.cells = next; this.next = cells; this.stepNo++;
    return this.measure();
  }

  damage(random: () => number): void {
    const angle = random() * Math.PI * 2, cx = this.w * (0.5 + Math.cos(angle) * 0.13), cy = this.h * (0.5 + Math.sin(angle) * 0.13), radius = Math.min(this.w, this.h) * 0.17;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < radius ** 2) this.cells[y * this.w + x] = 0;
  }

  private measure(): NeuralStats {
    let mass = 0, intersection = 0, union = 0, missing = 0, excess = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const alive = this.cells[i] > 0.42, wanted = this.target[i] > 0.5; mass += this.cells[i];
      if (alive && wanted) intersection++; if (alive || wanted) union++; if (!alive && wanted) missing++; if (alive && !wanted) excess++;
    }
    return { step: this.stepNo, mass: mass / this.cells.length, similarity: union ? intersection / union : 1, missing: missing / this.cells.length, excess: excess / this.cells.length };
  }

  private buildTarget(): void {
    const cx = this.w / 2, cy = this.h / 2, scale = Math.min(this.w, this.h) * 0.34;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const nx = (x - cx) / scale, ny = (y - cy) / scale; let inside = false;
      if (this.shape === 'flower') { const r = Math.hypot(nx, ny), a = Math.atan2(ny, nx); inside = r < 0.34 + 0.2 * Math.cos(a * 6); }
      else if (this.shape === 'butterfly') { const wing = ((Math.abs(nx) - 0.28) / 0.42) ** 2 + (ny / 0.62) ** 2 < 1; inside = wing || (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.62); }
      else if (this.shape === 'star') { const r = Math.hypot(nx, ny), a = Math.atan2(ny, nx); inside = r < 0.34 + 0.17 * Math.cos(a * 5); }
      else { const rotatedX = nx * 0.78 - ny * 0.35, rotatedY = nx * 0.35 + ny * 0.78; inside = (rotatedX / 0.38) ** 2 + (rotatedY / 0.72) ** 2 < 1 && !(rotatedX > 0.08 && Math.abs(rotatedY) < 0.08); }
      this.target[y * this.w + x] = inside ? 1 : 0;
    }
  }
}

export type NeuralEvent = 'grown' | 'damaged' | 'repaired' | 'failed';
export class NeuralWatcher {
  private grown = false; private damagedAt = 0; private announcedRepair = false;
  reset(): void { this.grown = false; this.damagedAt = 0; this.announcedRepair = false; }
  markDamage(step: number): NeuralEvent { this.damagedAt = step; return 'damaged'; }
  observe(stats: NeuralStats): NeuralEvent | null {
    if (!this.grown && stats.step > 40 && stats.similarity > 0.78) { this.grown = true; return 'grown'; }
    if (this.damagedAt && !this.announcedRepair && stats.step > this.damagedAt + 30 && stats.similarity > 0.74) { this.announcedRepair = true; return 'repaired'; }
    if (this.damagedAt && !this.announcedRepair && stats.step === this.damagedAt + 480 && stats.similarity < 0.58) return 'failed';
    return null;
  }
}
