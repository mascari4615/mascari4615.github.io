export interface ParticleLifeStats {
  step: number;
  kinetic: number;
  neighborRate: number;
  separation: number;
  ringScore: number;
}

export interface ParticleLifeConfig {
  species: number;
  count: number;
  matrix: Float32Array;
}

export function makeParticleLifeConfig(random: () => number, species = 5, count = 420): ParticleLifeConfig {
  const matrix = new Float32Array(species * species);
  for (let a = 0; a < species; a++) for (let b = 0; b < species; b++) {
    const mirrored = a > b && random() < 0.32 ? matrix[b * species + a] : random() * 2 - 1;
    matrix[a * species + b] = mirrored;
  }
  return { species, count, matrix };
}

/** Continuous particle life in a unit torus. Distances and velocities are normalized to the viewport. */
export class ParticleLife {
  readonly count: number;
  readonly speciesCount: number;
  readonly matrix: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  kind: Uint8Array;
  stepNo = 0;

  constructor(config: ParticleLifeConfig) {
    this.count = config.count;
    this.speciesCount = config.species;
    this.matrix = config.matrix;
    this.x = new Float32Array(config.count);
    this.y = new Float32Array(config.count);
    this.vx = new Float32Array(config.count);
    this.vy = new Float32Array(config.count);
    this.kind = new Uint8Array(config.count);
  }

  seed(random: () => number): void {
    this.stepNo = 0;
    for (let i = 0; i < this.count; i++) {
      this.x[i] = random();
      this.y[i] = random();
      this.vx[i] = (random() - 0.5) * 0.0008;
      this.vy[i] = (random() - 0.5) * 0.0008;
      this.kind[i] = i % this.speciesCount;
    }
  }

  step(dt = 1): ParticleLifeStats {
    const radius = 0.115;
    const core = 0.018;
    const radius2 = radius * radius;
    const { count, x, y, vx, vy, kind, speciesCount, matrix } = this;
    let neighborLinks = 0;
    for (let i = 0; i < count; i++) {
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        let dx = x[j] - x[i];
        let dy = y[j] - y[i];
        if (dx > 0.5) dx--;
        else if (dx < -0.5) dx++;
        if (dy > 0.5) dy--;
        else if (dy < -0.5) dy++;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0.0000001 || d2 >= radius2) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        let force: number;
        if (d < core) force = d / core - 1;
        else {
          const wave = 1 - Math.abs(2 * (d - core) / (radius - core) - 1);
          force = matrix[kind[i] * speciesCount + kind[j]] * wave;
        }
        fx += nx * force;
        fy += ny * force;
        if (d < 0.055) neighborLinks++;
      }
      vx[i] = (vx[i] + fx * 0.000045 * dt) * 0.88;
      vy[i] = (vy[i] + fy * 0.000045 * dt) * 0.88;
    }

    let kinetic = 0;
    for (let i = 0; i < count; i++) {
      x[i] = (x[i] + vx[i] * dt + 1) % 1;
      y[i] = (y[i] + vy[i] * dt + 1) % 1;
      kinetic += Math.hypot(vx[i], vy[i]);
    }
    this.stepNo++;
    return this.measure(kinetic / count, neighborLinks / (count * 12));
  }

  private measure(kinetic: number, neighborRate: number): ParticleLifeStats {
    const xCos = new Float64Array(this.speciesCount);
    const xSin = new Float64Array(this.speciesCount);
    const yCos = new Float64Array(this.speciesCount);
    const ySin = new Float64Array(this.speciesCount);
    const n = new Uint16Array(this.speciesCount);
    for (let i = 0; i < this.count; i++) {
      const k = this.kind[i];
      xCos[k] += Math.cos(this.x[i] * Math.PI * 2);
      xSin[k] += Math.sin(this.x[i] * Math.PI * 2);
      yCos[k] += Math.cos(this.y[i] * Math.PI * 2);
      ySin[k] += Math.sin(this.y[i] * Math.PI * 2);
      n[k]++;
    }
    const centerX = new Float64Array(this.speciesCount);
    const centerY = new Float64Array(this.speciesCount);
    for (let k = 0; k < this.speciesCount; k++) {
      centerX[k] = (Math.atan2(xSin[k], xCos[k]) / (Math.PI * 2) + 1) % 1;
      centerY[k] = (Math.atan2(ySin[k], yCos[k]) / (Math.PI * 2) + 1) % 1;
    }
    let separation = 0;
    for (let a = 0; a < this.speciesCount; a++) for (let b = a + 1; b < this.speciesCount; b++) {
      const dx0 = Math.abs(centerX[a] - centerX[b]);
      const dy0 = Math.abs(centerY[a] - centerY[b]);
      separation += Math.hypot(Math.min(dx0, 1 - dx0), Math.min(dy0, 1 - dy0));
    }
    separation /= Math.max(1, this.speciesCount * (this.speciesCount - 1) / 2);

    // A ring has many particles at a similar radius from the toroidal circular mean and a sparse center.
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < this.count; i++) { cx += this.x[i]; cy += this.y[i]; }
    cx /= this.count; cy /= this.count;
    let meanR = 0;
    const radii = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      let dx = Math.abs(this.x[i] - cx); dx = Math.min(dx, 1 - dx);
      let dy = Math.abs(this.y[i] - cy); dy = Math.min(dy, 1 - dy);
      radii[i] = Math.hypot(dx, dy);
      meanR += radii[i];
    }
    meanR /= this.count;
    let variance = 0;
    let centerCount = 0;
    for (const r of radii) { variance += (r - meanR) ** 2; if (r < meanR * 0.45) centerCount++; }
    const ringScore = meanR > 0.08 ? Math.max(0, 1 - Math.sqrt(variance / this.count) / meanR) * (1 - centerCount / this.count) : 0;
    return { step: this.stepNo, kinetic, neighborRate: Math.min(1, neighborRate), separation, ringScore };
  }
}

export type ParticleLifeEvent = 'cluster' | 'ring' | 'separated' | 'collapse';

export class ParticleLifeWatcher {
  private lastEvent = -1000;
  private previousNeighbors = 0;

  reset(): void { this.lastEvent = -1000; this.previousNeighbors = 0; }

  observe(stats: ParticleLifeStats): ParticleLifeEvent | null {
    if (stats.step - this.lastEvent < 180) { this.previousNeighbors = stats.neighborRate; return null; }
    let event: ParticleLifeEvent | null = null;
    if (stats.step > 100 && this.previousNeighbors < 0.16 && stats.neighborRate >= 0.16) event = 'cluster';
    else if (stats.step > 180 && stats.ringScore > 0.62 && stats.neighborRate > 0.09) event = 'ring';
    else if (stats.step > 260 && stats.separation > 0.24) event = 'separated';
    else if (this.previousNeighbors > 0.18 && stats.neighborRate < this.previousNeighbors * 0.58) event = 'collapse';
    this.previousNeighbors = stats.neighborRate;
    if (event) this.lastEvent = stats.step;
    return event;
  }
}
