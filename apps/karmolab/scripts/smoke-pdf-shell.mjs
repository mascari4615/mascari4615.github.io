/**
 * PDF 도구 껍데기. 파일 하나로 여러 일을 하는가 (TASK-KL-259).
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

/** 두 쪽짜리 최소 PDF. 라이브러리 없이 손으로 짠다(검사가 남의 파일에 기대지 않게). */
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
/** 앞 판의 상태가 남지 않게 새로 연다. 이 검사는 처음 올릴 때를 재기 때문이다. */
async function freshOpenPdf() {
  await page.goto('about:blank');
  await page.goto(`${BASE}#pdf`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pfDrop', { timeout: 20000 });
}
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#pdf`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfDrop', { timeout: 20000 });

/* **아직 안 보이는 것**도 잰다 (KL-283). 보이는가만 재면 늘 보이는 것을 못 잡는다 . 
 * 실제로 파일 줄과 이어서 줄이 CSS 때문에 처음부터 서 있었다. */
check(!(await page.locator('#pfFileBar').isVisible()), '파일을 올리기 전엔 파일 줄이 안 보인다');
check(!(await page.locator('#pfChain').isVisible()), '결과가 없으면 이어서 줄도 안 보인다');

/* ① 탭 줄이 없다. 할 일은 격자로 */
const tabs = await page.locator('.tool-page.active .tool-tabs button, .tool-page.active [role=tab]').count();
check(tabs <= 1, `할 일이 탭 줄로 늘어서 있으면 안 된다 (지금 ${tabs}개)`);
/* 수로 자르지 않는다 (2026-08-16). 도구가 늘 때마다 이 줄이 빨개졌고 그건 깨졌다가
   아니라 늘었다였다. 모양을 본다: 이름이 붙어 있고, 겹치지 않고, 갈래마다 하나는 있다. */
const jobIds = await page.locator('.pf-job').evaluateAll((bs) => bs.map((b) => b.dataset.job || ''));
const perGroup = await page.locator('.pf-group').evaluateAll((gs) => gs.map((g) => g.querySelectorAll('.pf-job').length));
check(jobIds.length > 0 && jobIds.every(Boolean), `카드마다 일 이름이 붙어 있다 (${jobIds.length}개)`);
check(new Set(jobIds).size === jobIds.length, '같은 일이 두 번 놓여 있지 않다');
check(perGroup.length > 0 && perGroup.every((n) => n > 0), `갈래마다 카드가 하나는 있다 (${perGroup.join('/')})`);
const groups = await page.locator('.pf-group-label').count();
check(groups === 4, `갈래는 넷 (지금 ${groups})`);

/* ② 파일을 올리면 이름, 쪽수, 미리보기가 뜬다 */
await page.setInputFiles('#pfFile', { name: '보고서.pdf', mimeType: 'application/pdf', buffer: tinyPdf() });
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
check((await page.locator('#pfName').innerText()) === '보고서.pdf', '파일 이름이 위에 뜬다');
await page.waitForFunction(() => /2/.test(document.querySelector('#pfMeta')?.textContent || ''), undefined, { timeout: 15000 }).catch(() => {});
const meta = await page.locator('#pfMeta').innerText();
check(/2/.test(meta), `쪽 수를 읽어야 한다 (지금 ${meta})`);
await page.waitForFunction(() => document.querySelectorAll('#pfPages .pf-thumb').length >= 2, undefined, { timeout: 20000 }).catch(() => {});
const thumbs = await page.locator('#pfPages .pf-thumb').count();
check(thumbs === 2, `쪽 격자에 두 쪽이 다 보인다 (지금 ${thumbs})`);
check((await page.locator('#pfPages .pf-thumb canvas').count()) === 2, '썸네일이 실제로 그려진다');

/* ③ 눌러서 크게 본다. 작은 격자만으로는 이 쪽이 맞나를 못 본다 */
await page.locator('.pf-thumb[data-page="2"]').click();
await page.waitForSelector('#pfZoom canvas', { timeout: 15000 }).catch(() => {});
check((await page.locator('#pfZoom canvas').count()) === 1, '누르면 크게 뜬다');
check(/2 \/ 2/.test(await page.locator('.pf-zoom-tag').innerText()), '크게 본 것이 누른 그 쪽이다');
await page.click('#pfZoom');
await page.waitForTimeout(200);
check((await page.locator('#pfZoom').count()) === 0, '다시 누르면 닫힌다');

/* ④ 할 일을 고르면 그 자리에서 열린다. 파일은 안 사라진다 */
await page.locator('.pf-job[data-job="pdfcrop"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
check(!(await page.locator('#pfJobs').isVisible()), '고르면 격자는 접힌다');
check(await page.locator('#pfFileBar').isVisible(), '**파일 줄은 그대로 남는다**');

/* ⑤ 그리고 그 도구가 파일을 이미 받았다. 다시 올릴 일이 없다 */
await page.waitForTimeout(900);
const got = await page.evaluate(() => {
  const input = document.querySelector('#pfHost input[type=file]');
  return input && input.files && input.files.length ? input.files[0].name : '';
});
check(got === '보고서.pdf', `할 일 쪽에도 파일이 들어가 있어야 한다 (지금 ${got})`);

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
check(got2 === '보고서.pdf', `다른 할 일로 옮겨도 파일이 따라간다 (지금 ${got2}). 이게 앞 판의 요점`);

/* ⑦ **쪽 위에서 바로 돌리고 빼기** (TASK-KL-282. Sejda Organize) */
/* 앞 판이 이미 할 일 고르는 자리로 돌아와 있다. 여기서 격자는 왼쪽에 그대로 있다. */
check(!(await page.locator('#pfEditBar').isVisible()), '아무것도 안 고쳤으면 저장 줄은 안 보인다');

/* 첫 쪽을 돌리면 그 자리에서 돌아 보인다 */
await page.locator('.pf-thumb[data-page="1"] .pf-act[data-act="rotate"]').click();
await page.waitForTimeout(200);
const spun = await page.locator('.pf-thumb[data-page="1"] canvas').evaluate((c) => c.style.transform);
check(/rotate\(90deg\)/.test(spun), `돌리면 화면에서 곧바로 돈다 (지금 ${spun})`);
check(await page.locator('#pfEditBar').isVisible(), '고친 게 생기면 저장 줄이 뜬다');

/* 둘째 쪽을 빼면 표시만 되고, 한 번 더 누르면 되살아난다 */
await page.locator('.pf-thumb[data-page="2"] .pf-act[data-act="drop"]').click();
await page.waitForTimeout(150);
check(await page.locator('.pf-thumb[data-page="2"].pf-tossed').count() === 1, '뺄 쪽은 표시만 된다(안 사라진다)');
await page.locator('.pf-thumb[data-page="2"] .pf-act[data-act="drop"]').click();
await page.waitForTimeout(150);
check(await page.locator('.pf-thumb[data-page="2"].pf-tossed').count() === 0, '한 번 더 누르면 되살아난다');

/* 되돌리기 */
await page.click('#pfUndo');
await page.waitForTimeout(200);
check(!(await page.locator('#pfEditBar').isVisible()), '되돌리면 저장 줄도 걷힌다');

/* 다시 둘째 쪽을 빼고 만들면. **한 쪽짜리 문서가 손에 들린다** */
await page.locator('.pf-thumb[data-page="2"] .pf-act[data-act="drop"]').click();
await page.waitForTimeout(150);
await page.click('#pfApply');
await page.waitForFunction(
  () => /1/.test(document.querySelector('#pfMeta')?.textContent || '') && document.querySelectorAll('#pfPages .pf-thumb').length === 1, undefined,
  { timeout: 25000 }
).catch(() => {});
check(
  (await page.locator('#pfPages .pf-thumb').count()) === 1,
  `쪽을 빼고 만들면 한 쪽만 남는다 (지금 ${await page.locator('#pfPages .pf-thumb').count()}쪽)`
);
check(/정리/.test(await page.locator('#pfName').innerText()), `만든 것이 **손에 든 파일**이 된다 (지금 ${await page.locator('#pfName').innerText()})`);


/* ⑦-나 **끌어서 순서 바꾸기** (TASK-KL-284. Sejda 의 마지막 조각)
 *
 * 끌기는 손으로 흉내 내기 어려우니 브라우저의 끌기 사건을 그대로 쏜다. 그리고 **글자로** 확인한다:
 * 손으로 짠 PDF 의 첫 쪽엔 PAGE ONE, 둘째 쪽엔 PAGE TWO 가 적혀 있으므로,
 * 순서를 바꿔 만들면 **첫 쪽에서 뽑히는 글자가 바뀌어야** 한다. 화면 순서만 보면 속을 수 있다. */
/* 앞 판에서 한 쪽을 빼 두었으니 두 쪽짜리를 **다시 올린다**. 순서 바꾸기는 두 쪽이 있어야 잰다. */
await page.setInputFiles('#pfFile', { name: '보고서.pdf', mimeType: 'application/pdf', buffer: tinyPdf() });
await page.waitForFunction(() => document.querySelectorAll('#pfPages .pf-thumb').length === 2, undefined, { timeout: 20000 });

await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#pfPages .pf-thumb')];
  const from = cells.find((c) => c.dataset.page === '2');
  const to = cells.find((c) => c.dataset.page === '1');
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  to.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
});
await page.waitForTimeout(250);
const nowOrder = await page.locator('#pfPages .pf-thumb').evaluateAll((els) => els.map((e) => e.dataset.page));
check(nowOrder.join(',') === '2,1', `끌어 놓으면 자리가 바뀐다 (지금 ${nowOrder.join(',')})`);
const nums = await page.locator('#pfPages .pf-no').allInnerTexts();
check(nums.join(',') === '1,2', `번호는 늘어놓은 자리대로 다시 붙는다 (지금 ${nums.join(',')})`);
check(await page.locator('#pfEditBar').isVisible(), '순서만 바꿔도 저장 줄이 뜬다');

