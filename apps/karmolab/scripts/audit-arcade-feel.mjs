/**
 * 오락실 손맛 감사. 브라우저에서 잰다 (감사 E3, 2026-09-03)
 *
 * `audit:arcade-contract` 는 파일에 `blip` 글자가 있나만 본다. 여기서는 실제로 떠 있는 판을 재서
 * - 스타일시트가 끝까지 살아 있나 (괄호 하나가 뒤 217줄을 죽인 사고, 2026-09-02)
 * - 평면 카드에 CSS 전환이 걸려 있나 (전환이 0s 면 카드가 순간이동)
 * - 자리 카드가 같은 요소로 남나 (매 프레임 새로 만들면 전환이 죽음)
 * 리포트 전용. `--strict` 면 스타일시트 손상이나 전환 0s 인 카드 판이 있을 때 exit 1
 *
 *   node scripts/audit-arcade-feel.mjs [--strict] [--only <game>]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { smokeBase } from './lib/smoke-base.mjs';
import { WAIT } from './lib/waits.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
/* 기본은 로비에 뜨는 판. --all 이면 감춘 판까지 (판마다 새 창이라 52판이면 오래 걸린다) */
const all = args.includes('--all');

/* 원본 CSS 의 마지막 선택자. 브라우저의 마지막 규칙과 같아야 끝까지 읽힌 것 */
const css = readFileSync('src/widgets/arcade/arcade.css', 'utf8');
const lastSelector = (() => {
  const body = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').trim();
  const m = [...body.matchAll(/(?:^|\n)([^@\n{}][^{}\n]*)\{/g)];
  return m.length ? m[m.length - 1][1].trim() : '';
})();

const server = await smokeBase();
const PAGE = `${server.base}/apps/karmolab/index.html${all ? '?all=1' : ''}#arcade`;
const browser = await chromium.launch();
const rows = [];
let sheetOk = null;
let cantRun = '';

/* 판마다 새 창. 한 창을 52번 돌려 쓰면 위젯 잔재가 쌓여 Page crashed (2026-09-03 실측) */
const open = async () => {
  const c = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('karmolab.arcade.dim', '2d'); } catch {} });
  await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-obj]', { timeout: 20000 });
  return { c, p };
};
let ctx;
let page;
try {
  ({ c: ctx, p: page } = await open());
} catch (e) {
  cantRun = `오락실이 안 떴다. ${String(e).slice(0, 80)}`;
}

if (!cantRun) {
  sheetOk = await page.evaluate((want) => {
    const sheet = document.getElementById('ac-style')?.sheet;
    if (!sheet) return { ok: false, why: 'ac-style 없음' };
    const rules = [...sheet.cssRules];
    /* 마지막 **스타일** 규칙. 끝에 @media 나 @keyframes 가 오면 그건 건너뜀 */
    let sel = '';
    for (let i = rules.length - 1; i >= 0 && !sel; i -= 1) sel = rules[i].selectorText || '';
    return { ok: !!sel && sel.replace(/\s+/g, '') === want.replace(/\s+/g, ''), n: rules.length, last: sel.slice(0, 60), want: want.slice(0, 60) };
  }, lastSelector);

  const ids = (await page.$$eval('[data-obj]', (bs) => bs.map((b) => b.dataset.obj))).filter((id) => !only || id === only);
  await ctx.close();
  for (const id of ids) {
    const row = { game: id, cards: null, transition: null, seatKept: null };
    let c2 = null;
    try {
      const o = await open();
      c2 = o.c;
      page = o.p;
      await page.click(`[data-obj="${id}"]`);
      await page.click(`[data-solo="${id}"]`, { timeout: 15000 });
      await page.waitForFunction(() => {
        const v = document.querySelector('#acView');
        return !!v && v.children.length > 0;
      }, null, { timeout: WAIT });
      await page.waitForSelector('#acSeats .ac-seat', { timeout: WAIT });
      const seatA = await page.evaluateHandle(() => document.querySelector('#acSeats .ac-seat'));
      /* 재움-의도: 자리 카드를 한 프레임이 아니라 여러 렌더 틱에 걸쳐 같은 DOM으로
         유지하는지 재는 시간 표본이다. 상태 도착을 기다리는 자리가 아니다. */
      await page.waitForTimeout(700);
      const got = await page.evaluate((a) => {
        const view = document.querySelector('#acView');
        const cards = [...(view?.querySelectorAll('.ac-pc') ?? [])];
        const durations = cards.slice(0, 6).map((c) => getComputedStyle(c).transitionDuration);
        const moving = durations.filter((d) => d && d !== '0s').length;
        return {
          cards: cards.length,
          transition: cards.length ? `${moving}/${durations.length}` : null,
          seatKept: a ? a === document.querySelector('#acSeats .ac-seat') : null
        };
      }, seatA);
      Object.assign(row, got);
    } catch (e) {
      row.error = String(e).slice(0, 60);
    }
    rows.push(row);
    await c2?.close();
  }
}
await browser.close();
await server.close();

if (cantRun) {
  console.log(`[arcade-feel] 못 쟀다. ${cantRun} (통과 아님)`);
  process.exit(2);
}
console.log(`[arcade-feel] 스타일시트 ${sheetOk.ok ? '끝까지 살아 있다' : '중간에 끊겼다'} (규칙 ${sheetOk.n}, 마지막 ${sheetOk.last})`);
const bad = rows.filter((r) => r.cards && r.transition && r.transition.startsWith('0/'));
console.log(`[arcade-feel] 판 ${rows.length}개. 카드 전환 0s 인 판 ${bad.length}개, 자리 카드가 바뀐 판 ${rows.filter((r) => r.seatKept === false).length}개`);
console.log('  판           카드   전환    자리유지   (카드는 평면 .ac-pc 수. 0 이면 그 판은 카드 종이를 안 씀)');
for (const r of rows) {
  const pad = (s, n) => String(s ?? '-').padEnd(n);
  console.log(`  ${pad(r.game, 12)} ${pad(r.cards, 6)} ${pad(r.transition, 7)} ${pad(r.seatKept === null ? '-' : r.seatKept ? 'O' : 'X', 9)}${r.error ? '  ' + r.error : ''}`);
}
if (strict && (!sheetOk.ok || bad.length)) process.exit(1);
