/**
 * 테마별 「글씨가 안 보이는 자리」 전수 검사 (TASK-KL-090)
 *
 * 색을 손으로 박아 둔 자리는 테마를 바꾸는 순간 흰 바탕에 흰 글씨, 검은 판에 검은
 * 글씨가 된다. 실제로 라이트 모드에서 카드가 통째로 안 보이고, 위젯 몇 개는 자기
 * 안에서 다크 색 한 벌을 따로 선언해 그 판만 까맣게 남아 있었다. 화면을 사람이
 * 하나씩 볼 수 없으니, 브라우저로 전 도구를 돌며 글자색과 **실제로 뒤에 깔린 배경**의
 * 대비를 잰다. 뒤 배경은 부모로 거슬러 올라가며 반투명을 차례로 합성해야 나온다 —
 * 그래야 흰 반투명이 흰 바탕 위에서 무엇이 되는지 드러난다.
 *
 * 사용: node scripts/smoke-contrast.mjs [id ...]     (기본 = 매니페스트 전 도구)
 *       THEMES=light node scripts/smoke-contrast.mjs (기본 = light,dark)
 */
import fs from 'node:fs';
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
       ① 0.0.0.0:45999 잡음 → ② listen(45999) 도 성공 → ③ 127.0.0.1 로 물으니 「먼저 잡은 쪽」
   ⚠ 이 검사는 <b>문제 0건이 곧 합격</b>이라, 남의 화면을 보고도 초록이 된다.
      같은 병으로 `smoke-shell-i18n` 이 실제로 남의 저장소를 보며 「정상」이라 답해 왔다.
   0 을 주면 운영체제가 빈 자리를 준다 — 충돌 자체가 없어진다. */
const PORT = Number(process.env.PORT || 0);
const THEMES = (process.env.THEMES || 'light,dark').split(',');
/* ★ 2.2 는 실수가 아니라 **이 검사의 목적**이다: 「글씨가 안 보이나」(흰 바탕에 흰 글씨).
   전 도구 × 양쪽 판 234장을 도는 넓고 얕은 검사라 바를 낮게 잡았다.
   표준(WCAG AA 4.5:1)은 여기서 안 잰다 — 그건 `smoke-a11y`(axe, 핵심 3장, 좁고 깊은 검사)가
   맡는다. 둘을 한 검사로 합치면 234장 × 전 규칙이 되어 아무도 안 돌린다.
   2026-08-16 에 이 구분이 없어서 3.16:1 짜리 글자가 「초록」인 채로 남아 있었다. */
const MIN_RATIO = Number(process.env.MIN_RATIO || 2.2);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

const lazyMeta = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
// desktopOnly 위젯은 Tauri 앱에서만 뜬다 — 브라우저에선 홈으로 튕겨 검사 의미가 없다.
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...lazyMeta.matchAll(/id: '([a-z0-9-]+)'([\s\S]*?)(?=\n  \{|\n\];)/g)]
      .filter((m) => !m[2].includes('desktopOnly'))
      .map((m) => m[1]);