/* 만들고 나서 **글자로** 확인. 첫 쪽이 정말 PAGE TWO 인가 */
await page.click('#pfApply');
await page.waitForFunction(() => /정리/.test(document.querySelector('#pfName')?.textContent || ''), undefined, { timeout: 25000 }).catch(() => {});
const firstText = await page.evaluate(async () => {
  const input = document.querySelector('#pfFile');
  const f = input.files[0];
  const lib = window.pdfjsLib;
  const doc = await lib.getDocument({ data: (await f.arrayBuffer()).slice(0) }).promise;
  const page1 = await doc.getPage(1);
  const tc = await page1.getTextContent();
  return tc.items.map((i) => i.str).join('').trim();
});
check(/TWO/.test(firstText), `순서를 바꿔 만들면 첫 쪽 글자가 바뀐다 (지금 ${firstText})`);

/* ⑧ 결과 이어받기. 할 일이 결과를 내놓으면 그것이 다음 판의 입력이 된다 (KL-260)
 *    도구가 실제로 결과를 낼 때까지 기다리는 대신, 도구가 부르는 그 신호를 그대로 울려 본다
 *    (도구 쪽 계산은 다른 검사가 본다. 여기서 볼 것은 **껍데기가 그 결과를 받아 무는가**). */
await page.evaluate(() => {
  const blob = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' });
  Toolbox.offerResult({ blob, name: '보고서-쪽번호.pdf', from: 'pdfpagenum' });
  window.dispatchEvent(new CustomEvent('karmolab-result', {
    detail: { type: 'application/pdf', name: '보고서-쪽번호.pdf', from: 'pdfpagenum', size: 4 }
  }));
});
await page.waitForSelector('#pfChain:visible', { timeout: 10000 }).catch(() => {});
check(await page.locator('#pfChain').isVisible(), '결과가 나오면 이어서 줄이 뜬다');
await page.click('#pfChainUse');
await page.waitForTimeout(500);
check(
  (await page.locator('#pfName').innerText()) === '보고서-쪽번호.pdf',
  '누르면 **그 결과가 손에 든 파일이 된다**. 다시 안 올린다 (이 판의 요점)'
);
check(await page.locator('#pfJobs').isVisible(), '이어서 다음 할 일을 고르는 자리로 돌아온다');

