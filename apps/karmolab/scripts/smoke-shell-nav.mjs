/**
 * 껍데기의 **자리 이동이 글자로 박은 손잡이 없이** 되나 (2026-08-17).
 *
 * 왜: CSP 에 `script-src` 를 걸려면 인라인 손잡이가 0 이어야 한다. 첫 화면에
 * `onclick="Toolbox.switchPage('community')"` 같은 것이 여섯 개 박혀 있어 그 자물쇠를 못 걸고
 * 있었다(거울 「보안」이 매 판 그 수를 적어 왔다). 표시(`data-goto`) + 위임 한 자리로 바꿨는데,
 * 그러면 **정말로 옮겨지나**를 볼 길이 있어야 한다 — 없으면 「인라인은 줄었는데 단추가 죽은」
 * 상태를 아무도 모른다.
 *
 * 재는 것 ① 표시 자리가 있나 ② 눌러서 화면이 실제로 바뀌나 ③ 남은 인라인 손잡이 수(래칫).
 * 나가는 값: 0 = 통과 / 1 = 빨강 / 2 = 못 돌림(빌드 전·브라우저 없음).
 *
 * ★ Jekyll 앞머리를 떼고 내야 한다 — 안 떼면 `<head>` 가 깨져 껍데기가 아예 안 뜨고,
 *   그러면 「단추가 죽었다」로 잘못 읽는다(붙이면서 실제로 한 번 그랬다).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFrontMatter } from './lib/serve-html.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));

/** 지금 남아 있는 인라인 손잡이 수 — 0 이 되면 `script-src` 를 걸 수 있다.
 *  실측(2026-08-17): 14 → 9(붙박이 여섯) → 5(스타일 넉 장) → **0**(첫 화면 큰 단추·빵부스러기 다섯).
 *  이제 0 이 기준이다 — 하나라도 늘면 빨강이고, 그때 `script-src` 가 다시 멀어진다. */
const 인라인한계 = Number(process.env.SHELL_INLINE_LIMIT || 0);

if (!fs.existsSync(path.join(appRoot, 'js/toolbox.js'))) {
  console.log('[shell-nav] 못 돌림 — 아직 안 구웠다 (`node build.mjs` 뒤에 돌려라). 이건 통과가 아니다.');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('[shell-nav] 못 돌림 — 이 기계에 브라우저가 없다. 이건 통과가 아니다.');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.gif': 'image/gif',
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
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const 문제 = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  /* ★ **자물쇠가 기능을 조용히 죽이는지 본다** (2026-08-17). 첫 화면에 `script-src` 를 걸었는데,
     바깥 스크립트 하나를 안 적어 두면 그 기능만 소리 없이 사라진다 — 실제로 방문 수 세는
     스크립트가 그렇게 막혔고, **손으로 열어 보고서야** 알았다. 그건 다음 사람에게 안 남는다.
     그래서 여기서 센다: 아는 것 말고 새로 막히는 게 있으면 빨강.
     아는 것 = 미리읽기 규칙(속도 도우미. 크롬이 키워드를 안 받아 준다 — `gen-csp-shell.mjs` 머리말). */
  const 막힌것 = [];
  page.on('console', (m) => {
    const t = m.text();
    if (!/Content Security Policy|Refused to (execute|load)/i.test(t)) return;
    if (/speculation rules/i.test(t)) return; // 아는 것
    막힌것.push(t.slice(0, 140));
  });
  await page.goto(`${BASE}/apps/karmolab/`, { waitUntil: 'networkidle', timeout: 60000 });
  /* `Toolbox` 는 **맨이름 전역**이다(window 에는 안 달려 있다) — 그래서 window.Toolbox 로 기다리면
     영영 안 온다(붙이면서 20초를 그렇게 날렸다). */
  await page.waitForFunction(
    () => { try { return typeof Toolbox === 'object' && typeof Toolbox.switchPage === 'function'; } catch { return false; } },
    null, { timeout: 30000 }
  );

  const 표시 = await page.$$eval('[data-goto]', (els) => els.map((e) => e.dataset.goto));
  if (표시.length === 0) 문제.push('data-goto 자리가 하나도 없다 — 위임이 받을 것이 없다');

  /* 첫 화면 큰 단추(favorites·arcade·docs)는 **자바스크립트가 그린 뒤** 생긴다 —
     붙박이 표시와 같은 위임으로 먹는지 따로 본다(2026-08-17 에 그 넷을 옮겼다). */
  for (const 곳 of ['community', 'plaza', 'linktree', 'arcade', 'favorites']) {
    if (!표시.includes(곳)) continue;
    const 결과 = await page.evaluate((g) => {
      Toolbox.switchPage('home');
      document.querySelector(`[data-goto="${g}"]`).click();
      return {
        hash: location.hash,
        보임: [...document.querySelectorAll('[id^="page-"]')]
          .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id),
      };
    }, 곳);
    if (결과.hash !== `#${곳}` || !결과.보임.includes(`page-${곳}`)) {
      문제.push(`${곳} 로 안 옮겨진다 — 주소 ${결과.hash} · 보이는 장 ${결과.보임.join(',') || '없음'}`);
    }
  }

  for (const t of 막힌것) 문제.push('자물쇠가 막았다 — ' + t);

  const 남은목록 = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter((e) => [...e.attributes].some((a) => /^on[a-z]+$/.test(a.name)))
    .map((e) => e.tagName.toLowerCase() + '#' + (e.id || '') + '.' + (e.className || '').toString().slice(0, 24)
      + ' [' + [...e.attributes].filter((a) => /^on[a-z]+$/.test(a.name)).map((a) => a.name).join(',') + ']'));
  const 남은 = 남은목록.length;
  if (process.env.SHELL_INLINE_LIST) console.log('[shell-nav] 남은 자리:', JSON.stringify(남은목록));
  console.log(`[shell-nav] 표시 ${표시.length}개 · 남은 인라인 손잡이 ${남은}개 (한계 ${인라인한계})`);
  if (남은 > 인라인한계) {
    문제.push(`인라인 손잡이가 늘었다 ${남은} > ${인라인한계} — script-src 가 그만큼 멀어진다`);
  }
} finally {
  await browser.close();
  server.close();
}

if (문제.length) {
  for (const m of 문제) console.error('  - ' + m);
  console.error('[shell-nav] ❌ 껍데기 자리 이동이 성하지 않다.');
  process.exit(1);
}
console.log('[shell-nav] OK — 표시만으로 자리가 옮겨지고, 인라인 손잡이가 안 늘었다.');
