export interface Genome { id: number; genes: Float32Array; parentA: number; parentB: number; born: number; }
export interface EvolutionStats {
  generation: number; tick: number; bestFitness: number; meanFitness: number; diversity: number; species: number;
  advanced: boolean; breakthrough: boolean; champion: number;
}

function sigmoid(value: number): number { return 1 / (1 + Math.exp(-value)); }
function angleDelta(from: number, to: number): number { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class GeneticEvolution {
  readonly count: number; readonly foodCount: number; readonly generationLength: number;
  genomes: Genome[] = [];
  x: Float32Array; y: Float32Array; heading: Float32Array; energy: Float32Array; fitness: Float32Array; eaten: Uint16Array;
  foodX: Float32Array; foodY: Float32Array; speciesOf: Uint8Array;
  generation = 0; tick = 0; private nextId = 1; private recordFitness = 0;

  constructor(count = 64, foodCount = 20, generationLength = 620) {
    this.count = count; this.foodCount = foodCount; this.generationLength = generationLength;
    this.x = new Float32Array(count); this.y = new Float32Array(count); this.heading = new Float32Array(count); this.energy = new Float32Array(count); this.fitness = new Float32Array(count); this.eaten = new Uint16Array(count);
    this.foodX = new Float32Array(foodCount); this.foodY = new Float32Array(foodCount); this.speciesOf = new Uint8Array(count);
  }

  seed(random: () => number): void {
    this.generation = 1; this.tick = 0; this.nextId = 1; this.recordFitness = 0; this.genomes = [];
    for (let i = 0; i < this.count; i++) { const genes = new Float32Array(7); for (let g = 0; g < genes.length; g++) genes[g] = random() * 4 - 2; this.genomes.push({ id: this.nextId++, genes, parentA: 0, parentB: 0, born: 1 }); }
    for (let f = 0; f < this.foodCount; f++) { const angle = f / this.foodCount * Math.PI * 2 + random() * 0.08; const radius = f % 2 ? 0.38 : 0.24; this.foodX[f] = (0.5 + Math.cos(angle) * radius + 1) % 1; this.foodY[f] = (0.5 + Math.sin(angle) * radius + 1) % 1; }
    this.resetArena(random);
  }

  step(random: () => number): EvolutionStats {
    this.tick++;
    for (let i = 0; i < this.count; i++) {
      // Each creature follows the same cyclic waypoint course at a different offset. Sharing the visible
      // food field but not consuming one another's target removes luck from evaluation while preserving a crowd.
      const nearest = (i + this.eaten[i]) % this.foodCount;
      let nearestDx = this.foodX[nearest] - this.x[i], nearestDy = this.foodY[nearest] - this.y[i]; if (nearestDx > 0.5) nearestDx--; else if (nearestDx < -0.5) nearestDx++; if (nearestDy > 0.5) nearestDy--; else if (nearestDy < -0.5) nearestDy++;
      const nearestD2 = nearestDx * nearestDx + nearestDy * nearestDy;
      const genes = this.genomes[i].genes; const error = angleDelta(this.heading[i], Math.atan2(nearestDy, nearestDx)); const sin = Math.sin(error), cos = Math.cos(error);
      const turn = Math.tanh(genes[0] * sin + genes[1] * cos + genes[2] * this.energy[i] + genes[3]) * 0.20;
      const thrust = 0.0012 + sigmoid(genes[4] * cos + genes[5] * this.energy[i] + genes[6]) * 0.0036;
      this.heading[i] += turn; this.x[i] = (this.x[i] + Math.cos(this.heading[i]) * thrust + 1) % 1; this.y[i] = (this.y[i] + Math.sin(this.heading[i]) * thrust + 1) % 1;
      this.energy[i] = Math.max(0.08, this.energy[i] - thrust * 0.085);
      // Dense selection signal: looking toward food is rewarded every tick, while capture remains valuable
      // without letting one lucky respawn dominate an entire generation.
      this.fitness[i] += Math.max(0, cos) * 0.055 + 0.0012 / (Math.sqrt(nearestD2) + 0.035) - Math.abs(turn) * 0.012 - thrust * 0.08;
      if (nearestD2 < 0.022 ** 2) { this.eaten[i]++; this.energy[i] = Math.min(1, this.energy[i] + 0.24); this.fitness[i] += 16; }
    }
    if (this.tick < this.generationLength) return this.stats(false, false);
    return this.evolve(random);
  }

  private evolve(random: () => number): EvolutionStats {
    const ranked = Array.from({ length: this.count }, (_, i) => i).sort((a, b) => this.fitness[b] - this.fitness[a]);
    const generationBest = this.fitness[ranked[0]]; const breakthrough = generationBest > this.recordFitness * 1.12 + 3; this.recordFitness = Math.max(this.recordFitness, generationBest);
    const next: Genome[] = [];
    for (let elite = 0; elite < 4; elite++) { const source = this.genomes[ranked[elite]]; next.push({ id: this.nextId++, genes: new Float32Array(source.genes), parentA: source.id, parentB: source.id, born: this.generation + 1 }); }
    const tournament = (): Genome => { let best = Math.floor(random() * this.count); for (let k = 0; k < 3; k++) { const candidate = Math.floor(random() * this.count); if (this.fitness[candidate] > this.fitness[best]) best = candidate; } return this.genomes[best]; };
    while (next.length < this.count) {
      const a = tournament(), b = tournament(), genes = new Float32Array(7);
      for (let g = 0; g < genes.length; g++) { let value = random() < 0.5 ? a.genes[g] : b.genes[g]; if (random() < 0.24) value += (random() + random() + random() - 1.5) * 0.9; genes[g] = Math.max(-4, Math.min(4, value)); }
      next.push({ id: this.nextId++, genes, parentA: a.id, parentB: b.id, born: this.generation + 1 });
    }
    const result = this.stats(true, breakthrough, ranked[0]); this.genomes = next; this.generation++; this.tick = 0; this.resetArena(random); return result;
  }

  private resetArena(random: () => number): void {
    this.fitness.fill(0); this.eaten.fill(0); this.energy.fill(1);
    for (let i = 0; i < this.count; i++) { const angle = i / this.count * Math.PI * 2, radius = 0.075 + (i % 3) * 0.016; this.x[i] = (0.5 + Math.cos(angle) * radius + 1) % 1; this.y[i] = (0.5 + Math.sin(angle) * radius + 1) % 1; this.heading[i] = angle + Math.PI * 0.5; }
    this.clusterSpecies();
  }

  private stats(advanced: boolean, breakthrough: boolean, champion = -1): EvolutionStats {
    let mean = 0, best = -Infinity, bestAt = 0; for (let i = 0; i < this.count; i++) { mean += this.fitness[i]; if (this.fitness[i] > best) { best = this.fitness[i]; bestAt = i; } }
    const geneMeans = new Float64Array(7); for (const genome of this.genomes) for (let g = 0; g < 7; g++) geneMeans[g] += genome.genes[g] / this.count;
    let variance = 0; for (const genome of this.genomes) for (let g = 0; g < 7; g++) variance += (genome.genes[g] - geneMeans[g]) ** 2; const diversity = Math.sqrt(variance / (this.count * 7));
    const species = new Set(Array.from(this.speciesOf)).size;
    return { generation: this.generation, tick: this.tick, bestFitness: Math.max(0, best), meanFitness: mean / this.count, diversity, species, advanced, breakthrough, champion: champion >= 0 ? this.genomes[champion].id : this.genomes[bestAt].id };
  }

  private clusterSpecies(): void {
    const representatives: number[] = [];
    for (let i = 0; i < this.count; i++) { let assigned = -1; for (let s = 0; s < representatives.length; s++) { const other = this.genomes[representatives[s]]; let distance = 0; for (let g = 0; g < 7; g++) distance += (this.genomes[i].genes[g] - other.genes[g]) ** 2; if (Math.sqrt(distance / 7) < 0.72) { assigned = s; break; } } if (assigned < 0) { assigned = representatives.length; representatives.push(i); } this.speciesOf[i] = assigned; }
  }
}

export type EvolutionEvent = 'generation' | 'breakthrough' | 'diversityLow' | 'speciation';
export class EvolutionWatcher {
  private lowDiversity = false; private maxSpecies = 0;
  reset(): void { this.lowDiversity = false; this.maxSpecies = 0; }
  observe(stats: EvolutionStats): EvolutionEvent | null {
    const previousMaxSpecies = this.maxSpecies;
    this.maxSpecies = Math.max(this.maxSpecies, stats.species);
    if (stats.breakthrough) return 'breakthrough';
    if (!this.lowDiversity && stats.generation > 4 && stats.diversity < 0.22) { this.lowDiversity = true; return 'diversityLow'; }
    if (stats.species > previousMaxSpecies && previousMaxSpecies > 0 && stats.species >= 3) return 'speciation';
    if (stats.advanced) return 'generation';
    return null;
  }
}
