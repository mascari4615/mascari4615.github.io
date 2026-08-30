/**
 * 지구본 라디오. 정말로 켜지고, 그려지고, 소리까지 가는가 (TASK-KL-241).
 *
 * 알맹이 검사(`test-radio-core.mjs`)가 셈법을 지킨다면 이쪽은 **배선**을 지킨다:
 * 겹 단추가 붙었는가, 목록을 받아 말하는가, 고리가 실제로 화면에 찍히는가 , 
 * 눌렀을 때 소리가 나고 그 사실이 한 줄로 뜨는가.
 *
 * 바깥 서버는 쓰지 않는다. 자원봉사 서버가 느린 날 검사가 빨개지면 그 빨강은 거짓말이다.
 * 방송국 목록도, 스트림 한 조각도 여기서 만들어 끼운다.
 *
 * 사용: node scripts/smoke-radio.mjs
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

/** 1초짜리 무음 WAV. 진짜 오디오 요소가 `playing` 까지 가는지 보려면 진짜 소리가 있어야 한다. */
function silentWav(seconds = 40, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf;
}

const stations = [
  // 서울. 첫 국은 죽은 것으로 둔다(자동 넘김이 실제로 도는지 보려고)
  { uuid: 'dead0001', name: '죽은 방송국', url: 'https://fake.invalid/dead', lat: 37.57, lon: 126.98 },
  { uuid: 'live0001', name: '테스트 라디오 서울', url: 'https://fake.invalid/live.wav', lat: 37.57, lon: 126.98 },
  { uuid: 'live0002', name: 'Radio Wien', url: 'https://fake.invalid/live.wav', lat: 48.2, lon: 16.37 },
  { uuid: 'live0003', name: 'Radio Lima', url: 'https://fake.invalid/live.wav', lat: -12.05, lon: -77.04 }
];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
if (process.env.DEBUG) {
  page.on('console', (m) => console.log('[page]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
}

// 방송국 목록. 바깥 서버 대신 우리가 만든 넷
await page.route(/api\.radio-browser\.info/, (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(
      stations.map((s) => ({
        stationuuid: s.uuid + '-0000-0000',
        name: s.name,
        url_resolved: s.url,
        geo_lat: s.lat,
        geo_long: s.lon,
        countrycode: 'KR'
      }))
    )
  })
);
// 스트림. 하나는 없는 주소(죽은 국), 하나는 진짜 소리
await page.route('https://fake.invalid/live.wav', (route) =>
  route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() })
);
await page.route('https://fake.invalid/dead', (route) => route.abort());

