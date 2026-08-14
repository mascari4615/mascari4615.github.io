/**
 * 오락실이 놀이의 **유일한 문**인지 (TASK-KL-313)
 *
 * 왜 창을 띄우나: 명부가 맞아도 화면에 안 서면 그 초록은 거짓이다. 혼자 놀이 자리는
 * `games.json` 을 **받아서** 그리므로(정본 한 벌), 코드만 읽어서는 실제로 섰는지 알 수 없다.
 *
 * 보는 것:
 *   ① 로비에 「혼자 놀이」 자리가 서고, 카드 수가 `games.json` 과 같다 (명부 두 벌 아님)
 *   ② 오늘의 코스 줄이 붙는다 (놀이터에서 옮겨 온 알맹이)
 *   ③ 찾기가 방 게임과 혼자 놀이를 **함께** 잡는다
 *   ④ 앱 안 놀이 카드를 누르면 그 도구로 건너간다 (죽은 링크 아님)
 *   ⑤ 표 만드는 문이 로비에 있다 (놀이의 재료로 가는 길)
 *
 * 로컬 dev 서버(`npm run dev`)를 본다. 서버가 없으면 「못 돌았다」(2)로 끝낸다.
 *
 * 실행: `node scripts/smoke-arcade-solo.mjs` (dev 서버가 떠 있어야 한다)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14).
   여태 `127.0.0.1:8813`(사람이 켜는 `npm run dev`)만 봤고, 없으면 「못 돌았다」(2)로 끝냈다.
   정직하긴 한데 CI 는 그 서버를 **한 번도 안 켠다** — 그래서 이 검사는 verify 에서 매번
   「못 돌림」이었고, 사실상 **아무 데서도 안 돌고 있었다**(실측: 오늘 verify 로그).
   못 도는 검사는 없는 검사다. 켜져 있으면 그걸 쓰고, 없으면 저장소를 그대로 내어 준다
   (다른 화면 검사들과 같은 `serveRepo`). */
/* 잴 자리는 한 곳에서 정한다 — `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
const 내서버 = await smokeBase();
const BASE = 내서버.base;
const PAGE = `${BASE}/apps/karmolab/index.html#arcade`;

const failures = [];
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : ' — ' + detail}`);
  if (!cond) failures.push(name);
};

const expected = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'games.json'), 'utf8')).games;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  /* 자리가 아예 안 서는 것이 가장 흔한 고장이다 — 그때 「Timeout」 스택을 뱉으면 무엇이
     망가졌는지 안 보인다. 여기서 잡아 한 줄로 말하고, 나머지 검사는 그대로 이어 간다. */
  const stood = await page
    .waitForSelector('#acSolo .ac-solocard', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('로비에 혼자 놀이 자리가 선다', stood, '#acSolo 가 비어 있다 — 명부를 못 받았거나 안 그렸다');
  if (!stood) {
    console.log(`
[arcade-solo] 실패 ${failures.length}건`);
    await browser.close();
if (내서버) await 내서버.close();
    process.exit(1);
  }

  const names = await page.$$eval('#acSolo .ac-solocard b', (n) => n.map((x) => x.textContent.trim()));
  check(
    `혼자 놀이 ${expected.length}개가 로비에 선다`,
    names.length === expected.length,
    `${names.length}개 — ${names.join(' / ')}`
  );
  check(
    '명부가 두 벌이 아니다 (games.json 과 이름이 같다)',
    expected.every((g) => names.includes(g.title)),
    names.join(' / ')
  );

  const course = await page.$eval('#acSolo .ac-solocourse', (n) => n.textContent.trim()).catch(() => '');
  check('오늘의 코스 줄이 붙는다', /\d/.test(course), course || '(줄 자체가 없다)');

  await page.fill('#acFind', '스무고개');
  await page.waitForTimeout(300);
  const hits = await page.$$eval('#acSolo .ac-solocard b, #acGames .ac-card b', (n) =>
    n.map((x) => x.textContent.trim())
  );
  check('찾기가 방 게임과 혼자 놀이를 함께 잡는다', hits.length >= 2, hits.join(' / '));
  check(
    '이름이 겹치지 않는다 (같은 글자가 둘이면 어느 쪽인지 모른다)',
    new Set(hits).size === hits.length,
    hits.join(' / ')
  );

  await page.fill('#acFind', '');
  await page.waitForTimeout(300);
  check('표 만드는 문이 로비에 있다', (await page.$('#acPacks #acPackNew')) !== null);

  const inApp = expected.find((g) => g.url.startsWith('/karmolab/#'));
  await page.click(`#acSolo a[data-solo-go="${inApp.id}"]`);
  await page.waitForTimeout(1200);
  check(
    `카드를 누르면 그 놀이로 건너간다 (${inApp.title})`,
    new URL(page.url()).hash === `#${inApp.id}`,
    page.url()
  );

  check('페이지 오류 없음', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

console.log(failures.length ? `\n[arcade-solo] 실패 ${failures.length}건` : '\n[arcade-solo] 통과');
process.exit(failures.length ? 1 : 0);
