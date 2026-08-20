/**
 * 타임캡슐이 **진짜로** 잠기는지 (TASK-KL-134)
 *
 * 이 도구의 값어치는 「그날 전에는 못 연다」한 줄에 전부 걸려 있다. 화면이 뜨는지 보는 검사도,
 * 값을 넣으면 반응하는지 보는 검사도 그걸 못 본다 — 잠금이 통째로 풀려 있어도 통과한다.
 *
 * 보는 것:
 *   ① 편지를 잠그면 주소가 나온다
 *   ② 그 주소를 열면 **아직 못 연다**고 하고, 열릴 날짜를 말해 준다
 *   ③ **시계를 앞으로 돌려도** 안 열린다 (열쇠가 이 컴퓨터에 없다는 뜻)
 *   ④ 그 시각이 실제로 지나면 열리고, 적은 그대로 나온다
 *
 * ③ 이 이 검사의 핵심이다. 날짜로 열쇠를 만드는 흔한 방식은 여기서 바로 무너진다.
 *
 * 바깥 공개 시계에 기대므로 **자동 묶음에는 안 넣는다** — 망이 막힌 자리에서 늘 빨간 경보가 된다.
 * `npm run test:timecapsule` 로 손수 돌린다. 못 돌면 「못 돌았다」(2)로 끝낸다.
 */
import { chromium } from 'playwright';
import { waitHydrated } from './lib/hydrated.mjs';

