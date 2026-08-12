/**
 * 소리 껍데기 화면 검사 (TASK-KL-269) — 파형이 서고, 한 번 올린 소리가 따라가는가.
 *
 * 소리는 **눈에 안 보이는 재료**라 파형이 곧 화면이다. 그래서 여기서 제일 중요한 검사는
 * 「캔버스가 있나」가 아니라 **그린 것이 진짜 그 소리의 모양인가**다 —
 * 앞은 조용하고 뒤가 큰 소리를 만들어 넣고, 파형의 앞뒤 높이를 **픽셀로 재서** 비교한다.
 * (봉우리 대신 평균을 내면 이 검사가 무너진다 — 그래서 이 검사가 그 설계를 지킨다.)
 *
 * 사용: node scripts/smoke-sound-shell.mjs
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

/** 3초 WAV — 앞 1.5초는 거의 조용하고, 뒤 1.5초는 큰 소리. 파형이 그 모양이어야 한다. */
function loudTailWav() {
  const rate = 8000;
  const total = rate * 3;
  const data = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const amp = t < 1.5 ? 0.02 : 0.85;
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * t) * amp * 32000), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#sound`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfDrop', { timeout: 20000 });

/* ① 탭 줄이 없다 · 할 일은 격자로 */
const tabs = await page.locator('.tool-page.active .tool-tabs button, .tool-page.active [role=tab]').count();
check(tabs <= 1, `할 일이 탭 줄로 늘어서 있으면 안 된다 (지금 ${tabs}개)`);
check((await page.locator('.pf-job').count()) === 9, '할 일 카드가 아홉');
check((await page.locator('.pf-group-label').count()) === 3, '갈래는 셋');

/* ② 소리를 올리면 재생기·파형이 뜨고 길이를 읽는다 */
await page.setInputFiles('#pfFile', { name: '녹음.wav', mimeType: 'audio/wav', buffer: loudTailWav() });
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
check((await page.locator('#pfName').innerText()) === '녹음.wav', '파일 이름이 위에 뜬다');
await page.waitForSelector('#sdWave', { timeout: 20000 });
check((await page.locator('#sdPlayer').count()) === 1, '재생기가 뜬다');
const meta = await page.locator('#pfMeta').innerText();
check(/0:03/.test(meta), `길이 3초를 읽는다 (지금 「${meta}」)`);
check(/8kHz|8 kHz/.test(meta), `표본률을 읽는다 (지금 「${meta}」)`);

/* ③ **그린 것이 진짜 그 소리의 모양인가** — 앞은 낮고 뒤는 높아야 한다 */
const shape = await page.waitForFunction(
  () => {
    const c = document.querySelector('#sdWave');
    if (!c) return null;
    const ctx = c.getContext('2d');
    const measure = (x) => {
      const col = ctx.getImageData(x, 0, 1, c.height).data;
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < c.height; y++) {
        if (col[y * 4 + 3] > 0) {
          if (top < 0) top = y;
          bottom = y;
        }
      }
      return top < 0 ? 0 : bottom - top + 1;
    };
    const quiet = measure(Math.floor(c.width * 0.2));
    const loud = measure(Math.floor(c.width * 0.8));
    return loud > 4 ? { quiet, loud } : null;
  },
  { timeout: 20000 }
).then((h) => h.jsonValue()).catch(() => null);
check(!!shape, '파형이 실제로 그려진다');
check(shape && shape.loud > shape.quiet * 3, `뒤쪽 큰 소리가 앞쪽보다 훨씬 높아야 한다 (앞 ${shape?.quiet}px · 뒤 ${shape?.loud}px)`);
check(shape && shape.quiet >= 1, `조용한 데도 한 픽셀은 남는다 — 안 그리면 빈 파일로 읽힌다 (지금 ${shape?.quiet}px)`);

/* ④ 파형을 누르면 그 자리로 옮겨 간다 */
const waveBox = await page.locator('#sdWave').boundingBox();
await page.mouse.click(waveBox.x + waveBox.width * 0.8, waveBox.y + waveBox.height / 2);
await page.waitForTimeout(400);
const at = await page.evaluate(() => document.querySelector('#sdPlayer').currentTime);
check(at > 1.5, `파형을 누른 자리로 옮겨 간다 (지금 ${at.toFixed(2)}초)`);

/* ⑤ 할 일을 고르면 소리가 따라간다 */
await page.locator('.pf-job[data-job="audiocut"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 20000 });
check(await page.locator('#pfFileBar').isVisible(), '**파일 줄은 그대로 남는다**');
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost input[type=file]');
    return !!el && el.files && el.files.length > 0;
  },
  { timeout: 20000 }
).catch(() => {});
const got = await page.evaluate(() => {
  const el = document.querySelector('#pfHost input[type=file]');
  return el && el.files && el.files.length ? el.files[0].name : '';
});
check(got === '녹음.wav', `할 일 쪽에도 소리가 들어가 있어야 한다 (지금 「${got}」)`);

/* ⑥ 결과 이어받기 — 자르고 → 그 결과를 다듬는 흐름 */
await page.evaluate(() => {
  const blob = new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' });
  Toolbox.offerResult({ blob, name: '녹음-자른것.wav', from: 'audiocut' });
  window.dispatchEvent(
    new CustomEvent('karmolab-result', {
      detail: { type: 'audio/wav', name: '녹음-자른것.wav', from: 'audiocut', size: 4 }
    })
  );
});
await page.waitForSelector('#pfChain:visible', { timeout: 10000 }).catch(() => {});
check(await page.locator('#pfChain').isVisible(), '결과가 나오면 「이어서」 줄이 뜬다');

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-sound-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-sound-shell] 전부 통과');
