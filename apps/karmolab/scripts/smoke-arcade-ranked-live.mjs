/**
 * 등급전 한 판을 사람 없이 끝까지 (사용자 2026-09-01: 모든 검사는 사람 도움 없이)
 *
 * 여태 이 실측은 계정 둘이 든다는 이유로 사람 몫이었고, 그래서 **한 번도 안 돌았다.**
 * 안 도는 검사는 없는 검사
 *
 * 여기서 가짜인 것은 신원 하나뿐이다. 대기열, 짝짓기, 결과 보고, 패보, 점수, 그리고
 * 서버가 판을 다시 셈하는 자리까지 **진짜 라우트가 진짜로 돈다**
 * (`yawnbot/scripts/serve-arcade-e2e.mjs`).
 *
 * 창을 둘 띄우고 그 안에서 진짜 클라이언트 묶음(`ranked.ts`)을 부른다. 창 안에서 부르는
 * 이유는 그 코드가 브라우저 것이기 때문이다. Node 에서 돌리면 안 도는 길(fetch 의 쿠키,
 * 주소 규칙)이 검사에서만 초록
 *
 * 판 위의 돌은 여기서 안 봄. 그건 `test:arcade:multi` 와 `test:arcade:yacht-ranked` 몫
 * 여기서 재는 것은 **점수가 붙는 길**
 *
 * `npm run test:arcade:ranked-live`
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { smokeBase } from './lib/smoke-base.mjs';

/**
 * **끝나는 판이어야 한다.** 사람 자리 둘에 수가 비면 오목은 영영 안 끝나고,
 * 서버는 옳게 못 셌다고 답함(실측). 봇 둘이면 커널이 스스로 끝까지 밈
 */
const TAPE = (seed) => ({
  game: 'gomoku',
  seed,
  seats: [{ name: '앨리스', bot: true }, { name: '밥', bot: true }],
  opts: {},
  moves: [],
  /* 되살리기는 이 시각까지만 민다. 봇 판은 길어서 넉넉히 잡아야 끝까지 감 */
  end: 200000
});

