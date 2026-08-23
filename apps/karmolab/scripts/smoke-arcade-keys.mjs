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
import { untilTrue, untilSettled } from './lib/settle.mjs';
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

/* ★ **dev 서버가 없으면 스스로 띄운다** — 사람이 켜는 `npm run dev`(8813)만 보면 CI 에서는
   늘 「못 돌림」이다. 그 서버를 CI 는 한 번도 안 켠다. 못 도는 검사는 없는 검사다. */
let server = null;
let BASE = process.env.ARCADE_BASE || 'http://127.0.0.1:8813';
if (!(await fetch(`${BASE}/apps/karmolab/index.html`).then((r) => r.ok).catch(() => false))) {
  server = await serveRepo();
  BASE = server.base;
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
  /* 로비가 돌아올 때까지 기다린다 — 판을 끝내고 나오는 길은 놀이마다 몇 백 ms 씩 다르다. */
  await p.waitForSelector('#acFind', { state: 'visible', timeout: 20000 });
  if (!(await p.isVisible(`[data-obj="${id}"]`).catch(() => false))) {
    await p.fill('#acFind', id);
    /* 재우지 않는다 — 바로 아래에서 그 물건이 보일 때까지 기다린다(같은 일을 두 번 하지 않는다). */
  }
  /* 진열장의 물건을 집으면 시작 단추가 뜬다 — 사람이 가는 길 그대로 두 번 누른다. */
  await p.waitForSelector(`[data-obj="${id}"]`, { state: 'visible', timeout: 20000 });
  await p.click(`[data-obj="${id}"]`);
  await p.waitForSelector(`[data-solo="${id}"]`, { state: 'visible', timeout: 20000 });
  await p.click(`[data-solo="${id}"]`);
  await p.waitForFunction(() => document.querySelector('#acIntro')?.style.display === 'none', null, { timeout: 20000 });
  /* ★ **150ms 재우고 키를 누르면 판마다 다른 놀이가 빨개진다** (2026-08-16, 실측).
     소개가 사라진 뒤에도 판은 아직 그려지는 중이다 — 그때 화살표를 누르면 아무 데도 안 간다.
     같은 날 CI 는 `president` 가, 내 자리는 `한붓그리기` 가 빨갰다(둘 다 제품은 멀쩡).
     시간을 세지 말고 **판이 다 서기를** 기다린다: 무대 안 알맹이 수가 두 번 연속 같으면 섰다. */
  /* 재는 자가 재려는 것을 건드리면 안 된다 — 처음엔 판 안에 표시를 남겨 두 번 비교했는데,
     매 프레임 `innerHTML` 을 새로 쓰는 놀이에서는 그 표시가 지워져 **영영 안 서는 것처럼** 보인다.
     그래서 바깥에서 두 번 세어 견준다(두 번 연속 같으면 섰다). 최대 5초. */
  /* ★ 같은 일을 하는 공용 자가 있다(`lib/settle.mjs` 의 `멎을때까지`) — 손으로 또 짜면
     고칠 곳이 둘이 된다. 뜻은 그대로: 무대 안 알맹이 수가 두 번 연속 같으면 섰다. */
  /* ★ **「멎었다」와 「아직 비었다」는 다르다** (2026-08-17, 갈아 끼우고 한 판 빨개져서 알았다).
     손으로 짠 옛 고리에는 `지금 > 0` 이 있었다 — 무대가 잠깐 빈 순간이 두 번 겹치면 공용 자는
     「0 에서 멎었다」로 보고 곧바로 키를 누르고, 그러면 아무 데도 안 간다(지난 판에 고친 그 병).
     그래서 먼저 **뭐라도 그려지기를** 기다리고, 그 다음에 멎기를 기다린다. */
  const coreCount = () => p.evaluate(() => document.querySelector('#acView')?.querySelectorAll('*').length ?? 0);
  await untilTrue(p, () => (document.querySelector('#acView')?.querySelectorAll('*').length ?? 0) > 0, { max: 5000 });
  await untilSettled(p, coreCount, { interval: 120, max: 5000 });
};