/* ⑨ **여러 개 한 번에** (TASK-KL-289. Stirling 의 파일 관리자를 우리 크기로)
 * 합치기, 잇기는 원래 여러 개가 필요하다. 하나만 들 수 있으면 그 도구들은 재료 화면을 지나쳐
 * 자기 화면에서 다시 올려야 했다. 껍데기를 만든 이유가 없어진다. */
await freshOpenPdf();
await page.setInputFiles('#pfFile', [
  { name: '앞.pdf', mimeType: 'application/pdf', buffer: tinyPdf() },
  { name: '뒤.pdf', mimeType: 'application/pdf', buffer: tinyPdf() }
]);
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
const manyName = await page.locator('#pfName').innerText();
check(/앞\.pdf/.test(manyName) && /1/.test(manyName), `여러 개면 외 N개로 말해 준다 (지금 ${manyName})`);

/* 합치기는 **여러 개를 받는** 도구다. 통째로 넘어가야 한다 */
await page.locator('.pf-job[data-job="pdftool"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 20000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost input[type=file]');
    return !!el && el.files && el.files.length >= 2;
  }, undefined,
  { timeout: 20000 }
).catch(() => {});
const gotMany = await page.evaluate(() => {
  const el = document.querySelector('#pfHost input[type=file]');
  return el && el.files ? [...el.files].map((f) => f.name) : [];
});
check(gotMany.length === 2, `합치기에는 둘 다 넘어간다 (지금 ${JSON.stringify(gotMany)})`);

