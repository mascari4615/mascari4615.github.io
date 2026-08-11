export interface FoodSource { x: number; y: number; }

export interface PhysarumStats {
  step: number;
  coverage: number;
  branches: number;
  connected: number;
}

export class Physarum {
  readonly w: number;
  readonly h: number;
  readonly count: number;
  trail: Float32Array;
  private nextTrail: Float32Array;
  x: Float32Array;
  y: Float32Array;
  angle: Float32Array;
  foods: FoodSource[] = [];
  stepNo = 0;

  constructor(w: number, h: number, count = 720) {
    this.w = w; this.h = h; this.count = count;
    this.trail = new Float32Array(w * h);
    this.nextTrail = new Float32Array(w * h);
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.angle = new Float32Array(count);
  }

  seed(random: () => number): void {
    this.stepNo = 0;
    this.trail.fill(0);
    this.foods = [];
    const foodCount = 5;
    for (let i = 0; i < foodCount; i++) {
      const a = i / foodCount * Math.PI * 2 + (random() - 0.5) * 0.28;
      const r = 0.25 + random() * 0.08;
      this.foods.push({ x: (0.5 + Math.cos(a) * r) * this.w, y: (0.5 + Math.sin(a) * r) * this.h });
    }
    for (let i = 0; i < this.count; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * Math.min(this.w, this.h) * 0.18;
      this.x[i] = this.w * 0.5 + Math.cos(a) * r;
      this.y[i] = this.h * 0.5 + Math.sin(a) * r;
      this.angle[i] = random() * Math.PI * 2;
    }
  }

  private sample(x: number, y: number): number {
    const ix = ((Math.round(x) % this.w) + this.w) % this.w;
    const iy = ((Math.round(y) % this.h) + this.h) % this.h;
    return this.trail[iy * this.w + ix];
  }

