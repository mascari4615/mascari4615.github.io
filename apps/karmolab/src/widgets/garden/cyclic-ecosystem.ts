export interface CyclicStats {
  gen: number;
  populations: Uint32Array;
  leader: number;
  leaderShare: number;
  boundary: number;
  vortices: number;
}

export class CyclicEcosystem {
  readonly w: number;
  readonly h: number;
  readonly species: number;
  cells: Uint8Array;
  private next: Uint8Array;
  gen = 0;

  constructor(w: number, h: number, species = 5) {
    this.w = w; this.h = h; this.species = species;
    this.cells = new Uint8Array(w * h);
    this.next = new Uint8Array(w * h);
  }

  seed(random: () => number): void {
    this.gen = 0;
    // Coarse patches give the fronts enough room to curl instead of starting as white noise.
    const scale = 7;
    const coarseW = Math.ceil(this.w / scale), coarseH = Math.ceil(this.h / scale);
    const coarse = new Uint8Array(coarseW * coarseH);
    for (let i = 0; i < coarse.length; i++) coarse[i] = Math.floor(random() * this.species);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const base = coarse[Math.floor(y / scale) * coarseW + Math.floor(x / scale)];
      this.cells[y * this.w + x] = random() < 0.045 ? Math.floor(random() * this.species) : base;
    }
  }

  step(threshold = 1): CyclicStats {
    const { w, h, species, cells, next } = this;
    for (let y = 0; y < h; y++) {
      const up = ((y - 1 + h) % h) * w, mid = y * w, down = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const left = (x - 1 + w) % w, right = (x + 1) % w;
        const i = mid + x, predator = (cells[i] + 1) % species;
        let seen = 0;
        if (cells[up + left] === predator) seen++;
        if (cells[up + x] === predator) seen++;
        if (cells[up + right] === predator) seen++;
        if (cells[mid + left] === predator) seen++;
        if (cells[mid + right] === predator) seen++;
        if (cells[down + left] === predator) seen++;
        if (cells[down + x] === predator) seen++;
        if (cells[down + right] === predator) seen++;
        next[i] = seen >= threshold ? predator : cells[i];
      }
    }
    this.cells = next; this.next = cells; this.gen++;
    return this.measure();
  }

  private measure(): CyclicStats {
    const populations = new Uint32Array(this.species);
    let boundary = 0, vortices = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x, value = this.cells[i]; populations[value]++;
      const right = this.cells[y * this.w + (x + 1) % this.w];
      const down = this.cells[((y + 1) % this.h) * this.w + x];
      if (right !== value) boundary++;
      if (down !== value) boundary++;
      // Four corners containing at least three consecutive species are a stable proxy for a spiral core.
      const diagonal = this.cells[((y + 1) % this.h) * this.w + (x + 1) % this.w];
      let mask = (1 << value) | (1 << right) | (1 << down) | (1 << diagonal);
      let kinds = 0;
      while (mask) { kinds += mask & 1; mask >>>= 1; }
      if (kinds >= 3) vortices++;
    }
    let leader = 0;
    for (let i = 1; i < populations.length; i++) if (populations[i] > populations[leader]) leader = i;
    return { gen: this.gen, populations, leader, leaderShare: populations[leader] / this.cells.length, boundary: boundary / (this.cells.length * 2), vortices: vortices / this.cells.length };
  }
}

export type CyclicEvent = 'reversal' | 'spiral' | 'extinct' | 'balance';

export class CyclicWatcher {
  private leader = -1;
  private leaderSince = 0;
  private lastEvent = -1000;
  private announcedSpiral = false;
  private announcedBalance = false;

  reset(): void { this.leader = -1; this.leaderSince = 0; this.lastEvent = -1000; this.announcedSpiral = false; this.announcedBalance = false; }

  observe(stats: CyclicStats): CyclicEvent | null {
    if (this.leader < 0) { this.leader = stats.leader; this.leaderSince = stats.gen; return null; }
    let event: CyclicEvent | null = null;
    const aliveSpecies = Array.from(stats.populations).filter(n => n > 0).length;
    if (aliveSpecies < stats.populations.length) event = 'extinct';
    else if (!this.announcedSpiral && stats.gen > 80 && stats.vortices > 0.006 && stats.boundary > 0.12) { event = 'spiral'; this.announcedSpiral = true; }
    else if (stats.leader !== this.leader && stats.gen - this.leaderSince > 45 && stats.leaderShare > 0.225) {
      event = 'reversal'; this.leader = stats.leader; this.leaderSince = stats.gen;
    } else if (!this.announcedBalance && stats.gen > 500 && stats.leaderShare < 0.235) { event = 'balance'; this.announcedBalance = true; }
    if (event && stats.gen - this.lastEvent >= 90) { this.lastEvent = stats.gen; return event; }
    return null;
  }
}
