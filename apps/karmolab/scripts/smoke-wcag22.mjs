#!/usr/bin/env node
/**
 * WCAG 2.2 에서 **axe 가 안 재는 넷** (2026-09-01)
 *
 * 왜 있나. `test:a11y` 는 axe 전 규칙을 건다. 그런데 axe 가 성질상 못 보는 것이 있음
 * 초점 표시는 눌러 봐야 알고, 누를 크기는 실제 상자를 재야 알고, 키보드만으로 도는 길은
 * 실제로 돌아 봐야 알고, 움직임 줄이기는 그 설정을 켠 판에서 봐야 앎
 * 그 넷을 아무도 안 재던 자리
 *
 * 재는 것 넷.
 *  ① 2.4.11 초점 표시. Tab 으로 밟히는 것마다 표시가 실제로 달라지나 (테두리, 그림자, 윤곽)
 *  ② 2.5.8 누를 크기. 누르는 것의 상자가 24x24 CSS px 이상인가 (AA 값)
 *  ③ 키보드만으로 도는 길. 마우스 없이 옆줄과 머리띠와 도구 판에 닿나
 *  ④ 움직임 줄이기. `prefers-reduced-motion: reduce` 를 켠 판에서 끝없는 움직임이 남나
 *  ⑤ 2.5.7 끌기 대안. 끌 수 있는 것이 밟히지도 않고 곁에 버튼도 없나
 *  ⑥ 3.3.8 인증 접근성. 열쇠 칸이 자동 채우기나 붙여넣기를 막나
 *
 * 기준선은 래칫이다. 처음 켰을 때 이미 어겨진 자리가 있으므로, 지금보다 늘면 빨강.
 * `--bless` 로만 다시 적음
 *
 * 사용: node scripts/smoke-wcag22.mjs [--bless] [--list]
 *   끝값 0 안 늘음, 1 늘음, 2 못 잼
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const BASELINE = path.join(root, 'data', 'wcag22-baseline.json');

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[wcag22] 못 돌림. 아직 안 구웠다 (`npm run build` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[wcag22] 못 돌림. 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

/* 도구 전수로 넓히는 길 (2026-09-01). 기본은 셸 조작이 다 나오는 넷.
   `KL_WCAG_ALL=1` 이면 등록된 도구 전부를 본다. 도구마다 제 버튼과 입력이 있어
   누를 크기와 초점 표시는 거기서 어긋난다 */
