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
import { longestLimit } from './lib/arcade-limits.mjs';
import { chromium } from 'playwright';
import { smokeBase } from './lib/smoke-base.mjs';

/* ★ **잴 자리는 한 곳에서 정한다** — `lib/smoke-base.mjs` (2026-08-14).
   여기 8813(사람이 켜는 dev 서버)이 박혀 있어, CI 에서는 `ERR_CONNECTION_REFUSED` 로
   죽었다(느린 레인 첫 판 실측). 시키지 않으면 늘 제 서버를 띄운다. */
const server = process.env.KL_URL ? null : await smokeBase('KL_URL_BASE');
const URL = process.env.KL_URL || `${server.base}/apps/karmolab/index.html`;
const ROUNDS = 5;
const fail = [];

const br = await chromium.launch();
const p = await (await br.newContext()).newPage();
await p.route('**/__dev', (r) => r.abort());
/* ★ **시계를 우리가 쥔다** (2026-08-17 실측). 놀이마다 제 시간 제한이 있고 가장 긴 것은
   스도쿠 **300초**·지뢰찾기 180초다. 아무 단추나 누르는 이 손으로는 스도쿠가 풀릴 리 없으니,
   그런 판은 **제 시간이 다 돼야** 끝난다 — 한 판 150초로 자르면 그 놀이가 뽑히는 순간 무조건 빨강이고,
   자르는 값을 300초로 올리면 다섯 판 최악 25분이라 조각 예산(40분)을 깬다.
   그래서 잠깐 놀아 본 뒤 **시계를 앞으로 감는다**. 놀이는 제 규칙대로 끝나고, 우리는 안 기다린다. */
await p.clock.install();
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
const tournamentButton = '#acAgain, #acSwap, #acReplay, #acStart, #acQuit';
/** 열려 있는 단추 하나를 누른다. 부르는 자리가 둘이라 함수로 둔다(둘이 갈리면 안 된다). */
async function clickOnce() {
  try {
    await p.evaluate((remove) => {
      const b = [...document.querySelectorAll('#acView button:not([disabled])')].filter(
        (el) => !el.matches(remove)
      );
      if (b.length) b[Math.floor(Math.random() * b.length)].click();
    }, tournamentButton);
  } catch { /* 창이 닫히는 중 */ }
}
const poke = setInterval(clickOnce, 700);

/* 한 판을 기다리는 참을성. 주석에 「4분」·「2.5분」이 적혀 있었지만 코드는 60초였다 —
   수를 두 군데 적으면 반드시 갈린다. 여기 한 곳만 둔다(실패 문구도 이 값을 읽는다). */
const WAIT_MS = 60000;

