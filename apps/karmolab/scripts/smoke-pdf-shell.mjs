/**
 * PDF 도구 껍데기 — 파일 하나로 여러 일을 하는가 (TASK-KL-259).
 *
 * 전에는 할 일 열하나가 탭이었고, **탭을 옮기면 파일을 다시 올려야** 했다. 그 자리를 고쳤으니
 * 여기서 지킬 것은 하나다: **한 번 올린 파일이 할 일을 옮겨도 그대로 쓰인다.**
 * 도구 열하나는 손대지 않았으므로, 파일이 그쪽 칸에 실제로 들어갔는지도 함께 본다.
 *
 * 사용: node scripts/smoke-pdf-shell.mjs
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

/** 두 쪽짜리 최소 PDF — 라이브러리 없이 손으로 짠다(검사가 남의 파일에 기대지 않게). */
function tinyPdf() {
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<</F1 5 0 R>>>>/Contents 6 0 R>>endobj',
    '4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<</F1 5 0 R>>>>/Contents 7 0 R>>endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    '6 0 obj<</Length 44>>stream\nBT /F1 24 Tf 40 300 Td (PAGE ONE) Tj ET\nendstream endobj',
    '7 0 obj<</Length 44>>stream\nBT /F1 24 Tf 40 300 Td (PAGE TWO) Tj ET\nendstream endobj'
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objs) {
    offsets.push(body.length);
    body += o + '\n';
  }
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += String(off).padStart(10, '0') + ' 00000 n \n';
  body += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#pdf`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfDrop', { timeout: 20000 });

/* ① 탭 줄이 없다 — 할 일은 격자로 */
const tabs = await page.locator('.tool-page.active .tool-tabs button, .tool-page.active [role=tab]').count();
check(tabs <= 1, `할 일이 탭 줄로 늘어서 있으면 안 된다 (지금 ${tabs}개)`);
const jobs = await page.locator('.pf-job').count();
check(jobs === 11, `할 일 카드가 열한 개여야 한다 (지금 ${jobs})`);
const groups = await page.locator('.pf-group-label').count();
check(groups === 4, `갈래는 넷 (지금 ${groups})`);

/* ② 파일을 올리면 이름·쪽수·미리보기가 뜬다 */
await page.setInputFiles('#pfFile', { name: '보고서.pdf', mimeType: 'application/pdf', buffer: tinyPdf() });
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
check((await page.locator('#pfName').innerText()) === '보고서.pdf', '파일 이름이 위에 뜬다');
await page.waitForFunction(() => /2/.test(document.querySelector('#pfMeta')?.textContent || ''), { timeout: 15000 }).catch(() => {});
const meta = await page.locator('#pfMeta').innerText();
check(/2/.test(meta), `쪽 수를 읽어야 한다 (지금 「${meta}」)`);
await page.waitForFunction(() => !!document.querySelector('#pfPreview canvas'), { timeout: 15000 }).catch(() => {});
check((await page.locator('#pfPreview canvas').count()) === 1, '미리보기가 그려진다');

/* ③ 두 쪽이면 넘기는 단추가 산다 */
check(await page.locator('#pfPager').isVisible(), '두 쪽이면 넘기는 단추가 보인다');
await page.click('#pfNext');
await page.waitForTimeout(700);
check(/2 \/ 2/.test(await page.locator('#pfPage').innerText()), '다음 쪽으로 넘어간다');

/* ④ 할 일을 고르면 그 자리에서 열린다 — 파일은 안 사라진다 */
await page.locator('.pf-job[data-job="pdfcrop"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
check(!(await page.locator('#pfJobs').isVisible()), '고르면 격자는 접힌다');
check(await page.locator('#pfFileBar').isVisible(), '**파일 줄은 그대로 남는다**');

/* ⑤ 그리고 그 도구가 파일을 이미 받았다 — 다시 올릴 일이 없다 */
await page.waitForTimeout(900);
const got = await page.evaluate(() => {
  const input = document.querySelector('#pfHost input[type=file]');
  return input && input.files && input.files.length ? input.files[0].name : '';
});
check(got === '보고서.pdf', `할 일 쪽에도 파일이 들어가 있어야 한다 (지금 「${got}」)`);

/* ⑥ 돌아가서 다른 할 일을 골라도 같다 */
await page.click('#pfBack');
await page.waitForSelector('#pfJobs:visible', { timeout: 10000 });
await page.locator('.pf-job[data-job="pdfpagenum"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
await page.waitForTimeout(900);
const got2 = await page.evaluate(() => {
  const input = document.querySelector('#pfHost input[type=file]');
  return input && input.files && input.files.length ? input.files[0].name : '';
});
check(got2 === '보고서.pdf', `다른 할 일로 옮겨도 파일이 따라간다 (지금 「${got2}」) — 이게 이 판의 요점`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-pdf-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-pdf-shell] 전부 통과');
