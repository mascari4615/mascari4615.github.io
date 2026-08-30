/**
 * 화면 녹화로 만든 영상을 넣어도 **길이를 제대로 읽는가** (TASK-KL-281).
 *
 * 화면 녹화가 만드는 webm 을 그대로 구간 자르기에 넣는 건 가장 흔한 흐름이다.
 * 그런 판에서 길이를 못 읽으면(`Infinity`, `NaN`) 구간을 아예 고를 수 없다.
 *
 * ⚠ 정직하게 적어 둔다: **처음엔 이 검사가 빨갰지만 도구 탓이 아니었다.** 화면 글씨에서
 *   0:00 꼴을 찾아 기다렸는데 구간 라벨이 **처음부터** 0:00 이라 곧바로 통과해 버렸고,
 *   아직 안 읽은 값을 재고 있었다. 재는 대상(재생기의 길이)이 준비됐는지로 기다리게 고쳤다.
 *   옛 배선으로 되돌려도 이 검사는 초록이다. 즉 여기서 지키는 것은 앞으로도 읽힌다이지
 *   고쳤다가 아니다.
 *
 * 사용: node scripts/test-video-duration.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveAppAssets } from './lib/widget-harness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
await serveAppAssets(page, root);
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, mountTool() { return true; }, ensureScript: async () => {}, copyText() {} };
  window.Mdd = new Proxy({}, { get: () => () => {} });
});
for (const tool of ['videotrim', 'video2gif', 'video2img']) {
  await page.addScriptTag({ content: read(`js/widgets/tools/${tool}.js`) });
}

const out = await page.evaluate(async () => {
  /* 화면 녹화가 만드는 것과 같은 방식으로 2초짜리 webm 을 찍는다 */
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  const rec = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => {
    const paint = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = `hsl(${Math.floor(t * 180)} 90% 50%)`;
      ctx.fillRect(0, 0, 120, 90);
      if (t > 2) return res();
      requestAnimationFrame(paint);
    };
    paint();
  });
  rec.stop();
  await stopped;
  const file = new File(chunks, '녹화.webm', { type: 'video/webm' });

  const res = {};
  for (const [id, input] of [['videotrim', '#vtFile'], ['video2gif', '#vgFile'], ['video2img', '#viFile']]) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    window.__reg[id].tabs[0].build(host);
    await window.__karmoWaitDrawn(host);
    const el = await window.__karmoWaitIn(host, input);
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event('change'));
    /* **재생기의 길이가 숫자가 될 때까지** 기다린다.
     * 처음엔 화면 글씨에서 0:00 꼴을 찾아 기다렸는데, 구간 라벨이 **처음부터** 0:00 을 달고
     * 있어서 곧바로 통과해 버렸다. 아직 안 읽은 값을 재고 NaN 이라고 우겼다(검사가 틀렸던 것).
     * 재는 대상 자체가 준비됐는지로 기다려야 한다. */
    const pick = () => host.querySelector('#vtVideo, #vgVideo, #viVideo, video');
    for (let i = 0; i < 100; i += 1) {
      const v = pick();
      if (v && Number.isFinite(v.duration) && v.duration > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const video = pick();
    res[id] = { duration: video ? video.duration : null, id: video ? video.id : '(없음)' };
  }
  return res;
});

await browser.close();

for (const [id, r] of Object.entries(out)) {
  check(Number.isFinite(r.duration), `${id}: 길이를 숫자로 읽어야 한다 (지금 ${r.duration})`);
  check(r.duration > 0.5, `${id}: 2초쯤이어야 한다 (지금 ${r.duration})`);
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`[test-video-duration] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-video-duration] 녹화한 영상도 길이를 제대로 읽는다');
