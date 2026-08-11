import { t } from '../../lib/i18n';
import { rng } from './rules';
import { Physarum, PhysarumWatcher, type PhysarumStats } from './physarum';

export function buildPhysarum(container: HTMLElement): void {
  if (!document.getElementById('ph-style')) {
    const style = document.createElement('style'); style.id = 'ph-style';
    style.textContent = `.ph-wrap{position:relative;width:100%;height:clamp(420px,78svh,900px);overflow:hidden;border-radius:var(--radius-md,12px);background:#060609}.ph-canvas{display:block;width:100%;height:100%;image-rendering:pixelated}.ph-head{position:absolute;inset:0 0 auto;display:flex;gap:9px;align-items:baseline;padding:13px 15px 30px;pointer-events:none;background:linear-gradient(#060609e8,transparent)}.ph-name{color:#fff1bd;font-size:13px}.ph-code,.ph-step{color:#d9cba777;font:11px var(--font-mono,monospace)}.ph-step{margin-left:auto}.ph-actions{position:absolute;right:12px;top:45px;display:flex;gap:6px}.ph-btn{border:1px solid #ffffff28;background:#17130db8;color:#ffedc0;padding:6px 9px;border-radius:999px;cursor:pointer;font:11px var(--font-mono,monospace)}.ph-btn[aria-pressed="true"]{border-color:#ffd66a88;background:#493712b8}.ph-log{position:absolute;inset:auto 0 0;padding:35px 16px 16px;color:#fff3d6;font-size:14px;line-height:1.45;pointer-events:none;background:linear-gradient(transparent,#060609e8)}.ph-hint{display:block;margin-top:3px;color:#d9cba777;font:11px var(--font-mono,monospace)}`;
    document.head.appendChild(style);
  }
  const wrap = document.createElement('div'); wrap.className = 'ph-wrap';
  const canvas = document.createElement('canvas'); canvas.className = 'ph-canvas';
  const head = document.createElement('div'); head.className = 'ph-head';
  const name = document.createElement('span'); name.className = 'ph-name'; const code = document.createElement('span'); code.className = 'ph-code'; const stepEl = document.createElement('span'); stepEl.className = 'ph-step'; head.append(name, code, stepEl);
  const actions = document.createElement('div'); actions.className = 'ph-actions'; const reseed = document.createElement('button'); reseed.type = 'button'; reseed.className = 'ph-btn'; const pause = document.createElement('button'); pause.type = 'button'; pause.className = 'ph-btn'; actions.append(reseed, pause);
  const log = document.createElement('div'); log.className = 'ph-log'; const line = document.createElement('span'); const hint = document.createElement('span'); hint.className = 'ph-hint'; log.append(line, hint); wrap.append(canvas, head, actions, log); container.appendChild(wrap);
  const ctx = canvas.getContext('2d'); if (!ctx) return; const c = ctx;
  const field = document.createElement('canvas'); const fc = field.getContext('2d'); if (!fc) return;
  const day = new Date().toISOString().slice(0, 10); let seedNo = 0; let paused = false; let raf: number | undefined; let sim = new Physarum(1, 1, 1); let pixels = fc.createImageData(1, 1); let random = rng(1); const watcher = new PhysarumWatcher();
  function seededRandom(extra: number): () => number { let hash = extra * 2654435761; for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619); return rng(hash >>> 0); }
  function build(): void { const r = wrap.getBoundingClientRect(); const w = Math.max(100, Math.floor(r.width / 3)); const h = Math.max(65, Math.floor((r.height || 420) / 3)); canvas.width = Math.max(1, Math.round(r.width)); canvas.height = Math.max(1, Math.round(r.height || 420)); field.width = w; field.height = h; pixels = fc!.createImageData(w, h); sim = new Physarum(w, h, Math.min(900, Math.max(520, Math.round(w * h / 23)))); plant(); }
  function plant(): void { seedNo++; random = seededRandom(seedNo); sim.seed(random); watcher.reset(); line.textContent = t('garden.ph.seeded', { n: seedNo }); }
  function draw(stats: PhysarumStats): void { const data = pixels.data; for (let i = 0, p = 0; i < sim.trail.length; i++, p += 4) { const q = Math.min(1, sim.trail[i] * 2.2); data[p] = 8 + q * 226; data[p + 1] = 7 + q * 178; data[p + 2] = 10 + q * 48; data[p + 3] = 255; } fc!.putImageData(pixels, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(field, 0, 0, canvas.width, canvas.height); for (const food of sim.foods) { c.fillStyle = '#fff4b8'; c.beginPath(); c.arc(food.x / sim.w * canvas.width, food.y / sim.h * canvas.height, 4, 0, Math.PI * 2); c.fill(); } stepEl.textContent = t('garden.ph.step', { n: stats.step }); }
  function frame(): void { raf = requestAnimationFrame(frame); if (paused) return; const stats = sim.step(random); if (sim.stepNo === 1900) { sim.damage(); line.textContent = t(`garden.ph.event.${watcher.markDamage(sim.stepNo)}`, { n: sim.stepNo }); } else { const event = watcher.observe(stats, sim.foods.length); if (event) line.textContent = t(`garden.ph.event.${event}`, { n: stats.step }); } draw(stats); if (sim.stepNo >= 5200) plant(); }
  reseed.onclick = plant; pause.onclick = () => { paused = !paused; pause.setAttribute('aria-pressed', String(paused)); pause.textContent = t(paused ? 'garden.resume' : 'garden.pause'); };
  reseed.textContent = t('garden.reseed'); pause.textContent = t('garden.pause'); name.textContent = t('garden.ph.name'); code.textContent = t('garden.ph.code'); hint.textContent = t('garden.ph.hint');
  build(); line.textContent = t('garden.ph.today'); raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(() => { const r = wrap.getBoundingClientRect(); const w = Math.max(100, Math.floor(r.width / 3)); const h = Math.max(65, Math.floor((r.height || 420) / 3)); if (w !== sim.w || h !== sim.h) build(); }); ro.observe(wrap);
  Toolbox.onDispose?.(() => { if (raf !== undefined) cancelAnimationFrame(raf); ro.disconnect(); });
}

