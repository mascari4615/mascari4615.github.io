import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { Physarum, PhysarumWatcher, type PhysarumStats } from './physarum';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

export function buildPhysarum(host: SimHost): SimHandle {
  const canvas = simCanvas(host, true);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };
  const field = document.createElement('canvas');
  const fc = field.getContext('2d');
  if (!fc) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const run = pacer();
  const watcher = new PhysarumWatcher();
  let seedNo = 0;
  let loop: GardenLoop | undefined;
  let sim = new Physarum(1, 1, 1);
  let pixels = fc.createImageData(1, 1);
  let random = rng(1);

  function seededRandom(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function grid(): { w: number; h: number; cw: number; ch: number } {
    const { w, h } = stageSize(host);
    return { w: Math.max(100, Math.floor(w / 3)), h: Math.max(65, Math.floor(h / 3)), cw: w, ch: h };
  }

  function build(): void {
    const g = grid();
    canvas.width = g.cw;
    canvas.height = g.ch;
    field.width = g.w;
    field.height = g.h;
    pixels = fc!.createImageData(g.w, g.h);
    sim = new Physarum(g.w, g.h, Math.min(900, Math.max(520, Math.round((g.w * g.h) / 23))));
    plant();
  }

  function plant(): void {
    seedNo++;
    random = seededRandom(seedNo);
    sim.seed(random);
    watcher.reset();
    host.say(t('garden.ph.seeded', { n: seedNo }), t('garden.ph.hint'));
  }

  function draw(stats: PhysarumStats): void {
    const data = pixels.data;
    for (let i = 0, p = 0; i < sim.trail.length; i++, p += 4) {
      const q = Math.min(1, sim.trail[i] * 2.2);
      data[p] = 8 + q * 226;
      data[p + 1] = 7 + q * 178;
      data[p + 2] = 10 + q * 48;
      data[p + 3] = 255;
    }
    fc!.putImageData(pixels, 0, 0);
    c!.imageSmoothingEnabled = true;
    c!.drawImage(field, 0, 0, canvas.width, canvas.height);
    for (const food of sim.foods) {
      c!.fillStyle = '#fff4b8';
      c!.beginPath();
      c!.arc((food.x / sim.w) * canvas.width, (food.y / sim.h) * canvas.height, 4, 0, Math.PI * 2);
      c!.fill();
    }
    host.setStep(t('garden.ph.step', { n: stats.step }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats = null as unknown as PhysarumStats;
    run(host, 1, () => { stats = sim.step(random); });
    if (sim.stepNo === 1900) {
      sim.damage();
      host.say(t(`garden.ph.event.${watcher.markDamage(sim.stepNo)}`, { n: sim.stepNo }), t('garden.ph.hint'));
    } else {
      const event = watcher.observe(stats, sim.foods.length);
      if (event) host.say(t(`garden.ph.event.${event}`, { n: stats.step }), t('garden.ph.hint'));
    }
    draw(stats);
    if (sim.stepNo >= 5200) plant();
  }

  host.setName(t('garden.ph.name'), t('garden.ph.code'));
  host.action('reseed', '✧', t('garden.reseed'), plant);
  build();
  host.say(t('garden.ph.today'), t('garden.ph.hint'));
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
