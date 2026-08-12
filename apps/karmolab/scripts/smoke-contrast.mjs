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
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const PORT = Number(process.env.PORT || 4319);
const THEMES = (process.env.THEMES || 'light,dark').split(',');
const MIN_RATIO = 2.2;

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
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const failures = [];
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { localStorage.setItem('toolbox_theme', t); }, theme);
  for (const id of ids) {
    await page.goto(`http://localhost:${PORT}/apps/karmolab/#${id}`, { waitUntil: 'networkidle' });
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