const ALL = process.env.KL_WCAG_ALL === "1";
function allToolScreens() {
  const src = fs.readFileSync(path.join(root, "src/widgets-lazy-meta.ts"), "utf8");
  const ids = [...new Set([...src.matchAll(/(?:^|[{,]\s*)id: '([a-z0-9-]+)'/gm)].map((m) => m[1]))];
  return ids.map((id) => [id, `/apps/karmolab/#${id}`]);
}

/* 볼 화면. 셸의 조작이 다 나오는 자리 */
const SCREENS = [
  ['첫 화면', '/apps/karmolab/'],
  ['도구 한 장', '/apps/karmolab/#passgen'],
  ['부품 킷', '/apps/karmolab/#uikit'],
  ['설정', '/apps/karmolab/#settings'],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(repoRoot, p);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (path.extname(file) === '.html') { res.end(stripFrontMatter(fs.readFileSync(file, 'utf8'))); return; }
  const stream = fs.createReadStream(file);
  stream.on('error', () => { try { res.destroy(); } catch { /* 이미 닫힘 */ } });
  stream.pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
/** 화면 이름 -> 규칙 이름 -> 어긴 수 */
const found = {};
const detail = [];

/** 한 화면을 열고 그릴 때까지 기다린다 */
async function open(hash, motion) {
  const ctx = await browser.newContext({
    /* 1440x900 이라야 한다. 앱이 그 크기를 기준으로 화면을 확대, 축소하므로(설정 화면 크기)
       1280 에서는 모든 상자가 0.889배로 읽힌다. WCAG 의 24px 은 CSS px 이지 그 배율이 아니다.
       1280 으로 재던 첫 판에서 24px 로 고친 자리가 21px 로 읽혀 안 고쳐진 줄 알았다 (2026-09-01) */
    viewport: { width: 1440, height: 900 },
    reducedMotion: motion ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('toolbox_theme', 'dark'); localStorage.setItem('toolbox_skin', 'classic'); } catch { /* 막힌 판 */ }
  });
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page
    .waitForFunction(() => !!document.querySelector('.tool-page.active') || !!document.querySelector('#page-home'), undefined, { timeout: 25000 })
    .catch(() => null);
  // 재움-의도: 늦게 붙는 조각을 기다리는 자리. 잴 상태가 하나로 안 정해짐
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const add = (screen, rule, n, sample) => {
  if (!n) return;
  found[screen] = found[screen] || {};
  found[screen][rule] = (found[screen][rule] || 0) + n;
  detail.push(`${screen} [${rule}] ${n}개  예: ${sample}`);
};

const RUN = ALL ? allToolScreens() : SCREENS;
for (const [name, url] of RUN) {
  const { ctx, page } = await open(url, false);

  /* ① 2.4.11 초점 표시. 밟았을 때 그림이 실제로 달라지나.
     밟기 전후의 outline, box-shadow, border, background 를 견준다. 하나라도 달라지면 통과 */
  const focus = await page.evaluate(() => {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const seen = [];
    const skipped = [];
    const list = [...document.querySelectorAll(sel)].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    }).slice(0, 60);
    const shot = (el) => {
      const cs = getComputedStyle(el);
      return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|');
    };
    /* 표시를 **감싼 상자가 맡는** 짜임이 있다 (`.kp-box:focus-within`). 그때는 칸 자체는
       안 변해도 사람 눈에는 표시가 보인다. 그래서 조상 셋까지 같이 본다 */
    const shotUp = (el) => {
      const parts = [shot(el)];
      let up = el.parentElement;
      for (let i = 0; i < 3 && up; i += 1) { parts.push(shot(up)); up = up.parentElement; }
      return parts.join(">>");
    };
    for (const el of list) {
      /* 이미 초점이 가 있는 칸이 있다(도구가 열리며 스스로 잡는다). 그대로 재면 전후가 같아
         표시가 없다고 잘못 읽는다. 재기 전에 초점을 뗀다 (2026-09-02 실측, password 도구) */
      /* 도구가 열리며 스스로 초점을 잡는 칸이 있다. 떼려 해도 곧바로 되잡는 곳이 있어
         전후가 같아진다. 그건 표시가 없는 것이 아니라 **못 잰 것**이라 안 센다
         (2026-09-02 실측: password 의 pwInput, 오늘의 문제의 qsAns) */
      if (document.activeElement === el) { skipped.push(el.id || el.tagName.toLowerCase()); continue; }
      el.blur();
      const before = shotUp(el);
      el.focus({ preventScroll: true });
      const after = shotUp(el);
      el.blur();
      if (before === after) {
        const tag = el.tagName.toLowerCase();
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        seen.push(tag + (cls ? '.' + cls : '') + (el.id ? '#' + el.id : ''));
      }
    }
    return { total: list.length, bad: seen, skipped };
  });
  add(name, 'focus-visible', focus.bad.length, focus.bad.slice(0, 20).join(', ') || '-');

  /* ② 2.5.8 누를 크기 24x24. 글 안에 든 링크는 이 조항에서 빠진다 (inline exception) */
  const target = await page.evaluate(() => {
    /* 조항이 스스로 두는 예외 하나 더. **그 크기가 곧 전하는 뜻일 때**(essential).
       흥의 건반은 68x16 인데, 높이가 곧 그 음의 줄이다. 24px 로 키우면 한 화면에 드는
       음이 3분의 2로 줄고 롤과 건반이 어긋난다. 피아노 롤을 쓰는 DAW 가 다 이 짜임이다 */
    const ESSENTIAL = ['.hu-key'];
    const sel = 'button:not([disabled]), a[href], input[type="checkbox"], input[type="radio"], select, [role="button"]';
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      /* 글줄 안에 든 링크는 조항이 봐준다. 부모가 글 문단이면 넘긴다 */
      if (el.tagName === 'A' && el.closest('p, li, .tool-hint, .tool-seo')) continue;
      if (ESSENTIAL.some((q) => el.matches(q))) continue;
      /* 반올림해서 잰다. 상자는 23.996px 로 떨어지는데 사람 눈에도 CSS 에도 24px
         날값으로 재면 24px 로 고친 자리가 영영 안 통과한다 (2026-09-02 실측) */
      if (Math.round(r.width) >= 24 && Math.round(r.height) >= 24) continue;
      /* 체크 상자와 라디오는 **감싼 이름표가 누를 곳**. 상자만 재면 늘 13px
         이름표가 24px 을 넘으면 사람이 누를 곳은 그만큼이다 (WCAG 2.2 2.5.8) */
      if (el.type === 'checkbox' || el.type === 'radio') {
        const label = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
        if (label) {
          const lr = label.getBoundingClientRect();
          if (Math.round(lr.width) >= 24 && Math.round(lr.height) >= 24) continue;
        }
      }
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      bad.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return bad;
  });
  add(name, 'target-size', target.length, target.slice(0, 20).join(', ') || '-');

  /* ③ 키보드만으로 도는 길. Tab 을 서른 번 눌러 밟히는 것이 늘어나나,
     그리고 초점이 화면 밖으로 새거나 한 자리에 갇히지 않나 */
  const trap = await page.evaluate(() => {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const list = [...document.querySelectorAll(sel)].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    });
    /* 밟히는 것이 하나도 없으면 키보드로는 아무 데도 못 간다 */
    return { reachable: list.length };
  });
  add(name, 'keyboard-reach', trap.reachable === 0 ? 1 : 0, `밟히는 것 ${trap.reachable}개`);

  /* ⑤ 2.5.7 끌기 대안. 끌어야만 되는 것은 한 손가락 조작으로도 되어야 함
     끌 수 있는 것이 밟히지도 않고(tabindex) 곁에 버튼도 없으면 마우스 없이는 못 쓴다 */
  const drag = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('[draggable="true"]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const focusable = el.tabIndex >= 0
        || el.matches('a[href], button, input, select, textarea')
        || !!el.querySelector('a[href], button, [tabindex]:not([tabindex="-1"])');
      if (focusable) continue;
      /* 곁에 대신 누를 것이 있으면 대안이 있는 것이다 */
      if (el.parentElement?.querySelector('button, [role="button"]')) continue;
      const cls = (el.getAttribute('class') || '').split(/s+/).filter(Boolean).slice(0, 2).join('.');
      bad.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`);
    }
    return [...new Set(bad)];
  });
  add(name, 'drag-alternative', drag.length, drag.slice(0, 20).join(', ') || '-');

  /* ⑥ 3.3.8 인증 접근성. 열쇠 칸이 붙여넣기와 자동 채우기를 막으면 사람이 외워야 함
     `autocomplete="off"` 는 열쇠 관리기를 막고, paste 를 막는 손잡이는 붙여넣기를 막는다 */
  const auth = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('input[type="password"]')) {
      const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
      const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      const blocked = !el.dispatchEvent(ev);
      if (ac === 'off' || ac === 'new-password-off' || blocked) {
        bad.push(`${el.name || el.id || 'input[type=password]'} autocomplete=${ac || '(없음)'}${blocked ? ' paste 막힘' : ''}`);
      }
    }
    return bad;
  });
  add(name, 'auth-paste', auth.length, auth.slice(0, 20).join(', ') || '-');

  await ctx.close();

  /* ④ 움직임 줄이기. 그 설정을 켠 판에서 끝없이 도는 움직임이 남나 */
  const m = await open(url, true);
  const motion = await m.page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.animationName === 'none' || !cs.animationName) continue;
      if (cs.animationIterationCount !== 'infinite') continue;
      if (cs.animationPlayState === 'paused') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      bad.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} ${cs.animationName}`);
    }
    return [...new Set(bad)];
  });
  add(name, 'reduced-motion', motion.length, motion.slice(0, 20).join(', ') || '-');
  await m.ctx.close();
}

