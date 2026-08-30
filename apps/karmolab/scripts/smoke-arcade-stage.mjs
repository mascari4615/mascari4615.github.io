/**
 * 무대가 판마다 안 출렁이고, 판이 무대를 실제로 채우는가 (TASK-KL-314)
 *
 * 두 가지를 같이 봐야 한다. 하나만 보면 둘 다 놓친다:
 *  ① **무대 폭이 51판 내내 같은가**. 갈아탈 때 화면이 출렁이지 않는다는 뜻
 *  ② **판이 그 무대를 채우는가**. ①만 보면 판이 폭 0 으로 무너져도 초록이다
 *
 * ②가 진짜로 필요했다: 무대를 세우면서 `place-items:center` 를 썼더니 자식이 shrink-to-fit 이
 * 되어 오목 칸이 **2px** 이 됐다. 그때 51종 화면검사(`test:arcade:ui`)는 초록이었다 . 
 * 떴다만 보고 크기를 안 재기 때문이다. 안 재는 검사는 안 보는 검사다.
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 못 돌림이었다. 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
/* 잴 자리는 한 곳에서 정한다. `lib/smoke-base.mjs`. */
const server = await smokeBase();
const BASE = server.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : '. ' + detail}`);
  if (!cond) fails.push(name);
};

let cantRun = '';
const br = await chromium.launch();
const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
try {
  await p.route('**/__dev', (r) => r.abort());
  const res = await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다. ${e.message}`;
}

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-obj]', { timeout: 30000 });
  const ids = await p.$$eval('[data-obj]', (bs) => bs.map((b) => b.dataset.obj));

  const widths = new Map();
  const thin = [];
  for (const id of ids) {
    await p.click(`[data-obj="${id}"]`);
    await p.click(`[data-solo="${id}"]`);
    await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(120);
    const seen = await p.evaluate(() => {
      const stage = document.querySelector('#acStage').getBoundingClientRect();
      /* 판에서 제일 넓은/높은 것. 무대를 얼마나 쓰고 있나. */
      const rects = [...document.querySelectorAll('#acView *')].map((e) => e.getBoundingClientRect());
      return {
        stage: Math.round(stage.width),
        widest: Math.round(Math.max(0, ...rects.map((r) => r.width))),
        tallest: Math.round(Math.max(0, ...rects.map((r) => r.height)))
      };
    });
    widths.set(seen.stage, (widths.get(seen.stage) || 0) + 1);
    /* 가로든 세로든 절반은 써야 무대에 담겼다고 할 수 있다. 무너지면 한 자릿수 px 이 된다.
       세로로 긴 판(컬링, 당구)은 화면에 넣느라 폭을 일부러 좁힌다. 그건 세로가 대신 채운다. */
    if (seen.widest < seen.stage * 0.5 && seen.tallest < seen.stage * 0.5) thin.push(`${id}(${seen.widest}×${seen.tallest}px)`);
    await p.click('#acQuit');
    await p.waitForSelector('[data-obj]', { timeout: 10000 });
  }

  check(`무대 폭이 ${ids.length}판 내내 같다`, widths.size === 1,
    [...widths.entries()].map(([w, n]) => `${w}px×${n}`).join(', '));
  check('판이 무대를 채운다 (폭 0 으로 안 무너진다)', thin.length === 0, thin.slice(0, 6).join(' '));

  /* 풀스크린은 무대만 커진다. 그 안의 것이 같이 커져야 뜻이 있다. */
  /* 칸 폭은 평면 판에서 잰다. 기본 표현은 입체라(`arcade.ts` 의 dim) 그대로 두면 `.ac-cell` 이 없다 */
  await p.evaluate(() => window.localStorage.setItem('karmolab.arcade.dim', '2d'));
  await p.click('[data-obj="gomoku"]');
  await p.click('[data-solo="gomoku"]');
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 });
  const small = await p.evaluate(() => Math.round(document.querySelector('.ac-cell').getBoundingClientRect().width));
  await p.click('#acFull');
  await p.waitForTimeout(700);
  const big = await p.evaluate(() => ({
    who: document.fullscreenElement?.id ?? null,
    cell: Math.round(document.querySelector('.ac-cell').getBoundingClientRect().width)
  }));
  check('풀스크린 대상은 무대다 (창 전체가 아니라)', big.who === 'acStage', String(big.who));
  check('풀스크린이면 판이 커진다', big.cell > small * 1.3, `${small}px → ${big.cell}px`);

  /* **풀스크린에서 단추가 눌리는가.** 브라우저는 풀스크린 대상 밖을 아예 안 그리므로,
     무대만 키우면 나가기, 한 판 더가 통째로 사라진다(실제로 그랬다). DOM 좌표는 이때
     거짓말을 한다. 보인다로 재면 초록이다. 그 자리를 눌렀을 때 무엇이 잡히나로 본다. */
  const reach = await p.evaluate(() =>
    ['acQuit', 'acFull', 'acSound'].map((id) => {
      const e = document.getElementById(id);
      if (!e) return `${id}:없음`;
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return `${id}:${hit === e || e.contains(hit) ? 'ok' : '못누름'}`;
    })
  );
  check('풀스크린에서도 단추가 눌린다', reach.every((r) => r.endsWith(':ok')), reach.join(' '));
}

