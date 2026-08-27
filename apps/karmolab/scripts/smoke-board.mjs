/**
 * 보드 — 실제로 열리고 그려지는가
 *
 * 이 위젯은 **데스크톱에서만** 진짜 데이터를 읽는다(비공개 memo). 그래서 브라우저에서는
 * 평소 「데스크톱 전용」 안내만 뜨고, 화면이 맞는지 아무도 못 본다. 그 상태로 두면
 * 「빌드는 초록인데 열면 빈 화면」이 조용히 지나간다 — karmograph 가 2026-08-09 에 그렇게
 * 20 커밋을 받았다.
 *
 * 그래서 여기서는 데스크톱 셸을 **흉내 낸다**: `__KARMOLAB_DESKTOP__` 을 켜고
 * `__TAURI__.core.invoke` 가 붙박이 보드 문서를 돌려주게 한다. 진짜 memo 는 안 읽는다 —
 * 검사에 비공개 글자를 쓰면 그 순간 이 레포가 그 글자를 갖게 된다.
 *
 * 사용: node scripts/smoke-board.mjs
 */
import { spawnSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');

/** 옛 묶음 위의 초록은 거짓말이다 — 소스가 더 새것이면 굽고 시작한다. */
async function ensureFresh() {
  if (process.env.URL || process.env.SKIP_BUILD) return;
  const bundle = path.join(app, 'js', 'widgets', 'board', 'board.js');
  const baked = await stat(bundle).then((x) => x.mtimeMs).catch(() => 0);
  const newest = async (dir) => {
    let at = 0;
    for (const it of await readdir(dir, { withFileTypes: true })) {
      const child = path.join(dir, it.name);
      at = Math.max(at, it.isDirectory() ? await newest(child) : (await stat(child)).mtimeMs);
    }
    return at;
  };
  if (await newest(path.join(app, 'src')) <= baked) return;
  console.log('· 소스가 묶음보다 새것이다 — 굽고 시작한다');
  const out = spawnSync(process.execPath, ['build.mjs'], { cwd: app, encoding: 'utf8' });
  if (out.status !== 0) {
    console.error(String(out.stderr || out.stdout).slice(-1200));
    throw new Error('묶음을 못 구웠다 — 옛 코드를 재는 대신 여기서 선다');
  }
}
await ensureFresh();

/* 붙박이 보드 — 진짜 문서와 **모양만** 같다. 앞머리에 등급 정의 표를 일부러 넣었다:
   그 표까지 세면 12행이 17행이 된다(실제로 한 번 그랬다). */
const FIXTURE = `# 스코어보드

| 등급 | 뜻 |
|---|---|
| ✓ | 방어 가능 |
| ◐ | 증거만 있음 |

| # | 넥슨 요구 | 출처 | 내 증거 | 등급 | 다음 한 수 | 기한 |
|---|---|---|---|---|---|---|
| 1 | 요구 하나 | 전 공고 | 증거 하나 | **◐** | 다음 하나 | 2026-09 |
| 2 | 요구 둘 | 일부 | 증거 둘 | **△** | 다음 둘 | 2000-01 |
| 3 | 요구 셋 | 일부 | — | **✗** | 다음 셋 | 2099-12-31 |
| 4 | 요구 넷 | 일부 | — | **?** | 다음 넷 | 미정 |
`;

const frozen = process.env.URL ? null : await serveRepo();
const base = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;
const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1400, height: 900 } });

/* 창이 열리기 **전에** 데스크톱 셸을 심는다 — 위젯이 뜨자마자 isDesktop() 을 보기 때문이다. */
await context.addInitScript(([md]) => {
  window.__KARMOLAB_DESKTOP__ = true;
  window.__TAURI__ = {
    core: {
      invoke: async (cmd) => {
        if (cmd !== 'board_read') throw new Error(`모르는 명령: ${cmd}`);
        return [{ key: 'career-scoreboard', relPath: 'career/goal/scoreboard.md', text: md, modifiedMs: Date.UTC(2026, 7, 28), error: null }];
      }
    }
  };
}, [FIXTURE]);

const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/CORS|ERR_FAILED|Failed to load resource|fetching the script/i.test(m.text())) return;
  errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${base}#board`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.board-wrap', { timeout: 30000 });
await page.waitForSelector('.board-table tbody tr', { timeout: 30000 });

const seen = await page.evaluate(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const rows = q('.board-table tbody tr');
  return {
    dday: q('.board-dday .num').map((e) => e.textContent.trim()),
    grades: rows.map((r) => r.querySelector('.board-g').textContent.trim()),
    dues: rows.map((r) => r.querySelector('.board-due').textContent.trim()),
    over: q('.board-due.over').length,
    firstNeed: rows[0]?.querySelector('td:nth-child(2) b')?.textContent.trim() ?? '',
    foot: document.querySelector('.board-foot')?.textContent ?? '',
    /* 넘치면 굴러야 한다 — 패널은 스스로 안 구르므로 이 값이 'auto' 가 아니면 아래가 잘린다. */
    overflowY: getComputedStyle(document.querySelector('.board-wrap')).overflowY
  };
});

const fail = [];
const eq = (name, got, want) => { if (got !== want) fail.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

eq('행 수', seen.grades.length, 4);                    // 등급 정의 표(2행)를 안 먹었나
eq('지난 기한 표시', seen.over, 1);                     // 2000-01 하나만 빨강
eq('맨 위 = 가장 급한 것', seen.firstNeed, '요구 둘');   // 마감순 정렬
if (!seen.dues.at(-1).includes('미정')) fail.push(`날짜 없는 것이 맨 아래가 아니다: ${seen.dues.at(-1)}`);
if (seen.dday.length !== 2 || !seen.dday.every((d) => /^D-\d+$/.test(d))) fail.push(`D-Day 가 안 나온다: ${JSON.stringify(seen.dday)}`);
if (!seen.foot.includes('career/goal/scoreboard.md')) fail.push('읽은 경로가 안 보인다');
if (seen.overflowY !== 'auto') fail.push(`넘쳐도 안 구른다: overflow-y=${seen.overflowY}`);
if (errors.length) fail.push(`콘솔 빨강 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);

await browser.close();
if (frozen) await frozen.close();

if (fail.length) {
  console.error('[board] 빨강\n  - ' + fail.join('\n  - '));
  process.exit(1);
}
console.log(`[board] OK — 행 ${seen.grades.length} · 등급 ${seen.grades.join('')} · D-Day ${seen.dday.join(' ')} · 지난 것 ${seen.over}`);
