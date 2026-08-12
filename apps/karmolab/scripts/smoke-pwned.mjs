/**
 * 유출 확인 — 화면에서 정말 안 새는가 (TASK-KL-255).
 *
 * 알맹이 검사가 셈법을 지킨다면 이쪽은 **실제 브라우저에서 나가는 요청**을 본다.
 * 코드가 아무리 옳아도 화면 어딘가에서 비밀번호를 함께 실어 보내면 그걸로 끝이라,
 * 여기서는 나간 요청을 전수로 뒤진다.
 *
 * 사용: node scripts/smoke-pwned.mjs
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

/** 이 비밀번호는 **도메인(pwnedpasswords)과 안 겹치는 말**이어야 한다 — 안 그러면 거짓 양성. */
const SECRET = '말달리자1234!';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const outbound = [];
page.on('request', (r) => {
  const u = r.url();
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return;
  let body = '';
  try {
    body = r.postData() || '';
  } catch {
    body = '';
  }
  outbound.push(u + ' ' + body);
});

/* 진짜 목록 서버 대신 가짜 — 남의 서버 상태에 검사가 흔들리면 안 된다.
   응답 모양은 실제와 같다(`접미35글자:횟수` 줄들). */
let asked = '';
await page.route(/api\.pwnedpasswords\.com\/range\//, (route) => {
  asked = route.request().url().split('/range/')[1];
  return route.fulfill({
    status: 200,
    contentType: 'text/plain',
    body: ['0018A45C4D1DEF81644B54AB7F969B88D65:100', '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2'].join('\r\n')
  });
});

await page.goto(`${BASE}#passgen`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#passgen, .tool-page.active', { timeout: 20000 });

/* 「확인하기」 탭으로 */
await page.locator('.tool-page.active button, .tool-page.active [role=tab]', { hasText: /확인|Check|確認/ }).first().click({ force: true });
await page.waitForSelector('#pcIn', { timeout: 15000 });

/* ① 유출 확인 단추가 붙었다 */
check(await page.locator('#pcPwned').isVisible(), '「확인하기」 탭에 유출 확인 단추가 있어야 한다');
const how = await page.locator('.pc-how').first().innerText();
check(/안 보냅|never sent|送りません/.test(how), `왜 안전한지를 화면이 먼저 말해야 한다 (지금 「${how.slice(0, 30)}」)`);

/* ② 눌러 확인 */
await page.fill('#pcIn', SECRET);
await page.click('#pcPwned');
await page.waitForSelector('#pcPwnedMsg', { timeout: 15000 });
const msg = await page.locator('#pcPwnedMsg').innerText();
check(/없습니다|Not in|ありません/.test(msg), `이 가짜 응답에는 없으므로 「없음」이어야 한다 (지금 「${msg}」)`);

/* ③ 약속: 비밀번호도 완전한 해시도 안 나갔다 */
check(asked.length === 5, `보낸 것은 다섯 글자여야 한다 (지금 「${asked}」)`);
const leaked = outbound.filter((rec) => rec.includes(SECRET) || rec.includes(encodeURIComponent(SECRET)));
check(leaked.length === 0, `비밀번호가 어디로도 나가면 안 된다 (샌 곳: ${leaked.slice(0, 1)})`);

/* ④ 무엇을 보냈는지 사람에게 그대로 보여 준다 */
const sentLine = await page.locator('#pcPwnedSent').innerText();
check(sentLine.includes(asked), `보낸 다섯 글자를 화면에 보여야 한다 (지금 「${sentLine.slice(0, 40)}」)`);

/* ⑤ 목록에 있으면 그렇다고 말한다 */
await page.unroute(/api\.pwnedpasswords\.com\/range\//);
await page.route(/api\.pwnedpasswords\.com\/range\//, async (route) => {
  /* 이번엔 **그 비밀번호의 접미사**를 심어 「있음」을 만든다. */
  const suffix = await page.evaluate(async (pw) => {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(5);
  }, SECRET);
  return route.fulfill({ status: 200, contentType: 'text/plain', body: `${suffix}:9659365\r\nAAAA:1` });
});
await page.fill('#pcIn', SECRET + ' ');
await page.fill('#pcIn', SECRET);
await page.click('#pcPwned');
await page.waitForFunction(() => /9,659,365|9659365/.test(document.querySelector('#pcPwnedMsg')?.textContent || ''), {
  timeout: 15000
}).catch(() => {});
const found = await page.locator('#pcPwnedMsg').innerText();
check(/9,659,365|9659365/.test(found), `유출된 것은 횟수와 함께 말해야 한다 (지금 「${found}」)`);
check(/쓰지 마|do not use|使わないで/.test(found), '유출된 것은 쓰지 말라고 말해야 한다');

/* ⑥ 비밀번호를 고치면 앞의 답은 지운다 — 남의 답이 남아 있으면 안 된다 */
await page.fill('#pcIn', SECRET + 'X');
await page.waitForTimeout(300);
check((await page.locator('#pcPwnedMsg').count()) === 0, '비밀번호가 바뀌면 앞의 답은 사라져야 한다');

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-pwned] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-pwned] 전부 통과');
