import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';
import { makeParticleLifeConfig, ParticleLife, ParticleLifeWatcher, type ParticleLifeStats } from './particle-life';

const COLORS = ['#70e1f5', '#ffd36a', '#ff719a', '#a78bfa', '#83ef9b'];

export function buildParticleLife(host: SimHost): SimHandle {
  const canvas = simCanvas(host);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const run = pacer();
  const watcher = new ParticleLifeWatcher();
  let seedNo = 0;
  let loop: GardenLoop | undefined;
  let sim: ParticleLife;
  let stats: ParticleLifeStats = { step: 0, kinetic: 0, neighborRate: 0, separation: 0, ringScore: 0 };

  function randomFor(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function plant(): void {
    seedNo++;
    const config = makeParticleLifeConfig(randomFor(seedNo * 2), 5, 420);
    sim = new ParticleLife(config);
    sim.seed(randomFor(seedNo * 2 + 1));
    stats = { step: 0, kinetic: 0, neighborRate: 0, separation: 0, ringScore: 0 };
    watcher.reset();
    host.say(t('garden.pl.seeded', { n: seedNo }), t('garden.pl.hint'));
  }

  function resize(): void {
    const { w, h } = stageSize(host);
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }

  function draw(): void {
    const w = canvas.width;
    const h = canvas.height;
    c!.fillStyle = 'rgba(5,7,12,.24)';
    c!.fillRect(0, 0, w, h);
    for (let i = 0; i < sim.count; i++) {
      const speed = Math.min(1, Math.hypot(sim.vx[i], sim.vy[i]) * 450);
      c!.globalAlpha = 0.62 + speed * 0.38;
      c!.fillStyle = COLORS[sim.kind[i] % COLORS.length];
      c!.beginPath();
      c!.arc(sim.x[i] * w, sim.y[i] * h, 1.4 + speed * 1.5, 0, Math.PI * 2);
      c!.fill();
    }
    c!.globalAlpha = 1;
    host.setStep(t('garden.pl.step', { n: stats.step }));
  }

  function frame(): void {
    if (!host.running()) return;
    run(host, 1, () => { stats = sim.step(); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.pl.event.${event}`, { n: stats.step }), t('garden.pl.hint'));
    draw();
    if (stats.step >= 8000) plant();
  }

  host.setName(t('garden.pl.name'), t('garden.pl.code'));
  host.action('reseed', '✧', t('garden.reseed'), plant);
  resize();
  plant();
  host.say(t('garden.pl.today'), t('garden.pl.hint'));
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
