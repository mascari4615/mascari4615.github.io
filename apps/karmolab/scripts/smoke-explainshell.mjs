/**
 * 명령줄 뜯어보기 — 화면에 실제로 뜨는가 (TASK-KL-250).
 *
 * 알맹이 검사가 자르는 일을 지킨다면 이쪽은 **보이는 것**을 지킨다: 조각마다 설명이 붙는지,
 * 위험한 줄에서 경고가 크게 뜨는지, 사전에 적어 둔 강조(`**…**`)가 별표째 새어 나오지 않는지.
 *
 * 그리고 이 도구의 약속 하나를 검사한다: **바깥으로 아무것도 안 보낸다.**
 * 명령줄에는 서버 주소·토큰이 섞여 있어서, 이건 기능이 아니라 약속이다.
 *
 * 사용: node scripts/smoke-explainshell.mjs
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
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/**
 * 바깥으로 나간 요청을 전부 모은다.
 *
 * 재려는 것은 「요청이 하나도 없는가」가 아니다 — 사이트에는 방문자 세기 같은 공용 스크립트가
 * 늘 돈다. 이 도구의 약속은 **붙여넣은 줄이 실려 나가지 않는 것**이므로, 나간 요청의 주소와
 * 몸통에 그 줄 조각이 들어 있는지를 본다.
 */
const outbound = [];
page.on('request', (r) => {
  const u = r.url();
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return;
  if (u.startsWith('data:') || u.startsWith('blob:')) return;
  let body = '';
  try {
    body = r.postData() || '';
  } catch {
    body = '';
  }
  outbound.push(u + ' ' + body);
});

await page.goto(`${BASE}#explainshell`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#exLine', { timeout: 20000 });
await page.waitForTimeout(700);

/* ① 열자마자 뜯어 놓은 것이 있다 */
const rows0 = await page.locator('.ex-table tr').count();
check(rows0 >= 3, `열면 바로 조각이 보여야 한다 (지금 ${rows0}줄)`);

/* ② 붙은 옵션이 하나씩 갈라져 설명을 받는다 */
await page.fill('#exLine', 'tar -xzvf a.tar.gz');
await page.waitForTimeout(400);
const toks = await page.locator('.ex-tok code').allTextContents();
for (const want of ['-x', '-z', '-v', '-f']) {
  check(toks.includes(want), `붙은 옵션이 갈라져야 한다: ${want}`);
}
const unknowns = await page.locator('.ex-unknown').count();
check(unknowns <= 1, `아는 옵션은 「사전에 없습니다」로 남지 않아야 한다 (지금 ${unknowns})`);

/* ③ 파이프 너머는 다른 명령으로 나뉜다 */
await page.fill('#exLine', 'ls -la | grep foo | wc -l');
await page.waitForTimeout(400);
const segs = await page.locator('.ex-seg').count();
check(segs === 3, `파이프로 이어진 세 명령이 따로 보여야 한다 (지금 ${segs})`);
const joins = await page.locator('.ex-join').count();
check(joins === 2, `이음말 설명이 둘 (지금 ${joins})`);

/* ④ 위험한 줄에서 경고가 뜬다 */
await page.fill('#exLine', 'sudo rm -rf / --no-preserve-root');
await page.waitForTimeout(400);
check(await page.locator('.ex-danger').isVisible(), '되돌릴 수 없는 명령에는 경고가 떠야 한다');
const dangerText = await page.locator('.ex-danger').innerText();
check(/안전장치|되돌릴/.test(dangerText), `왜 위험한지 말해야 한다 (지금 「${dangerText.slice(0, 40)}」)`);

/* ⑤ 강조는 굵게 — 별표가 그대로 보이면 안 된다 */
const stars = await page.locator('.ex-danger').innerText();
check(!stars.includes('**'), '별표가 화면에 그대로 새어 나오면 안 된다');
check((await page.locator('.ex-danger strong').count()) > 0, '강조는 굵은 글씨로 나와야 한다');

/* ⑥ 멀쩡한 줄에는 겁주지 않는다 */
await page.fill('#exLine', 'ls -la');
await page.waitForTimeout(400);
check((await page.locator('.ex-danger').count()) === 0, '멀쩡한 명령에는 경고가 없어야 한다');

/* ⑦ 약속: 바깥으로 아무것도 안 나간다 */
await page.fill('#exLine', 'ssh deploy@secret-host.internal -i ~/.ssh/id_rsa');
await page.waitForTimeout(900);
/* 붙여넣은 줄에서만 나오는 조각들 — 이게 어디로든 실려 나가면 약속이 깨진 것이다. */
const secrets = ['secret-host.internal', 'id_rsa', 'deploy@'];
const leaked = outbound.filter((rec) => secrets.some((w) => rec.includes(w) || rec.includes(encodeURIComponent(w))));
check(leaked.length === 0, `붙여넣은 줄이 바깥으로 실려 나가면 안 된다 (나간 곳: ${leaked.slice(0, 2).join(' | ')})`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-explainshell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-explainshell] 전부 통과');
