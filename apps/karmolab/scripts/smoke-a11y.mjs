/**
 * **화면낭독기, 대비 관문**. 그려진 뒤를 본다 (2026-08-16)
 *
 * 왜 또 만드나. `smoke-contrast` 와 뭐가 다른가:
 *   `smoke-contrast` 는 **글씨가 안 보이나** 를 본다(흰 바탕에 흰 글씨). 기준이 2.2:1 인 것은
 *   실수가 아니라 그 목적에 맞춘 값이다. 전 도구 × 양쪽 판을 도는 대신 바를 낮게 잡았다.
 *   그래서 3.16:1 짜리 흐린 글자는 그 검사를 **정당하게** 통과한다. 초록이지만 표준(WCAG AA
 *   4.5:1) 아래다. 아무도 표준을 안 재고 있었다는 뜻이다.
 *
 *   이 검사는 반대다. 화면 수는 적게(핵심 3장), 대신 **axe-core 전 규칙**을 건다 . 
 *   대비뿐 아니라 이름표, 랜드마크, 역할까지. 둘은 겹치지 않는다: 넓고 얕은 것 하나,
 *   좁고 깊은 것 하나.
 *
 * 못 잰 것은 통과가 아니다. axe 나 브라우저가 없으면 **끝값 2(CANNOT-RUN)**.
 */
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { stripFrontMatter } from './lib/serve-html.mjs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
/* ★ **붙박이 자리는 남의 서버를 보게 만든다** (2026-08-21, 기전까지 재서 확인).
   `listen(포트)` 는 IPv6(`::`)로 잡히는데, 남이 이미 IPv4(`0.0.0.0`)로 같은 번호를 잡고 있어도
   <b>부딪히지 않고 성공한다</b>. 그리고 `localhost`/`127.0.0.1` 로 물으면 <b>남의 서버가 답한다</b>.
   오류도 안 나고 로그도 안 남는다. 실측(작은 판으로 재현):
       ① 0.0.0.0:45999 잡음 → ② listen(45999) 도 성공 → ③ 127.0.0.1 로 물으니 먼저 잡은 쪽
   ⚠ 이 검사는 <b>문제 0건이 곧 합격</b>이라, 남의 화면을 보고도 초록이 된다.
      같은 병으로 `smoke-shell-i18n` 이 실제로 남의 저장소를 보며 정상이라 답해 왔다.
   0 을 주면 운영체제가 빈 자리를 준다. 충돌 자체가 없어진다. */
const PORT = Number(process.env.PORT || 0);
const THEMES = (process.env.THEMES || 'light,dark').split(',');
/* 스킨 축 (2026-09-01). 스킨은 색과 모서리를 갈아 끼우므로 대비가 스킨마다 다름
   한 스킨만 재면 다른 스킨의 WCAG 위반이 통째로 안 보임 */
const SKINS = (process.env.SKINS || 'classic,field').split(',');
const AXE = path.join(root, 'node_modules', 'axe-core', 'axe.min.js');

/* 핵심 3장. 첫 화면, 도구 한 장(입력칸이 많은 것), 도구 목록. */
/* 도구 전수로 넓히는 길 (2026-09-01). 기본은 좁고 깊게 여섯 장이다. 전부 재려면
   `KL_A11Y_ALL=1`. 그때는 스킨과 판을 하나로 줄인다(classic, dark). 안 그러면 도구 233개에
   스킨 둘 판 둘이라 932판이 되고 사십 분이 넘는다. 넓게 한 번 훑는 것이 목적이지
   스킨마다 다시 재는 것이 목적이 아니다. 좁고 깊은 쪽은 기본 여섯 장이 맡는다 */