const seen = [];
let prevSum = -1;
for (let i = 1; i <= ROUNDS; i++) {
  /* 15초는 진짜로 논다(그려지고 눌리는지 보려면 실제 시간이 필요하다). 그 뒤 6분을 감아
     어떤 놀이든 제 시간 제한에 닿게 한다 — 감은 시간은 기다린 시간이 아니다. */
  await p.waitForTimeout(15000);
  /* ★ **시계를 세워 놨으면 「기다리기」가 아무 일도 안 한다** (2026-08-17, 재현해서 알아냈다).
     이 검사는 창을 열기 전에 `clock.install()` 로 시계를 세운다 — 그래서 판은 **감을 때만** 움직인다.
     그런데 판이 끝나는 길은 두 걸음이다: ① 놀이가 「이겼다」를 내면 커널이 `roundOverAt = 지금 + 쉬는참`
     을 잡고 ② **그 시각이 지나야** 다음 판으로 넘어간다. 한 번만 감고 그 뒤로 가만히 기다리면
     ②가 영영 안 온다 — 시계가 멈춰 있으니 그림틀이 돌아도 커널의 시각이 안 는다.
     실제로 그렇게 걸렸다: 윷에서 「말을 다 뺐다」(=이겼다는 말)까지 띄우고 60초를 그냥 서 있었다.
     그러니 **기다리는 동안에도 계속 감는다**. 감는 총량은 그대로(6분), 조각으로 나눌 뿐이다. */
  const shard = 2000;
  /* ★ **감는 총량은 손으로 안 적는다** (2026-08-17). 놀이마다 제 시간 제한이 있고 가장 긴 것이
     스도쿠 300초다 — 그보다 적게 감으면 그 놀이가 뽑히는 판은 **무조건 빨강**이다.
     예전엔 '06:00' 이라고 글자로 적어 두고 시험이 그 글자를 찾았는데, 남이 조각내기로 고치자
     시험이 「못 찾았다」로 빨개졌다(실측). 값을 **소스에서 끌어와** 관계가 저절로 지켜지게 한다. */
  const toWrap = Math.round(longestLimit() * 1.2) + 30000;
  const deadline = Date.now() + WAIT_MS;
  let finished2 = false;
  /* ★ **시간 제한이 없는 놀이는 시계를 감아도 안 끝난다** (2026-08-17 실측). 놀이 51개 중
     제한이 박힌 것은 **11개뿐**이고, 나머지 40개는 「다 두면」 끝난다 — 끝나는 데 드는 것은
     시간이 아니라 **누른 횟수**다. 실제로 `fleet`(8×8 판에 서로 배를 맞히는 놀이)이 그렇게 걸렸다:
     제한이 없어 감아도 그대로였고, 손은 700ms 에 한 번이라 60초 예산 안에서 85번밖에 못 눌렀다
     (그중 상당수는 이미 친 칸이라 헛손질이다). 그래서 감을 때마다 **같이 누른다** —
     기다린 시간이 아니라 판이 나아간 만큼 누르게 된다. */
  for (let wrapped = 0; wrapped < toWrap && !finished2 && Date.now() < deadline; wrapped += shard) {
    await p.clock.fastForward(shard);
    // eslint-disable-next-line no-await-in-loop -- 한 조각마다 한 번 (위 주석)
    await clickOnce();
    // eslint-disable-next-line no-await-in-loop -- 한 조각 감고 그때마다 본다(멈춘 시계에서는 이 길뿐)
    finished2 = await p.evaluate(() => {
      const a = document.querySelector('#acAgain');
      return !!(a && a.style.display !== 'none' && window.__arcade?.finished);
    }).catch(() => false);
  }
  const ok = await p
    .waitForFunction(() => {
      const a = document.querySelector('#acAgain');
      return a && a.style.display !== 'none' && window.__arcade?.finished;
      /* ★ **한 판이 안 끝나면 4분을 버린다** (2026-08-16, 실측). 다섯 판이니 최악 20분 —
         라이브 점검 한 조각(예측 14분)이 그 하나 때문에 40분 제한에 걸려 취소됐다.
         정상 판은 실측 60~95초다(로컬 세 판). 150초면 **1.6배 여유**이고, 걸렸을 때 버리는 시간은
         4분 → 2.5분으로 준다. 넘으면 아래 판정이 **어느 놀이가 멈췄는지** 이름까지 적는다. */
    }, null, { timeout: WAIT_MS })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    /* ★ **어느 판이 멈췄는지를 말해야 고칠 수 있다** (2026-08-16, 실측). 여태 「5판이 안 끝났다」
       한 줄만 남았다 — 그런데 이 검사가 뽑는 다섯 판은 **매번 다르다**(같은 날 실측: CI 는
       snake·dots·fishing·liars 로 시작, 내 자리는 shellgame 으로 시작). 그러니 그 한 줄로는
       어느 놀이가 안 끝나는지 영영 알 수 없고, 다음 판에서 또 다른 놀이가 걸린다.
       멈춘 놀이의 **이름과 그때 화면이 하던 말**을 들고 나간다 — 한 번만 걸려도 범인이 정해진다. */
    const stopped = await p
      .evaluate(() => ({
        놀이: window.__arcade?.game ?? '(모름)',
        끝났나: !!window.__arcade?.finished,
        말: (document.querySelector('#acStatus')?.textContent || '').slice(0, 60),
        /* ★ **시계가 갔는지부터 봐야 한다** (2026-08-17). 이 검사는 6분을 감아 「어떤 놀이든 제
           시간 제한에 닿는다」고 가정한다. 그런데 놀이마다 제한이 25초~300초로 다르고, 판이
           스스로 끝나는 것은 그 놀이의 `tick` 이 **불려야** 일어난다. 안 끝났을 때 그 둘을 모르면
           「누가 범인인가」에서 또 추측이 시작된다 — 감긴 시각과 끝날 시각을 같이 들고 나간다. */
        지금: Math.round(performance.now()),
        끝날때: window.__arcade?.endsAt ?? null,
        /* ★ **대회가 아직 서 있나** (2026-08-17). CI 가 남긴 줄은 「화면: 1 / 1 판」이었는데
           내 자리에서 같은 자리는 「5/5판」이다 — 그렇다면 그 판은 대회가 **닫힌 뒤**였다는 뜻이다
           (누가 흐름 단추를 눌렀거나 대회가 먼저 끝났거나). 그 둘은 고치는 곳이 다르므로 갈라야 한다. */
        대회: window.__arcade?.tour ? `${window.__arcade.tour.at + 1}/${window.__arcade.tour.games?.length ?? '?'}판` : '없음(대회가 닫혔다)',
      }))
      .catch(() => ({ 놀이: '(창이 죽었다)', 끝났나: false, 말: '', 지금: null, 끝날때: null }));
    fail.push(
      `${i}판이 안 끝났다 — 놀이 「${stopped.놀이}」 · 끝남표시 ${stopped.끝났나 ? '있음' : '없음'} · 화면: 「${stopped.말}」`
        + ` · 대회 ${stopped.대회} · 창 시계 ${stopped.지금}ms · 이 판이 끝날 시각 ${stopped.끝날때 ?? '(그 놀이는 시간 제한이 없다)'}`
        + ` (실제로 기다린 시간 ${WAIT_MS / 1000}초 + 감은 시간 ${Math.round(toWrap / 1000)}초 + 누른 횟수 ${Math.round(toWrap / shard)}회+)`
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
/* ★ 시계를 우리가 쥐고 있으므로 **화면의 기다림**(waitForTimeout)은 안 쓴다 — 감아 주지 않으면
   영영 안 깨어난다. 여기서는 node 쪽 시계로 잠깐 쉰다. */
await new Promise((r) => setTimeout(r, 300));
await br.close();
/* 내가 띄운 서버는 내가 닫는다 — 안 닫으면 검사가 끝나고도 프로세스가 안 죽는다(실측). */
await server?.close?.();

if (fail.length) {
  console.error('❌ 대회 — ' + fail.join(' / '));
  process.exit(1);
}
console.log(`✅ 대회 ${ROUNDS}판 이어짐 — ${seen.join(' → ')}`);
