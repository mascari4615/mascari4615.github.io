export interface BoidStats {
  step: number;
  flocks: number;
  largestShare: number;
  alignment: number;
  predatorDistance: number;
}

function wrappedDelta(a: number, b: number): number {
  let d = b - a;
  if (d > 0.5) d--;
  else if (d < -0.5) d++;
  return d;
}

export class Boids {
  readonly count: number;
  readonly predatorCount: number;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  px: Float32Array; py: Float32Array; pvx: Float32Array; pvy: Float32Array;
  stepNo = 0;

  constructor(count = 190, predatorCount = 2) {
    this.count = count; this.predatorCount = predatorCount;
    this.x = new Float32Array(count); this.y = new Float32Array(count); this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.px = new Float32Array(predatorCount); this.py = new Float32Array(predatorCount); this.pvx = new Float32Array(predatorCount); this.pvy = new Float32Array(predatorCount);
  }

  seed(random: () => number): void {
    this.stepNo = 0;
    for (let i = 0; i < this.count; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.17;
      this.x[i] = (0.5 + Math.cos(a) * r + 1) % 1; this.y[i] = (0.5 + Math.sin(a) * r + 1) % 1;
      const heading = random() * Math.PI * 2; this.vx[i] = Math.cos(heading) * 0.0024; this.vy[i] = Math.sin(heading) * 0.0024;
    }
    for (let i = 0; i < this.predatorCount; i++) {
      const a = i / this.predatorCount * Math.PI * 2 + random(); this.px[i] = 0.5 + Math.cos(a) * 0.42; this.py[i] = 0.5 + Math.sin(a) * 0.42;
      this.pvx[i] = -Math.sin(a) * 0.0018; this.pvy[i] = Math.cos(a) * 0.0018;
    }
  }

  step(): BoidStats {
    const perception2 = 0.105 ** 2, separation2 = 0.024 ** 2, evade2 = 0.16 ** 2;
    for (let i = 0; i < this.count; i++) {
      let alignX = 0, alignY = 0, cohesionX = 0, cohesionY = 0, separateX = 0, separateY = 0, neighbors = 0;
      for (let j = 0; j < this.count; j++) {
        if (i === j) continue;
        const dx = wrappedDelta(this.x[i], this.x[j]), dy = wrappedDelta(this.y[i], this.y[j]); const d2 = dx * dx + dy * dy;
        if (d2 >= perception2) continue;
        neighbors++; alignX += this.vx[j]; alignY += this.vy[j]; cohesionX += dx; cohesionY += dy;
        if (d2 < separation2 && d2 > 0.0000001) { separateX -= dx / d2; separateY -= dy / d2; }
      }
      let evadeX = 0, evadeY = 0;
      for (let p = 0; p < this.predatorCount; p++) {
        const dx = wrappedDelta(this.x[i], this.px[p]), dy = wrappedDelta(this.y[i], this.py[p]); const d2 = dx * dx + dy * dy;
        if (d2 < evade2 && d2 > 0.000001) { const weight = 1 - Math.sqrt(d2 / evade2); evadeX -= dx / Math.sqrt(d2) * weight; evadeY -= dy / Math.sqrt(d2) * weight; }
      }
      let ax = separateX * 0.000028 + evadeX * 0.00048;
      let ay = separateY * 0.000028 + evadeY * 0.00048;
      if (neighbors) { ax += (alignX / neighbors - this.vx[i]) * 0.045 + cohesionX / neighbors * 0.00034; ay += (alignY / neighbors - this.vy[i]) * 0.045 + cohesionY / neighbors * 0.00034; }
      this.vx[i] += ax; this.vy[i] += ay;
      const speed = Math.hypot(this.vx[i], this.vy[i]) || 1; const targetSpeed = Math.max(0.0017, Math.min(0.0045, speed));
      this.vx[i] = this.vx[i] / speed * targetSpeed; this.vy[i] = this.vy[i] / speed * targetSpeed;
    }
    for (let p = 0; p < this.predatorCount; p++) {
      let nearest = 0, nearestD = Infinity;
      for (let i = 0; i < this.count; i++) { const dx = wrappedDelta(this.px[p], this.x[i]), dy = wrappedDelta(this.py[p], this.y[i]); const d2 = dx * dx + dy * dy; if (d2 < nearestD) { nearestD = d2; nearest = i; } }
      const dx = wrappedDelta(this.px[p], this.x[nearest]), dy = wrappedDelta(this.py[p], this.y[nearest]);
      this.pvx[p] = this.pvx[p] * 0.965 + dx * 0.00012; this.pvy[p] = this.pvy[p] * 0.965 + dy * 0.00012;
      const speed = Math.hypot(this.pvx[p], this.pvy[p]) || 1; this.pvx[p] = this.pvx[p] / speed * 0.0028; this.pvy[p] = this.pvy[p] / speed * 0.0028;
      this.px[p] = (this.px[p] + this.pvx[p] + 1) % 1; this.py[p] = (this.py[p] + this.pvy[p] + 1) % 1;
    }
    for (let i = 0; i < this.count; i++) { this.x[i] = (this.x[i] + this.vx[i] + 1) % 1; this.y[i] = (this.y[i] + this.vy[i] + 1) % 1; }
    this.stepNo++;
    return this.measure();
  }

