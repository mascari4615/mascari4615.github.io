/**
 * 숨긴 것 — 정말 찾아지는가 (TASK-KL-196 D)
 *
 * 왜 화면 검사인가: 숨긴 것은 **사람의 손짓**으로만 열린다(키 순서·연타). 코드를 읽어서는
 * 「눌리는가」를 알 수 없고, 단위 시험으로 함수를 직접 부르면 정작 **손짓이 안 걸리는 것**을
 * 못 잡는다. 그래서 진짜 키를 누르고 진짜로 연타한다.
 *
 * 같이 지키는 것: 숨긴 것이 **평소 쓰는 길을 안 막는가**. 입력칸에 글을 치다가 코나미 코드가
 * 걸리면 그건 재미가 아니라 사고다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-secrets.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.route('**/kl/**', (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

await page.goto(URL_TARGET, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => !!window.KarmoSecrets, null, { timeout: 15000 });

const found = () => page.evaluate(() => window.KarmoSecrets.found());
const total = await page.evaluate(() => window.KarmoSecrets.all.length);
if (total < 3) problems.push(`숨긴 것이 ${total}개다 (셋은 넘어야 찾을 맛이 난다)`);

// ① 코나미 코드 — 진짜 키를 누른다.
const KEYS = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
for (const key of KEYS) await page.keyboard.press(key);
await page.waitForTimeout(300);
if (!(await found()).includes('konami')) problems.push('코나미 코드를 눌렀는데 안 걸린다');

// ② 찾으면 그 자리에서 말해 준다 — 조용히 켜 두면 찾은 줄도 모른다.
const toast = await page.locator('.toast, #toast, [class*="toast"]').count();
if (!toast) problems.push('숨긴 것을 찾았는데 아무 말도 없다');

// ③ 같은 것을 또 해도 두 번 축하하지 않는다.
const before = (await found()).length;
for (const key of KEYS) await page.keyboard.press(key);
await page.waitForTimeout(300);
if ((await found()).length !== before) problems.push('같은 비밀이 두 번 세어졌다');

// ④ **평소 쓰는 길을 안 막는다** — 입력칸에 치는 중이면 안 걸려야 한다.
await page.evaluate(() => localStorage.removeItem('karmolab_secrets'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.KarmoSecrets, null, { timeout: 15000 });
await page.evaluate(() => {
  const input = document.createElement('input');
  input.id = 'smokeInput';
  document.body.appendChild(input);
  input.focus();
});
for (const key of KEYS) await page.keyboard.press(key);
await page.waitForTimeout(300);
if ((await found()).includes('konami')) problems.push('입력칸에 치는 중인데 코나미가 걸렸다 (도구 쓰는 손을 막는다)');

// ⑤ 콘솔 손잡이 — 개발자 도구를 여는 사람의 길.
const line = await page.evaluate(() => window.karmo());
if (!/찾은 것/.test(String(line))) problems.push(`karmo() 가 이상한 것을 돌려준다: ${line}`);
if (!(await found()).includes('console')) problems.push('karmo() 를 쳤는데 안 걸린다');

// ⑥ 도감 아래에 「몇 개 중 몇 개」가 있고, 못 찾은 것은 이름이 안 보여야 한다.
await page.goto(`${URL_TARGET}#collection`, { waitUntil: 'networkidle' });
await page.waitForSelector('.cl-secrets .cl-sec', { timeout: 15000 });
const cells = await page.locator('.cl-secrets .cl-sec').count();
if (cells !== total) problems.push(`비밀 칸이 ${cells}개인데 목록은 ${total}개다`);
const unknown = await page.locator('.cl-secrets .cl-sec:not(.is-on)').first().innerText();
if (unknown.trim() !== '?') problems.push(`못 찾은 칸에 이름이 보인다: 「${unknown}」`);
const on = await page.locator('.cl-secrets .cl-sec.is-on').count();
if (on < 1) problems.push('찾은 것이 도감에 안 뜬다');

await browser.close();

if (problems.length) {
  console.error('❌ 숨긴 것\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`✅ 숨긴 것 — ${total}개 중 코나미·콘솔이 실제로 걸림 · 두 번 안 셈 · 입력칸에서는 안 걸림 · 도감에 「?」로 표시`);
