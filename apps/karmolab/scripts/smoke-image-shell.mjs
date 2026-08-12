/**
 * 이미지 껍데기 — 사진 하나로 여러 일을 하는가 (TASK-KL-261).
 *
 * PDF 와 **같은 껍데기**(`shared/material-shell`)를 쓴다. 그래서 여기서 볼 것은 「같은 껍데기가
 * 다른 재료에서도 도는가」다: 사진을 한 번 올리면 할 일을 옮겨도 따라가는가, 결과를 이어받는가.
 * 도구 열셋은 손대지 않았으므로, 사진이 그쪽 칸에 실제로 들어갔는지도 함께 본다.
 *
 * 사용: node scripts/smoke-image-shell.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';
import { deflateSync } from 'node:zlib';

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

/** 3×2 PNG — 라이브러리 없이 손으로 짠다(검사가 남의 파일에 기대지 않게). */
function tinyPng() {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(3, 0); // width 3
  ihdr.writeUInt32BE(2, 4); // height 2
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  // 줄마다 필터 바이트 0 + RGB 세 칸
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const png = tinyPng();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#image`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfDrop', { timeout: 20000 });

/* ① 탭 줄이 없다 — 할 일은 격자로 */
const tabs = await page.locator('.tool-page.active .tool-tabs button, .tool-page.active [role=tab]').count();
check(tabs <= 1, `할 일이 탭 줄로 늘어서 있으면 안 된다 (지금 ${tabs}개)`);
const jobs = await page.locator('.pf-job').count();
check(jobs === 15, `할 일 카드가 열다섯 개여야 한다 (지금 ${jobs})`);
const groups = await page.locator('.pf-group-label').count();
check(groups === 5, `갈래는 다섯 (지금 ${groups})`);

/* ② 사진을 올리면 이름·치수·그림이 뜬다 */
await page.setInputFiles('#pfFile', { name: '사진.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
check((await page.locator('#pfName').innerText()) === '사진.png', '사진 이름이 위에 뜬다');
await page.waitForFunction(() => !!document.querySelector('#imShot img'), { timeout: 15000 }).catch(() => {});
check((await page.locator('#imShot img').count()) === 1, '사진이 그려진다');
const meta = await page.locator('#pfMeta').innerText();
check(/3×2/.test(meta), `치수를 읽어야 한다 — 이미지 판단의 기준 (지금 「${meta}」)`);

/* ③ 눌러서 크게 본다 */
await page.click('#imShot');
await page.waitForSelector('#imZoom img', { timeout: 10000 }).catch(() => {});
check((await page.locator('#imZoom img').count()) === 1, '누르면 크게 뜬다');
await page.click('#imZoom');
await page.waitForTimeout(200);
check((await page.locator('#imZoom').count()) === 0, '다시 누르면 닫힌다');

/* ④ 할 일을 고르면 그 자리에서 열린다 — 사진은 안 사라진다 */
await page.locator('.pf-job[data-job="imgresize"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
check(!(await page.locator('#pfJobs').isVisible()), '고르면 격자는 접힌다');
check(await page.locator('#pfFileBar').isVisible(), '**사진 줄은 그대로 남는다**');

/* ⑤ 그리고 그 도구가 사진을 이미 받았다 — 다시 올릴 일이 없다 */
await page.waitForTimeout(900);
const got = await page.evaluate(() => {
  const input = document.querySelector('#pfHost input[type=file]');
  return input && input.files && input.files.length ? input.files[0].name : '';
});
check(got === '사진.png', `할 일 쪽에도 사진이 들어가 있어야 한다 (지금 「${got}」)`);

/* ⑥ 돌아가서 다른 할 일을 골라도 같다 */
await page.click('#pfBack');
await page.waitForSelector('#pfJobs:visible', { timeout: 10000 });
await page.locator('.pf-job[data-job="palette"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
await page.waitForTimeout(900);
const got2 = await page.evaluate(() => {
  const input = document.querySelector('#pfHost input[type=file]');
  return input && input.files && input.files.length ? input.files[0].name : '';
});
check(got2 === '사진.png', `다른 할 일로 옮겨도 사진이 따라간다 (지금 「${got2}」)`);

/* ⑦ 결과 이어받기 — 도구가 내놓은 것이 다음 판의 입력이 된다 */
await page.evaluate(() => {
  const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  Toolbox.offerResult({ blob, name: '사진-작게.png', from: 'imgresize' });
  window.dispatchEvent(
    new CustomEvent('karmolab-result', {
      detail: { type: 'image/png', name: '사진-작게.png', from: 'imgresize', size: 4 }
    })
  );
});
await page.waitForSelector('#pfChain:visible', { timeout: 10000 }).catch(() => {});
check(await page.locator('#pfChain').isVisible(), '결과가 나오면 「이어서」 줄이 뜬다');
await page.click('#pfChainUse');
await page.waitForTimeout(500);
check(
  (await page.locator('#pfName').innerText()) === '사진-작게.png',
  '누르면 **그 결과가 손에 든 사진이 된다** — 다시 안 올린다'
);
check(await page.locator('#pfJobs').isVisible(), '이어서 다음 할 일을 고르는 자리로 돌아온다');

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-image-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-image-shell] 전부 통과');
