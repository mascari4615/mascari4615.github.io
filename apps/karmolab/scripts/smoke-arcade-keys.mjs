/**
 * 마우스 없이 논다 — 키로 51개를 (arcade-next ★1)
 *
 * 규약을 51개에 나눠 주지 않았다. 화면들은 이미 `<button>` 으로 판을 그리므로, 껍데기가
 * **그 단추들 위를 화살표로 옮기고 엔터로 누른다.** 게임 화면은 이 사실을 모른다.
 *
 * 여기서 재는 것:
 *   ① 판이 서면 무대에 **초점**이 온다 (어디를 눌러야 하는지 화면이 말해 준다)
 *   ② 화살표가 짚는 자리를 옮긴다 — 격자면 2차원으로
 *   ③ 엔터가 **진짜로 둔다** (판이 바뀐다)
 *   ④ 키로 놀 수 있는 놀이가 몇 개인가 — 그림판만 쓰는 놀이는 손이 그대로 마우스다
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** — 사람이 켜는 `npm run dev`(8813)만 보면 CI 에서는
   늘 「못 돌림」이다. 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
let 내서버 = null;
let BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
if (!(await fetch(`${BASE}/apps/karmolab/index.html`).then((r) => r.ok).catch(() => false))) {
  내서버 = await serveRepo();
  BASE = 내서버.base;
}
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

const openGame = async (id) => {
  /* 앞 판이 끝나 결과 딱지가 떠 있으면 목록을 덮는다 — 먼저 치운다.
     (안 치우면 「목록이 안 보인다」로 시간만 끌다 죽는다 — 어느 판에서 끝나느냐에 따라 갈린다.) */
  await p.evaluate(() => {
    const over = document.querySelector('#acOver');
    if (over && over.style.display !== 'none') document.querySelector('#acQuit')?.click();
  });
  /* 로비는 여섯 개만 내놓는다(pick6) — 나머지는 **찾아서** 연다. 사람이 하는 것과 같은 길이다. */
  /* 로비가 돌아올 때까지 기다린다 — 판을 끝내고 나오는 길은 놀이마다 몇 백 ms 씩 다르다. */
  await p.waitForSelector('#acFind', { state: 'visible', timeout: 20000 });
  if (!(await p.isVisible(`[data-solo="${id}"]`).catch(() => false))) {
    await p.fill('#acFind', id);
    await p.waitForTimeout(250);
  }
  await p.waitForSelector(`[data-solo="${id}"]`, { state: 'visible', timeout: 20000 });
  await p.click(`[data-solo="${id}"]`);
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 });
  await p.waitForTimeout(150);
};

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-solo="gomoku"]', { timeout: 30000 });

  await openGame('gomoku');
  check('판이 서면 무대에 초점이 온다', (await p.evaluate(() => document.activeElement?.id)) === 'acStage');

  /* 첫 화살표는 「고르기 시작」이라 0번에 들어간다 — 그다음부터 움직인다.
     오른쪽 4 → 3번 칸, 아래 4 → 3 + 9*4 = 39번. 9칸짜리 격자라는 것을 CSS 에서 읽는다. */
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']) await p.keyboard.press(k);
  const row0 = await p.evaluate(() => [...document.querySelectorAll('.ac-cell')].findIndex((e) => e.classList.contains('ac-key')));
  check('화살표가 옆으로 옮긴다', row0 === 3, `${row0}번`);
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await p.keyboard.press(k);
  const down = await p.evaluate(() => [...document.querySelectorAll('.ac-cell')].findIndex((e) => e.classList.contains('ac-key')));
  check('아래위는 한 줄만큼 뛴다 (격자를 안다)', down === 39, `${down}번 (9칸 격자면 39)`);

  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  const put = await p.evaluate(() => (document.querySelectorAll('.ac-cell')[39]?.textContent || '').trim());
  check('엔터가 진짜로 둔다', put === '●', `"${put}"`);

  await p.click('#acQuit');

  /* ── 한붓그리기: 그림판인데도 키로 긋는다 (TASK-KL-317) ──────────────
     이 놀이는 canvas 가 아니라 **고르기**였다 — 선을 누르는 것이 곧 수다. 그래서 그림은
     그대로 두고 **지금 그을 수 있는 선 위에 투명 단추**만 얹어 껍데기 규약에 태웠다.
     여기서 재는 것 = 「엔터를 눌렀을 때 실제로 한 획이 늘어나나」. 단추가 보이나 X. */
  await openGame('onestroke');
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => (window.__arcade?.state?.drawn?.[0] ?? []).length);
  const opens = await p.evaluate(() => document.querySelectorAll('.ac-oskey').length);
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => (window.__arcade?.state?.drawn?.[0] ?? []).length);
  const opens2 = await p.evaluate(() => document.querySelectorAll('.ac-oskey').length);
  /* 첫 수는 시작점이 없어 **모든 선**이 후보다(12개) — 그건 규칙이 그렇다.
     키로 놀 만한가는 **한 획 그은 뒤**에 갈린다: 붓 끝에 닿는 선만 남아야 화살표로 훑을 수 있다.
     격자의 한 점에 모이는 선은 넷을 못 넘는다. */
  check('한붓그리기: 첫 수 뒤엔 붓 끝에 닿는 선만 남는다', opens2 > 0 && opens2 <= 4, `${opens} → ${opens2}개`);
  check('한붓그리기: 엔터가 진짜로 한 획 긋는다', after === before + 1, `${before} → ${after}`);
  await p.click('#acQuit');
  await p.waitForSelector('[data-solo]', { timeout: 10000 });

  /* ── 탁구·에어하키: 그림판이라도 키로 (TASK-KL-317) ────────────────
     여기서 재는 것 = ① 화살표를 누르고 있으면 **라켓이 실제로 옮겨진다**
     ② **누른 시간에 비례**한다(프레임 수가 아니라). ②가 없으면 144Hz 화면에서 2.4배 빠른
     다른 놀이가 된다 — 커널에서 한 번 겪은 자리다. */
  for (const [id, read] of [
    ['pong', () => window.__arcade?.state?.pad?.[0]],
    ['airhockey', () => window.__arcade?.state?.paddles?.[0]?.x]
  ]) {
    await openGame(id);
    await p.waitForTimeout(400);
    /* **벽 안쪽에서 재야 한다.** 한 방향으로 계속 밀면 라켓이 벽에 붙어 「시간에 비례」가
       깨진 것처럼 보인다(실측: 22.4 → 10.6 은 라켓이 아니라 벽이 낸 수다).
       그래서 오른쪽으로 잠깐, 왼쪽으로 그 두 배 — 가운데를 오가며 잰다. */
    const at0 = await p.evaluate(read);
    await p.keyboard.down('ArrowRight');
    await p.waitForTimeout(150);
    await p.keyboard.up('ArrowRight');
    await p.waitForTimeout(120);
    const at1 = await p.evaluate(read);
    await p.keyboard.down('ArrowLeft');
    await p.waitForTimeout(300);
    await p.keyboard.up('ArrowLeft');
    await p.waitForTimeout(120);
    const at2 = await p.evaluate(read);
    const short = at1 - at0;
    const long = at1 - at2;
    check(`${id}: 화살표를 누르면 라켓이 옮겨진다`, short > 1, `${at0?.toFixed?.(1)} → ${at1?.toFixed?.(1)}`);
    /* 0.15초 → 0.3초면 옮긴 거리도 두 배. 시간이 아니라 프레임 수로 움직이면 이 비가 깨진다. */
    check(`${id}: 누른 시간에 비례해 옮겨진다`,
      long > short * 1.5 && long < short * 2.8, `${short.toFixed(1)} → ${long.toFixed(1)}`);

    /* **프레임 수로 움직이는지**는 위로 못 잰다 — 60Hz 로 고정된 화면에서는 프레임 수가
       곧 시간이라 둘이 똑같아 보인다(되돌려 봤더니 안 빨개졌다). 그래서 **프레임률을 실제로
       떨어뜨려** 같은 시간 동안 얼마나 가는지 본다. 시간으로 움직이면 거의 같고,
       프레임 수로 움직이면 느려진 만큼 덜 간다. */
    const cdp = await p.context().newCDPSession(p);
    const run = async (rate) => {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const a = await p.evaluate(read);
      await p.keyboard.down('ArrowRight');
      await p.waitForTimeout(400);
      await p.keyboard.up('ArrowRight');
      await p.waitForTimeout(150);
      const b = await p.evaluate(read);
      await p.keyboard.down('ArrowLeft');
      await p.waitForTimeout(400);
      await p.keyboard.up('ArrowLeft');
      await p.waitForTimeout(150);
      return Math.abs(b - a);
    };
    const fast = await run(1);
    const slow = await run(8);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check(`${id}: 화면이 느려져도 같은 속도다 (프레임 수 X)`,
      slow > fast * 0.6, `보통 ${fast.toFixed(1)} · 8배 느린 화면 ${slow.toFixed(1)}`);
    await p.click('#acQuit');
  }

  /**
   * **몇 개나 키로 놀 수 있나** — 재는 것을 두 번 틀렸다. 처음엔 「단추가 있나」로 셌고
   * (판이 선 직후 한 순간만 봐서 43/51), 다음엔 기다리게 고쳤지만(47/51) 여전히 「단추」였다.
   * 그런데 뱀은 단추가 없어도 **화살표를 직접 받는다** — 「단추 있나」는 「키로 놀 수 있나」가 아니다.
   *
   * 그래서 이제 **눌러 보고 판이 바뀌는지**로 잰다. 그게 애초에 알고 싶던 것이다.
   */
  const ids = await p.$$eval('[data-solo]', (bs) => bs.map((b) => b.dataset.solo));
  let keyable = 0;
  const mouseOnly = [];
  for (const id of ids) {
    await openGame(id);
    /* 판이 그려질 틈을 준다 — 카드를 돌리는 놀이는 곧바로는 아무것도 없다. */
    await p.waitForTimeout(700);
    const before = await p.evaluate(() => JSON.stringify(window.__arcade?.state ?? null));
    /* 사람이 처음 만졌을 때 눌러 볼 법한 것들 — 방향과 「고른다」. */
    for (const k of ['ArrowRight', 'ArrowDown', 'Enter', 'ArrowLeft', 'ArrowUp', ' ']) {
      await p.keyboard.press(k === ' ' ? 'Space' : k);
      await p.waitForTimeout(60);
    }
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => JSON.stringify(window.__arcade?.state ?? null));
    /* 실시간 놀이는 안 눌러도 판이 흐른다 — 그건 「키가 먹었다」가 아니다.
       그래서 짚은 자리(테두리)나 판의 **모양**이 달라졌는지를 같이 본다. */
    const cursor = await p.evaluate(() => document.querySelectorAll('#acView .ac-key').length);
    if (before !== after || cursor > 0) keyable += 1;
    else mouseOnly.push(id);
    await p.click('#acQuit');
    await p.waitForSelector('[data-solo]', { timeout: 10000 });
  }
  /**
   * **이 수로는 게이트를 안 건다.** 「키로 놀 수 있나」를 한 순간에 재려고 세 번 시도했고
   * 세 번 다 다른 것을 쟀다:
   *   ① 「단추가 있나」 (판이 선 직후) → 43/51 — 카드를 아직 안 돌린 놀이를 놓쳤다
   *   ② 「단추가 있나」 (나타날 때까지 기다림) → 47/51 — 뱀은 단추 없이 화살표를 받는데도 빠졌다
   *   ③ 「눌러서 판이 바뀌나」 → 45/51 — 이번엔 **내 차례가 아닌** 차례 놀이가 빠졌다
   *
   * 셋 다 「키로 놀 수 있나」가 아니라 각자 다른 것을 잰 수다. 그걸 문턱으로 걸면 어느 날
   * 애먼 것이 빨개진다(G1 에서 배운 그대로). 그래서 **수는 적어만 두고** 게이트는 위의
   * 실제로 증명된 것(초점 → 화살표 → 엔터 → 돌이 놓임)에만 건다.
   */
  console.log(`  · (참고) 이 순간 키가 먹은 놀이 ${keyable}/${ids.length} — 안 먹은 것: ${mouseOnly.join(' ') || '없음'}`);
}

await br.close();
if (내서버) await 내서버.close();
if (cantRun) { console.log(`[arcade-keys] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-keys] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-keys] 통과 — 마우스 없이 둔다');
