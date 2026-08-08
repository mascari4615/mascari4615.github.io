/**
 * 흐름이 **스스로 이어가는가** (TASK-KL-191 축1)
 *
 * 「자동화」라고 적어 놓고 사람이 단계마다 「다음」을 눌러야 했다. 그 클릭 하나가
 * 자동화와 반자동을 갈랐다. 여기서는 진짜 브라우저에서 그 클릭이 **정말 없어졌는지**를 본다.
 *
 * 서버는 안 쓴다 — 서버가 하는 일은 「켰다」를 기억하는 것뿐이고(도구는 전부 브라우저 안에서
 * 돈다), 자동으로 넘어가는 일 자체는 이 창 안에서 일어난다. 그러니 실행 상태를 직접 심고
 * 결과 신호를 쏴서, 넘어가는지 · 멈출 수 있는지를 그 자리에서 잰다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-flow-auto.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

await page.goto(`${BASE}#flow`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.switchPage === 'function', {
  timeout: 20000,
});
// 흐름 위젯은 그 화면을 열어야 비로소 받아진다 — 받아진 뒤에야 결과 신호를 듣는다.
await page.waitForSelector('.flow-wrap', { timeout: 20000 });

/** 두 단계짜리 자동 흐름을 심는다 (서버 없이 — 실행 상태는 이 창의 것이다). */
const seed = async (auto) => {
  await page.evaluate((on) => {
    sessionStorage.setItem(
      'karmolab_flow_run',
      JSON.stringify({
        id: 'probe',
        title: '검사용 흐름',
        steps: [{ toolId: 'pdfcrop' }, { toolId: 'pdfcompress' }],
        at: 0,
        started: Date.now(),
        auto: on,
      }),
    );
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, auto);
  await page.waitForSelector('.flow-bar', { timeout: 10000 });
};

const fireResult = () =>
  page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('karmolab-result', { detail: { type: 'application/pdf', size: 4242 } }));
  });

/* ① 자동이 꺼져 있으면 — 결과가 나와도 **혼자 안 넘어간다**. 이걸 먼저 본다:
 *    안 그러면 「자동이 됐다」가 아니라 「원래 넘어가고 있었다」를 자동이라 부르게 된다. */
await seed(false);
await fireResult();
await page.waitForTimeout(6000);
const manualStayed = await page.evaluate(() => JSON.parse(sessionStorage.getItem('karmolab_flow_run') || '{}').at);
if (manualStayed !== 0) problems.push(`자동을 껐는데 혼자 ${manualStayed + 1}단계로 갔다`);
const manualCountdown = await page.locator('.flow-bar-auto').count();
if (manualCountdown !== 0) problems.push('자동을 껐는데 초를 세고 있다');

/* ② 자동이 켜져 있으면 — 결과가 나온 뒤 초를 세고 스스로 넘어간다. */
await seed(true);
await fireResult();
await page.waitForSelector('.flow-bar-auto', { timeout: 5000 });
const countdownText = await page.locator('.flow-bar-auto').first().textContent();
if (!/\d초 뒤/.test(countdownText ?? '')) problems.push(`남은 초가 안 보인다: ${countdownText}`);

await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('karmolab_flow_run') || '{}').at === 1, {
  timeout: 12000,
}).catch(() => problems.push('자동을 켰는데 다음 단계로 안 갔다'));
/* 화면이 실제로 옮겨 갔나. 주소는 **묶음 이름**이 된다 — pdfcompress 는 「PDF 도구」 탭이라
 * `#pdf` 로 간다(도구 이름이 주소에 그대로 뜰 것이라 처음 헛짚었다). 그러니 주소는
 * 「흐름 화면을 떠났나」로만 보고, 몇 단계인지는 띠에게 묻는다. */
const landed = await page.evaluate(() => location.hash);
if (landed === '#flow') problems.push('다음 단계로 갔다는데 화면은 흐름 목록 그대로다');
const barText = (await page.locator('.flow-bar-count').first().textContent()) ?? '';
if (!barText.includes('2 / 2')) problems.push(`띠가 아직 다음 단계를 안 가리킨다: ${barText}`);

/* ③ **멈출 수 있어야** 자동이다 — 못 멈추는 자동은 덫이다. */
await seed(true);
await fireResult();
await page.waitForSelector('.flow-bar-auto', { timeout: 5000 });
await page.locator('.flow-bar button', { hasText: '잠깐' }).first().click();
await page.waitForTimeout(6000);
const stopped = await page.evaluate(() => JSON.parse(sessionStorage.getItem('karmolab_flow_run') || '{}').at);
if (stopped !== 0) problems.push(`「잠깐」을 눌렀는데 ${stopped + 1}단계로 넘어갔다`);

await browser.close();

if (problems.length) {
  console.error('❌ 스스로 이어가기:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log('✅ 스스로 이어감 — 꺼져 있으면 안 넘어가고, 켜면 초를 세고 넘어가고, 「잠깐」이면 멈춘다');