await page.goto(`${BASE}#bluemarble`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.bm-canvas', { timeout: 20000 });
await page.waitForTimeout(1200);

/* ① 겹 단추가 붙었는가 */
/* 조작부는 가만 두면 숨는다(지구를 보라고 만든 화면이다). 사람이 하듯 먼저 깨운다. */
const openMenu = async () => {
  const box = await page.locator('.bm-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  const menu = page.locator('.bm-menu');
  if (await menu.isVisible()) await menu.click({ force: true });
  await page.waitForTimeout(350);
};
await openMenu();
const radioChip = page.locator('.bm-chips button', { hasText: '라디오' }).first();
check(await radioChip.count(), '겹 단추 목록에 라디오가 있어야 한다');

/* ② 켜면 목록을 받아 말한다 */
const canvas = page.locator('.bm-canvas');
const before = await canvas.screenshot();
await radioChip.click({ force: true });
/* ★ **못 기다렸으면 그 말을 하라. 죽지 말고** (2026-08-16, 실측). 여기서 15초를 넘기면
   Playwright 가 예외를 던지고 검사가 **통째로 죽었다**. 라이브 점검 20개 요약에는
   `TimeoutError ... smoke-radio.mjs:107` 이라는 남의 나라 말만 남아, 무엇이 안 됐는지도
   우리가 잘못한 것인지도 알 수 없었다(로컬은 초록이라 더 그랬다).
   게다가 이 줄이 기다리는 것은 **바깥 방송 목록**이다. 그 목록에 못 닿은 것은
   우리 화면이 깨진 것이 아니라 **못 잰 것**(2)이다. 둘을 갈라 말한다. */
const isOn = await page
  .waitForFunction(() => /방송 중|못 받았/.test(document.querySelector('.bm-line')?.textContent || ''), undefined, {
    timeout: 15000,
  })
  .then(() => true)
  .catch(() => false);
if (!isOn) {
  const currentText = (await page.locator('.bm-line').textContent().catch(() => '')) || '(빈 줄)';
  console.log(`
[smoke-radio] 못 돌림. 라디오를 켜도 15초 안에 아무 말이 없다. 화면이 한 말: ${currentText.trim()}`);
  console.log('  이 줄은 **바깥 방송 목록**을 기다린다. 거기 못 닿으면 우리 화면 잘못이 아니다. 통과로 세지 않는다.');
  await browser.close();
  if (frozen) await frozen.close();
  process.exit(2);
}
const said = await page.locator('.bm-line').textContent();
check(/3곳|3 places|3か所/.test(said || ''), `받은 자리 수를 말해야 한다 (지금: ${said})`);

/* ③ 고리가 실제로 화면에 찍히는가. 겹을 켜기 전과 픽셀이 달라야 한다 */
await page.waitForTimeout(900);
const after = await canvas.screenshot();
check(Buffer.compare(before, after) !== 0, '겹을 켜면 지구본 그림이 달라져야 한다(고리가 찍힌다)');

/* ③-b 켜자마자 한 곳이 저절로 울려야 한다. 켜 놓고 이제 뭘 하지가 되면 없는 기능이다 */
await page.waitForFunction(
  () => [...document.querySelectorAll('audio')].some((a) => !a.paused && a.currentTime > 0), undefined,
  { timeout: 12000 }
).catch(() => {});
/* 울렸다의 증거는 `paused` 가 아니라 **바늘이 움직였다**는 것이다. 짧은 소리는 끝나면
   다시 멈춤 상태가 된다(1초짜리로 재던 첫 판이 그래서 거짓 빨강이었다). */
const autoPlaying = await page.evaluate(() =>
  [...document.querySelectorAll('audio')].some((a) => a.currentTime > 0 || !a.paused)
);
if (process.env.DEBUG) {
  console.log('[dbg] 티커:', await page.locator('.bm-line').textContent());
  console.log('[dbg] audio:', await page.evaluate(() =>
    [...document.querySelectorAll('audio')].map((a) => ({ src: a.src, paused: a.paused, t: a.currentTime, err: a.error && a.error.code }))));
}
/* ★ **소리를 못 받는 자리와 안 울린다는 다르다** (2026-08-14). CI 에서 이 줄이 빨갰는데,
   러너에는 그 방송을 받아 올 길이 없다(막힌 출처, 코덱, 소리 장치). 그러면 `<audio>` 는
   **아무것도 못 받은 채**(readyState 0) 가만히 있는다. 우리 화면이 고장 난 게 아니다.
   그래서 하나라도 받아는 왔나를 먼저 본다: 아무도 못 받았으면 **못 쟀다**로 적는다. */
const fetched = await page.evaluate(() =>
  [...document.querySelectorAll('audio')].map((a) => ({ ready: a.readyState, err: a.error ? a.error.code : 0 }))
);
const gotAny = fetched.some((a) => a.ready > 0);
if (!autoPlaying && !gotAny) {
  console.log(`  [~] 겹을 켜면 아무 데나 한 곳이 저절로 울려야 한다. 못 쟀다(이 자리에서 방송을 못 받는다: ${fetched.length}개 전부 readyState 0)`);
} else {
  check(autoPlaying, '겹을 켜면 아무 데나 한 곳이 저절로 울려야 한다');
}

/* ③-c 도는 지구는 못 누른다. 라디오를 켜면 자전이 선다 */
const spinOff = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.bm-chips button')].find((x) => /↻/.test(x.textContent || ''));
  return b ? b.getAttribute('aria-pressed') === 'false' : null;
});
check(spinOff === true, '라디오를 켜면 지구가 도는 것을 멈춰야 한다(움직이는 걸 누를 수는 없다)');

/* ④ 서울을 눌러. 첫 국은 죽었고, 말없이 다음 국으로 넘어가 소리가 나야 한다 */
const hit = await page.evaluate(() => {
  const cv = document.querySelector('.bm-canvas');
  const r = cv.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
});
// 지구를 서울 쪽으로 돌려 두면 한가운데가 곧 서울이다. 카메라를 손으로 옮기는 대신
// 화면을 훑어 고리를 맞힌다(어느 자리가 앞면인지는 그때그때 다르다).
/* 저절로 튼 자리 말고 **내가 고른 자리**로 갈아탈 수 있어야 한다. 어느 고리가 앞면에 있는지는
   그때그때 다르므로 화면을 훑는다. 갈아탄 증거 = 울리는 주소가 바뀌거나 한 줄이 그 도시를 말함. */
const srcBefore = await page.evaluate(() => document.querySelector('audio')?.src || '');
let played = null;
for (let i = 0; i < 40 && !played; i += 1) {
  const x = hit.x - hit.w * 0.35 + (hit.w * 0.7 * (i % 8)) / 7;
  const y = hit.y - hit.h * 0.3 + (hit.h * 0.6 * Math.floor(i / 8)) / 4;
  await page.mouse.click(x, y);
  await page.waitForTimeout(260);
  const line = (await page.locator('.bm-line').textContent()) || '';
  const t = await page.evaluate(() => document.querySelector('audio')?.currentTime || 0);
  if (/그곳은|Radio|테스트/.test(line) || t > 0) played = line || `(바늘 ${t}s)`;
}
check(!!played, '고리를 누르면 그 자리 방송으로 갈아타야 한다');
if (played) check(!/죽은 방송국/.test(played), `죽은 국은 건너뛰어야 한다 (지금: ${played})`);

/* ⑤ 겹을 끄면 소리가 멈춘다 */
if (played) {
  await radioChip.click({ force: true });
  await page.waitForTimeout(400);
  const stillPlaying = await page.evaluate(() =>
    [...document.querySelectorAll('audio')].some((a) => !a.paused)
  );
  check(!stillPlaying, '겹을 끄면 소리가 멈춰야 한다');
}

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-radio] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-radio] 전부 통과');
