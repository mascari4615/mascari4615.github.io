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

/* 사람 손 대신. 700ms 마다 열려 있는 단추 하나를 누른다.
   ★ **대회를 모는 단추는 안 만진다** (2026-08-16, 실측). 이 손은 아무 단추나 눌렀는데,
   거기에는 `#acAgain` 도 들어 있었다. 마지막 판에서 그 단추는 「대회 끝」이고, 누르면
   `tour = null` 로 대회를 닫고 로비로 나간다(`arcade.ts` 의 `againBtn.onclick`).
   그러면 검사가 기다리는 `__arcade.finished` 는 **영영 안 온다** — 4분을 기다리다
   「5판이 안 끝났다」로 빨개진다. 실제로 1~4판은 늘 지나가고 **5판에서만** 걸렸다
   (CI·내 자리 둘 다, 뽑힌 놀이는 서로 달랐는데도).
   이 손이 할 일은 **판을 두는 것**이지 대회를 모는 것이 아니다 — 흐름 단추는 검사가 누른다. */
const 대회를_모는_단추 = '#acAgain, #acSwap, #acReplay, #acStart, #acQuit';
const poke = setInterval(async () => {
  try {
    await p.evaluate((빼기) => {
      const b = [...document.querySelectorAll('#acView button:not([disabled])')].filter(
        (el) => !el.matches(빼기)
      );
      if (b.length) b[Math.floor(Math.random() * b.length)].click();
    }, 대회를_모는_단추);
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
  if (!ok) {
    /* ★ **어느 판이 멈췄는지를 말해야 고칠 수 있다** (2026-08-16, 실측). 여태 「5판이 안 끝났다」
       한 줄만 남았다 — 그런데 이 검사가 뽑는 다섯 판은 **매번 다르다**(같은 날 실측: CI 는
       snake·dots·fishing·liars 로 시작, 내 자리는 shellgame 으로 시작). 그러니 그 한 줄로는
       어느 놀이가 안 끝나는지 영영 알 수 없고, 다음 판에서 또 다른 놀이가 걸린다.
       멈춘 놀이의 **이름과 그때 화면이 하던 말**을 들고 나간다 — 한 번만 걸려도 범인이 정해진다. */
    const 멈춘것 = await p
      .evaluate(() => ({
        놀이: window.__arcade?.game ?? '(모름)',
        끝났나: !!window.__arcade?.finished,
        말: (document.querySelector('#acStatus')?.textContent || '').slice(0, 60),
      }))
      .catch(() => ({ 놀이: '(창이 죽었다)', 끝났나: false, 말: '' }));
    fail.push(
      `${i}판이 안 끝났다 — 놀이 「${멈춘것.놀이}」 · 끝남표시 ${멈춘것.끝났나 ? '있음' : '없음'} · 화면: 「${멈춘것.말}」 (4분 기다림)`
    );
    break;
  }

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
