/**
 * 「여기도 있어요」가 **제자리에 있는지** 본다 (TASK-KL-207 곁가지).
 *
 * 왜 있나: 도구마다 레이아웃이 다른데(`full` / `form` / `wide`), 화면 맨 아래에 셸이 붙이는
 * 이 안내는 그중 하나만 보고 만들어졌다. `layout-full` 은 **스크롤을 끈 채** 패널을 화면
 * 높이에 가두므로, 거기서는 이 안내가
 *   ① 화면 가장자리에 딱 붙어 잘린 것처럼 보이거나 (그쪽은 여백이 0 이다)
 *   ② 창이 조금만 짧아지면 화면 밖으로 밀려나 **영영 안 보이거나** (스크롤이 없다)
 *   ③ 도구 몸통과 겹친다
 * 셋 다 실제로 났다. 도구마다 손으로 피해 다니면(ORBITA 는 `full` 을 포기하고 `form` 으로
 * 내려갔다) 다음 도구에서 또 난다 — 그래서 재는 자리를 하나 만든다.
 *
 * 사용: node scripts/audit-tool-footer.mjs [도구id …]   (안 적으면 layout:'full' 전부)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'
};

/** 인자가 없으면 `layout: 'full'` 인 도구를 메타에서 뽑는다 — 목록을 손으로 안 적는다. */
function fullLayoutIds() {
  const body = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
  const ids = [];
  for (const block of body.split(/\n\s*\{\s*\n/)) {
    if (!/layout:\s*'full'/.test(block)) continue;
    /* **데스크톱 앱 전용은 브라우저에 아예 없다** — 「이 기계에서 안 뜬다」가 아니라 「여기선
       원래 없는 것」이다. 그런데 목록에 넣어 두면 판이 뜨기를 15초씩 기다렸다가 「못 돌림」으로
       적었다. 다섯 개 × 두 높이 × 15초 = **150초**, 이 검사에 든 시간(161초)의 거의 전부였다.
       없는 것을 기다리는 시간이 배포 전체를 늦추고 있었다 (2026-08-09). */
    if (/desktopOnly:\s*true/.test(block)) continue;
    /* **묶음의 탭도 자기 판이 없다** — `bundle: 'image'` 인 항목은 주소만 남기고 그 묶음 위젯의
       탭으로 간다(`hidden: true`). 그 판은 묶음 주인 id 로 이미 잰다. 여기 넣어 두면 역시
       15초씩 기다렸다가 「못 돌림」이다 (실측 imagegen·imageedit 넷 = 60초). */
    if (/bundle:\s*'/.test(block)) continue;
    const m = /id:\s*'([^']+)'/.exec(block);
    if (m) ids.push(m[1]);
  }
  return ids;
}

const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = ids.length ? ids : fullLayoutIds();

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[audit-tool-footer] 못 돌림 — js/toolbox.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

/* 두 창 높이로 본다. 넉넉한 창에서만 재면 ②(짧으면 사라짐)를 영영 못 잡는다. */
const HEIGHTS = [900, 620];
const rows = [];
let bad = 0;
let skipped = 0;

/* **도구 하나당 한 번만 연다** (2026-08-09).
 *
 * 예전에는 창 높이마다 새로 열었다 — 도구 서른 개 × 두 높이 = 예순 번 부팅이다. 그런데 여기서
 * 재는 것은 전부 **자리**(CSS 가 창 높이를 보고 정하는 값)라, 창만 바꿔도 그대로 다시 잡힌다.
 * 새로 열어서 얻는 것은 없고 배포만 늦어진다 — 이 검사 하나가 빌드 10분 중 3분이었다.
 * 대신 창을 바꾼 뒤 **자리가 멎을 때까지** 기다린다(고정 대기를 지우면서 정직은 지킨다). */