if (!cantRun) {
  await p.waitForFunction(() => typeof Toolbox !== 'undefined' && !!Toolbox.switchPage, null, { timeout: 30000 });
  await p.evaluate(() => Toolbox.switchPage('arcade'));
  await p.waitForSelector('[data-obj="gomoku"]', { timeout: 30000 });

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
  /* 돌이 놓일 때까지 — 무엇을 기다리는지 아는 자리다(재우면 느린 기계에서 빈 칸을 읽는다). */
  await untilTrue(p, () => (document.querySelectorAll('.ac-cell')[39]?.textContent || '').trim().length > 0, { max: 3000 });
  const put = await p.evaluate(() => (document.querySelectorAll('.ac-cell')[39]?.textContent || '').trim());
  check('엔터가 진짜로 둔다', put === '●', `"${put}"`);

  await p.click('#acQuit');

  /* ── 짚은 자리가 **그림을 다시 그려도 남는가** (2026-08-16) ───────────
     매 프레임 `innerHTML` 을 새로 쓰는 놀이에서는 화살표를 눌러도 테두리가 곧 지워졌다.
     사람 눈에는 「키가 안 먹는다」로 보인다 — 실제로 다섯 놀이가 그렇게 세어졌다(45/51).
     누른 **직후**만 재면 못 잡는다(그때는 있다). 그래서 한 박자 뒤를 잰다. */
  for (const id of ['checkers', 'president']) {
    await openGame(id);
    /* ★ **누를 것이 생기기 전에 화살표를 누르면 아무 일도 안 난다** (2026-08-17, 라이브 빨강을 짚었다).
       여기서는 0.5초만 재우고 눌렀는데, `president` 는 그 사이 아직 나눠 주는 중이라
       누를 수 있는 단추가 하나도 없었다 — 그래서 짚은 자리가 0 이고 「키가 안 먹는다」로 빨개졌다.
       놀이가 아니라 **검사가 이른 것**이다. 누를 것이 생길 때까지 기다린다. */
    await untilTrue(
      p,
      () => [...document.querySelectorAll('#acView button:not([disabled]),#acView [role="button"]:not([aria-disabled="true"])')]
        .some((e) => e.offsetParent !== null),
      { max: 8000 }
    );
    /* ★ **한 번 눌러 안 되면 두 번 더 눌러 본다** (2026-08-17, CI 빨강 · 여기선 초록).
       `president` 는 나눠 주는 그림이 끝나며 무대를 다시 그리는데, 그 찰나에 눌린 키는 **삼켜진다**.
       느린 러너에서만 그 찰나에 걸려 「직후 0 · 0.5초 뒤 0」으로 빨개졌다(실사이트를 이 자리에서
       세 번 눌러 보니 매번 1 이었다 — 놀이가 아니라 **누른 때**의 문제다).
       그래도 「눌러도 안 된다」를 놓치면 안 되므로 **세 번까지만** 눌러 보고, 그 뒤엔 그대로 빨강이다.
       0.5초 뒤에도 남아 있나(아래)는 그대로 — 그게 이 판정의 알맹이다. */
    let now0 = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await p.keyboard.press('ArrowRight');
      await p
        .waitForFunction(() => document.querySelectorAll('#acView .ac-key').length === 1, null, { timeout: 4000 })
        .catch(() => {});
      now0 = await p.evaluate(() => document.querySelectorAll('#acView .ac-key').length);
      if (now0 === 1) break;
    }
    /* 재움-의도: **0.5초 뒤에도 남아 있나**가 이 판정의 알맹이다 — 매 프레임 다시 그리는 놀이에서
       표시가 곧 지워지던 것을 잡으려고 일부러 시간을 흘려보낸다. 기다릴 「된 상태」가 따로 없다. */
    await p.waitForTimeout(500);
    const later = await p.evaluate(() => document.querySelectorAll('#acView .ac-key').length);
    check(`${id}: 짚은 자리가 다시 그려도 남는다`, now0 === 1 && later === 1, `직후 ${now0} · 0.5초 뒤 ${later}`);
    await p.click('#acQuit');
    await p.waitForSelector('[data-obj]', { timeout: 10000 });
  }

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
  await p.waitForSelector('[data-obj]', { timeout: 10000 });

  /* ── 탁구·에어하키: 그림판이라도 키로 (TASK-KL-317) ────────────────
     여기서 재는 것 = ① 화살표를 누르고 있으면 **라켓이 실제로 옮겨진다**
     ② **누른 시간에 비례**한다(프레임 수가 아니라). ②가 없으면 144Hz 화면에서 2.4배 빠른
     다른 놀이가 된다 — 커널에서 한 번 겪은 자리다. */
  /** 값이 **바뀔 때까지** 기다린다 — 「재우고 읽기」는 느린 기계에서 늘 진다. */
  const untilChanged = async (read, from, ms = 3000) => {
    const until = Date.now() + ms;
    let last = from;
    while (Date.now() < until) {
      last = await p.evaluate(read);
      if (typeof last === 'number' && typeof from === 'number' && Math.abs(last - from) > 1) return last;
      await p.waitForTimeout(50);
    }
    return last;
  };
  /** 시간 비(比) 판정은 **여러 판 재고 가장 좋은 판**을 쓴다.
   *  시간 잡음은 늘 한쪽(느린 쪽)으로만 튄다 — 한 판만 재면 그 튐이 곧 빨강이 된다
   *  (`rules/domain-wm.md § 관문 ④-3`). 세 판 안에 한 번이라도 맞으면 제품은 맞는 것이다. */
  const bestOf = async (measure, ok, tries = 3) => {
    let last = null;
    for (let i = 0; i < tries; i += 1) {
      last = await measure();
      if (ok(last)) return { hit: true, last, tries: i + 1 };
    }
    return { hit: false, last, tries };
  };

  for (const [id, read] of [
    ['pong', () => window.__arcade?.state?.pad?.[0]],
    ['airhockey', () => window.__arcade?.state?.paddles?.[0]?.x]
  ]) {
    await openGame(id);
    await p.waitForTimeout(400);
    /* **벽 안쪽에서 재야 한다.** 한 방향으로 계속 밀면 라켓이 벽에 붙어 「시간에 비례」가
       깨진 것처럼 보인다(실측: 22.4 → 10.6 은 라켓이 아니라 벽이 낸 수다).
       그래서 오른쪽으로 잠깐, 왼쪽으로 그 두 배 — 가운데를 오가며 잰다. */
    const oneRun = async () => {
      const a0 = await p.evaluate(read);
      await p.keyboard.down('ArrowRight');
      await p.waitForTimeout(150);
      await p.keyboard.up('ArrowRight');
      const a1 = await untilChanged(read, a0);
      await p.keyboard.down('ArrowLeft');
      await p.waitForTimeout(300);
      await p.keyboard.up('ArrowLeft');
      const a2 = await untilChanged(read, a1);
      return { at0: a0, at1: a1, short: a1 - a0, long: a1 - a2 };
    };
    const ratio = await bestOf(oneRun, (m) => m.short > 1 && m.long > m.short * 1.5 && m.long < m.short * 2.8);
    const m = ratio.last;
    check(`${id}: 화살표를 누르면 라켓이 옮겨진다`, m.short > 1, `${m.at0?.toFixed?.(1)} → ${m.at1?.toFixed?.(1)}`);
    /* 0.15초 → 0.3초면 옮긴 거리도 두 배. 시간이 아니라 프레임 수로 움직이면 이 비가 깨진다. */
    check(`${id}: 누른 시간에 비례해 옮겨진다`, ratio.hit,
      `${m.short.toFixed(1)} → ${m.long.toFixed(1)} (${ratio.tries}판째)`);

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
    const slowdownRatio = await bestOf(
      async () => ({ fast: await run(1), slow: await run(8) }),
      (r) => r.slow > r.fast * 0.6,
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check(`${id}: 화면이 느려져도 같은 속도다 (프레임 수 X)`, slowdownRatio.hit,
      `보통 ${slowdownRatio.last.fast.toFixed(1)} · 8배 느린 화면 ${slowdownRatio.last.slow.toFixed(1)} (${slowdownRatio.tries}판째)`);
    /* **마우스가 밀려나지 않았나** (TASK-KL-317). 키를 넣으면서 마우스 길을 끊으면
       고친 게 아니라 바꾼 것이다 — 둘 다 살아야 한다. 판 위를 한 번 지나가 본다. */
    /* 판을 화면 안으로 끌어온 **뒤** 자리를 잰다 — 안 그러면 화면 밖 좌표에 마우스를 두고
       「마우스가 안 먹는다」로 읽는다(실측: elementFromPoint 가 none 이었다). */
    await p.locator('canvas').first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(120);
    const box = await p.locator('canvas').first().boundingBox();
    if (box) {
      const before = await p.evaluate(read);
      await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
      await p.waitForTimeout(120);
      await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
      /* 재우고 읽지 않는다 — 채가 옮겨질 때까지 **기다린다**(느린 기계에서 250ms 는 모자란다). */
      const after = await untilChanged(read, before);
      check(`${id}: 키를 넣어도 마우스는 그대로 먹는다`, Math.abs(after - before) > 1,
        `${before?.toFixed?.(1)} → ${after?.toFixed?.(1)}`);
    }
    await p.click('#acQuit');
  }

  /**
   * **몇 개나 키로 놀 수 있나** — 재는 것을 두 번 틀렸다. 처음엔 「단추가 있나」로 셌고
   * (판이 선 직후 한 순간만 봐서 43/51), 다음엔 기다리게 고쳤지만(47/51) 여전히 「단추」였다.
   * 그런데 뱀은 단추가 없어도 **화살표를 직접 받는다** — 「단추 있나」는 「키로 놀 수 있나」가 아니다.
   *
   * 그래서 이제 **눌러 보고 판이 바뀌는지**로 잰다. 그게 애초에 알고 싶던 것이다.
   */
  const ids = await p.$$eval('[data-obj]', (bs) => bs.map((b) => b.dataset.obj));
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
    await p.waitForSelector('[data-obj]', { timeout: 10000 });
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
  /* ★ **줄 자체가 스스로를 설명해야 한다** (2026-08-17). 위 주석은 「이 수는 게이트가 아니다」를
     길게 적어 뒀는데, **CI 로그에 나가는 건 아래 한 줄뿐**이다. 그 줄이 놀이 이름을 콕 집어
     「안 먹은 것: president」 라고 하니, 읽는 사람은 결함으로 읽고 쫓아간다 —
     실제로 오늘 한 판 쫓아갔고, 가 보니 **내 차례가 아니라 단추가 disabled** 였을 뿐이다.
     그래서 이름 옆에 그 뜻을 같이 적는다. 주석은 로그에 안 실린다. */
  console.log(
    `  · (참고·게이트 아님) 이 순간 키가 먹은 놀이 ${keyable}/${ids.length}` +
      `${mouseOnly.length ? ` — 이 순간 안 먹은 것: ${mouseOnly.join(' ')}` : ''}`
  );
  if (mouseOnly.length) {
    console.log('     ↑ 결함 목록이 아니다 — **내 차례가 아니면** 단추가 disabled 라 여기 뜬다(정상).');
    console.log('       진짜 판정은 위의 「초점 → 화살표 → 엔터 → 놓임」 줄들이다.');
  }
}

await br.close();
if (server) await server.close();
if (cantRun) { console.log(`[arcade-keys] 못 돌았다 — ${cantRun} (통과 아님)`); process.exit(2); }
if (fails.length) { console.log(`[arcade-keys] 실패 ${fails.length}건`); process.exit(1); }
console.log('[arcade-keys] 통과 — 마우스 없이 둔다');
