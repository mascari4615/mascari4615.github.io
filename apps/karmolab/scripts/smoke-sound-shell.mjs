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
/* 소리틀(AudioContext) 을 **몇 개나 만드는지** 센다 (TASK-KL-271).
 * 브라우저는 이걸 무제한으로 안 열어 준다 — 도구마다 새로 만들면 몇 번 오간 뒤부터
 * 소리가 **조용히** 안 난다(오류도 안 뜬다). 세는 것 말고는 손대지 않는다. */
await page.addInitScript(() => {
  window.__ctxCount = 0;
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) {
      window.__ctxCount++;
      super(...args);
    }
  };
});
await page.goto(`${BASE}#sound`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfDrop', { timeout: 20000 });

/* 아직 안 보이는 것도 잰다 (KL-283) */
check(!(await page.locator('#pfFileBar').isVisible()), '소리를 올리기 전엔 파일 줄이 안 보인다');
check(!(await page.locator('#pfChain').isVisible()), '결과가 없으면 「이어서」 줄도 안 보인다');

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

/* ④-나 **파형을 자판으로도** (TASK-KL-294) — 누르는 건 마우스가 있어야 하는 조작이다 */
await page.locator('#sdWave').focus();
const t0 = await page.evaluate(() => document.querySelector('#sdPlayer').currentTime);
/* 앞 판에서 눌러 **재생 중**이다 — 스페이스로 멈추고 재야 「0 으로 갔나」를 볼 수 있다
 * (안 멈추면 Home 직후에도 시간이 흘러 0.1초쯤으로 읽힌다 — 첫 판에 그래서 빨갰다). */
await page.keyboard.press('Space');
await page.waitForTimeout(150);
await page.keyboard.press('Home');
await page.waitForTimeout(150);
check((await page.evaluate(() => document.querySelector('#sdPlayer').currentTime)) === 0, 'Home 으로 처음으로 간다');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const t2 = await page.evaluate(() => document.querySelector('#sdPlayer').currentTime);
check(t2 > 0, `화살표로 앞으로 간다 (지금 ${t2.toFixed(1)}초)`);
check((await page.locator('#sdWave').getAttribute('role')) === 'slider', '무엇을 미는 자리인지 밝힌다');
check(!!(await page.locator('#sdWave').getAttribute('aria-label')), '이름이 있다');


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

/* ⑦ 할 일을 네 번 오가도 **소리틀은 늘어나지 않는다** — 이게 「오가다 소리가 죽던」 자리다 */
for (const job of ['audiofade', 'audiolevel', 'audiospeed', 'audiocut']) {
  await page.click('#pfBack');
  await page.waitForSelector('#pfJobs:visible', { timeout: 10000 });
  await page.locator(`.pf-job[data-job="${job}"]`).click();
  await page.waitForSelector('#pfMount:visible', { timeout: 20000 });
  await page.waitForTimeout(700);
}
const ctxCount = await page.evaluate(() => window.__ctxCount);
check(ctxCount <= 2, `소리 도구 다섯을 오가도 소리틀은 한둘이어야 한다 (지금 ${ctxCount}개)`);

/* 그리고 오간 뒤에도 **소리가 실제로 읽히는지** — 틀이 죽었으면 여기서 조용히 실패한다 */
const stillWorks = await page.evaluate(async () => {
  const res = await fetch(document.querySelector('#sdPlayer').src);
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf);
  return Math.round(decoded.duration);
});
check(stillWorks === 3, `오간 뒤에도 소리가 읽힌다 (길이 ${stillWorks}초)`);


process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-sound-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-sound-shell] 전부 통과');
