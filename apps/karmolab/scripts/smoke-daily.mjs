/**
 * 오늘의 놀이 두 판이 **화면에서** 도는가 — 그리고 답이 새지 않는가 (데일리 ⓐⓑ)
 *
 * 알맹이 시험은 「채점이 맞다」까지다. 이 검사가 보는 것은 다르다:
 *
 * ★ **답이 화면 안에 없어야 한다.** 초성 맞히기의 답은 화면 어딘가에 글자로 들어 있으면
 *   그 순간 놀이가 끝난다 — 개발자 도구를 열 필요도 없이 「소스 보기」로 보인다. 알맹이가
 *   아무리 답을 안 돌려줘도, 화면이 미리 그려 두면 새는 것이다. 이건 여기서만 잡힌다.
 *
 * ★ **공유 글에도 답이 없어야 한다.** 격자(🟩🟨⬛)를 자랑하러 붙여 넣는 글이라, 여기 답이
 *   섞이면 받은 사람의 그날이 끝난다.
 *
 * 그 밖에: 답을 넣으면 실제로 맞음으로 채점되는지(사슬이 이어져 있는지)까지 눌러 본다.
 *
 * 사용: node scripts/smoke-daily.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const NL = String.fromCharCode(10);
const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(appRoot, '../../packages/mcp/dist');

const NEEDED = ['js/widgets/tools/dailycho.js', 'js/widgets/tools/dailytype.js'];
const missing = NEEDED.filter((rel) => fs.existsSync(path.join(appRoot, rel)) === false);
if (missing.length > 0) {
  console.log(`[daily-smoke] CANNOT-RUN(건너뜀) — 번들이 아직 없다: ${missing.join(' · ')}`);
  console.log('  `node build.mjs` 뒤에 돌려라.');
  process.exit(2);
}
if (fs.existsSync(path.join(distDir, 'dailycho.mjs')) === false) {
  console.log('[daily-smoke] CANNOT-RUN(건너뜀) — 알맹이 dist 가 없다. `npm run test:mcp` 뒤에 돌려라.');
  process.exit(2);
}

/* 오늘 답은 **알맹이에게 따로 물어** 둔다 — 화면에서 캐낼 수 있으면 그게 곧 실패다. */
const { puzzleFor } = await import(pathToFileURL(path.join(distDir, 'dailycho.mjs')).href);
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
const answers = puzzleFor(today).questions.map((q) => q.answer);

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[daily-smoke] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(NL)[0]);
  process.exit(1);
}

const page = await browser.newPage();
await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await page.goto('http://localhost/');
/*
 * 말 묶음을 미리 박는다 — **진짜 페이지가 하는 그대로**(`window.__KARMO_I18N`, 머리말에 박힘).
 * 안 박으면 화면이 `dailycho.score` 같은 열쇠를 그대로 뱉거나 아예 안 그려진다. 그건 하네스가
 * 만든 상태지 제품의 상태가 아니다 — 검사가 제품을 헐뜯게 된다(실측: CI 배포 빨강).
 */
const catalogs = {
  dailycho: JSON.parse(fs.readFileSync(path.join(appRoot, 'i18n/ko/dailycho.json'), 'utf8')),
  dailytype: JSON.parse(fs.readFileSync(path.join(appRoot, 'i18n/ko/dailytype.json'), 'utf8'))
};
await page.evaluate((cat) => {
  window.__KARMO_LOCALE = 'ko';
  window.__KARMO_I18N = { ko: cat };
  window.__reg = {};
  window.Toolbox = {
    register: (t) => {
      window.__reg[t.id] = t;
    },
    trackUse() {},
    copyText() {},
    onDispose() {},
    mountTool() {
      return true;
    }
  };
}, catalogs);
const read = (rel) => fs.readFileSync(path.join(appRoot, rel), 'utf8');
await page.addScriptTag({ content: read('js/widgets/tools/dailycho.js') });
await page.addScriptTag({ content: read('js/widgets/tools/dailytype.js') });

const fails = [];

/* ── 초성 맞히기 ─────────────────────────────────────────────────────────── */
const choBuilt = await page.evaluate(() => {
  const tool = window.__reg['dailycho'];
  if (!tool) return false;
  const host = document.createElement('div');
  host.id = 'choHost';
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  return true;
});

/*
 * 위젯은 **말 묶음을 받은 뒤에** 그린다 — `build()` 는 바로 돌아오고 화면은 조금 뒤에 채워진다.
 * 부르자마자 읽으면 「칸이 없다」로 헛보인다(실측: CI 배포 빨강).
 */
await page.waitForSelector('#choHost #chIn0', { state: 'attached', timeout: 8000 }).catch(() => null);