for (const id of targets) {
  let opened = false;
  for (const H of HEIGHTS) {
    await page.setViewportSize({ width: 1280, height: H });
    if (opened) {
      /* 이미 열려 있다 — 창만 바뀌었다. 다시 안 연다. */
    } else {
      await page.goto(`${BASE}/apps/karmolab/index.html#${id}`, { waitUntil: 'load', timeout: 30000 });
      opened = true;
    }
    /* **그 도구의 판**이 뜰 때까지 기다린다. 푸터로 기다리면 앞 도구의 잔상에 걸려
       엉뚱한 판정이 난다(planner 가 창 높이에 따라 다르게 나왔다 — 그게 그 증상이었다). */
    try {
      await page.waitForSelector(`#page-${id}.active`, { timeout: 15000 });
    } catch {
      /* 이 기계에서 안 뜨는 도구가 있다(무거운 것·바깥 자격이 필요한 것).
         그건 **제품 고장이 아니라 「못 돌림」**이다 — 실패로 세면 진짜 고장이 그 속에 묻힌다. */
      rows.push([id, H, '—', '—', '—', '못 돌림 — 이 기계에서 안 뜬다']);
      skipped++;
      continue;
    }
    /* 고정 900ms 대신 **멎을 때까지**. 두 번 이어서 잰 자리가 같으면 그 자리는 굳은 것이다.
       느린 기계에서는 더 기다리고 빠른 기계에서는 안 기다린다 — 어느 쪽도 거짓말을 안 한다. */
    await page
      .waitForFunction(
        () => {
          const f = document.querySelector('.tool-page.active .tool-page-next');
          const w = window;
          if (!f) return true; // 푸터가 없는 화면 — 기다릴 것이 없다
          const now = Math.round(f.getBoundingClientRect().top);
          const same = w.__footPrev === now;
          w.__footPrev = now;
          return same;
        },
        null,
        { timeout: 5000, polling: 120 }
      )
      .catch(() => {});
    await page.evaluate(() => { delete window.__footPrev; });
    const m = await page.evaluate(() => {
      /* 「보이는 도구」를 잡아야 한다 — `.active` 가 여럿일 수 있다(앞서 연 도구가 남는다).
         푸터를 먼저 찾고 그 조상으로 거슬러 올라가면 짝이 어긋날 일이 없다. */
      const foot = document.querySelector('.tool-page.active .tool-page-next');
      if (!foot) return null; // 시스템 화면에는 푸터를 안 붙인다 — 그건 정상이다
      const pageEl = foot.closest('.tool-page');
      const panel = pageEl.querySelector('.tab-panel.active') || pageEl.querySelector('.tab-panel');
      const pr = panel?.getBoundingClientRect();
      const fr = foot.getBoundingClientRect();
      /* **글자**가 가장자리에서 얼마나 떨어졌나를 재야 한다. 바깥 상자의 왼쪽을 재면
         안쪽 여백(padding)을 아무리 줘도 값이 안 변한다 — 고쳐 놓고도 계속 빨갛다(그랬다). */
      const head = foot.querySelector('.tool-page-next-head');
      const links = foot.querySelector('.tool-page-next-links');
      const inkLeft = Math.min(
        ...[head, links].filter(Boolean).map((el) => Math.round(el.getBoundingClientRect().left))
      );
      const inkRight = Math.min(
        ...[head, links].filter(Boolean).map((el) => Math.round(window.innerWidth - el.getBoundingClientRect().right))
      );
      return {
        layout: [...pageEl.classList].find((c) => c.startsWith('layout-')) || '—',
        panelBottom: pr ? Math.round(pr.bottom) : null,
        footTop: Math.round(fr.top),
        footLeft: inkLeft,
        footRight: inkRight,
        visible: fr.top < window.innerHeight - 4 && fr.bottom > 0,
        winH: window.innerHeight
      };
    });

    if (!m) {
      // 시스템 화면(계좌·설정 등)에는 일부러 안 붙인다 — 없는 게 맞다
      rows.push([id, H, '—', '—', '—', '푸터 없음(시스템 화면)']);
      continue;
    }
    const flush = m.footLeft < 8 || m.footRight < 8;
    const overlap = m.panelBottom !== null && m.footTop < m.panelBottom - 1;
    const verdict = overlap
      ? `겹침 (${m.panelBottom - m.footTop}px)`
      : !m.visible
        ? '화면 밖 — 스크롤이 없어 영영 못 본다'
        : flush
          ? `가장자리에 붙음 (왼 ${m.footLeft} · 오른 ${m.footRight})`
          : 'OK';
    if (verdict !== 'OK') bad++;
    rows.push([id, H, m.layout, m.footLeft, m.visible ? 'Y' : 'N', verdict]);
  }
}

await browser.close();
server.close();

const head = ['도구', '창', '레이아웃', '글자여백', '보임', '판정'];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
console.log(line(head));
for (const r of rows) console.log(line(r));

if (bad) {
  console.error(`\n[audit-tool-footer] ${bad}건 — 「여기도 있어요」가 제자리에 없다`);
  process.exit(1);
}
console.log('\n[audit-tool-footer] OK');
