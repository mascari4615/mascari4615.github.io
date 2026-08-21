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
const scriptCeiling = 5;
const inlineLimit = Number(process.env.SHELL_INLINE_LIMIT || 0);

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

const problems = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  /* ★ **자물쇠가 기능을 조용히 죽이는지 본다** (2026-08-17). 첫 화면에 `script-src` 를 걸었는데,
     바깥 스크립트 하나를 안 적어 두면 그 기능만 소리 없이 사라진다 — 실제로 방문 수 세는
     스크립트가 그렇게 막혔고, **손으로 열어 보고서야** 알았다. 그건 다음 사람에게 안 남는다.
     그래서 여기서 센다: 막히는 게 있으면 빨강 — **미리읽기 규칙도 예외가 아니다.**
     ★ 예전엔 미리읽기 규칙만 빼고 셌다(「아는 것」). 그 한 줄 때문에 이 검사가 초록인 채로
     배포가 두 판 섰다 (2026-08-17 실측: f5767691·fbf9e8cd — `smoke-lang-switch` 가 뒤늦게 잡았다).
     지금은 그 규칙이 막힐 이유가 없다: `script-src` 에 지문을 안 적으면 크롬이 키워드를 받아 준다.
     막혔다면 누가 지문을 적었다는 뜻이고, 그건 **미리읽기가 죽었다**는 뜻이다 — 여기서 잡아야 한다. */
  const blocked = [];
  page.on('console', (m) => {
    const t = m.text();
    if (!/Content Security Policy|Refused to (execute|load)/i.test(t)) return;
    blocked.push(t.slice(0, 140));
  });
  await page.goto(`${BASE}/apps/karmolab/`, { waitUntil: 'networkidle', timeout: 60000 });
  /* `Toolbox` 는 **맨이름 전역**이다(window 에는 안 달려 있다) — 그래서 window.Toolbox 로 기다리면
     영영 안 온다(붙이면서 20초를 그렇게 날렸다). */
  await page.waitForFunction(
    () => { try { return typeof Toolbox === 'object' && typeof Toolbox.switchPage === 'function'; } catch { return false; } },
    null, { timeout: 30000 }
  );

  const mark = await page.$$eval('[data-goto]', (els) => els.map((e) => e.dataset.goto));
  if (mark.length === 0) problems.push('data-goto 자리가 하나도 없다 — 위임이 받을 것이 없다');

  /* 첫 화면 큰 단추(favorites·arcade·docs)는 **자바스크립트가 그린 뒤** 생긴다 —
     붙박이 표시와 같은 위임으로 먹는지 따로 본다(2026-08-17 에 그 넷을 옮겼다). */
  for (const place of ['community', 'plaza', 'linktree', 'arcade', 'favorites']) {
    if (!mark.includes(place)) continue;
    const result = await page.evaluate((g) => {
      Toolbox.switchPage('home');
      document.querySelector(`[data-goto="${g}"]`).click();
      return {
        hash: location.hash,
        visible: [...document.querySelectorAll('[id^="page-"]')]
          .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id),
      };
    }, place);
    if (result.hash !== `#${place}` || !result.보임.includes(`page-${place}`)) {
      problems.push(`${place} 로 안 옮겨진다 — 주소 ${result.hash} · 보이는 장 ${result.보임.join(',') || '없음'}`);
    }
  }

  for (const t of blocked) problems.push('자물쇠가 막았다 — ' + t);

  const remainingList = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter((e) => [...e.attributes].some((a) => /^on[a-z]+$/.test(a.name)))
    .map((e) => e.tagName.toLowerCase() + '#' + (e.id || '') + '.' + (e.className || '').toString().slice(0, 24)
      + ' [' + [...e.attributes].filter((a) => /^on[a-z]+$/.test(a.name)).map((a) => a.name).join(',') + ']'));
  const remaining = remainingList.length;
  if (process.env.SHELL_INLINE_LIST) console.log('[shell-nav] 남은 자리:', JSON.stringify(remainingList));
  console.log(`[shell-nav] 표시 ${mark.length}개 · 남은 인라인 손잡이 ${remaining}개 (한계 ${inlineLimit})`);
  /* ★ **손잡이만 세면 반만 본 것이다** (2026-08-17). `script-src` 를 걸려면 인라인 손잡이(on…)
     뿐 아니라 **인라인 <script> 도 0** 이어야 한다 — 지문으로 허락하는 길은 막혀 있다(지문을
     하나라도 적으면 크롬이 `'inline-speculation-rules'` 를 무시해 미리읽기가 죽는다, 실험으로 확인).
     오늘 12 → 5 로 줄였는데, 지키는 자가 없으면 내일 누가 하나 더 넣어도 아무도 모른다.
     지금 수를 천장으로 박는다 — 줄이는 쪽은 언제나 환영이고, 줄면 천장을 조이라고 말한다. */
  const shellText = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
  const inlineScripts = [...shellText.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => {
      const t = (/type\s*=\s*"([^"]+)"/.exec(m[1] || '') || [])[1] || '';
      return !t || t === 'text/javascript' || t === 'module';
    }).length;
  console.log(`[shell-nav] 인라인 <script> ${inlineScripts}개 (천장 ${scriptCeiling})`);
  if (inlineScripts > scriptCeiling) {
    problems.push(`인라인 <script> 가 늘었다 ${inlineScripts} > ${scriptCeiling} — script-src 가 그만큼 멀어진다`);
  } else if (inlineScripts < scriptCeiling) {
    console.log(`[shell-nav] ${scriptCeiling - inlineScripts}개 줄었다 — 이 파일의 \`스크립트천장\` 을 ${inlineScripts} 로 조여라.`);
  }

  if (remaining > inlineLimit) {
    problems.push(`인라인 손잡이가 늘었다 ${remaining} > ${inlineLimit} — script-src 가 그만큼 멀어진다`);
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  for (const m of problems) console.error('  - ' + m);
  console.error('[shell-nav] ❌ 껍데기 자리 이동이 성하지 않다.');
  process.exit(1);
}
console.log('[shell-nav] OK — 표시만으로 자리가 옮겨지고, 인라인 손잡이가 안 늘었다.');
