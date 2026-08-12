/**
 * 셈 공책 화면 검사 (TASK-KL-264) — 쓰는 대로 답이 서는가.
 *
 * 셈 자체는 `test-calc.mjs` 가 서른으로 잰다. 여기서 볼 것은 **화면의 약속**이다:
 *   - 쓰는 칸이 **안 사라진다**(한 줄 치고 칸이 없어지면 이어 쓸 수가 없다)
 *   - 줄 수만큼 답 줄이 서고, 그 자리가 맞다
 *   - 못 센 줄이 **눈에 보이되 나머지를 안 망친다**
 *
 * 사용: node scripts/smoke-calc-shell.mjs
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
await page.goto(`${BASE}#calc`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pfText', { timeout: 20000 });

/* ① 빈 화면에 설명 대신 **한 판 적혀 있다** */
const seeded = await page.inputValue('#pfText');
check(/밥값/.test(seeded), '처음부터 예시가 적혀 있다 — 무엇을 쓰는 곳인지 글로 설명하지 않는다');
await page.waitForSelector('#caSheet', { timeout: 15000 });
check((await page.locator('.pf-job').count()) === 14, '할 일 카드가 열넷');

/* ② 예시 다섯 줄이 그대로 셈된다 — 마지막이 1인당 */
const rows = await page.locator('#caSheet .ca-row').count();
check(rows === 5, `줄 수만큼 답 줄이 선다 (지금 ${rows})`);
const answers = await page.locator('#caSheet .ca-ans').allInnerTexts();
check(answers[2].replace(/[^\d]/g, '') === '50000', `밥값+술값 = 50,000 (지금 ${answers[2]})`);
check(answers[3].replace(/[^\d]/g, '') === '55000', `거기에 10% = 55,000 (지금 ${answers[3]})`);
check(answers[4].replace(/[^\d]/g, '') === '13750', `넷으로 나누면 13,750 (지금 ${answers[4]})`);

/* ③ 쓰는 칸이 안 사라진다 — 이게 공책과 제출 양식의 차이다 */
check(await page.locator('#pfText').isVisible(), '**쓰는 칸이 계속 보인다**');

/* ④ 고쳐 쓰면 곧바로 다시 센다 */
await page.fill('#pfText', '100 + 200\n3km in mi\n25% of 400');
await page.waitForFunction(
  () => document.querySelectorAll('#caSheet .ca-row').length === 3,
  { timeout: 10000 }
).catch(() => {});
const a2 = await page.locator('#caSheet .ca-ans').allInnerTexts();
check(a2.length === 3, '고쳐 쓰면 답도 갈아 끼워진다');
check(a2[0].replace(/[^\d]/g, '') === '300', `100+200 (지금 ${a2[0]})`);
check(/1\.86/.test(a2[1]), `3km 는 1.86 마일 (지금 ${a2[1]})`);
check(a2[2].replace(/[^\d]/g, '') === '100', `400 의 25% (지금 ${a2[2]})`);

/* ⑤ 못 센 줄은 표시되되 나머지는 산다 */
await page.fill('#pfText', '1000\n이건 글이라 못 셈\n2000\n합계');
await page.waitForFunction(
  () => document.querySelectorAll('#caSheet .ca-row').length === 4,
  { timeout: 10000 }
).catch(() => {});
check((await page.locator('#caSheet .ca-bad').count()) === 1, '못 센 줄 하나가 표시된다');
const a3 = await page.locator('#caSheet .ca-ans').allInnerTexts();
check(a3[3].replace(/[^\d]/g, '') === '3000', `못 센 줄이 있어도 합계는 3,000 (지금 ${a3[3]})`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-calc-shell] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-calc-shell] 전부 통과');
