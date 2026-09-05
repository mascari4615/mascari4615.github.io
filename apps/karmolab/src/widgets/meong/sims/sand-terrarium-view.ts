import { t } from '../../../lib/i18n';
import { gloop, type GardenLoop } from '../../../lib/gloop';
import { rng } from './rules';
import { Material, SandTerrarium, TerrariumWatcher, type TerrariumStats } from './sand-terrarium';
import { pacer, simCanvas, stageSize, type SimHandle, type SimHost } from './sim-host';

const COLORS = [
  [6, 8, 11], [73, 70, 68], [111, 76, 48], [210, 164, 89],
  [54, 132, 203], [59, 159, 76], [255, 111, 38], [126, 132, 142]
];

export function buildSandTerrarium(host: SimHost): SimHandle {
  const canvas = simCanvas(host, true);
  const c = canvas.getContext('2d');
  if (!c) return { dispose(): void {} };
  const field = document.createElement('canvas');
  const fc = field.getContext('2d');
  if (!fc) return { dispose(): void {} };

  const day = new Date().toISOString().slice(0, 10);
  const run = pacer();
  const watcher = new TerrariumWatcher();
  let seedNo = 0;
  let loop: GardenLoop | undefined;
  let sim = new SandTerrarium(1, 1);
  let pixels = fc.createImageData(1, 1);
  let random = rng(1);

  function randomFor(extra: number): () => number {
    let hash = extra * 2654435761;
    for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
    return rng(hash >>> 0);
  }

  function grid(): { w: number; h: number; cw: number; ch: number } {
    const { w, h } = stageSize(host);
    return { w: Math.max(95, Math.floor(w / 4)), h: Math.max(64, Math.floor(h / 4)), cw: w, ch: h };
  }

  function build(): void {
    const g = grid();
    canvas.width = g.cw;
    canvas.height = g.ch;
    field.width = g.w;
    field.height = g.h;
    pixels = fc!.createImageData(g.w, g.h);
    sim = new SandTerrarium(g.w, g.h);
    plant();
  }

  function plant(): void {
    seedNo++;
    random = randomFor(seedNo);
    sim.seed(random);
    watcher.reset();
    host.say(t('garden.st.seeded', { n: seedNo }), t('garden.st.hint'));
  }

  function draw(stats: TerrariumStats): void {
    const data = pixels.data;
    for (let i = 0, p = 0; i < sim.cells.length; i++, p += 4) {
      const material = sim.cells[i];
      const color = COLORS[material];
      const flicker = material === Material.Fire ? (sim.age[i] % 3) * 18 : 0;
      data[p] = Math.min(255, color[0] + flicker);
      data[p + 1] = color[1];
      data[p + 2] = color[2];
      data[p + 3] = material === Material.Smoke ? 190 : 255;
    }
    fc!.putImageData(pixels, 0, 0);
    c!.imageSmoothingEnabled = false;
    c!.drawImage(field, 0, 0, canvas.width, canvas.height);
    host.setStep(t('garden.st.step', { n: stats.step }));
  }

  function frame(): void {
    if (!host.running()) return;
    let stats = null as unknown as TerrariumStats;
    run(host, 2, () => { stats = sim.step(random); });
    const event = watcher.observe(stats);
    if (event) host.say(t(`garden.st.event.${event}`, { n: stats.step }), t('garden.st.hint'));
    draw(stats);
    if (stats.step >= 6000) plant();
  }

  host.setName(t('garden.st.name'), t('garden.st.code'));
  host.action('reseed', '✧', t('garden.reseed'), plant);
  build();
  host.say(t('garden.st.today'), t('garden.st.hint'));
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
