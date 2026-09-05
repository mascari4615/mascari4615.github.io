export const enum Material { Empty, Rock, Soil, Sand, Water, Plant, Fire, Smoke }

export interface TerrariumStats {
  step: number;
  counts: Uint32Array;
  movedSand: number;
  grown: number;
  burned: number;
}

export class SandTerrarium {
  readonly w: number;
  readonly h: number;
  cells: Uint8Array;
  age: Uint16Array;
  private touched: Uint8Array;
  stepNo = 0;

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.cells = new Uint8Array(w * h);
    this.age = new Uint16Array(w * h);
    this.touched = new Uint8Array(w * h);
  }

  seed(random: () => number): void {
    this.cells.fill(Material.Empty); this.age.fill(0); this.stepNo = 0;
    const surface = new Int16Array(this.w);
    let level = Math.floor(this.h * 0.68);
    for (let x = 0; x < this.w; x++) {
      level += random() < 0.32 ? (random() < 0.5 ? -1 : 1) : 0;
      level = Math.max(Math.floor(this.h * 0.55), Math.min(Math.floor(this.h * 0.78), level));
      surface[x] = level;
      for (let y = level; y < this.h; y++) {
        const i = y * this.w + x;
        this.cells[i] = y > this.h - 3 || random() < 0.12 ? Material.Rock : (y < level + 4 ? Material.Soil : Material.Sand);
      }
    }
    // Unsettled dunes make gravity visible immediately instead of presenting an already static cross-section.
    for (let dune = 0; dune < 4; dune++) {
      const center = Math.floor(random() * this.w);
      const radius = 4 + Math.floor(random() * Math.max(4, this.w * 0.045));
      for (let dx = -radius; dx <= radius; dx++) {
        const x = (center + dx + this.w) % this.w;
        const height = Math.max(0, Math.floor((radius - Math.abs(dx)) * (0.35 + random() * 0.35)));
        for (let offset = 1; offset <= height; offset++) {
          const y = surface[x] - offset;
          if (y > 1) this.cells[y * this.w + x] = Material.Sand;
        }
      }
    }
    for (let x = 2; x < this.w - 2; x++) {
      if (random() < 0.18) {
        const y = surface[x] - 1;
        this.cells[y * this.w + x] = Material.Plant;
        this.age[y * this.w + x] = 20 + Math.floor(random() * 80);
      }
    }
    // A small initial pond lets the first plant cycle start before the first rain.
    const pondX = Math.floor(this.w * (0.2 + random() * 0.6));
    for (let y = Math.floor(this.h * 0.56); y < Math.floor(this.h * 0.66); y++) for (let x = pondX - 8; x <= pondX + 8; x++) {
      const i = y * this.w + ((x + this.w) % this.w);
      if (this.cells[i] === Material.Empty) this.cells[i] = Material.Water;
    }
  }

  step(random: () => number): TerrariumStats {
    this.stepNo++; this.touched.fill(0);
    let movedSand = 0, grown = 0, burned = 0;
    // Weather belongs to the world, not to a button: recurring rain and occasional lightning.
    if (this.stepNo % 7 === 0 && (this.stepNo % 900) < 360) {
      for (let n = 0; n < Math.max(1, Math.floor(this.w / 55)); n++) {
        const x = Math.floor(random() * this.w), i = x;
        if (this.cells[i] === Material.Empty) this.cells[i] = Material.Water;
      }
    }
    if (this.stepNo > 500 && this.stepNo % 1050 === 0) {
      const plants: number[] = [];
      for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === Material.Plant) plants.push(i);
      if (plants.length) { const i = plants[Math.floor(random() * plants.length)]; this.cells[i] = Material.Fire; this.age[i] = 0; }
    }

    const leftFirst = this.stepNo % 2 === 0;
    for (let y = this.h - 2; y >= 0; y--) for (let n = 0; n < this.w; n++) {
      const x = leftFirst ? n : this.w - 1 - n;
      const i = y * this.w + x;
      if (this.touched[i]) continue;
      const material = this.cells[i];
      if (material === Material.Empty || material === Material.Rock) continue;
      this.age[i] = Math.min(65535, this.age[i] + 1);
      if (material === Material.Sand) { if (this.movePowder(i, x, y, random)) movedSand++; }
      else if (material === Material.Water) this.moveWater(i, x, y, random);
      else if (material === Material.Plant) grown += this.growPlant(i, x, y, random);
      else if (material === Material.Fire) burned += this.burn(i, x, y, random);
      else if (material === Material.Smoke) this.moveSmoke(i, x, y, random);
    }
    const counts = new Uint32Array(8);
    for (const material of this.cells) counts[material]++;
    return { step: this.stepNo, counts, movedSand, grown, burned };
  }

  private swap(a: number, b: number): void {
    const m = this.cells[a]; this.cells[a] = this.cells[b]; this.cells[b] = m;
    const age = this.age[a]; this.age[a] = this.age[b]; this.age[b] = age;
    this.touched[a] = 1; this.touched[b] = 1;
  }

  private movePowder(i: number, x: number, y: number, random: () => number): boolean {
    const below = i + this.w;
    if (this.cells[below] === Material.Empty || this.cells[below] === Material.Water) { this.swap(i, below); return true; }
    const first = random() < 0.5 ? -1 : 1;
    for (const dx of [first, -first]) {
      const nx = (x + dx + this.w) % this.w, j = (y + 1) * this.w + nx;
      if (this.cells[j] === Material.Empty || this.cells[j] === Material.Water) { this.swap(i, j); return true; }
    }
    return false;
  }

  private moveWater(i: number, x: number, y: number, random: () => number): void {
    if (this.cells[i + this.w] === Material.Empty) { this.swap(i, i + this.w); return; }
    const first = random() < 0.5 ? -1 : 1;
    for (const dx of [first, -first, first * 2, first * 3]) {
      const nx = (x + dx + this.w) % this.w, j = y * this.w + nx;
      if (this.cells[j] === Material.Empty) { this.swap(i, j); return; }
    }
    // Water slowly turns exposed sand into soil, closing the plant-water-soil loop.
    if (random() < 0.012) for (const j of this.neighbors4(x, y)) if (this.cells[j] === Material.Sand) { this.cells[j] = Material.Soil; break; }
  }

  private growPlant(i: number, x: number, y: number, random: () => number): number {
    let water = false;
    for (let oy = -2; oy <= 2 && !water; oy++) for (let ox = -2; ox <= 2; ox++) {
      const nx = (x + ox + this.w) % this.w, ny = y + oy;
      if (ny >= 0 && ny < this.h && this.cells[ny * this.w + nx] === Material.Water) { water = true; break; }
    }
    if (!water || this.age[i] % 18 !== 0 || random() > 0.38) return 0;
    const options = [[0,-1],[-1,0],[1,0],[-1,-1],[1,-1]];
    const [dx, dy] = options[Math.floor(random() * options.length)];
    const nx = (x + dx + this.w) % this.w, ny = y + dy;
    if (ny < 1 || ny >= this.h) return 0;
    const j = ny * this.w + nx;
    if (this.cells[j] === Material.Empty) { this.cells[j] = Material.Plant; this.age[j] = 0; this.touched[j] = 1; return 1; }
    return 0;
  }

  private burn(i: number, x: number, y: number, random: () => number): number {
    let burned = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = (x + ox + this.w) % this.w, ny = y + oy;
      if (ny < 0 || ny >= this.h) continue;
      const j = ny * this.w + nx;
      if (this.cells[j] === Material.Plant && random() < 0.24) { this.cells[j] = Material.Fire; this.age[j] = 0; this.touched[j] = 1; burned++; }
      else if (this.cells[j] === Material.Water && random() < 0.08) { this.cells[j] = Material.Smoke; this.age[j] = 0; }
    }
    if (this.age[i] > 22 + random() * 28) { this.cells[i] = random() < 0.35 ? Material.Soil : Material.Smoke; this.age[i] = 0; }
    return burned;
  }

  private moveSmoke(i: number, x: number, y: number, random: () => number): void {
    if (this.age[i] > 80 || random() < 0.012) { this.cells[i] = Material.Empty; this.age[i] = 0; return; }
    if (y <= 0) { this.cells[i] = Material.Empty; return; }
    const dx = random() < 0.34 ? -1 : random() < 0.66 ? 1 : 0;
    const j = (y - 1) * this.w + (x + dx + this.w) % this.w;
    if (this.cells[j] === Material.Empty) this.swap(i, j);
  }

  private neighbors4(x: number, y: number): number[] {
    const result = [y * this.w + (x - 1 + this.w) % this.w, y * this.w + (x + 1) % this.w];
    if (y > 0) result.push((y - 1) * this.w + x);
    if (y + 1 < this.h) result.push((y + 1) * this.w + x);
    return result;
  }
}

