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
import { smokeBase } from './lib/smoke-base.mjs';

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
  const tapeId = await host.page.evaluate(
    (c) =>
      window.__ranked.saveTape(c, {
        game: 'gomoku', seed: 7,
        seats: [{ name: '앨리스', bot: false }, { name: '밥', bot: false }],
        opts: {}, moves: [], end: 1000
      }),
    code
  );
  check('패보가 올라갔다', !!tapeId, String(tapeId));

  /* ③ 둘이 같은 순서를 보고하면 점수가 움직인다 */
  const order = [ra.m.you, rb.m.you];
  const said = (p, m) =>
    p.page.evaluate(
      ([mm, o]) => window.__ranked.reportResult(mm, o, false),
      [m, order]
    );
  const first = await said(A, ra.m);
  check('먼저 보고한 쪽은 기다린다', first?.applied === false, JSON.stringify(first));
  const second = await said(B, rb.m);
  check('둘 다 보고하면 반영된다', second?.applied === true, JSON.stringify(second));

  const mine = await A.page.evaluate(() => window.__ranked.myRating('gomoku'));
  check('이긴 쪽 점수가 올랐다', (mine?.rating ?? 0) > 1500, JSON.stringify(mine));
  check('판 수가 늘었다', (mine?.games ?? 0) === 1, JSON.stringify(mine));

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