const ALL = process.env.KL_A11Y_ALL === "1";
function allToolScreens() {
  const src = fs.readFileSync(path.join(root, "src/widgets-lazy-meta.ts"), "utf8");
  const ids = [...new Set([...src.matchAll(/(?:^|[{,]\s*)id: '([a-z0-9-]+)'/gm)].map((m) => m[1]))];
  return ids.map((id) => [id, `/apps/karmolab/#${id}`]);
}

const SCREENS = [
  ['첫 화면', '/apps/karmolab/'],
  ['도구 한 장', '/apps/karmolab/#passgen'],
  ['도구 목록', '/apps/karmolab/#tools'],
  /* ★ **검색으로 들어오는 정문을 안 재고 있었다** (2026-08-16). 위 셋은 전부 앱 껍데기다.
     사람 대부분이 처음 밟는 자리는 도구 상세 장(129장)인데 그 장은 껍데기에 SEO 글 뭉치가
     더 붙어 나간다. 그래서 껍데기에 없는 위반이 거기에만 있었다(실측: 129장 전부에
     landmark-unique 하나씩, 같은 이름의 nav 가 둘이라). 한 장을 표본으로 넣는다. */
  ['도구 상세 한 장', '/apps/blog/t/loan/'],
  /* 부품 킷 장 (2026-09-01). 여기 위반 하나는 그 부품을 쓰는 도구 전부의 위반
     좁고 깊게 보는 이 검사에 값이 가장 큰 한 장 */
  ['부품 킷', '/apps/karmolab/#uikit'],
  ['설정', '/apps/karmolab/#settings'],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

/* 도구 상세 장은 **찍혀야** 존재한다. 없으면 위반 0이 아니라 못 잰 것이다.
 *
 * ★ **없으면 여기서 찍는다** (2026-08-17). 이 장은 배포 때만 찍히고 저장소에 안 들어간다.
 *   그래서 verify(CI) 에서는 늘 없었고, 이 검사는 **한 번도 안 돌았다**(로그에 매 판
 *   못 돌린 검사 2개로 남아 있었다). 사람 손으로 `gen:tool-pages` 를 먼저 돌리라는 안내는
 *   기계에게 안 통한다. 못 돌 이유를 스스로 없앤다. 찍는 데 4초면 된다.
 *   찍는 것도 실패하면 그때는 진짜 못 잼이다(기록 파일은 안 건드린다). */
let tempPage = null;
const SAMPLE_TOOL_PAGE = path.join(repoRoot, 'apps/blog/t/loan/index.html');
if (fs.existsSync(SAMPLE_TOOL_PAGE) === false) {
  tempPage = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-a11y-'));
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/gen-tool-pages.mjs'), '--out', path.join(tempPage, 't')], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, KARMOLAB_GEN_NO_STATE: '1' },
    });
  } catch (e) {
    console.error('[smoke-a11y] 못 돌았다. 도구 상세 표본을 찍지 못했다.');
    console.error('  ' + String(e.stderr || e.stdout || e.message).trim().split(String.fromCharCode(10))[0].slice(0, 140));
    console.error('  (구운 것이 없으면 `node build.mjs` 뒤에 다시. 안 재고 통과시키지 않는다.)');
    process.exit(2);
  }
  if (!fs.existsSync(path.join(tempPage, 't/loan/index.html'))) {
    console.error('[smoke-a11y] 못 돌았다. 찍긴 했는데 표본 장이 없다.');
    process.exit(2);
  }
}

if (fs.existsSync(AXE) === false) {
  console.error(`[smoke-a11y] 못 돌았다. axe-core 가 없다 (${AXE}). npm i -D axe-core`);
  process.exit(2);
}
const axeSource = fs.readFileSync(AXE, 'utf8');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  /* 갓 찍은 표본을 쓰는 판이면 그 자리로 보낸다. 주소는 배포와 같게 둔다. */
  const file = tempPage && p.startsWith('/apps/blog/t/')
    ? path.join(tempPage, 't', p.slice('/apps/blog/t/'.length))
    : path.join(repoRoot, p);
  if ((!file.startsWith(repoRoot) && !(tempPage && file.startsWith(tempPage))) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  /* ★ Jekyll 앞머리는 **떼고** 낸다. 안 떼면 브라우저가 그 줄들을 본문 글자로 읽고
     `<head>` 가 닫힌 것으로 친다. 그러면 이 검사가 **배포와 다른 화면**을 재게 된다. */
  if (path.extname(file) === '.html') {
    res.end(stripFrontMatter(fs.readFileSync(file, 'utf8')));
    return;
  }
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const PORT_IN_USE = server.address().port;

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(`[smoke-a11y] 못 돌았다. 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 80)})`);
  server.close();
  process.exit(2);
}

/**
 * 이 판에서만 볼 화면. `KL_A11Y_ONLY=status,pulse` 처럼 쉼표로. 이름이나 주소에 든 글자로 고르기
 *
 * - 전수 233장은 이 기계에서 한 시간 초과, 판정 못 받음 (2026-09-04 실측)
 * - 쓰임새는 몇 장 고친 뒤 그것만 재기
 * - 견주기는 본 화면만. 안 본 화면의 빚은 그대로
 */
