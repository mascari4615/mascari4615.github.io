import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { Boids, BoidWatcher, type BoidStats } from './boids';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

export function buildBoids(host: SimHost): SimHandle {
  const canvas = simCanvas(host);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const run = pacer();
  const sim = new Boids(190, 2);
  const watcher = new BoidWatcher();
  let seedNo = 0;
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
    sim.seed(randomFor(seedNo));
    watcher.reset();
    host.say(t('garden.bd.seeded', { n: seedNo }), t('garden.bd.hint'));
  }

  function triangle(x: number, y: number, vx: number, vy: number, size: number, color: string): void {
    const a = Math.atan2(vy, vx);
    c!.save();
    c!.translate(x, y);
    c!.rotate(a);
    c!.fillStyle = color;
    c!.beginPath();
    c!.moveTo(size, 0);
    c!.lineTo(-size * 0.72, size * 0.5);
    c!.lineTo(-size * 0.45, 0);
    c!.lineTo(-size * 0.72, -size * 0.5);
    c!.closePath();
    c!.fill();
    c!.restore();
  }

  function draw(stats: BoidStats): void {
    const w = canvas.width;
    const h = canvas.height;
    c!.fillStyle = 'rgba(7,17,27,.34)';
    c!.fillRect(0, 0, w, h);
    for (let i = 0; i < sim.count; i++) triangle(sim.x[i] * w, sim.y[i] * h, sim.vx[i], sim.vy[i], 4.2, '#b9ecff');
    for (let p = 0; p < sim.predatorCount; p++) triangle(sim.px[p] * w, sim.py[p] * h, sim.pvx[p], sim.pvy[p], 9, '#ff7b69');
    host.setStep(t('garden.bd.step', { n: stats.step, f: stats.flocks }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats = null as unknown as BoidStats;
    run(host, 1, () => { stats = sim.step(); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.bd.event.${event}`, { n: stats.step, f: stats.flocks }), t('garden.bd.hint'));
    draw(stats);
    if (stats.step >= 8000) plant();
  }

  host.setName(t('garden.bd.name'), t('garden.bd.code'));
  host.action('reseed', '✧', t('garden.reseed'), plant);
  resize();
  plant();
  host.say(t('garden.bd.today'), t('garden.bd.hint'));
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
