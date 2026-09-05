import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { NeuralCA, NeuralWatcher, neuralShapeForDay, type NeuralStats } from './neural-ca';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

export function buildNeuralCA(host: SimHost): SimHandle {
  const canvas = simCanvas(host, true);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };
  const field = document.createElement('canvas');
  const fc = field.getContext('2d');
  if (!fc) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const shape = neuralShapeForDay(day);
  const run = pacer();
  const watcher = new NeuralWatcher();
  let seedNo = 0;
  let autoDamaged = false;
  let loop: GardenLoop | undefined;
  let sim = new NeuralCA(1, 1, shape);
  let pixels = fc.createImageData(1, 1);
  let random = rng(1);

  function randomFor(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function grid(): { w: number; h: number; cw: number; ch: number } {
    const { w, h } = stageSize(host);
    return { w: Math.max(72, Math.floor(w / 5)), h: Math.max(48, Math.floor(h / 5)), cw: w, ch: h };
  }

  function build(): void {
    const g = grid();
    canvas.width = g.cw;
    canvas.height = g.ch;
    field.width = g.w;
    field.height = g.h;
    pixels = fc!.createImageData(g.w, g.h);
    sim = new NeuralCA(g.w, g.h, shape);
    plant();
  }

  function plant(): void {
    seedNo++;
    random = randomFor(seedNo);
    sim.seed();
    watcher.reset();
    autoDamaged = false;
    host.say(t('garden.nc.seeded', { n: seedNo }), t('garden.nc.hint'));
  }

  function hurt(): void {
    sim.damage(random);
    autoDamaged = true;
    host.say(t(`garden.nc.event.${watcher.markDamage(sim.stepNo)}`, { n: sim.stepNo }), t('garden.nc.hint'));
  }

  function draw(stats: NeuralStats): void {
    const data = pixels.data;
    for (let i = 0, p = 0; i < sim.cells.length; i++, p += 4) {
      const q = sim.cells[i];
      const ghost = sim.target[i] * 0.08;
      data[p] = 9 + ghost * 90 + q * 205;
      data[p + 1] = 6 + ghost * 42 + q * 105;
      data[p + 2] = 14 + ghost * 105 + q * 230;
      data[p + 3] = 255;
    }
    fc!.putImageData(pixels, 0, 0);
    c!.imageSmoothingEnabled = true;
    c!.drawImage(field, 0, 0, canvas.width, canvas.height);
    host.setStep(t('garden.nc.step', { n: stats.step, p: Math.round(stats.similarity * 100) }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats = null as unknown as NeuralStats;
    run(host, 2, () => { stats = sim.step(random); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.nc.event.${event}`, { n: stats.step, p: Math.round(stats.similarity * 100) }), t('garden.nc.hint'));
    if (!autoDamaged && stats.step >= 700) hurt();
    draw(stats);
    if (stats.step >= 2400) plant();
  }

  const name = t(`garden.nc.shape.${shape}`);
  host.setName(name, t('garden.nc.code'));
  host.action('damage', '✂', t('garden.nc.damage'), hurt);
  host.action('reseed', '✧', t('garden.reseed'), plant);
  build();
  host.say(t('garden.nc.today', { shape: name }), t('garden.nc.hint'));
  loop = gloop(frame, host.stage);

  const ro = new ResizeObserver(() => {
    const g = grid();
    if (g.w !== sim.w || g.h !== sim.h) build();
  });
  ro.observe(host.stage);

  return {
    dispose(): void {
      loop?.stop();
      ro.disconnect();
    }
  };
}
