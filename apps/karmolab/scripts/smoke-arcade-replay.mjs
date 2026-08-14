/**
 * 「다시 보기」가 진짜로 같은 판을 되살리는가 — 창을 열어 실측 (TASK-KL-264)
 *
 * 창 없는 검사(`test:replay`)는 커널만 본다. 여기서 보는 것은 **껍데기가 그 받침을 제대로
 * 쓰고 있는가**다 — 씨앗·자리·봇의 손버릇·세기를 하나라도 빠뜨리면 다른 판이 나온다.
 * 실제로 손버릇을 빼 보니 마지막 줄이 빨개졌다(그래서 이 검사는 극장이 아니다).
 *
 * 시간으로 끝나는 놀이(반응 측정)를 쓴다. 오목 같은 차례 놀이는 사람이 안 두면 영영 안 끝나서
 * 「판이 안 끝났다」로 빨개지는데, 그건 다시 보기의 흠이 아니다(처음에 그렇게 헛짚었다).
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
const p = await (await br.newContext()).newPage();
p.setDefaultTimeout(60000);
try {
  await p.route('**/__dev', (r) => r.abort());
  const res = await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!res || !res.ok()) cantRun = `dev 서버가 안 뜬다 (${PAGE})`;
} catch (e) {
  cantRun = `dev 서버에 못 닿았다 — ${e.message}`;
}

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 60000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-solo="reflex"]', { timeout: 60000 });
  await p.click('[data-solo="reflex"]');
  await p.waitForSelector('.ac-choice', { timeout: 45000 });
  /* 시작 3초 덮개가 걷힌 뒤에 눌러야 한다 — 덮개 위를 누르면 아무 데도 안 닿는다. */
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 45000 });
  for (let i = 0; i < 6; i++) {
    await p.locator('.ac-choice').first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(700);
  }

  const ended = await p.waitForFunction(() => window.__arcade?.finished, null, { timeout: 120000 }).then(() => true).catch(() => false);
  check('판이 끝난다', ended);
  if (ended) {
    await p.waitForTimeout(400);
    const before = await p.evaluate(() => JSON.stringify(window.__arcade?.state));
    check('「다시 보기」가 뜬다', await p.locator('#acReplay').isVisible());
    await p.click('#acReplay');
    await p.waitForTimeout(600);
    const mid = await p.evaluate(() => JSON.stringify(window.__arcade?.state));
    check('판이 처음으로 돌아간다', mid !== before, '판이 그대로다');
    const again = await p.waitForFunction(() => window.__arcade?.finished, null, { timeout: 180000 }).then(() => true).catch(() => false);
    check('다시 본 판도 끝까지 간다', again);
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => JSON.stringify(window.__arcade?.state));
    if (after !== before) {
      const a = JSON.parse(before ?? '{}');
      const b = JSON.parse(after ?? '{}');
      const 다른키 = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
        (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])
      );
      console.log('[DEBUG-5c7d] 다른 칸:', 다른키.join(', ') || '(모양이 다름)');
      for (const k of 다른키.slice(0, 4)) {
        console.log(`  · ${k}: ${JSON.stringify(a[k]).slice(0, 80)} → ${JSON.stringify(b[k]).slice(0, 80)}`);
      }
    }
    check('되살린 판이 원래 판과 똑같다', after === before, '끝 판이 다르다');
  }
}

await br.close();
if (내서버) await 내서버.close();
if (cantRun) { console.log(`[arcade-replay] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-replay] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-replay] 통과 — 껍데기가 씨앗·자리·손버릇을 그대로 다시 씌운다');