const ONLY = (process.env.KL_A11Y_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
/** 실제로 돌 화면. 전수 판에서는 도구 전부 */
const RUN_SCREENS = (ALL ? allToolScreens() : SCREENS)
  .filter(([name, url]) => !ONLY.length || ONLY.some((q) => name.includes(q) || url.includes(q)));
/** 전수 판은 스킨과 판을 하나로 줄인다 */
const RUN_SKINS = ALL ? [SKINS[0]] : SKINS;
const RUN_THEMES = ALL ? [THEMES[THEMES.length - 1]] : THEMES;

const failures = [];
for (const skin of RUN_SKINS) for (const theme of RUN_THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript((v) => {
    try {
      localStorage.setItem('toolbox_theme', v.theme);
      localStorage.setItem('toolbox_skin', v.skin);
    } catch { /* 사생활 모드 */ }
  }, { theme, skin });
  for (const [name, url] of RUN_SCREENS) {
    const res = await page.goto(`http://localhost:${PORT_IN_USE}${url}`, { waitUntil: 'load' });
    /* ★ **여기서 문제 0건은 안 봤다일 수 있다** (2026-08-21).
     * 이 검사의 합격 조건이 <b>문제 0건</b>이라, 장이 안 열려 화면이 비면 그대로 초록이 된다.
     * 실측으로 밟았다. 남이 같은 자리 번호를 잡고 있을 때 <b>남의 서버를 보고도 초록</b>이었다
     * (`listen(포트)` 는 IPv6 로 잡혀 IPv4 를 남이 쥐고 있어도 안 부딪힌다).
     * 그래서 잰 것이 있는지부터 본다. 없으면 초록, 빨강 어느 쪽으로도 적지 않는다. */
    const bodyLen = await page.evaluate(() => (document.body?.innerText || '').trim().length);
    /* ⚠ `res` 가 <b>null 일 수 있다</b>. 해시(`#id`)만 바뀌는 이동은 새 응답이 없다.
     *   처음엔 `!res` 를 실패로 셌다가 멀쩡한 판이 못 돌림이 됐다(실측 글 808자).
     *   응답이 <b>있는데</b> 200 이 아닐 때만 실패로 세고, 나머지는 글자 수로 본다. */
    if ((res && res.status() !== 200) || bodyLen < 200) {
      console.error(`[smoke-a11y] CANNOT-RUN: 장을 못 열었다 (http ${res && res.status()}, 글 ${bodyLen}자).`);
      console.error('  이건 문제 없음이 아니라 **아무것도 안 봤다**는 뜻이다. 통과로 안 센다.');
      process.exit(2);
    }
    /* 재움-의도: 늦게 오는 조각(장식, 지연 위젯)이 다 붙기를 기다린다. 읽어서 판정할
       상태가 없다. axe 는 그 순간의 화면 전체를 재는 것이라 기다릴 표식이 없다 */
    await page.waitForTimeout(1800);
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => {
        const n0 = v.nodes[0];
        const d = n0?.any?.[0]?.data;
        /* ★ **잰 값을 같이 낸다** (2026-08-16). 처음엔 규칙 이름과 대상만 찍었는데, CI 가
           빨간데 로컬에서 재현이 안 되면 **고칠 수가 없다**. 어떤 색이 어떤 배경 위에서
           얼마였는지가 없으면 추측으로 색을 바꾸게 된다. 실제로 한 번 그렇게 헤맸다. */
        const measured = d && d.contrastRatio != null
          ? `${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} (필요 ${d.expectedContrastRatio})`
          : '';
        return { id: v.id, impact: v.impact, n: v.nodes.length, help: v.help,
          sample: (n0?.target || []).join(' '), measured };
      });
    });
    for (const v of violations) failures.push({ theme: `${skin}/${theme}`, name, ...v });
  }
  await ctx.close();
}
await browser.close();
server.close();
if (tempPage) fs.rmSync(tempPage, { recursive: true, force: true });

/* ★ 기준선(래칫). 처음 켰더니 36곳이 이미 어겨져 있었다. 다 고칠 때까지 게이트를 안 켜면
   그 사이에 **새로 생기는 것**도 못 막는다. 그래서 지금보다 늘면 빨강으로 켠다.
   기준선은 오직 내려가야 한다: 줄었으면 그렇게 말하고 다시 적으라고 시킨다.
   `--bless` 로만 다시 적는다. 자동으로 올라가면 그건 래칫이 아니다. */