if (choBuilt === false) {
  fails.push('번들을 실어도 dailycho 가 등록되지 않는다');
} else {
  /* ★ 답이 화면 어디에도 없어야 한다. 눈에 보이는 글만이 아니라 **HTML 통째로** 본다 —
     숨긴 칸·data 속성·value 에 들어 있어도 「소스 보기」로 다 보인다. */
  /* ★ **우리가 쓴 글까지 「샜다」고 세면 안 된다** (2026-08-16, 실측). 답은 우리 도구 설명에서
     뽑은 **평범한 낱말**이다(`word-pool.generated.ts`). 그래서 그 낱말이 위젯 제 이름표에
     그냥 들어 있을 수 있다 — 오늘 답 「글자」가 이름표 「🟨 한 글자 다름」에 박혀 있어,
     아무것도 안 새는데 검사가 빨갰다(도구 설명을 채우자 낱말 뭉치가 바뀌면서 터졌다).
     이름표는 **말 묶음에서 온 고정 글**이라 답이 될 수 없다 — 먼저 걷어내고 본다.
     걷어낸 뒤에도 남으면 그건 값·data 속성·숨긴 칸에 든 **진짜 유출**이다. */
  /* **길이 힌트는 답이 아니다.** 화면은 「2글자」처럼 답의 길이를 알려 준다 — 그런데 답 자체가
     「글자」 같은 평범한 낱말이면 그 안에 통째로 들어가 버린다(오늘 실측). 사람이 「2글자」를 보고
     답을 알 수는 없으니 이건 유출이 아니다. 그래서 **힌트 칸은 걷어내고** 본다 —
     걷어낸 나머지에 답이 있으면 그건 값·data 속성·숨긴 칸에 든 진짜 유출이다. */
  const html = await page.evaluate(() => {
    const clone = document.getElementById('choHost').cloneNode(true);
    clone.querySelectorAll('.tool-hint').forEach((el) => el.remove());
    return clone.outerHTML;
  });
  const labels = Object.values(catalogs.dailycho)
    .flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v || {})))
    .filter((v) => typeof v === 'string' && v.length > 0)
    .sort((a, b) => b.length - a.length);
  let withoutLabels = html;
  for (const label of labels) withoutLabels = withoutLabels.split(label).join('');
  const leaked = answers.filter((a) => withoutLabels.includes(a));
  if (leaked.length > 0) fails.push(`답이 화면 안에 들어 있다: ${leaked.join(' · ')}`);

  /* 사슬이 이어져 있나 — 답을 넣으면 실제로 맞음이 되는가. */
  const marks = await page.evaluate(async (list) => {
    const host = document.getElementById('choHost');
    list.forEach((a, i) => {
      const el = host.querySelector(`#chIn${i}`);
      if (el) el.value = a;
    });
    host.querySelector('#chDone').click();
    await new Promise((r) => setTimeout(r, 50));
    return {
      say: host.querySelector('#chSay')?.textContent ?? '',
      share: host.querySelector('#chShare')?.textContent ?? ''
    };
  }, answers);

  if (/5\s*\/\s*5|다 맞|5개/.test(marks.say) === false) {
    fails.push(`답을 다 넣어도 다 맞았다고 안 한다: ${marks.say.trim()}`);
  }
  if (marks.share.trim() === '') {
    fails.push('채점해도 공유 글이 안 생긴다');
  } else {
    const shareLeak = answers.filter((a) => marks.share.includes(a));
    if (shareLeak.length > 0) fails.push(`공유 글에 답이 섞여 있다: ${shareLeak.join(' · ')}`);
  }
}

/* ── 한글 타자 ───────────────────────────────────────────────────────────── */
const typeOut = await page.evaluate(async () => {
  const tool = window.__reg['dailytype'];
  if (!tool) return { missing: true };
  const host = document.createElement('div');
  host.id = 'dtHost';
  document.body.appendChild(host);
  tool.tabs[0].build(host);
  /* 여기도 그려질 때까지 기다린다 — 말 묶음이 온 뒤에 칸이 생긴다. */
  for (let i = 0; i < 80 && host.querySelector('#dtIn0') === null; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const first = host.querySelector('#dtIn0');
  if (!first) return { noInput: true };
  /* 한 줄만 그대로 옮겨 친다 — 화면이 보여 준 문장이니 답이 새는 문제가 없다. */
  const line = host.querySelector('#dtLines')?.textContent ?? '';
  first.value = first.placeholder || line.slice(0, 10);
  host.querySelector('#dtDone').click();
  await new Promise((r) => setTimeout(r, 50));
  return { say: host.querySelector('#dtSay')?.textContent ?? '', share: host.querySelector('#dtShare')?.textContent ?? '' };
});

if (typeOut.missing === true) fails.push('번들을 실어도 dailytype 이 등록되지 않는다');
else if (typeOut.noInput === true) fails.push('타자 화면에 칠 칸이 없다');
else if (typeOut.say.trim() === '') fails.push('「다 쳤어요」를 눌러도 화면이 아무 말이 없다');

await browser.close();

if (fails.length > 0) {
  console.error('[daily-smoke] 실패:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log(`[daily-smoke] 초성 ${answers.length}문제 답이 화면·공유 글 어디에도 없음 · 답을 넣으면 채점됨 · 타자도 돎`);
