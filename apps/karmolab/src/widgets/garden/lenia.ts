export interface LeniaPreset { id: string; radius: number; mu: number; sigma: number; dt: number; }
export const LENIA_PRESETS: LeniaPreset[] = [
  { id: 'orbium', radius: 10, mu: 0.150, sigma: 0.034, dt: 0.065 },
  { id: 'scutium', radius: 9, mu: 0.145, sigma: 0.036, dt: 0.060 },
  { id: 'geminium', radius: 11, mu: 0.158, sigma: 0.038, dt: 0.055 },
  { id: 'aquarium', radius: 8, mu: 0.135, sigma: 0.034, dt: 0.065 }
];
export function leniaPresetForDay(day: string): LeniaPreset { let hash = 2166136261; for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619); return LENIA_PRESETS[(hash >>> 0) % LENIA_PRESETS.length]; }

export interface LeniaStats { step: number; mass: number; cx: number; cy: number; components: number; activity: number; }

export class Lenia {
  readonly w: number; readonly h: number; readonly preset: LeniaPreset;
  cells: Float32Array; private next: Float32Array; private offsets: Int16Array; private weights: Float32Array;
  stepNo = 0;

  constructor(w: number, h: number, preset: LeniaPreset) {
    this.w = w; this.h = h; this.preset = preset; this.cells = new Float32Array(w * h); this.next = new Float32Array(w * h);
    const offsets: number[] = [], weights: number[] = []; let sum = 0;
    const r = preset.radius;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const distance = Math.hypot(x, y) / r; if (distance <= 0.05 || distance > 1) continue;
      const weight = Math.exp(-((distance - 0.52) ** 2) / (2 * 0.15 ** 2));
      offsets.push(x, y); weights.push(weight); sum += weight;
    }
    this.offsets = Int16Array.from(offsets); this.weights = Float32Array.from(weights.map(weight => weight / sum));
  }

  seed(random: () => number): void {
    this.cells.fill(0); this.stepNo = 0;
    const cx = this.w / 2, cy = this.h / 2;
    const blobs = 5 + Math.floor(random() * 3);
    for (let b = 0; b < blobs; b++) {
      const angle = b / blobs * Math.PI * 2 + random() * 0.35; const distance = this.preset.radius * (0.25 + random() * 0.42);
      const bx = cx + Math.cos(angle) * distance, by = cy + Math.sin(angle) * distance * 0.72; const radius = this.preset.radius * (0.24 + random() * 0.16);
      for (let y = Math.floor(by - radius); y <= by + radius; y++) for (let x = Math.floor(bx - radius); x <= bx + radius; x++) {
        const dx = x - bx, dy = y - by; const d = Math.hypot(dx, dy) / radius; if (d > 1) continue;
        const ix = ((x % this.w) + this.w) % this.w, iy = ((y % this.h) + this.h) % this.h;
        this.cells[iy * this.w + ix] = Math.max(this.cells[iy * this.w + ix], Math.max(0, (1 - d * d) * (0.72 + random() * 0.22)));
      }
    }
  }

  step(): LeniaStats {
    const { w, h, cells, next, offsets, weights, preset } = this; let activity = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let potential = 0;
      for (let k = 0, q = 0; k < weights.length; k++, q += 2) {
        const nx = (x + offsets[q] + w) % w, ny = (y + offsets[q + 1] + h) % h;
        potential += cells[ny * w + nx] * weights[k];
      }
      const growth = 2 * Math.exp(-((potential - preset.mu) ** 2) / (2 * preset.sigma ** 2)) - 1;
      const i = y * w + x; const value = Math.max(0, Math.min(1, cells[i] + growth * preset.dt));
      next[i] = value; activity += Math.abs(value - cells[i]);
    }
    this.cells = next; this.next = cells; this.stepNo++;
    return this.measure(activity / cells.length);
  }

  private measure(activity: number): LeniaStats {
    let mass = 0, xCos = 0, xSin = 0, yCos = 0, ySin = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const value = this.cells[y * this.w + x]; mass += value; const ax = x / this.w * Math.PI * 2, ay = y / this.h * Math.PI * 2; xCos += Math.cos(ax) * value; xSin += Math.sin(ax) * value; yCos += Math.cos(ay) * value; ySin += Math.sin(ay) * value; }
    const cx = (Math.atan2(xSin, xCos) / (Math.PI * 2) + 1) % 1, cy = (Math.atan2(ySin, yCos) / (Math.PI * 2) + 1) % 1;
    return { step: this.stepNo, mass: mass / this.cells.length, cx, cy, components: this.countComponents(0.18), activity };
  }

  private countComponents(threshold: number): number {
    const seen = new Uint8Array(this.cells.length), queue = new Int32Array(this.cells.length); let components = 0;
    for (let start = 0; start < this.cells.length; start++) {
      if (seen[start] || this.cells[start] < threshold) continue; components++; if (components > 12) return components;
      let head = 0, tail = 0; queue[tail++] = start; seen[start] = 1;
      while (head < tail) { const i = queue[head++], x = i % this.w, y = Math.floor(i / this.w); const around = [y * this.w + (x + 1) % this.w, y * this.w + (x - 1 + this.w) % this.w, ((y + 1) % this.h) * this.w + x, ((y - 1 + this.h) % this.h) * this.w + x]; for (const j of around) if (!seen[j] && this.cells[j] >= threshold) { seen[j] = 1; queue[tail++] = j; } }
    }
    return components;
  }
}

export type LeniaEvent = 'emerged' | 'moving' | 'split' | 'collapse' | 'steady';
export class LeniaWatcher {
  private lastEvent = -1000; private peakMass = 0; private lastCx = 0.5; private lastCy = 0.5; private travel = 0; private emerged = false; private split = false; private announcedSteady = false;
  reset(): void { this.lastEvent = -1000; this.peakMass = 0; this.lastCx = 0.5; this.lastCy = 0.5; this.travel = 0; this.emerged = false; this.split = false; this.announcedSteady = false; }
  observe(stats: LeniaStats): LeniaEvent | null {
    let dx = Math.abs(stats.cx - this.lastCx), dy = Math.abs(stats.cy - this.lastCy); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy); if (stats.mass > 0.002) this.travel += Math.hypot(dx, dy); this.lastCx = stats.cx; this.lastCy = stats.cy;
    this.peakMass = Math.max(this.peakMass, stats.mass);
    if (stats.step - this.lastEvent < 100) return null;
    let event: LeniaEvent | null = null;
    if (!this.emerged && stats.step > 35 && stats.mass > 0.008 && stats.components > 0 && stats.components <= 8) { event = 'emerged'; this.emerged = true; }
    else if (this.travel > 0.16) { event = 'moving'; this.travel = 0; }
    else if (!this.split && stats.components >= 2 && stats.components <= 6 && stats.step > 100) { event = 'split'; this.split = true; }
    else if (this.peakMass > 0.01 && stats.mass < this.peakMass * 0.45) event = 'collapse';
    else if (!this.announcedSteady && stats.step > 400 && stats.activity < 0.00005 && stats.mass > 0.004) { event = 'steady'; this.announcedSteady = true; }
    if (event) this.lastEvent = stats.step; return event;
  }
}