/* ── 폰: 세우든 눕히든 (TASK-KL-314) ─────────────────────────────
   눕힌 화면은 세로가 390px 뿐이라 자리줄 / 무대 / 상태 / 단추로 쌓으면 무대에 226px 밖에
   안 남는다(오목 칸 23px = 손가락 최소권장의 절반). 그래서 눕히면 판을 옆으로 세운다.
   여기서 재는 것 둘: **칸이 손가락에 닿나**, 그리고 **판이 한 화면에 들어가나**. */
if (!cantRun) {
  console.log('[arcade-stage] 폰. 세우든 눕히든');
  for (const [label, w, h] of [['세로', 390, 844], ['가로', 844, 390], ['작은 가로', 740, 360]]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h } });
    const q = await ctx.newPage();
    await q.route('**/__dev', (r) => r.abort());
    await q.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await q.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
    /* 새 맥락은 저장소가 비어 기본 표현(입체)이 뜬다. 칸 폭은 평면에서 잰다 */
    await q.evaluate(() => { window.localStorage.setItem('karmolab.arcade.dim', '2d'); Toolbox.switchPage('arcade'); });
    await q.waitForSelector('[data-obj="gomoku"]', { timeout: 20000 });
    await q.click('[data-obj="gomoku"]');
    await q.click('[data-solo="gomoku"]');
    await q.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 });
    await q.waitForTimeout(200);
    const m = await q.evaluate(() => ({
      cell: Math.round(document.querySelector('.ac-cell').getBoundingClientRect().width),
      over: Math.round(document.querySelector('#acQuit').getBoundingClientRect().bottom) - window.innerHeight
    }));
    /* 28px. 손가락 최소권장(44px)에는 못 미치지만 칸이 붙어 있는 판이라 여기까지는 눌린다.
       고치기 전 눕힌 화면이 23px 이었고, 그건 옆 칸이 눌리는 크기였다. */
    check(`폰 ${label}: 칸이 눌릴 만하다`, m.cell >= 28, `${m.cell}px`);
    check(`폰 ${label}: 판이 한 화면에 들어간다`, m.over <= 0, m.over > 0 ? `${m.over}px 밀림` : '');
    await ctx.close();
  }
}

await br.close();
if (server) await server.close();
if (cantRun) { console.log(`[arcade-stage] 못 돌았다. ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-stage] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-stage] 통과. 51판이 같은 무대에 담기고, 풀스크린이면 그대로 커진다');