  step(random: () => number): PhysarumStats {
    const sensorDistance = 5;
    const sensorAngle = 0.52;
    for (const food of this.foods) {
      const cx = Math.round(food.x), cy = Math.round(food.y);
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
        if (ox * ox + oy * oy > 9) continue;
        const px = (cx + ox + this.w) % this.w, py = (cy + oy + this.h) % this.h;
        this.trail[py * this.w + px] = Math.min(1, this.trail[py * this.w + px] + 0.22);
      }
    }
    for (let i = 0; i < this.count; i++) {
      const a = this.angle[i];
      const front = this.sample(this.x[i] + Math.cos(a) * sensorDistance, this.y[i] + Math.sin(a) * sensorDistance);
      const leftA = a - sensorAngle, rightA = a + sensorAngle;
      const left = this.sample(this.x[i] + Math.cos(leftA) * sensorDistance, this.y[i] + Math.sin(leftA) * sensorDistance);
      const right = this.sample(this.x[i] + Math.cos(rightA) * sensorDistance, this.y[i] + Math.sin(rightA) * sensorDistance);
      if (front < left && front < right) this.angle[i] += (random() < 0.5 ? -1 : 1) * 0.72;
      else if (left > right) this.angle[i] -= 0.48;
      else if (right > left) this.angle[i] += 0.48;
      else this.angle[i] += (random() - 0.5) * 0.16;
      this.x[i] = (this.x[i] + Math.cos(this.angle[i]) * 1.15 + this.w) % this.w;
      this.y[i] = (this.y[i] + Math.sin(this.angle[i]) * 1.15 + this.h) % this.h;
      const ix = Math.floor(this.x[i]), iy = Math.floor(this.y[i]);
      const at = iy * this.w + ix;
      this.trail[at] = Math.min(1, this.trail[at] + 0.18);
    }
    this.diffuse();
    this.stepNo++;
    return this.stepNo % 12 === 0 ? this.measure() : { step: this.stepNo, coverage: -1, branches: -1, connected: -1 };
  }

  private diffuse(): void {
    const { w, h, trail, nextTrail } = this;
    for (let y = 0; y < h; y++) {
      const up = ((y - 1 + h) % h) * w, mid = y * w, down = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const left = (x - 1 + w) % w, right = (x + 1) % w;
        const blur = trail[mid + x] * 0.42 + (trail[mid + left] + trail[mid + right] + trail[up + x] + trail[down + x]) * 0.145;
        nextTrail[mid + x] = blur * 0.965;
      }
    }
    this.trail = nextTrail;
    this.nextTrail = trail;
  }

  damage(): void {
    const cx = this.w >> 1;
    const width = Math.max(3, Math.round(this.w * 0.055));
    for (let y = 0; y < this.h; y++) for (let x = cx - width; x <= cx + width; x++) this.trail[y * this.w + x] = 0;
  }

  private measure(): PhysarumStats {
    let active = 0, branches = 0;
    const threshold = 0.115;
    for (let y = 1; y < this.h - 1; y++) for (let x = 1; x < this.w - 1; x++) {
      const i = y * this.w + x;
      if (this.trail[i] < threshold) continue;
      active++;
      let neighbors = 0;
      if (this.trail[i - 1] >= threshold) neighbors++;
      if (this.trail[i + 1] >= threshold) neighbors++;
      if (this.trail[i - this.w] >= threshold) neighbors++;
      if (this.trail[i + this.w] >= threshold) neighbors++;
      if (neighbors >= 3) branches++;
    }
    return { step: this.stepNo, coverage: active / this.trail.length, branches: branches / Math.max(1, active), connected: this.connectedFoods(threshold) };
  }

  private connectedFoods(threshold: number): number {
    if (!this.foods.length) return 0;
    const seen = new Uint8Array(this.trail.length);
    const queue = new Int32Array(this.trail.length);
    const first = this.foods[0];
    const start = Math.round(first.y) * this.w + Math.round(first.x);
    let head = 0, tail = 0;
    queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % this.w, y = Math.floor(i / this.w);
      const around = [y * this.w + (x + 1) % this.w, y * this.w + (x - 1 + this.w) % this.w, ((y + 1) % this.h) * this.w + x, ((y - 1 + this.h) % this.h) * this.w + x];
      for (const j of around) if (!seen[j] && this.trail[j] >= threshold) { seen[j] = 1; queue[tail++] = j; }
    }
    let connected = 0;
    for (const food of this.foods) {
      const fx = Math.round(food.x), fy = Math.round(food.y);
      let found = false;
      for (let oy = -3; oy <= 3 && !found; oy++) for (let ox = -3; ox <= 3; ox++) {
        const x = (fx + ox + this.w) % this.w, y = (fy + oy + this.h) % this.h;
        if (seen[y * this.w + x]) { found = true; break; }
      }
      if (found) connected++;
    }
    return connected;
  }
}

export type PhysarumEvent = 'connected' | 'pruned' | 'damaged' | 'repaired';

export class PhysarumWatcher {
  private lastEvent = -1000;
  private bestConnected = 0;
  private peakBranches = 0;
  private announcedConnection = false;
  private announcedRepair = false;
  damagedAt = 0;

  reset(): void { this.lastEvent = -1000; this.bestConnected = 0; this.peakBranches = 0; this.announcedConnection = false; this.announcedRepair = false; this.damagedAt = 0; }
  markDamage(step: number): PhysarumEvent { this.damagedAt = step; this.lastEvent = step; return 'damaged'; }
  observe(stats: PhysarumStats, foodCount: number): PhysarumEvent | null {
    if (stats.connected < 0) return null;
    this.bestConnected = Math.max(this.bestConnected, stats.connected);
    this.peakBranches = Math.max(this.peakBranches, stats.branches);
    if (stats.step - this.lastEvent < 120) return null;
    let event: PhysarumEvent | null = null;
    if (!this.damagedAt && !this.announcedConnection && stats.connected === foodCount && this.bestConnected === foodCount) {
      event = 'connected';
      this.announcedConnection = true;
    }
    else if (!this.damagedAt && this.peakBranches > 0.34 && stats.branches < this.peakBranches * 0.68) event = 'pruned';
    else if (this.damagedAt && !this.announcedRepair && stats.step > this.damagedAt + 80 && stats.connected === foodCount) {
      event = 'repaired';
      this.announcedRepair = true;
    }
    if (event) this.lastEvent = stats.step;
    return event;
  }
}