export type TerrariumEvent = 'flood' | 'erosion' | 'fire' | 'wildfire' | 'recovery';

export class TerrariumWatcher {
  private lastEvent = -1000;
  private peakPlants = 0;
  private sawFire = false;
  private lowestAfterFire = Infinity;
  reset(): void { this.lastEvent = -1000; this.peakPlants = 0; this.sawFire = false; this.lowestAfterFire = Infinity; }
  observe(stats: TerrariumStats): TerrariumEvent | null {
    const total = stats.counts.reduce((a, b) => a + b, 0);
    const plants = stats.counts[Material.Plant], fire = stats.counts[Material.Fire], water = stats.counts[Material.Water];
    this.peakPlants = Math.max(this.peakPlants, plants);
    if (this.sawFire) this.lowestAfterFire = Math.min(this.lowestAfterFire, plants);
    if (stats.step - this.lastEvent < 100) return null;
    let event: TerrariumEvent | null = null;
    if (!this.sawFire && fire > 0) { event = 'fire'; this.sawFire = true; this.lowestAfterFire = plants; }
    else if (fire > 24 || stats.burned > 10) event = 'wildfire';
    else if (this.sawFire && fire === 0 && plants > this.lowestAfterFire + 18 && stats.grown > 0) event = 'recovery';
    else if (water / total > 0.13) event = 'flood';
    else if (stats.movedSand > Math.max(12, total * 0.004)) event = 'erosion';
    if (event) this.lastEvent = stats.step;
    return event;
  }
}