const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const TOOL = `${BASE}/karmolab/t/timecapsule/`;
const letter2 = '먼 날의 너에게 — 이 줄이 그대로 보이면 잠금이 제대로 열린 것이다.';
const waited = 210000; // 2분 뒤로 잠그고 넉넉히 기다린다

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name} — ${detail}`);
};

const browser = await chromium.launch();
let cantRun = '';

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => failures.push(`페이지 오류: ${e.message}`));

  // ① 잠그면 주소가 나온다 (2분 뒤로)
  const res = await page.goto(TOOL, { waitUntil: 'domcontentloaded' });
  if (res && res.status() === 404) throw new Error(`페이지가 아직 없다 (${BASE} 에 배포되기 전)`);
  /* 단추가 보인다고 손이 달린 것은 아니다 — 미리 그린 그림과 진짜 화면 사이 틈 (TASK-KL-135).
     이 검사가 그 틈에서 두 번 헛돌아 「공개 시계에 못 닿았다」로 끝났다(도구는 멀쩡했다). */
  await waitHydrated(page, '#tcSeal');
  await page.fill('#tcText', letter2);
  const onOpen = new Date(Date.now() + 120000);
  const p2 = (n) => String(n).padStart(2, '0');
  const value = `${onOpen.getFullYear()}-${p2(onOpen.getMonth() + 1)}-${p2(onOpen.getDate())}T${p2(onOpen.getHours())}:${p2(onOpen.getMinutes())}`;
  await page.fill('#tcWhen', value);
  await page.click('#tcSeal');

  const locked2 = await page
    .waitForSelector('#tcUrl', { timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  if (!locked2) {
    const output = await page.evaluate(() => document.querySelector('#tcStatus')?.textContent || '');
    cantRun = `잠그지 못했다 — 공개 시계에 닿지 못했을 수 있다 (${output.slice(0, 60)})`;
    throw new Error(cantRun);
  }
  const url = await page.inputValue('#tcUrl');
  check('잠긴 주소', /#c=/.test(url) && url.length > 200, `주소 길이 ${url.length}`);

  const hash = url.slice(url.indexOf('#'));

  // ② 열면 아직 못 연다고 하고, 열릴 날짜를 말해 준다
  await page.goto('about:blank');
  await page.goto(TOOL + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tcStatus', { timeout: 30000 });
  await page.waitForFunction(() => !/여는 중/.test(document.querySelector('#tcStatus')?.textContent || ''), undefined, {
    timeout: 60000
  });
  const lockedScreen = await page.evaluate(() => ({
    status: document.querySelector('#tcStatus')?.textContent || '',
    locked: !!document.querySelector('.tc-locked'),
    when: document.querySelector('.tc-when')?.textContent || '',
    letter: document.querySelector('.tc-letter')?.textContent || ''
  }));
  check('아직 못 엶', /아직 열 때가 아닙니다/.test(lockedScreen.status), `상태줄: ${lockedScreen.status.slice(0, 60)}`);
  check('열릴 날짜 안내', lockedScreen.locked && lockedScreen.when.length > 0, `자물쇠 ${lockedScreen.locked} · 날짜 "${lockedScreen.when}"`);
  check('내용은 안 보임', !lockedScreen.letter.includes('먼 날의'), '잠겼는데 편지가 보였다');

  // ③ 시계를 앞으로 돌려도 안 열린다 — 여기가 이 도구의 존재 이유다
  const future = await browser.newContext({ timezoneId: 'UTC' });
  const earlier = await future.newPage();
  await earlier.addInitScript(`{
    const 진짜 = Date.now;
    const 앞으로 = 400 * 24 * 3600 * 1000;
    Date.now = () => 진짜() + 앞으로;
    const OD = Date;
    // new Date() 도 같이 앞당긴다 — 화면이 「지났다」고 믿게 만드는 것이 목적이다
    globalThis.Date = class extends OD {
      constructor(...a) { super(...(a.length ? a : [진짜() + 앞으로])); }
      static now() { return 진짜() + 앞으로; }
    };
  }`);
  await earlier.goto(TOOL + hash, { waitUntil: 'domcontentloaded' });
  await earlier.waitForSelector('#tcStatus', { timeout: 30000 });
  await earlier.waitForFunction(() => !/여는 중/.test(document.querySelector('#tcStatus')?.textContent || ''), undefined, {
    timeout: 60000
  });
  const spoofed = await earlier.evaluate(() => ({
    status: document.querySelector('#tcStatus')?.textContent || '',
    letter: document.querySelector('.tc-letter')?.textContent || ''
  }));
  check('시계를 돌려도 안 열림', !spoofed.letter.includes('먼 날의'), `시계를 앞당기니 열렸다: ${spoofed.letter.slice(0, 40)}`);
  /* 시계를 돌리면 공개 시계에서 「아직 없는 회차」를 달라고 하게 되어, 못 연다는 말 대신
   * 받아오기 실패로 끝날 수도 있다. 어느 쪽이든 **안 열린 것**이 이 검사가 지키려는 성질이다.
   * 문구까지 못 박으면 라이브러리가 말을 바꿀 때마다 빨개진다. */
  check('시계 속임 · 열렸다고 안 함', !/열렸습니다/.test(spoofed.status), `상태줄: ${spoofed.status.slice(0, 60)}`);
  await future.close();

  // ④ 진짜로 그때가 지나면 열린다
  const deadline = Date.now() + waited;
  let openedText = '';
  while (Date.now() < deadline && !openedText) {
    await page.waitForTimeout(15000);
    await page.goto('about:blank');
    await page.goto(TOOL + hash, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(() => !/여는 중/.test(document.querySelector('#tcStatus')?.textContent || ''), undefined, { timeout: 60000 })
      .catch(() => {});
    openedText = await page.evaluate(() => document.querySelector('.tc-letter')?.textContent || '');
  }
  check('때가 되면 열림', openedText.includes('먼 날의'), `기다렸는데 안 열렸다 (${Math.round(waited / 1000)}초)`);
  check('적은 그대로', openedText.trim() === letter2, `나온 글: ${openedText.slice(0, 40)}`);
} catch (e) {
  if (!cantRun) failures.push(`검사가 끝까지 못 갔다: ${e.message}`);
} finally {
  await browser.close();
}

if (cantRun) {
  console.log(`[smoke-timecapsule] 못 돌았다 — ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length > 0) {
  console.log(`[smoke-timecapsule] 실패 ${failures.length}건`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('[smoke-timecapsule] 진짜 잠금 확인 — 잠그기 · 아직 못 엶 · 시계 돌려도 안 열림 · 때가 되니 열림');