/** 브라우저 안에서 도는 검사 본체. 페이지의 모든 글자 요소를 훑는다. */
const CHECK = (minRatio) => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own) continue;
    // 이모지·기호만 있는 칸은 글자색과 무관하게 그려진다 (달 🌕 이 매번 걸렸다).
    if (!/[a-zA-Z0-9가-힣]/.test(own)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.15) continue;
    // 꺼 둔 단추는 **일부러 흐리다** — 「지금은 못 누른다」가 흐림 그 자체로 보이는 것이라,
    // 여기서 잡으면 고치는 방법이 「꺼진 티를 없애라」가 된다(막는 자리가 답을 더 나쁘게 만든다).
    // 접근성 기준(WCAG 1.4.3)도 못 쓰는 컨트롤은 대비 대상에서 뺀다.
    if (el.closest('[disabled], [aria-disabled="true"]')) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.15) continue;

    // 실제 뒤 배경: 부모로 올라가며 반투명을 합성. 그라디언트를 만나면 색을 알 수
    // 없으므로 검사를 포기한다 (빨간 리본 위 흰 글씨가 거짓 양성으로 잡혔다).
    let bg = null;
    let gradient = false;
    for (let n = el; n; n = n.parentElement) {
      const ns = getComputedStyle(n);
      if (ns.backgroundImage && ns.backgroundImage !== 'none') { gradient = true; break; }
      const c = parse(ns.backgroundColor);
      if (c && c.a > 0) { bg = bg ? over(bg, c) : c; if (bg.a >= 1) break; }
    }
    if (gradient) continue;
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };

    const front = over(fg, bg);
    const [hi, lo] = [lum(front), lum(bg)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < minRatio) {
      out.push({
        ratio: +ratio.toFixed(2),
        where: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''),
        color: cs.color,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        text: own.slice(0, 40),
      });
    }
  }
  const seen = new Set();
  return out.filter((o) => { const k = o.where + o.color + o.bg; if (seen.has(k)) return false; seen.add(k); return true; });
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(repoRoot, p);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  /* ★ Jekyll 앞머리는 **떼고** 낸다 — 안 떼면 브라우저가 그 줄들을 본문 글자로 읽고
     `<head>` 가 닫힌 것으로 친다. 그러면 이 검사가 **배포와 다른 화면**을 재게 된다. */
  if (path.extname(file) === '.html') {
    res.end(stripFrontMatter(fs.readFileSync(file, 'utf8')));
    return;
  }
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const PORT_IN_USE = server.address().port;

const browser = await chromium.launch();
const failures = [];
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { localStorage.setItem('toolbox_theme', t); }, theme);
  for (const id of ids) {
    const res = await page.goto(`http://localhost:${PORT_IN_USE}/apps/karmolab/#${id}`, { waitUntil: 'networkidle' });
    /* ★ **여기서 「문제 0건」은 「안 봤다」일 수 있다** (2026-08-21).
     * 이 검사의 합격 조건이 <b>문제 0건</b>이라, 장이 안 열려 화면이 비면 그대로 초록이 된다.
     * 실측으로 밟았다 — 남이 같은 자리 번호를 잡고 있을 때 <b>남의 서버를 보고도 초록</b>이었다
     * (`listen(포트)` 는 IPv6 로 잡혀 IPv4 를 남이 쥐고 있어도 안 부딪힌다).
     * 그래서 잰 것이 있는지부터 본다 — 없으면 초록·빨강 어느 쪽으로도 적지 않는다. */
    const bodyLen = await page.evaluate(() => (document.body?.innerText || '').trim().length);
    /* ⚠ `res` 가 <b>null 일 수 있다</b> — 해시(`#id`)만 바뀌는 이동은 새 응답이 없다.
     *   처음엔 `!res` 를 실패로 셌다가 멀쩡한 판이 「못 돌림」이 됐다(실측 글 808자).
     *   응답이 <b>있는데</b> 200 이 아닐 때만 실패로 세고, 나머지는 글자 수로 본다. */
    if ((res && res.status() !== 200) || bodyLen < 200) {
      console.error(`[smoke-contrast] CANNOT-RUN: 장을 못 열었다 (http ${res && res.status()} · 글 ${bodyLen}자).`);
      console.error('  이건 「문제 없음」이 아니라 **아무것도 안 봤다**는 뜻이다. 통과로 안 센다.');
      process.exit(2);
    }
    await page.waitForTimeout(700);
    const bad = await page.evaluate(CHECK, MIN_RATIO);
    for (const b of bad) failures.push({ theme, id, ...b });
  }
  await ctx.close();
}
await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`\n[smoke-contrast] 대비 미달 ${failures.length}건 (기준 ${MIN_RATIO}:1)\n`);
  for (const f of failures) {
    console.error(`  ${f.theme.padEnd(5)} #${f.id}  ${f.ratio}  ${f.where}`);
    console.error(`        ${f.color} on ${f.bg}  "${f.text}"`);
  }
  console.error('\n색을 직접 박지 말고 테마 토큰(--text-*/--bg-*)을 쓴다. 늘 어두운 판 안이면 그 판 안에서만 밝은 색을 고정한다.\n');
  process.exit(1);
}
console.log(`[smoke-contrast] ${ids.length}개 화면 × ${THEMES.join('/')} 대비 OK`);
