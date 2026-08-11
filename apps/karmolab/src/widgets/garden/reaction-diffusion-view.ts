import { t } from '../../lib/i18n';
import { ReactionDiffusion, ReactionWatcher, presetForDay, type ReactionStats } from './reaction-diffusion';
import { rng } from './rules';

export function buildReactionDiffusion(container: HTMLElement): void {
  const styleId = 'rd-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
.rd-wrap{position:relative;width:100%;height:clamp(420px,78svh,900px);overflow:hidden;border-radius:var(--radius-md,12px);background:#05080b}
.rd-canvas{display:block;width:100%;height:100%;image-rendering:pixelated}
.rd-head{position:absolute;inset:0 0 auto;display:flex;gap:9px;align-items:baseline;padding:13px 15px 30px;pointer-events:none;background:linear-gradient(#05080be8,transparent)}
.rd-name{color:#e8fbff;font-size:13px}.rd-code,.rd-step{color:#9cc3c880;font:11px var(--font-mono,monospace)}.rd-step{margin-left:auto}
.rd-actions{position:absolute;right:12px;top:45px;display:flex;gap:6px}.rd-btn{border:1px solid #ffffff28;background:#071216b8;color:#cce4e7;padding:6px 9px;border-radius:999px;cursor:pointer;font:11px var(--font-mono,monospace)}
.rd-btn[aria-pressed="true"]{border-color:#69d7cf88;background:#16413eb8}
.rd-log{position:absolute;inset:auto 0 0;padding:35px 16px 16px;color:#ddfbf6;font-size:14px;line-height:1.45;pointer-events:none;background:linear-gradient(transparent,#05080be8)}
.rd-hint{display:block;margin-top:3px;color:#b7d2d477;font:11px var(--font-mono,monospace)}
`;
    document.head.appendChild(style);
  }

  const wrap = document.createElement('div');
  wrap.className = 'rd-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'rd-canvas';
  const head = document.createElement('div');
  head.className = 'rd-head';
  const name = document.createElement('span'); name.className = 'rd-name';
  const code = document.createElement('span'); code.className = 'rd-code';
  const stepEl = document.createElement('span'); stepEl.className = 'rd-step';
  head.append(name, code, stepEl);
  const actions = document.createElement('div'); actions.className = 'rd-actions';
  const reseed = document.createElement('button'); reseed.className = 'rd-btn'; reseed.type = 'button';
  const pause = document.createElement('button'); pause.className = 'rd-btn'; pause.type = 'button';
  actions.append(reseed, pause);
  const log = document.createElement('div'); log.className = 'rd-log';
  const line = document.createElement('span');
  const hint = document.createElement('span'); hint.className = 'rd-hint';
  log.append(line, hint);
  wrap.append(canvas, head, actions, log);
  container.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const fieldCanvas = document.createElement('canvas');
  const fieldCtx = fieldCanvas.getContext('2d');
  if (!fieldCtx) return;
  const day = new Date().toISOString().slice(0, 10);
  const preset = presetForDay(day);
  let sim = new ReactionDiffusion(1, 1);
  const watcher = new ReactionWatcher();
  let pixels = fieldCtx.createImageData(1, 1);
  let raf: number | undefined;
  let alive = true;
  let paused = false;
  let seedNo = 0;

  function build(): void {
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(72, Math.floor(rect.width / 3));
    const h = Math.max(48, Math.floor((rect.height || 420) / 3));
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height || 420));
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
    line.textContent = t('garden.rd.seeded', { n: seedNo });
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
    stepEl.textContent = t('garden.rd.step', { n: stats.step });
  }

  function frame(): void {
    raf = requestAnimationFrame(frame);
    if (paused) return;
    let stats: ReactionStats = { step: sim.stepNo, active: 0, edge: 0, delta: 0 };
    for (let i = 0; i < 3; i++) stats = sim.step(preset);
    const event = watcher.observe(stats);
    if (event) line.textContent = t(`garden.rd.event.${event}`, { n: stats.step });
    draw(stats);
    if (stats.step >= 6500 || event === 'settled') window.setTimeout(() => alive && plant(), 3200);
  }

  reseed.onclick = plant;
  pause.onclick = () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = t(paused ? 'garden.resume' : 'garden.pause');
  };
  reseed.textContent = t('garden.reseed');
  pause.textContent = t('garden.pause');
  name.textContent = t(`garden.rd.preset.${preset.id}`);
  code.textContent = `F ${preset.feed} · K ${preset.kill}`;
  hint.textContent = t('garden.rd.hint');
  line.textContent = t('garden.rd.today', { name: name.textContent });
  build();
  raf = requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => {
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(72, Math.floor(rect.width / 3));
    const h = Math.max(48, Math.floor((rect.height || 420) / 3));
    if (w !== sim.w || h !== sim.h) build();
  });
  ro.observe(wrap);
  Toolbox.onDispose?.(() => {
    alive = false;
    if (raf !== undefined) cancelAnimationFrame(raf);
    ro.disconnect();
  });
}