/* 전수 판(233장 classic/dark)은 제 기준선을 따로 둔다. 여섯 장 기준선(0곳)에 대고 재니 여섯 장 밖 도구의
   묵은 위반 49곳이 매 판 '늘었다' 로 나와 main 이 한 번도 초록이 못 됐다 (2026-09-03). 래칫은 축마다 하나 */
const BASELINE = path.join(root, 'data', ALL ? 'a11y-axe-all-baseline.json' : 'a11y-axe-baseline.json');
const key = (f) => `${f.theme}|${f.name}|${f.id}`;
const now = {};
for (const f of failures) now[key(f)] = (now[key(f)] || 0) + f.n;

if (process.argv.includes('--bless') && ONLY.length) {
  console.error('[smoke-a11y] 몇 장만 고른 판에서는 기준선을 못 적는다. 안 본 화면의 빚이 지워진다');
  process.exit(2);
}
if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(now, null, 1) + '\n', 'utf8');
  console.log(`[smoke-a11y] 기준선을 다시 적었다. ${Object.keys(now).length}종 / ${Object.values(now).reduce((a, b) => a + b, 0)}곳`);
  process.exit(0);
}

let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch {
  console.error(`[smoke-a11y] 못 돌았다. 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const grown = [];
const seen = new Set();
for (const f of failures) {
  const k = key(f);
  if (seen.has(k)) continue;
  seen.add(k);
  const before = base[k] || 0;
  if (now[k] > before) grown.push({ f, before, after: now[k] });
}
/* 골라 돈 판에서 안 본 화면은 0 으로 읽힘. 견주기도 본 것만 */
const scope = ONLY.length ? Object.keys(base).filter((k) => RUN_SCREENS.some(([name]) => k.split('|')[1] === name)) : Object.keys(base);
const shrunk = scope.filter((k) => (now[k] || 0) < (base[k] || 0));

if (grown.length > 0) {
  console.error(`\n[smoke-a11y] 접근성 위반이 **늘었다** ${grown.length}건
`);
  for (const { f, before, after } of grown) {
    console.error(`  ${f.theme.padEnd(5)} ${f.name}  [${f.impact}] ${f.id}  ${before} → ${after}`);
    console.error(`        ${f.help}`);
    console.error(`        예: ${f.sample.slice(0, 90)}`);
    if (f.measured) console.error(`        잰 값: ${f.measured}`);
  }
  console.error('\n색, 이름표를 자리마다 박지 말고 토큰, 공용 뼈대(shared/markup.ts)를 쓴다.\n');
  process.exit(1);
}

/* 남은 빚을 자리까지 보여 준다. 수만 보면 어디를 고칠지 모른다 (`KL_A11Y_LIST=1`) */
if (process.env.KL_A11Y_LIST === '1') {
  const rows = [...new Map(failures.map((f) => [key(f), f])).values()]
    .sort((a, b) => (now[key(b)] || 0) - (now[key(a)] || 0));
  console.log(`
[smoke-a11y] 남은 자리 ${rows.length}종`);
  for (const f of rows) {
    console.log(`  ${f.theme.padEnd(5)} ${f.name}  [${f.impact}] ${f.id}  ${now[key(f)]}곳`);
    console.log(`        예: ${f.sample.slice(0, 100)}`);
    if (f.measured) console.log(`        잰 값: ${f.measured}`);
  }
  console.log('');
}

const total = scope.reduce((a, k) => a + (now[k] || 0), 0);
const baseline = scope.reduce((a, k) => a + (base[k] || 0), 0);
if (shrunk.length > 0) {
  console.log(`[smoke-a11y] 줄었다 ${baseline} → ${total}곳. 기준선을 다시 적어라: npm run ${ALL ? 'test:a11y:all' : 'test:a11y'} -- --bless`);
  process.exit(0);
}
console.log(`[smoke-a11y] ${RUN_SCREENS.length}장 x ${RUN_SKINS.join('/')} x ${RUN_THEMES.join('/')} = ${RUN_SCREENS.length*RUN_SKINS.length*RUN_THEMES.length}판. 늘지 않았다 (남은 빚 ${total}곳)`);
