/**
 * 무대가 판마다 안 출렁이고, 판이 무대를 실제로 채우는가 (TASK-KL-314)
 *
 * 두 가지를 같이 봐야 한다. 하나만 보면 둘 다 놓친다:
 *  ① **무대 폭이 51판 내내 같은가** — 갈아탈 때 화면이 출렁이지 않는다는 뜻
 *  ② **판이 그 무대를 채우는가** — ①만 보면 판이 폭 0 으로 무너져도 초록이다
 *
 * ②가 진짜로 필요했다: 무대를 세우면서 `place-items:center` 를 썼더니 자식이 shrink-to-fit 이
 * 되어 오목 칸이 **2px** 이 됐다. 그때 51종 화면검사(`test:arcade:ui`)는 초록이었다 —
 * 「떴다」만 보고 크기를 안 재기 때문이다. 안 재는 검사는 안 보는 검사다.
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** (2026-08-14). 사람이 켜는 `npm run dev`(8813)만 보다가
   CI 에서는 늘 「못 돌림」이었다 — 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
/* 잴 자리는 한 곳에서 정한다 — `lib/smoke-base.mjs` (시키지 않으면 늘 자기 서버). */
const 내서버 = await smokeBase();
const BASE = 내서버.base;
const PAGE = `${BASE}/apps/karmolab/index.html`;
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
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
  cantRun = `dev 서버에 못 닿았다 — ${e.message}`;
}

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-solo]', { timeout: 30000 });
  const ids = await p.$$eval('[data-solo]', (bs) => bs.map((b) => b.dataset.solo));

  const widths = new Map();
  const thin = [];
  for (const id of ids) {
    await p.click(`[data-solo="${id}"]`);
    await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(120);
    const seen = await p.evaluate(() => {
      const stage = document.querySelector('#acStage').getBoundingClientRect();
      /* 판에서 제일 넓은 것 — 무대를 얼마나 쓰고 있나. */
      const kids = [...document.querySelectorAll('#acView *')].map((e) => e.getBoundingClientRect().width);
      return { stage: Math.round(stage.width), widest: Math.round(Math.max(0, ...kids)) };
    });
    widths.set(seen.stage, (widths.get(seen.stage) || 0) + 1);
    /* 절반은 써야 「무대에 담겼다」고 할 수 있다. 무너지면 한 자릿수 px 이 된다. */
    if (seen.widest < seen.stage * 0.5) thin.push(`${id}(${seen.widest}px)`);
    await p.click('#acQuit');
    await p.waitForSelector('[data-solo]', { timeout: 10000 });
  }

  check(`무대 폭이 ${ids.length}판 내내 같다`, widths.size === 1,
    [...widths.entries()].map(([w, n]) => `${w}px×${n}`).join(' · '));
  check('판이 무대를 채운다 (폭 0 으로 안 무너진다)', thin.length === 0, thin.slice(0, 6).join(' '));

  /* 풀스크린은 무대만 커진다 — 그 안의 것이 같이 커져야 뜻이 있다. */
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
     무대만 키우면 나가기·한 판 더가 통째로 사라진다(실제로 그랬다). DOM 좌표는 이때
     거짓말을 한다 — 「보인다」로 재면 초록이다. 그 자리를 눌렀을 때 무엇이 잡히나로 본다. */
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

await br.close();
if (내서버) await 내서버.close();
if (cantRun) { console.log(`[arcade-stage] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-stage] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-stage] 통과 — 51판이 같은 무대에 담기고, 풀스크린이면 그대로 커진다');
