/**
 * 오늘의 판 — 첫 화면에 매일 달라지는 것이 있는가 (TASK-KL-194)
 *
 * 왜 화면 검사인가: 이 자리의 값은 **각 놀이가 이 브라우저에 남긴 것**을 읽어 나온다.
 * 그 읽는 법(`play-course.ts`)과 저장 모양이 어긋나면 단위 시험은 전부 초록인데 첫 화면만
 * 영원히 「0 / 5」가 된다 — 실제로 그 어긋남이 코스가 못 세는 놀이를 만든 적이 있다(KL-089).
 * 그래서 진짜 저장을 넣고 진짜 화면을 본다.
 *
 * 서버(`/kl/today`)는 **끊어 놓고** 시작한다. 오늘의 판은 로그인·서버 없이도 떠야 하고,
 * 그게 안 되면 노트북 한 대가 첫 화면의 단일 장애점이 된다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-today.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/* 서버는 안 부른다 — 있어도 없어도 이 화면은 같아야 한다. 껐을 때가 기본값이므로 그쪽을 본다. */
await context.route('**/kl/**', (route) => route.abort());

const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const open = async () => {
  const res = await page.goto(URL_TARGET, { waitUntil: 'networkidle', timeout: 30000 });
  if (!res || res.status() !== 200) problems.push(`첫 화면이 안 열린다 (http ${res && res.status()})`);
  await page.waitForSelector('#homeToday .lt-chips', { timeout: 15000 });
};

const countLine = () => page.locator('#homeToday .lt-count').innerText();
const doneChips = () => page.locator('#homeToday .lt-chip.is-done').count();

// ① 빈 브라우저 — 자리는 있고 아무것도 안 했다
await open();
const chips = await page.locator('#homeToday .lt-chip').count();
if (chips < 5) problems.push(`오늘의 판 칸이 ${chips}개다 (다섯이어야 한다)`);
if ((await doneChips()) !== 0) problems.push('아무것도 안 했는데 끝난 칸이 있다');
if (!(await countLine()).startsWith('0 /')) problems.push(`빈 브라우저인데 「${await countLine()}」로 뜬다`);
if (await page.locator('#homeToday .lt-brag').count()) problems.push('아무것도 안 했는데 자랑 단추가 있다');
if (await page.locator('#homeToday .lt-run').count()) problems.push('첫날인데 연속일이 떠 있다');

/* ② 놀이가 실제로 쓰는 저장 모양 그대로 — 여기서 모양을 지어내면 검사만 초록이 된다.
   `quest`/`higher` 는 「그날 문자열」을 열쇠로 쓴다(`YYYY. M. D.`), 월드컵은 우승 목록의 날짜. */
const seed = async (ids) => {
  await page.evaluate((list) => {
    const k = new Date(Date.now() + 9 * 3600e3);
    const day = `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
    const iso = new Date(Date.now() + 9 * 3600e3).toISOString();
    for (const id of list) {
      if (id === 'daily') localStorage.setItem('daily:pokemon:2026-08-08', JSON.stringify({ status: 'won' }));
      if (id === 'quest') localStorage.setItem('karmolab_quest', JSON.stringify({ [day]: { tries: 2 } }));
      if (id === 'higher') localStorage.setItem('karmolab_higher_day', JSON.stringify({ day, rounds: 3 }));
      if (id === 'twenty') localStorage.setItem('karmolab_twenty_day', JSON.stringify({ day, rounds: 1 }));
      if (id === 'worldcup') localStorage.setItem('karmolab_worldcup_history', JSON.stringify([{ at: iso }]));
    }
  }, ids);
};

await seed(['quest']);
await open();
if ((await doneChips()) !== 1) problems.push(`한 판 했는데 끝난 칸이 ${await doneChips()}개다`);
if (!(await countLine()).startsWith('1 /')) problems.push(`한 판 했는데 「${await countLine()}」로 뜬다`);

// ③ 다섯 다 — 완주 문구 + 자랑 단추
await seed(['daily', 'higher', 'twenty', 'worldcup']);
await open();
if ((await doneChips()) !== 5) problems.push(`다섯 다 했는데 끝난 칸이 ${await doneChips()}개다`);
if (!(await countLine()).includes('다 끝냈')) problems.push(`완주했는데 「${await countLine()}」로 뜬다`);
if (!(await page.locator('#homeToday .lt-brag').count())) problems.push('완주했는데 자랑 단추가 없다');

// ④ 칸을 누르면 그 놀이로 간다 (앱 안 화면은 그 자리에서 넘어간다)
await page.locator('#homeToday .lt-chip[data-go="higher"]').click();
await page.waitForTimeout(600);
if (!page.url().includes('higher')) problems.push(`칸을 눌렀는데 주소가 그대로다 (${page.url()})`);

await browser.close();

if (problems.length) {
  console.error('❌ 오늘의 판\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('✅ 오늘의 판 — 빈 브라우저 0/5 · 한 판 1/5 · 다섯 완주+자랑 · 칸 누르면 이동 (서버 끊고)');
