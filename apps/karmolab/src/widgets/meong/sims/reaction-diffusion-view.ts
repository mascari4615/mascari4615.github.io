import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { ReactionDiffusion, ReactionWatcher, presetForDay, type ReactionStats } from './reaction-diffusion';
import { rng } from './rules';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

export function buildReactionDiffusion(host: SimHost): SimHandle {
  const canvas = simCanvas(host, true);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose(): void {} };
  const fieldCanvas = document.createElement('canvas');
  const fieldCtx = fieldCanvas.getContext('2d');
  if (!fieldCtx) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const preset = presetForDay(day);
  const run = pacer();
  let sim = new ReactionDiffusion(1, 1);
  const watcher = new ReactionWatcher();
  let pixels = fieldCtx.createImageData(1, 1);
  let loop: GardenLoop | undefined;
  let alive = true;
  let seedNo = 0;

  function build(): void {
    const { w: cw, h: ch } = stageSize(host);
    const w = Math.max(72, Math.floor(cw / 3));
    const h = Math.max(48, Math.floor(ch / 3));
    canvas.width = cw;
    canvas.height = ch;
    fieldCanvas.width = w;
    fieldCanvas.height = h;
    pixels = fieldCtx!.createImageData(w, h);
    sim = new ReactionDiffusion(w, h);
    plant();
  }

  function plant(): void {
    seedNo++;
    let hash = seedNo * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    sim.seed(rng(hash >>> 0));
    watcher.reset();
    host.say(t('garden.rd.seeded', { n: seedNo }), t('garden.rd.hint'));
  }

  function draw(stats: ReactionStats): void {
    const data = pixels.data;
    for (let i = 0, p = 0; i < sim.b.length; i++, p += 4) {
      const b = Math.max(0, Math.min(1, sim.b[i] * 1.65));
      const edge = Math.max(0, Math.min(1, (sim.b[i] - sim.a[i] + 0.45) * 1.7));
      data[p] = 5 + 42 * b;
      data[p + 1] = 10 + 190 * edge;
      data[p + 2] = 15 + 220 * b;
      data[p + 3] = 255;
    }
    fieldCtx!.putImageData(pixels, 0, 0);
    ctx!.imageSmoothingEnabled = true;
    ctx!.drawImage(fieldCanvas, 0, 0, canvas.width, canvas.height);
    host.setStep(t('garden.rd.step', { n: stats.step }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats: ReactionStats = { step: sim.stepNo, active: 0, edge: 0, delta: 0 };
    run(host, 3, () => { stats = sim.step(preset); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.rd.event.${event}`, { n: stats.step }), t('garden.rd.hint'));
    draw(stats);
    if (stats.step >= 6500 || event === 'settled') window.setTimeout(() => alive && plant(), 3200);
  }

  const name = t(`garden.rd.preset.${preset.id}`);
  host.setName(name, `F ${preset.feed}, K ${preset.kill}`);
  host.action('reseed', '✧', t('garden.reseed'), plant);
  build();
  host.say(t('garden.rd.today', { name }), t('garden.rd.hint'));
  loop = gloop(frame, host.stage);

  const ro = new ResizeObserver(() => {
    const { w: cw, h: ch } = stageSize(host);
    const w = Math.max(72, Math.floor(cw / 3));
    const h = Math.max(48, Math.floor(ch / 3));
    if (w !== sim.w || h !== sim.h) build();
  });
  ro.observe(host.stage);

  return {
    dispose(): void {
      alive = false;
      loop?.stop();
      ro.disconnect();
    }
  };
}