/* 하나만 받는 도구에는 **고른 한 장만**. 통째로 밀어 넣으면 엉뚱한 것이 처리된다 */
await page.click('#pfBack');
await page.waitForSelector('#pfJobs:visible', { timeout: 10000 });
await page.locator('.pf-job[data-job="pdfcrop"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 20000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost input[type=file]');
    return !!el && el.files && el.files.length > 0;
  }, undefined,
  { timeout: 20000 }
).catch(() => {});
const gotOne = await page.evaluate(() => {
  const el = document.querySelector('#pfHost input[type=file]');
  return el && el.files ? [...el.files].map((f) => f.name) : [];
});
check(gotOne.length === 1 && gotOne[0] === '앞.pdf', `한 장만 받는 도구엔 한 장만 (지금 ${JSON.stringify(gotOne)})`);


/* ⑦-다 **자판으로도 순서를 바꾼다** (TASK-KL-293)
 * 끌어 놓기는 마우스가 있어야 하는 조작이다. 그것만 두면 순서 바꾸기가 통째로 막힌다. */
await freshOpenPdf();
await page.setInputFiles('#pfFile', { name: '보고서.pdf', mimeType: 'application/pdf', buffer: tinyPdf() });
await page.waitForFunction(() => document.querySelectorAll('#pfPages .pf-thumb').length === 2, undefined, { timeout: 20000 });
await page.locator('.pf-thumb[data-page="1"]').focus();
check(
  await page.evaluate(() => document.activeElement?.dataset?.page === '1'),
  '쪽에 초점을 줄 수 있다(자판으로 닿는다)'
);
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(250);
const kbOrder = await page.locator('#pfPages .pf-thumb').evaluateAll((els) => els.map((e) => e.dataset.page));
check(kbOrder.join(',') === '2,1', `Ctrl+화살표로 순서가 바뀐다 (지금 ${kbOrder.join(',')})`);
check(
  await page.evaluate(() => document.activeElement?.dataset?.page === '1'),
  '옮긴 뒤에도 그 쪽에 초점이 남는다(이어서 또 옮길 수 있게)'
);
check(
  (await page.locator('#pfEditBar').getAttribute('aria-live')) === 'polite',
  '몇 쪽을 바꿨는지 읽히는 자리다'
);


/* ⑩ **방금 하던 것** (TASK-KL-300. iLovePDF 의 저장한 흐름을 우리 크기로)
 * 되풀이가 잦은 판에서는 같은 서너 개를 계속 쓴다. 자동으로 돌리진 않고 **앞에 꺼내 둔다**. */
await freshOpenPdf();
/* 앞 판들이 이미 할 일을 여러 번 골랐다. **처음 온 사람을 만들어서** 재야 한다
 * (그냥 재면 처음엔 없다가 언제나 빨갛다. 검사가 앞 판의 자취를 안 지운 탓이었다). */
await page.evaluate(() => Toolbox.setPref?.('mat_recent_pdf', ''));
/* **지워졌는지 확인하고 넘어간다**. 저장이 한 박자 늦으면 옛 기억이 남아, 무엇을 고쳐도
 * 이 판이 초록으로 나온다(돌연변이를 넣어도 안 빨개져서 잡았다). */
await page.waitForFunction(() => !(Toolbox.getPref?.('mat_recent_pdf', '') || ''), undefined, { timeout: 10000 });
await freshOpenPdf();
check(!(await page.locator('#pfRecent').isVisible()), '처음 온 사람에겐 방금 하던 것이 없다');
await page.setInputFiles('#pfFile', { name: '보고서.pdf', mimeType: 'application/pdf', buffer: tinyPdf() });
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
await page.locator('#pfJobs .pf-job[data-job="pdfcrop"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
await page.click('#pfBack');
await page.locator('#pfJobs .pf-job[data-job="pdfpagenum"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });

await freshOpenPdf();
check(await page.locator('#pfRecent').isVisible(), '다시 오면 방금 하던 것이 뜬다');
const recent = await page.locator('#pfRecent .pf-recent-job').evaluateAll((els) => els.map((e) => e.dataset.job));
check(recent[0] === 'pdfpagenum', `마지막에 쓴 것이 맨 앞이다 (지금 ${recent.join(',')})`);
check(recent.includes('pdfcrop'), '그전 것도 남아 있다');
await page.locator('#pfRecent .pf-recent-job').first().click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
check(await page.locator('#pfMount').isVisible(), '거기서 눌러도 그 할 일이 열린다');


process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-pdf-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-pdf-shell] 전부 통과');
