/**
 * 「이어서」로 넘긴 결과가 **묶음 안 도구까지** 닿는가 (TASK-KL-274).
 *
 * 도구가 결과를 내놓으면 「이어서」 줄이 서고, 누르면 받는 도구로 옮겨 간다. 그런데 받는 도구가
 * 재료 묶음 **안**에 숨어 있으면 길이 한 단계 더 있다:
 *   결과 놓기 → 묶음으로 옮기기 → 껍데기가 그 할 일 열기 → 도구가 그려지며 결과 집기.
 * 이 중 하나만 어긋나도 **빈 화면**이 뜬다(오류는 안 난다). 재료 껍데기를 새로 만들면서
 * 가운데 두 단계가 통째로 바뀌었으므로 여기서 잰다.
 *
 * 받는 도구가 **묶음 밖에 단독으로** 있는 경우도 함께 본다 — 재료 화면의 할 일 목록에 이름이
 * 있다고 해서 그 도구가 묶음 **소속**인 것은 아니다(첫 판에서 내가 이걸 헷갈려 검사가 헛빨갰다).
 * 어느 쪽이든 재는 것은 하나다: **그 도구가 넘긴 것을 실제로 받았는가.**
 *
 * 사용: node scripts/smoke-handoff-bundle.mjs
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
await page.goto(`${BASE}#home`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.offerResult, undefined, { timeout: 20000 });

/* 진짜 JPG 를 하나 만든다 — 받는 쪽이 형식을 본다 */
const madeJpeg = await page.evaluate(async () => {
  const cv = document.createElement('canvas');
  cv.width = 40;
  cv.height = 30;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3388ff';
  ctx.fillRect(0, 0, 40, 30);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
  Toolbox.offerResult({ blob, name: '넘긴사진.jpg', from: 'imgresize' });
  return blob.size > 0;
});
check(madeJpeg, '넘길 결과를 만든다');

/* 「이어서」가 실제로 하는 일 = 받는 도구로 옮겨 가기. 그 도구는 이미지 묶음 안에 숨어 있다. */
await page.evaluate(() => Toolbox.switchPage('exifclean'));

/* ① 묶음이 열리고 ② 그 할 일이 열리고 ③ 도구가 결과를 집었다 */
const opened = await page
  .waitForSelector('#exStatus', { timeout: 20000, state: 'attached' })
  .then(() => true)
  .catch(() => false);
check(opened, '「촬영 정보 지우기」 화면이 열린다');

const got = await page
  .waitForFunction(
    () => {
      const el = document.querySelector('#exEditor');
      return !!el && el.style.display !== 'none';
    }, undefined,
    { timeout: 20000 }
  )
  .then(() => true)
  .catch(() => false);
check(got, '넘긴 사진을 **그 도구가 실제로 받았다**(빈 화면이 아니다)');

const status = await page.locator('#exStatus').innerText().catch(() => '');
check(!/오류|실패|error/i.test(status), `받는 쪽이 오류를 내지 않는다 (지금 「${status.slice(0, 40)}」)`);

/* ─ 두 번째 판: 받는 도구가 **정말로 묶음 안**인 경우 (audiocut = 소리 묶음) ─
 * 위 판은 단독 도구라 「묶음 열기 → 할 일 열기」 두 단계를 안 지난다. 이번 판이 그 두 단계를 지난다. */
await page.evaluate(() => {
  const rate = 8000;
  const len = rate;
  const data = new Int16Array(len);
  for (let i = 0; i < len; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 20000;
  const head = new DataView(new ArrayBuffer(44));
  const put = (o, str) => [...str].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
  put(0, 'RIFF');
  head.setUint32(4, 36 + data.byteLength, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  head.setUint32(16, 16, true);
  head.setUint16(20, 1, true);
  head.setUint16(22, 1, true);
  head.setUint32(24, rate, true);
  head.setUint32(28, rate * 2, true);
  head.setUint16(32, 2, true);
  head.setUint16(34, 16, true);
  put(36, 'data');
  head.setUint32(40, data.byteLength, true);
  const blob = new Blob([head.buffer, data.buffer], { type: 'audio/wav' });
  Toolbox.offerResult({ blob, name: '넘긴소리.wav', from: 'voicerec' });
});
await page.evaluate(() => Toolbox.switchPage('audiocut'));

const inBundle = await page
  .waitForSelector('#acStatus', { timeout: 20000, state: 'attached' })
  .then(() => true)
  .catch(() => false);
check(inBundle, '소리 묶음 안에서 「자르기」가 열린다');

const soundGot = await page
  .waitForFunction(
    () => {
      /* **판이 펴졌는지만** 본다 (2026-08-13). 처음엔 상태 글씨도 같이 봤는데, 그 글씨는
       * 아무것도 안 받았을 때도 「0:00」 을 달고 있어서 **넘겨받지 않아도 초록**이었다
       * (게이트를 일부러 망가뜨려 보고 잡았다 — `rules/quality.md § 설명문이 거짓말이면`). */
      const panel = document.querySelector('#acPanel');
      return !!panel && panel.style.display !== 'none';
    }, undefined,
    { timeout: 20000 }
  )
  .then(() => true)
  .catch(() => false);
check(soundGot, '넘긴 소리를 **묶음 안 도구가 실제로 받았다**');


/* ⑦ **밝힌 대로 목적지가 뜨는가** (TASK-KL-299)
 * 「받는다」고 밝히지 않은 도구는 받을 수 있어도 목록에 안 뜬다 = 사람 눈엔 없는 기능이다.
 * 그림 하나를 내놨을 때, 이번에 채운 도구들이 실제로 갈 곳으로 잡히는지 본다. */
const dests = await page.evaluate(() => (Toolbox.toolsAccepting('image/png', 'barcode') || []).map((t) => t.id));
for (const id of ['imgbatch', 'redact', 'palette', 'qrread']) {
  check(dests.includes(id), `그림을 내놓으면 「${id}」 가 갈 곳으로 뜬다 (지금 ${dests.length}곳)`);
}
const pdfDests = await page.evaluate(() => (Toolbox.toolsAccepting('application/pdf', 'pdf') || []).map((t) => t.id));
check(pdfDests.includes('pdftool'), `PDF 를 내놓으면 「합치기·나누기」가 갈 곳으로 뜬다 (지금 ${pdfDests.length}곳)`);


process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-handoff-bundle] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-handoff-bundle] 넘긴 결과가 묶음 안 도구까지 닿는다');
