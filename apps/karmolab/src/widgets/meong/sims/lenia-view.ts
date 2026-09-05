import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { Lenia, LeniaWatcher, leniaPresetForDay, type LeniaStats } from './lenia';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

export function buildLenia(host: SimHost): SimHandle {
  const canvas = simCanvas(host, true);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };
  const field = document.createElement('canvas');
  const fc = field.getContext('2d');
  if (!fc) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const preset = leniaPresetForDay(day);
  const run = pacer();
  const watcher = new LeniaWatcher();
  let seedNo = 0;
  let loop: GardenLoop | undefined;
  let sim = new Lenia(1, 1, preset);
  let pixels = fc.createImageData(1, 1);

  function randomFor(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function grid(): { w: number; h: number; cw: number; ch: number } {
    const { w, h } = stageSize(host);
    return { w: Math.max(72, Math.floor(w / 6)), h: Math.max(48, Math.floor(h / 6)), cw: w, ch: h };
  }

  function build(): void {
    const g = grid();
    canvas.width = g.cw;
    canvas.height = g.ch;
    field.width = g.w;
    field.height = g.h;
    pixels = fc!.createImageData(g.w, g.h);
    sim = new Lenia(g.w, g.h, preset);
    plant();
  }

  function plant(): void {
    seedNo++;
    sim.seed(randomFor(seedNo));
    watcher.reset();
    host.say(t('garden.ln.seeded', { n: seedNo }), t('garden.ln.hint'));
  }

  function draw(stats: LeniaStats): void {
    const data = pixels.data;
    for (let i = 0, p = 0; i < sim.cells.length; i++, p += 4) {
      const q = Math.max(0, Math.min(1, sim.cells[i]));
      data[p] = 5 + q * 96;
      data[p + 1] = 9 + q * 225;
      data[p + 2] = 12 + q * 190;
      data[p + 3] = 255;
    }
    fc!.putImageData(pixels, 0, 0);
    c!.imageSmoothingEnabled = true;
    c!.drawImage(field, 0, 0, canvas.width, canvas.height);
    host.setStep(t('garden.ln.step', { n: stats.step }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats = null as unknown as LeniaStats;
    run(host, 1, () => { stats = sim.step(); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.ln.event.${event}`, { n: stats.step, c: stats.components }), t('garden.ln.hint'));
    draw(stats);
    if (stats.step >= 3200 || stats.mass < 0.00005) plant();
  }

  const name = t(`garden.ln.preset.${preset.id}`);
  host.setName(name, `R ${preset.radius}, μ ${preset.mu}, σ ${preset.sigma}`);
  host.action('reseed', '✧', t('garden.reseed'), plant);
  build();
  host.say(t('garden.ln.today', { name }), t('garden.ln.hint'));
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
