import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { CyclicEcosystem, CyclicWatcher, type CyclicStats } from './cyclic-ecosystem';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

const COLORS = [[26, 151, 138], [238, 193, 74], [224, 91, 104], [117, 108, 193], [82, 156, 220]];

export function buildCyclicEcosystem(host: SimHost): SimHandle {
  const canvas = simCanvas(host, true);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };
  const field = document.createElement('canvas');
  const fc = field.getContext('2d');
  if (!fc) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const run = pacer();
  const watcher = new CyclicWatcher();
  let seedNo = 0;
  let loop: GardenLoop | undefined;
  let restartTimer: number | undefined;
  let sim = new CyclicEcosystem(1, 1);
  let pixels = fc.createImageData(1, 1);

  function randomFor(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function grid(): { w: number; h: number; cw: number; ch: number } {
    const { w, h } = stageSize(host);
    return { w: Math.max(85, Math.floor(w / 4)), h: Math.max(58, Math.floor(h / 4)), cw: w, ch: h };
  }

  function build(): void {
    const g = grid();
    canvas.width = g.cw;
    canvas.height = g.ch;
    field.width = g.w;
    field.height = g.h;
    pixels = fc!.createImageData(g.w, g.h);
    sim = new CyclicEcosystem(g.w, g.h, 5);
    plant();
  }

  function plant(): void {
    if (restartTimer !== undefined) window.clearTimeout(restartTimer);
    restartTimer = undefined;
    seedNo++;
    sim.seed(randomFor(seedNo));
    watcher.reset();
    host.say(t('garden.ce.seeded', { n: seedNo }), t('garden.ce.hint'));
  }

  function draw(stats: CyclicStats): void {
    const data = pixels.data;
    for (let i = 0, p = 0; i < sim.cells.length; i++, p += 4) {
      const color = COLORS[sim.cells[i]];
      data[p] = color[0];
      data[p + 1] = color[1];
      data[p + 2] = color[2];
      data[p + 3] = 255;
    }
    fc!.putImageData(pixels, 0, 0);
    c!.imageSmoothingEnabled = false;
    c!.drawImage(field, 0, 0, canvas.width, canvas.height);
    host.setStep(t('garden.ce.step', { n: stats.gen }));
  }

  function frame(): void {
    if (!host.running() || restartTimer !== undefined) return;
    let stats = null as unknown as CyclicStats;
    run(host, 2, () => { stats = sim.step(2); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.ce.event.${event}`, { n: stats.gen, species: stats.leader + 1 }), t('garden.ce.hint'));
    draw(stats);
    if (stats.gen >= 5000 || event === 'extinct') restartTimer = window.setTimeout(plant, 2400);
  }

  host.setName(t('garden.ce.name'), t('garden.ce.code'));
  host.action('reseed', '✧', t('garden.reseed'), plant);
  build();
  host.say(t('garden.ce.today'), t('garden.ce.hint'));
  loop = gloop(frame, host.stage);

  const ro = new ResizeObserver(() => {
    const g = grid();
    if (g.w !== sim.w || g.h !== sim.h) build();
  });
  ro.observe(host.stage);

  return {
    dispose(): void {
      loop?.stop();
      if (restartTimer !== undefined) window.clearTimeout(restartTimer);
      ro.disconnect();
    }
  };
}
