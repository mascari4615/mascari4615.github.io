import { t } from '../../lib/i18n';
import { rng } from './rules';
import { createObservationControls } from './observation-controls';
import { makeParticleLifeConfig, ParticleLife, ParticleLifeWatcher, type ParticleLifeStats } from './particle-life';

const COLORS = ['#70e1f5', '#ffd36a', '#ff719a', '#a78bfa', '#83ef9b'];

export function buildParticleLife(container: HTMLElement): void {
  if (!document.getElementById('pl-style')) {
    const style = document.createElement('style'); style.id = 'pl-style';
    style.textContent = `
.pl-wrap{position:relative;width:100%;height:clamp(420px,78svh,900px);overflow:hidden;border-radius:var(--radius-md,12px);background:#05070c}
.pl-canvas{display:block;width:100%;height:100%}.pl-head{position:absolute;inset:0 0 auto;display:flex;gap:9px;align-items:baseline;padding:13px 15px 30px;pointer-events:none;background:linear-gradient(#05070ce8,transparent)}
.pl-name{color:#edf5ff;font-size:13px}.pl-code,.pl-step{color:#b9c7e277;font:11px var(--font-mono,monospace)}.pl-step{margin-left:auto}.pl-actions{position:absolute;right:12px;top:45px;display:flex;gap:6px}
.pl-btn{border:1px solid #ffffff28;background:#0b101db8;color:#dbe7ff;padding:6px 9px;border-radius:999px;cursor:pointer;font:11px var(--font-mono,monospace)}.pl-btn[aria-pressed="true"]{border-color:#8eb8ff88;background:#21365bb8}
.pl-log{position:absolute;inset:auto 0 0;padding:35px 16px 16px;color:#e9efff;font-size:14px;line-height:1.45;pointer-events:none;background:linear-gradient(transparent,#05070ce8)}.pl-hint{display:block;margin-top:3px;color:#b9c7e277;font:11px var(--font-mono,monospace)}
`;
    document.head.appendChild(style);
  }
  const wrap = document.createElement('div'); wrap.className = 'pl-wrap';
  const canvas = document.createElement('canvas'); canvas.className = 'pl-canvas';
  const head = document.createElement('div'); head.className = 'pl-head';
  const name = document.createElement('span'); name.className = 'pl-name';
  const code = document.createElement('span'); code.className = 'pl-code';
  const stepEl = document.createElement('span'); stepEl.className = 'pl-step'; head.append(name, code, stepEl);
  const actions = document.createElement('div'); actions.className = 'pl-actions';
  const reseed = document.createElement('button'); reseed.type = 'button'; reseed.className = 'pl-btn';
  const pause = document.createElement('button'); pause.type = 'button'; pause.className = 'pl-btn';
  const controls = createObservationControls(); actions.append(controls.element, reseed, pause);
  const log = document.createElement('div'); log.className = 'pl-log'; const line = document.createElement('span');
  const hint = document.createElement('span'); hint.className = 'pl-hint'; log.append(line, hint); wrap.append(canvas, head, actions, log); container.appendChild(wrap);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const c = ctx;
  const day = new Date().toISOString().slice(0, 10);
  let seedNo = 0;
  let paused = false;
  let raf: number | undefined;
  let sim: ParticleLife;
  let stats: ParticleLifeStats = { step: 0, kinetic: 0, neighborRate: 0, separation: 0, ringScore: 0 };
  const watcher = new ParticleLifeWatcher();

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
    line.textContent = t('garden.pl.seeded', { n: seedNo });
  }
  function resize(): void {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round((rect.height || 420) * dpr));
  }
  function draw(stats: ParticleLifeStats): void {
    const w = canvas.width, h = canvas.height;
    c.fillStyle = 'rgba(5,7,12,.24)'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < sim.count; i++) {
      const speed = Math.min(1, Math.hypot(sim.vx[i], sim.vy[i]) * 450);
      c.globalAlpha = 0.62 + speed * 0.38;
      c.fillStyle = COLORS[sim.kind[i] % COLORS.length];
      c.beginPath(); c.arc(sim.x[i] * w, sim.y[i] * h, 1.4 + speed * 1.5, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    stepEl.textContent = t('garden.pl.step', { n: stats.step });
  }
  function frame(): void {
    raf = requestAnimationFrame(frame);
    if (paused) return;
    controls.run(1, () => { stats = sim.step(); });
    const event = watcher.observe(stats);
    if (event) line.textContent = t(`garden.pl.event.${event}`, { n: stats.step });
    draw(stats);
    if (stats.step >= 8000) plant();
  }
  reseed.onclick = plant;
  pause.onclick = () => { paused = !paused; pause.setAttribute('aria-pressed', String(paused)); pause.textContent = t(paused ? 'garden.resume' : 'garden.pause'); };
  reseed.textContent = t('garden.reseed'); pause.textContent = t('garden.pause');
  name.textContent = t('garden.pl.name'); code.textContent = t('garden.pl.code'); hint.textContent = t('garden.pl.hint');
  resize(); plant(); line.textContent = t('garden.pl.today'); raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(resize); ro.observe(wrap);
  Toolbox.onDispose?.(() => { if (raf !== undefined) cancelAnimationFrame(raf); ro.disconnect(); });
}
