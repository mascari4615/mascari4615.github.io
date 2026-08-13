/**
 * 영상 껍데기 화면 검사 (TASK-KL-268) — 한 번 올린 영상으로 여러 일을 하는가.
 *
 * 영상은 **손으로 짤 수 없는 재료**다(PDF·PNG 는 바이트를 적어 만들었지만 영상은 못 한다).
 * 그래서 브라우저 안에서 진짜로 하나 **찍는다** — 캔버스를 칠하며 `MediaRecorder` 로 담는다.
 * 덤으로 이게 제일 고약한 판을 덮는다: 그렇게 만든 webm 은 길이가 `Infinity` 로 와서,
 * 그냥 읽으면 필름 스트립이 전부 0초 자리만 뽑는다(`shared/video` 의 되감기 요령이 그 자리다).
 *
 * 사용: node scripts/smoke-video-shell.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#videotool`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfDrop', { timeout: 20000 });

/* ① 탭 줄이 없다 · 할 일은 격자로 */
const tabs = await page.locator('.tool-page.active .tool-tabs button, .tool-page.active [role=tab]').count();
check(tabs <= 1, `할 일이 탭 줄로 늘어서 있으면 안 된다 (지금 ${tabs}개)`);
check((await page.locator('.pf-job').count()) === 8, '할 일 카드가 여덟');
check((await page.locator('.pf-group-label').count()) === 3, '갈래는 셋');

/* ② 영상을 그 자리에서 찍어 넣는다 — 색이 바뀌므로 스트립 장면도 서로 달라야 한다 */
await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(15);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start();
  const started = performance.now();
  await new Promise((res) => {
    const paint = () => {
      const t = (performance.now() - started) / 1000;
      ctx.fillStyle = `hsl(${Math.floor(t * 200)} 90% 50%)`;
      ctx.fillRect(0, 0, 160, 120);
      if (t > 2) return res();
      requestAnimationFrame(paint);
    };
    paint();
  });
  rec.stop();
  await done;
  const file = new File(chunks, '찍은영상.webm', { type: 'video/webm' });
  const input = document.querySelector('#pfFile');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

await page.waitForSelector('#pfFileBar:visible', { timeout: 20000 });
check((await page.locator('#pfName').innerText()) === '찍은영상.webm', '영상 이름이 위에 뜬다');
await page.waitForSelector('#vdPlayer', { timeout: 20000 });
check((await page.locator('#vdPlayer').count()) === 1, '재생기가 뜬다');

/* ③ 필름 스트립 — 여덟 장이 **다 뽑히고**, 시각 표가 0초에 뭉쳐 있지 않다 */
await page.waitForFunction(() => document.querySelectorAll('#vdStrip .vd-frame').length >= 8, undefined, { timeout: 30000 }).catch(() => {});
const frames = await page.locator('#vdStrip .vd-frame').count();
check(frames === 8, `필름 스트립 여덟 장 (지금 ${frames})`);
const ats = await page.locator('#vdStrip .vd-frame').evaluateAll((els) => els.map((e) => Number(e.dataset.at)));
check(new Set(ats).size === ats.length, `장면 시각이 서로 달라야 한다 — 길이를 못 읽으면 다 0 이 된다 (지금 ${JSON.stringify(ats)})`);
check(Math.max(...ats) > 0.5, `마지막 장면이 영상 뒤쪽이어야 한다 (지금 ${Math.max(...ats)})`);

/* ④ 장면이 실제로 서로 다른 그림인가 — 되감기가 안 먹으면 여덟 장이 같은 그림이다 */
const distinct = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#vdStrip .vd-frame canvas')];
  const keys = cells.map((c) => {
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  });
  return new Set(keys).size;
});
check(distinct >= 3, `장면들이 서로 다른 그림이어야 한다 (서로 다른 색 ${distinct}가지)`);

/* ⑤ 길이·크기를 읽었다 */
const meta = await page.locator('#pfMeta').innerText();
check(/160×120/.test(meta), `크기를 읽는다 (지금 「${meta}」)`);
check(/0:0[1-9]|0:1\d/.test(meta), `길이를 읽는다 — Infinity 로 오는 webm 을 되감아 잰다 (지금 「${meta}」)`);

/* ⑥ 할 일을 고르면 그 자리에서 열리고 **영상이 따라간다** */
await page.locator('.pf-job[data-job="video2gif"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 20000 });
check(await page.locator('#pfFileBar').isVisible(), '**영상 줄은 그대로 남는다**');
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost input[type=file]');
    return !!el && el.files && el.files.length > 0;
  }, undefined,
  { timeout: 20000 }
).catch(() => {});
const got = await page.evaluate(() => {
  const el = document.querySelector('#pfHost input[type=file]');
  return el && el.files && el.files.length ? el.files[0].name : '';
});
check(got === '찍은영상.webm', `할 일 쪽에도 영상이 들어가 있어야 한다 — 200MB 를 두 번 고르지 않는다 (지금 「${got}」)`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-video-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-video-shell] 전부 통과');