  private measure(): BoidStats {
    const parent = new Int16Array(this.count); const size = new Int16Array(this.count); for (let i = 0; i < this.count; i++) { parent[i] = i; size[i] = 1; }
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const join = (a: number, b: number): void => { a = find(a); b = find(b); if (a === b) return; if (size[a] < size[b]) [a, b] = [b, a]; parent[b] = a; size[a] += size[b]; };
    for (let i = 0; i < this.count; i++) for (let j = i + 1; j < this.count; j++) { const dx = wrappedDelta(this.x[i], this.x[j]), dy = wrappedDelta(this.y[i], this.y[j]); if (dx * dx + dy * dy < 0.075 ** 2) join(i, j); }
    const roots = new Map<number, number>(); for (let i = 0; i < this.count; i++) { const root = find(i); roots.set(root, (roots.get(root) ?? 0) + 1); }
    let largest = 0; for (const n of roots.values()) largest = Math.max(largest, n);
    let headingX = 0, headingY = 0, nearestPredator = Infinity;
    for (let i = 0; i < this.count; i++) { const speed = Math.hypot(this.vx[i], this.vy[i]) || 1; headingX += this.vx[i] / speed; headingY += this.vy[i] / speed; for (let p = 0; p < this.predatorCount; p++) nearestPredator = Math.min(nearestPredator, Math.hypot(wrappedDelta(this.x[i], this.px[p]), wrappedDelta(this.y[i], this.py[p]))); }
    return { step: this.stepNo, flocks: Array.from(roots.values()).filter(n => n >= 5).length, largestShare: largest / this.count, alignment: Math.hypot(headingX, headingY) / this.count, predatorDistance: nearestPredator };
  }
}

export type BoidEvent = 'approach' | 'split' | 'escaped' | 'rejoined';

export class BoidWatcher {
  private lastEvent = -1000; private threatened = false; private split = false;
  reset(): void { this.lastEvent = -1000; this.threatened = false; this.split = false; }
  observe(stats: BoidStats): BoidEvent | null {
    if (stats.step - this.lastEvent < 100) return null;
    let event: BoidEvent | null = null;
    if (!this.threatened && stats.predatorDistance < 0.045) { event = 'approach'; this.threatened = true; }
    else if (!this.split && stats.flocks >= 3 && stats.largestShare < 0.72) { event = 'split'; this.split = true; }
    else if (this.threatened && stats.predatorDistance > 0.13) { event = 'escaped'; this.threatened = false; }
    else if (this.split && stats.flocks <= 1 && stats.largestShare > 0.82) { event = 'rejoined'; this.split = false; }
    if (event) this.lastEvent = stats.step;
    return event;
  }
}