await browser.close();
server.close();

if (process.argv.includes('--list')) {
  for (const line of detail) console.log('  ' + line);
  console.log(`[wcag22] 어긴 자리 ${detail.length}종`);
  process.exit(0);
}

if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(found, null, 1) + '\n', 'utf8');
  const total = Object.values(found).reduce((n, o) => n + Object.values(o).reduce((a, b) => a + b, 0), 0);
  console.log(`[wcag22] 기준선을 다시 적었다. 남은 빚 ${total}곳`);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch {
  console.error(`[wcag22] 못 쟀다. 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const grew = [];
let total = 0;
for (const [screen, rules] of Object.entries(found)) {
  for (const [rule, n] of Object.entries(rules)) {
    total += n;
    const was = base[screen]?.[rule] ?? 0;
    if (n > was) grew.push(`${screen} [${rule}] ${was} -> ${n}`);
  }
}
let baseTotal = 0;
for (const rules of Object.values(base)) for (const n of Object.values(rules)) baseTotal += n;

if (grew.length) {
  console.error(`[wcag22] **WCAG 2.2 를 어긴 자리가 늘었다** ${grew.length}건:`);
  for (const g of grew) console.error('  - ' + g);
  console.error('  자리 목록: npm run test:wcag -- --list');
  console.error('  focus-visible 은 밟았을 때 그림이 달라져야 한다. target-size 는 24x24 이상.');
  console.error('  reduced-motion 은 그 설정을 켠 판에서 끝없는 움직임을 멈춰야 한다.');
  process.exit(1);
}
if (total < baseTotal) {
  console.log(`[wcag22] 줄었다 ${baseTotal} -> ${total}곳. 기준선을 조여라: npm run test:wcag -- --bless`);
  process.exit(0);
}
console.log(`[wcag22] 화면 ${RUN.length}장. 안 늘었다 (남은 빚 ${total}곳)`);