const PORT = 4703;
const LOCAL = `http://127.0.0.1:${PORT}`;
const YAWN = 'https://yawnbot.mascari4615.com';

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else { console.log(`  [X] ${name}${detail ? '. ' + detail : ''}`); failures.push(name); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 서버 ─────────────────────────────────────────────── */
const serverPath = path.resolve(
  'src/../..', 'discord-bots', 'apps', 'yawnbot', 'scripts', 'serve-arcade-e2e.mjs'
);
const bot = spawn(process.execPath, [serverPath, '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
bot.stdout.on('data', (d) => process.stdout.write(`  [서버] ${d}`));
bot.stderr.on('data', (d) => process.stdout.write(`  [서버!] ${d}`));

let up = false;
for (let i = 0; i < 40 && !up; i++) {
  await wait(500);
  up = await fetch(`${LOCAL}/kl/e2e/ping`).then((r) => r.ok).catch(() => false);
}
if (!up) {
  console.log('[ranked-live] 못 돌림: 검사 서버가 안 떴다');
  bot.kill();
  process.exit(2);
}

/* ── 클라이언트 묶음 ───────────────────────────────────── */
const built = await build({
  entryPoints: ['src/widgets/arcade/ranked.ts'],
  /* 창에 통째로 붙일 것이라 iife. esm 은 script 태그가 못 읽는다(실측) */
  bundle: true, format: 'iife', globalName: '__ranked', platform: 'browser', write: false
});
const rankedSrc = built.outputFiles[0].text;

/* 서버가 셀 답을 이쪽도 미리 안다. 같은 묶음을 부르므로 답이 갈릴 수 없다 */
const verifierPath = path.resolve(
  'src/../..', 'discord-bots', 'apps', 'yawnbot', 'data', 'arcade-verifier.cjs'
);
const { verifyTape } = createRequire(import.meta.url)(verifierPath);

const site = await smokeBase();
const browser = await chromium.launch();

/** 창 하나 = 사람 하나. 그 창의 모든 서버 부름에 제 이름이 실린다 */
async function open(id) {
  const ctx = await browser.newContext();
  /* 주소를 https 에서 http 로 바꾸는 것은 playwright 가 막는다(규약이 달라서).
     그래서 이쪽에서 대신 다녀와 그 답을 그대로 돌려준다. 창이 보기엔 원래 주소 그대로 */
  await ctx.route(`${YAWN}/**`, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': site.base,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS'
    };
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const res = await fetch(req.url().replace(YAWN, LOCAL), {
      method: req.method(),
      headers: { ...req.headers(), 'x-e2e-user': id },
      body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined
    });
    await route.fulfill({
      status: res.status,
      headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'application/json' },
      body: await res.text()
    });
  });
  /* 셸이 뜨면서 화면을 갈아 끼운다. 그때 붙인 script 는 날아가므로 문서마다 먼저 심음 */
  /* playwright 는 이 글을 함수로 감싼다. 그래서 창에 올려 주는 줄이 따로 필요 */
  const boot = rankedSrc + String.fromCharCode(10) + "window.__ranked = __ranked;";
  await ctx.addInitScript({ content: boot });
  /**
   * **셸을 안 띄운다.** 오락실 껍데기는 뜨면서 스스로 화면을 갈아 끼우고,
   * 그때 창 안에서 기다리던 약속이 통째로 죽는다(실측: promise was garbage collected).
   * 여기서 잴 것은 점수가 붙는 길이지 껍데기가 아님. 그래서 빈 장 하나만
   */
  await ctx.route(`${site.base}/__e2e`, (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>e2e</title>' })
  );
  const page = await ctx.newPage();
  await page.goto(`${site.base}/__e2e`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__ranked?.enterQueue === 'function', null, { timeout: 20000 });
  return { ctx, page };
}

try {
  const A = await open('e2e-alice');
  const B = await open('e2e-bob');
  console.log('[ranked-live] 창 둘, 검사 서버 하나');

  /* ① 줄 서고 짝이 난다 */
  const stand = (p, name) =>
    p.page.evaluate(
      (n) =>
        new Promise((resolve) => {
          const t = setTimeout(() => resolve({ how: '시간초과' }), 20000);
          window.__ranked.enterQueue('gomoku', n, {
            onMatched: (m) => { clearTimeout(t); resolve({ how: '짝', m }); },
            onWaiting: () => {},
            onNeedSignIn: () => { clearTimeout(t); resolve({ how: '로그인 필요' }); },
            onDown: () => { clearTimeout(t); resolve({ how: '서버 죽음' }); }
          });
        }),
      name
    );

  const [ra, rb] = await Promise.all([stand(A, '앨리스'), stand(B, '밥')]);
  check('둘 다 짝이 났다', ra.how === '짝' && rb.how === '짝', `${ra.how} / ${rb.how}`);
  if (failures.length) throw new Error('짝짓기 실패');

  const code = ra.m.code;
  check('같은 방 코드를 받았다', code === rb.m.code, `${code} vs ${rb.m.code}`);
  check('한쪽만 주인이다', ra.m.host !== rb.m.host, `${ra.m.host} / ${rb.m.host}`);

  /* ② 주인이 패보를 올린다. 서버가 그 패보로 판을 다시 셈함 */
  const host = ra.m.host ? A : B;
  const tape = TAPE(7);
  const truth = verifyTape(tape);
  check('그 패보는 끝나는 판이다', truth.ok && truth.finished === true, JSON.stringify(truth));
  const tapeId = await host.page.evaluate(([c, t]) => window.__ranked.saveTape(c, t), [code, tape]);
  check('패보가 올라갔다', !!tapeId, String(tapeId));

  /* ③ 둘이 같은 순서를 보고하면 점수가 움직인다 */
  /* 서버가 셀 순서 그대로 보고한다. 자리 번호를 사람 이름으로 옮김 */
  const seatIds = [ra.m.host ? ra.m.you : rb.m.you, ra.m.host ? rb.m.you : ra.m.you];
  const order = truth.ranks.map((seat) => seatIds[seat]);
  const said = (p, m) =>
    p.page.evaluate(
      ([mm, o]) => window.__ranked.reportResult(mm, { placements: o.map((id) => [id]) }),
      [m, order]
    );
  const first = await said(A, ra.m);
  check('먼저 보고한 쪽은 기다린다', first?.applied === false, JSON.stringify(first));
  const second = await said(B, rb.m);
  check('둘 다 보고하면 반영된다', second?.applied === true, JSON.stringify(second));

  check('서버가 다시 세어 봤다고 말한다', second?.verified === true, JSON.stringify(second));

  const winner = order[0] === ra.m.you ? A : B;
  const mine = await winner.page.evaluate(() => window.__ranked.myRating('gomoku'));
  check('이긴 쪽 점수가 올랐다', (mine?.rating ?? 0) > 1500, JSON.stringify(mine));
  check('판 수가 늘었다', (mine?.games ?? 0) === 1, JSON.stringify(mine));

  /**
   * 둘이 짜고 거꾸로 보고하면 서버가 막는다. 등급 점수의 마지막 자물쇠
   *
   * **사람을 새로 부른다.** 짝이 난 뒤에도 서버는 그 답을 얼마간 들고 있어서,
   * 같은 둘이 다시 서면 **같은 방 코드**가 돌아온다(실측). 그러면 이미 끝난 판에
   * 다시 보고하는 꼴이라 아무것도 안 재게 됨
   */
  const C = await open('e2e-carol');
  const D = await open('e2e-dave');
  const [rc, rd] = await Promise.all([stand(C, '캐럴'), stand(D, '데이브')]);
  check('새 둘도 짝이 났다', rc.how === '짝' && rd.how === '짝', `${rc.how} / ${rd.how}`);

  if (rc.how === '짝' && rd.how === '짝') {
    const tape2 = TAPE(9);
    const truth2 = verifyTape(tape2);
    const host2 = rc.m.host ? C : D;
    await host2.page.evaluate(([c, t]) => window.__ranked.saveTape(c, t), [rc.m.code, tape2]);
    const seat2 = [rc.m.host ? rc.m.you : rd.m.you, rc.m.host ? rd.m.you : rc.m.you];
    /* 서버가 센 것과 거꾸로 말한다. 둘 다 같은 거짓말을 해도 막혀야 함 */
    const wrong = truth2.ranks.map((seat) => seat2[seat]).reverse();
    await C.page.evaluate(([m, o]) => window.__ranked.reportResult(m, { placements: o.map((id) => [id]) }), [rc.m, wrong]);
    const caught = await D.page.evaluate(([m, o]) => window.__ranked.reportResult(m, { placements: o.map((id) => [id]) }), [rd.m, wrong]);
    check('거짓 보고는 점수가 안 붙는다', caught?.applied === false, JSON.stringify(caught));
    check('거짓이라고 말해 준다', caught?.forged === true, JSON.stringify(caught));
    const still = await C.page.evaluate(() => window.__ranked.myRating('gomoku'));
    check('거짓 보고 뒤 점수가 그대로다', still?.rating === 1500, JSON.stringify(still));
  }
  await C.ctx.close();
  await D.ctx.close();

  await A.ctx.close();
  await B.ctx.close();
} finally {
  await browser.close();
  await site.stop?.();
  bot.kill();
  await wait(300);
}

console.log(failures.length ? `[ranked-live] ❌ ${failures.length}건 실패` : '[ranked-live] ✅ 전부 통과');
process.exit(failures.length ? 1 : 0);
