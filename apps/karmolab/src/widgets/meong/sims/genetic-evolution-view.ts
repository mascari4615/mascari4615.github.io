import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { EvolutionWatcher, GeneticEvolution, type EvolutionStats } from './genetic-evolution';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

const COLORS = ['#77d9ff', '#ffd36f', '#ff7f9e', '#a990ff', '#76e39b', '#ff9f63', '#72d8ca', '#e792dd'];

export function buildGeneticEvolution(host: SimHost): SimHandle {
  const canvas = simCanvas(host);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const run = pacer();
  const sim = new GeneticEvolution();
  const watcher = new EvolutionWatcher();
  let seedNo = 0;
  let random = rng(1);
  let loop: GardenLoop | undefined;

  function randomFor(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function resize(): void {
    const { w, h } = stageSize(host);
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }

  function plant(): void {
    seedNo++;
    random = randomFor(seedNo);
    sim.seed(random);
    watcher.reset();
    host.say(t('garden.ev.seeded', { n: seedNo }), t('garden.ev.hint'));
  }

  function draw(stats: EvolutionStats): void {
    const w = canvas.width;
    const h = canvas.height;
    c!.fillStyle = 'rgba(8,11,16,.25)';
    c!.fillRect(0, 0, w, h);
    c!.fillStyle = '#d8f29a';
    for (let f = 0; f < sim.foodCount; f++) {
      c!.beginPath();
      c!.arc(sim.foodX[f] * w, sim.foodY[f] * h, 2.6, 0, Math.PI * 2);
      c!.fill();
    }
    for (let i = 0; i < sim.count; i++) {
      const color = COLORS[sim.speciesOf[i] % COLORS.length];
      const a = sim.heading[i];
      const size = 3.3 + sim.energy[i] * 1.8;
      c!.save();
      c!.translate(sim.x[i] * w, sim.y[i] * h);
      c!.rotate(a);
      c!.fillStyle = color;
      c!.beginPath();
      c!.moveTo(size, 0);
      c!.lineTo(-size, size * 0.56);
      c!.lineTo(-size * 0.5, 0);
      c!.lineTo(-size, -size * 0.56);
      c!.closePath();
      c!.fill();
      c!.restore();
    }
    host.setStep(t('garden.ev.step', { g: stats.generation, n: stats.tick, s: stats.species }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats = null as unknown as EvolutionStats;
    run(host, 2, () => { stats = sim.step(random); });
    const event = watcher.observe(stats);
    if (event) {
      host.say(
        t(`garden.ev.event.${event}`, {
          g: stats.generation,
          best: Math.round(stats.bestFitness),
          d: stats.diversity.toFixed(2),
          s: stats.species,
          id: stats.champion
        }),
        t('garden.ev.hint')
      );
    }
    draw(stats);
  }

  host.setName(t('garden.ev.name'), t('garden.ev.code'));
  host.action('reseed', '✧', t('garden.reseed'), plant);
  resize();
  plant();
  host.say(t('garden.ev.today'), t('garden.ev.hint'));
  loop = gloop(frame, host.stage);

  const ro = new ResizeObserver(resize);
  ro.observe(host.stage);

  return {
    dispose(): void {
      loop?.stop();
      ro.disconnect();
    }
  };
}
