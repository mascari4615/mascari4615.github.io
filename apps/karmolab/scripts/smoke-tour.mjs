/**
 * 대회 다섯 판을 **끝까지 실제로 돌려 본다** (TASK-KL-264 E3)
 *
 * 셈법(등수 점수·동점 처리)은 `_tourtest` 가 창 없이 잰다. 여기서 재는 것은 그것이 아니라
 * **판이 이어지는가**다 — 한 판이 끝나면 다음 판으로 넘어가고, 같은 사람들이 계속 앉아 있고,
 * 점수가 쌓이고, 다섯 판째에 단추가 「대회 끝」이 되는가.
 *
 * 사람 대신 **아무 단추나 누르는 손**을 쓴다. 잘 두는 손이 아니어도 된다 — 재는 것은 승부가
 * 아니라 이어짐이다. 다만 15퍼즐처럼 아무렇게나 눌러서는 안 끝나는 판이 있어 제한시간까지
 * 기다린다(그래서 넉넉히 준다).
 *
 * **갈아 끼우기 통로(`/__dev`)를 막는다.** 옆 세션이 파일을 고치면 이 창이 새로고침되어 판이
 * 통째로 날아가는데, 그건 대회의 결함이 아니라 검사의 결함이다(실측 — 이것 때문에 2판째가
 * 안 넘어가는 것처럼 보였다).
 */
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **잴 자리는 한 곳에서 정한다** — `lib/smoke-base.mjs` (2026-08-14).
   여기 8813(사람이 켜는 dev 서버)이 박혀 있어, CI 에서는 `ERR_CONNECTION_REFUSED` 로
   죽었다(느린 레인 첫 판 실측). 시키지 않으면 늘 제 서버를 띄운다. */
const 내서버 = process.env.KL_URL ? null : await smokeBase('KL_URL_BASE');
const URL = process.env.KL_URL || `${내서버.base}/apps/karmolab/index.html`;
const ROUNDS = 5;
const fail = [];

const br = await chromium.launch();
const p = await (await br.newContext()).newPage();
await p.route('**/__dev', (r) => r.abort());
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
await p.evaluate(() => Toolbox.switchPage('arcade'));
await p.waitForSelector('#acTour', { timeout: 20000 });
await p.click('#acTour');

/* 사람 손 대신. 700ms 마다 열려 있는 단추 하나를 누른다. */
const poke = setInterval(async () => {
  try {
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('#acView button:not([disabled])')];
      if (b.length) b[Math.floor(Math.random() * b.length)].click();
    });
  } catch { /* 창이 닫히는 중 */ }
}, 700);

const seen = [];
let prevSum = -1;
for (let i = 1; i <= ROUNDS; i++) {
  const ok = await p
    .waitForFunction(() => {
      const a = document.querySelector('#acAgain');
      return a && a.style.display !== 'none' && window.__arcade?.finished;
    }, null, { timeout: 240000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) { fail.push(`${i}판이 안 끝났다`); break; }

  const st = await p.evaluate(() => ({
    game: window.__arcade?.game,
    names: [...document.querySelectorAll('#acSeats .ac-seat')].map((e) => e.textContent.trim()),
    status: document.querySelector('#acStatus')?.textContent || '',
    again: document.querySelector('#acAgain')?.textContent || ''
  }));
  seen.push(st.game);
  console.log(`${i}판 ${st.game} | ${st.status.slice(0, 60)} | 단추: ${st.again}`);

  if (!st.status.startsWith(`${i}/${ROUNDS}판`)) fail.push(`${i}판 점수판이 「${i}/${ROUNDS}판」으로 안 적힌다: ${st.status}`);
  const sum = [...st.status.matchAll(/(\d+)(?:\s|$)/g)].reduce((a, m) => a + Number(m[1]), 0);
  if (sum <= prevSum) fail.push(`${i}판에서 점수가 안 늘었다 (${prevSum} → ${sum})`);
  prevSum = sum;
  if (i < ROUNDS && st.again.includes('끝')) fail.push(`${i}판인데 단추가 벌써 「대회 끝」이다`);
  if (i === ROUNDS && !st.again.includes('끝')) fail.push(`마지막 판인데 단추가 「대회 끝」이 아니다: ${st.again}`);

  if (i < ROUNDS) {
    await p.click('#acAgain');
    await p.waitForTimeout(4000);
  }
}

if (new Set(seen).size !== seen.length) fail.push(`같은 판이 두 번 나왔다: ${seen.join(', ')}`);

clearInterval(poke);
await p.waitForTimeout(300);
await br.close();

if (fail.length) {
  console.error('❌ 대회 — ' + fail.join(' / '));
  process.exit(1);
}
console.log(`✅ 대회 ${ROUNDS}판 이어짐 — ${seen.join(' → ')}`);
