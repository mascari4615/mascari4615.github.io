export interface ReactionPreset {
  id: string;
  feed: number;
  kill: number;
  du: number;
  dv: number;
}

export interface ReactionStats {
  step: number;
  active: number;
  edge: number;
  delta: number;
}

export const REACTION_PRESETS: ReactionPreset[] = [
  { id: 'coral', feed: 0.0545, kill: 0.062, du: 1, dv: 0.5 },
  { id: 'mitosis', feed: 0.0367, kill: 0.0649, du: 1, dv: 0.5 },
  { id: 'maze', feed: 0.029, kill: 0.057, du: 1, dv: 0.5 },
  { id: 'spots', feed: 0.035, kill: 0.065, du: 1, dv: 0.5 },
  { id: 'waves', feed: 0.014, kill: 0.054, du: 1, dv: 0.5 }
];

export function presetForDay(day: string): ReactionPreset {
  let hash = 2166136261;
  for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
  return REACTION_PRESETS[(hash >>> 0) % REACTION_PRESETS.length];
}

/** Gray–Scott reaction diffusion on a torus. A is replenished, B consumes A and duplicates. */
export class ReactionDiffusion {
  readonly w: number;
  readonly h: number;
  a: Float32Array;
  b: Float32Array;
  private nextA: Float32Array;
  private nextB: Float32Array;
  stepNo = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
    this.nextA = new Float32Array(n);
    this.nextB = new Float32Array(n);
    this.a.fill(1);
  }

  seed(random: () => number): void {
    this.a.fill(1);
    this.b.fill(0);
    this.stepNo = 0;
    const islands = 5 + Math.floor(random() * 7);
    for (let n = 0; n < islands; n++) {
      const cx = Math.floor((0.15 + random() * 0.7) * this.w);
      const cy = Math.floor((0.15 + random() * 0.7) * this.h);
      const r = 2 + Math.floor(random() * 5);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const px = (cx + x + this.w) % this.w;
        const py = (cy + y + this.h) % this.h;
        const i = py * this.w + px;
        this.b[i] = 0.75 + random() * 0.25;
        this.a[i] = 0.15 + random() * 0.15;
      }
    }
  }

  step(preset: ReactionPreset, dt = 0.2): ReactionStats {
    const { w, h, a, b, nextA, nextB } = this;
    let active = 0;
    let edge = 0;
    let delta = 0;
    for (let y = 0; y < h; y++) {
      const up = ((y - 1 + h) % h) * w;
      const mid = y * w;
      const down = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const left = (x - 1 + w) % w;
        const right = (x + 1) % w;
        const i = mid + x;
        const lapA = a[mid + left] + a[mid + right] + a[up + x] + a[down + x] - 4 * a[i];
        const lapB = b[mid + left] + b[mid + right] + b[up + x] + b[down + x] - 4 * b[i];
        const reaction = a[i] * b[i] * b[i];
        const na = Math.max(0, Math.min(1, a[i] + (preset.du * lapA - reaction + preset.feed * (1 - a[i])) * dt));
        const nb = Math.max(0, Math.min(1, b[i] + (preset.dv * lapB + reaction - (preset.kill + preset.feed) * b[i]) * dt));
        nextA[i] = na;
        nextB[i] = nb;
        if (nb > 0.18) active++;
        if (Math.abs(lapB) > 0.075) edge++;
        delta += Math.abs(nb - b[i]);
      }
    }
    this.a = nextA;
    this.b = nextB;
    this.nextA = a;
    this.nextB = b;
    this.stepNo++;
    return { step: this.stepNo, active: active / a.length, edge: edge / a.length, delta: delta / a.length };
  }
}

export type ReactionEvent = 'spots' | 'joined' | 'front' | 'settled';

export class ReactionWatcher {
  private lastEvent = -1000;
  private maxActive = 0;
  private settledRuns = 0;

  reset(): void {
    this.lastEvent = -1000;
    this.maxActive = 0;
    this.settledRuns = 0;
  }

  observe(stats: ReactionStats): ReactionEvent | null {
    const previousMax = this.maxActive;
    this.maxActive = Math.max(this.maxActive, stats.active);
    this.settledRuns = stats.delta < 0.00008 ? this.settledRuns + 1 : 0;
    if (stats.step - this.lastEvent < 180) return null;
    let event: ReactionEvent | null = null;
    if (stats.step > 80 && previousMax < 0.08 && stats.active >= 0.08) event = 'spots';
    else if (stats.step > 160 && stats.edge > 0.18 && stats.active > 0.14) event = 'joined';
    else if (stats.active > 0.48) event = 'front';
    else if (this.settledRuns >= 30) event = 'settled';
    if (event) this.lastEvent = stats.step;
    return event;
  }
}
