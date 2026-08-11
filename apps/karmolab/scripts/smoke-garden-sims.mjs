import * as esbuild from 'esbuild';
import { runInNewContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadTypeScript(relativePath) {
  const result = await esbuild.build({
    entryPoints: [join(root, relativePath)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, Math, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Map, Array });
  return module.exports;
}

function seededRandom(initial) {
  let state = initial >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function assert(name, condition, details) {
  console.log(`[garden-sims] ${name}`, JSON.stringify(details));
  if (!condition) {
    console.error(`[garden-sims] ${name} failed`);
    process.exitCode = 1;
  }
}

const reaction = await loadTypeScript('src/widgets/garden/reaction-diffusion.ts');
const reactionResults = {};
for (const preset of reaction.REACTION_PRESETS) {
  const model = new reaction.ReactionDiffusion(48, 32);
  model.seed(seededRandom(0x51ed270b));
  let stats;
  for (let step = 0; step < 360; step++) stats = model.step(preset);
  reactionResults[preset.id] = stats;
}
assert('Reaction diffusion', Object.values(reactionResults).every(stats =>
  Number.isFinite(stats.active) && stats.active > 0.002 && stats.delta >= 0
), reactionResults);

const particle = await loadTypeScript('src/widgets/garden/particle-life.ts');
const particleRandom = seededRandom(0xa4093822);
const particleWorld = new particle.ParticleLife(particle.makeParticleLifeConfig(particleRandom, 5, 110));
particleWorld.seed(particleRandom);
let particleStats;
for (let step = 0; step < 320; step++) particleStats = particleWorld.step();
assert('Particle Life', Number.isFinite(particleStats.kinetic) && particleStats.kinetic > 0 &&
  particleStats.neighborRate > 0 && particleWorld.x.every(value => value >= 0 && value < 1), particleStats);

const physarum = await loadTypeScript('src/widgets/garden/physarum.ts');
const physarumRandom = seededRandom(0x13198a2e);
const physarumWorld = new physarum.Physarum(48, 32, 180);
physarumWorld.seed(physarumRandom);
let physarumStats;
for (let step = 0; step < 600; step++) physarumStats = physarumWorld.step(physarumRandom);
assert('Physarum', physarumStats.coverage > 0.01 && physarumStats.connected >= 1 &&
  physarumWorld.trail.every(value => Number.isFinite(value) && value >= 0), physarumStats);

const cyclic = await loadTypeScript('src/widgets/garden/cyclic-ecosystem.ts');
const cyclicResults = [];
for (let seed = 0; seed < 8; seed++) {
  const cyclicWorld = new cyclic.CyclicEcosystem(72, 48, 5);
  cyclicWorld.seed(seededRandom(0x082efa98 + seed * 7919));
  let stats;
  let minimumAlive = 5;
  let meanBoundary = 0;
  for (let step = 0; step < 900; step++) {
    stats = cyclicWorld.step();
    if (step >= 450) {
      minimumAlive = Math.min(minimumAlive, [...stats.populations].filter(value => value > 0).length);
      meanBoundary += stats.boundary / 450;
    }
  }
  cyclicResults.push({ seed, minimumAlive, meanBoundary, leaderShare: stats.leaderShare, vortices: stats.vortices });
}
assert('Cyclic ecosystem', cyclicResults.every(result =>
  result.minimumAlive === 5 && result.meanBoundary > 0.08 && result.leaderShare < 0.75
), cyclicResults);

const sand = await loadTypeScript('src/widgets/garden/sand-terrarium.ts');
const sandRandom = seededRandom(0x452821e6);
const sandWorld = new sand.SandTerrarium(64, 40);
sandWorld.seed(sandRandom);
let sandStats;
let totalMoved = 0, totalGrown = 0, totalBurned = 0;
for (let step = 0; step < 1200; step++) {
  sandStats = sandWorld.step(sandRandom);
  totalMoved += sandStats.movedSand; totalGrown += sandStats.grown; totalBurned += sandStats.burned;
}
assert('Sand terrarium', sandStats.counts.reduce((sum, value) => sum + value, 0) === sandWorld.cells.length &&
  totalMoved > 0 && totalGrown > 0 && totalBurned > 0, { moved: totalMoved, grown: totalGrown, burned: totalBurned, counts: [...sandStats.counts] });

const boids = await loadTypeScript('src/widgets/garden/boids.ts');
const boidWorld = new boids.Boids(90, 2);
boidWorld.seed(seededRandom(0xbe5466cf));
let boidStats;
for (let step = 0; step < 360; step++) boidStats = boidWorld.step();
assert('Boids', boidStats.flocks >= 1 && boidStats.largestShare > 0.1 && boidStats.alignment > 0 &&
  boidWorld.x.every(value => value >= 0 && value < 1), boidStats);

const lenia = await loadTypeScript('src/widgets/garden/lenia.ts');
const leniaResults = {};
for (const preset of lenia.LENIA_PRESETS) {
  const model = new lenia.Lenia(48, 32, preset);
  model.seed(seededRandom(0xc0ac29b7));
  let stats;
  for (let step = 0; step < 180; step++) stats = model.step();
  leniaResults[preset.id] = stats;
}
assert('Lenia', Object.values(leniaResults).every(stats =>
  Number.isFinite(stats.mass) && stats.mass > 0.001 && stats.mass < 0.8 && stats.components > 0
), leniaResults);

const neural = await loadTypeScript('src/widgets/garden/neural-ca.ts');
const neuralResults = {};
for (const shape of neural.NEURAL_SHAPES) {
  const model = new neural.NeuralCA(72, 48, shape);
  const random = seededRandom(0x9e3779b9);
  model.seed();
  let stats;
  for (let step = 0; step < 700; step++) stats = model.step(random);
  const before = stats.similarity;
  model.damage(random);
  const damaged = model.step(random).similarity;
  for (let step = 0; step < 400; step++) stats = model.step(random);
  neuralResults[shape] = { before, damaged, after: stats.similarity, mass: stats.mass };
}

console.log('[garden-sims] Neural CA', JSON.stringify(neuralResults));
const failures = Object.entries(neuralResults).filter(([, value]) =>
  value.before < 0.7 || value.damaged >= value.before || value.after < value.damaged + 0.08
);
if (failures.length) {
  console.error('[garden-sims] Neural CA growth/recovery failed:', failures.map(([shape]) => shape).join(', '));
  process.exitCode = 1;
}

const evolution = await loadTypeScript('src/widgets/garden/genetic-evolution.ts');
const evolutionResults = [];
for (let seed = 0; seed < 5; seed++) {
  const world = new evolution.GeneticEvolution(40, 14, 320);
  const evolutionRandom = seededRandom(0x243f6a88 + seed * 104729);
  world.seed(evolutionRandom);
  const generationBest = [], generationDiversity = [];
  while (world.generation <= 20) {
    const stats = world.step(evolutionRandom);
    if (stats.advanced) { generationBest.push(stats.bestFitness); generationDiversity.push(stats.diversity); }
  }
  const firstFive = generationBest.slice(0, 5).reduce((sum, value) => sum + value, 0) / 5;
  const lastFive = generationBest.slice(-5).reduce((sum, value) => sum + value, 0) / 5;
  const inherited = world.genomes.filter(genome => genome.parentA > 0 && genome.parentB > 0).length;
  evolutionResults.push({ seed, improvement: lastFive / firstFive - 1, diversity: generationDiversity.at(-1), inherited });
}
assert('Genetic evolution', evolutionResults.filter(result => result.improvement > 0.04).length >= 4 &&
  evolutionResults.every(result => result.inherited === 40 && result.diversity > 0.08), evolutionResults);
