/**
 * 논문 지도 — 찾고, 그리고, 열리는가 (TASK-KL-253).
 *
 * 바깥(OpenAlex)은 가짜로 세운다 — 남의 서버가 느린 날 이 검사가 빨개지면 그 빨강은 거짓말이다.
 * 대신 **그 서버가 실제로 주는 모양 그대로** 흉내 낸다(2026-08-12 실측한 응답 구조).
 *
 * 사용: node scripts/smoke-papermap.mjs
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

const work = (id, title, year, cited, refs = []) => ({
  id: `https://openalex.org/${id}`,
  title,
  publication_year: year,
  cited_by_count: cited,
  referenced_works: refs.map((r) => `https://openalex.org/${r}`),
  authorships: [{ author: { display_name: '아무개' } }],
  doi: `https://doi.org/10.1/${id}`
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

let searchCalls = 0;
let fetchCalls = 0;

await page.route(/api\.openalex\.org\/works\?/, async (route) => {
  const url = route.request().url();
  if (url.includes('filter=openalex_id')) {
    fetchCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [work('W2', '옛 바닥 논문', 1990, 40000), work('W3', '가까운 논문', 2015, 120)]
      })
    });
  }
  searchCalls += 1;
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [work('W1', 'Attention Is All You Need', 2017, 6585, ['W2', 'W3'])] })
  });
});

await page.goto(`${BASE}#papermap`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pmQuery', { timeout: 20000 });

/* ① 찾으면 목록이 뜬다 */
await page.click('#pmSearch');
await page.waitForSelector('.pm-hit', { timeout: 15000 });
check((await page.locator('.pm-hit').count()) === 1, '찾은 논문이 목록에 뜬다');
const hitText = await page.locator('.pm-hit').first().innerText();
check(/6,585|6585/.test(hitText), `인용 수가 보인다 (지금 「${hitText.slice(0, 40)}」)`);

/* ② 고르면 지도가 그려진다 */
await page.locator('.pm-hit').first().click();
await page.waitForSelector('#pmMapWrap:visible', { timeout: 15000 });
const boxes = await page.locator('.pm-node').count();
check(boxes === 3, `가운데 하나 + 바닥 둘이 그려져야 한다 (지금 ${boxes})`);
check((await page.locator('.pm-root').count()) === 1, '가운데 논문은 하나이고 눈에 띈다');
check((await page.locator('.pm-edge').count()) === 2, '이은 줄이 둘');

/* ③ 참고문헌은 한 번의 요청으로 받는다 — 스무 편을 스무 번 부르면 곧 막힌다 */
check(fetchCalls === 1, `참고문헌은 한 번에 받아야 한다 (지금 ${fetchCalls}번)`);

/* ④ 크기 = 인용 수 · 왼쪽 = 옛것 */
const geo = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('.pm-node').forEach((g) => {
    const title = g.querySelector('title')?.textContent || '';
    const r = g.querySelector('rect');
    out[title] = { x: +r.getAttribute('x'), w: +r.getAttribute('width') };
  });
  return out;
});
check(geo['옛 바닥 논문'].w > geo['가까운 논문'].w, '많이 인용된 것이 더 크게 그려진다');
check(geo['옛 바닥 논문'].x < geo['가까운 논문'].x, '옛 논문이 왼쪽에 온다');

/* ⑤ 칸을 누르면 그 논문으로 간다 */
const [popup] = await Promise.all([
  page.waitForEvent('popup', { timeout: 10000 }),
  page.locator('.pm-node').nth(1).click()
]);
check(/doi\.org/.test(popup.url()), `칸을 누르면 논문으로 가야 한다 (지금 ${popup.url().slice(0, 40)})`);
await popup.close();

/* ⑥ 캔버스 파일로 내보낸다 */
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#pmExport')]);
check(dl.suggestedFilename().endsWith('.canvas'), `카모그래프가 읽는 파일로 나가야 한다 (지금 ${dl.suggestedFilename()})`);

process.stdout.write('\n');
await browser.close();
if (frozen) await frozen.close();

if (failures.length) {
  console.error(`[smoke-papermap] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[smoke-papermap] 전부 통과');
