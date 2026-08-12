/**
 * 글 껍데기 — 한 번 붙여넣으면 할 일을 옮겨도 따라가는가 (TASK-KL-262).
 *
 * PDF·이미지와 **같은 껍데기**(`shared/material-shell`)를 쓰되, 글은 파일이 아니라 **붙여넣기**로
 * 온다. 그래서 여기서 볼 것은 「다른 들이는 길(intake)이 같은 껍데기에서 도는가」다:
 * 붙여넣은 글이 도구의 **글 칸**에 실제로 들어가는가, 할 일을 옮겨도 따라가는가.
 *
 * 사용: node scripts/smoke-text-shell.mjs
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

/** 세 줄·열두 낱말 — 세는 숫자가 맞는지 눈으로 셀 수 있게 작게 짠다. */
const SAMPLE = ['가나다 라마바 사아자', 'hello world this is a test', '끝줄'].join('\n');
const CHARS = [...SAMPLE].length;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}#text`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfText', { timeout: 20000 });

/* ① 탭 줄이 없다 · 할 일은 격자로 · **붙여넣는 칸**이 있다(놓는 자리가 아니라) */
const tabs = await page.locator('.tool-page.active .tool-tabs button, .tool-page.active [role=tab]').count();
check(tabs <= 1, `할 일이 탭 줄로 늘어서 있으면 안 된다 (지금 ${tabs}개)`);
check((await page.locator('.pf-job').count()) === 16, '할 일 카드가 열여섯 개여야 한다');
check((await page.locator('.pf-group-label').count()) === 4, '갈래는 넷');
check((await page.locator('#pfText').count()) === 1, '글은 **붙여넣는 칸**으로 받는다');

/* ② 붙여넣으면 세 숫자와 앞머리가 뜬다 */
await page.fill('#pfText', SAMPLE);
await page.waitForSelector('#pfFileBar:visible', { timeout: 15000 });
await page.waitForFunction(() => !!document.querySelector('#txNums'), { timeout: 10000 }).catch(() => {});
const nums = await page.locator('#txNums .tx-num strong').allInnerTexts();
check(nums.length === 3, '글자·낱말·줄 세 숫자가 뜬다');
/* 숫자만 뽑아서 한 번만 견준다 — 「또는」으로 두 갈래를 두면 느슨한 쪽이 늘 이긴다 (KL-278). */
check(Number(nums[0].replace(/,/g, '')) === CHARS, `글자 수가 맞다 (기대 ${CHARS}, 지금 ${nums[0]})`);
check(Number(nums[2].replace(/,/g, '')) === 3, `줄 수가 맞다 (기대 3, 지금 ${nums[2]})`);
check(/끝줄/.test(await page.locator('#txHead').innerText()), '앞머리에 실제 글이 보인다');

/* ③ 할 일을 고르면 그 자리에서 열린다 — 글은 안 사라진다 */
await page.locator('.pf-job[data-job="textclean"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
check(!(await page.locator('#pfJobs').isVisible()), '고르면 격자는 접힌다');
check(await page.locator('#pfFileBar').isVisible(), '**글 줄은 그대로 남는다**');

/* ④ 그리고 그 도구의 **글 칸**에 이미 들어가 있다 — 다시 붙여넣을 일이 없다 */
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost textarea');
    return !!el && el.value.includes('끝줄');
  },
  { timeout: 15000 }
).catch(() => {});
const got = await page.evaluate(() => {
  const el = document.querySelector('#pfHost textarea');
  return el ? el.value : '';
});
check(/끝줄/.test(got), `할 일 쪽 글 칸에도 글이 들어가 있어야 한다 (지금 「${got.slice(0, 20)}」)`);

/* ⑤ 돌아가서 다른 할 일(묶음 밖 도구 포함)을 골라도 같다 */
await page.click('#pfBack');
await page.waitForSelector('#pfJobs:visible', { timeout: 10000 });
await page.locator('.pf-job[data-job="wordfreq"]').click();
await page.waitForSelector('#pfMount:visible', { timeout: 15000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('#pfHost textarea');
    return !!el && el.value.includes('끝줄');
  },
  { timeout: 15000 }
).catch(() => {});
const got2 = await page.evaluate(() => {
  const el = document.querySelector('#pfHost textarea');
  return el ? el.value : '';
});
check(/끝줄/.test(got2), `다른 할 일로 옮겨도 글이 따라간다 (지금 「${got2.slice(0, 20)}」)`);

/* ⑥ 결과 이어받기 — 도구가 내놓은 글이 다음 판의 입력이 된다 */
await page.evaluate(() => {
  const blob = new Blob(['정리된 글\n두 줄'], { type: 'text/plain' });
  Toolbox.offerResult({ blob, name: '정리된-글.txt', from: 'textclean' });
  window.dispatchEvent(
    new CustomEvent('karmolab-result', {
      detail: { type: 'text/plain', name: '정리된-글.txt', from: 'textclean', size: 12 }
    })
  );
});
await page.waitForSelector('#pfChain:visible', { timeout: 10000 }).catch(() => {});
check(await page.locator('#pfChain').isVisible(), '결과가 나오면 「이어서」 줄이 뜬다');
await page.click('#pfChainUse');
await page.waitForFunction(() => /정리된 글/.test(document.querySelector('#txHead')?.textContent || ''), { timeout: 10000 }).catch(() => {});
check(
  /정리된 글/.test(await page.locator('#txHead').innerText()),
  '누르면 **그 결과가 손에 든 글이 된다** — 다시 안 붙여넣는다'
);
check(await page.locator('#pfJobs').isVisible(), '이어서 다음 할 일을 고르는 자리로 돌아온다');

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-text-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-text-shell] 전부 통과');
