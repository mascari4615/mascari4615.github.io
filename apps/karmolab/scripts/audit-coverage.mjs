/**
 * 안 쓰는 코드 비율 — 진짜 커버리지 (TASK-KL-201 ⑱).
 *
 * 계기판의 「받았는데 안 쓴 코드」는 **위젯 단위 근사**다(그려졌나 안 그려졌나). 그보다 정밀한
 * 「이 줄이 실행됐나」는 브라우저가 페이지에 안 알려 준다 — 개발자 도구 전용 통로(CDP)로만 나온다.
 * 그런데 CI 는 그 통로를 쓸 수 있다. 그래서 여기서 잰다.
 *
 * 무엇을 답하나: 첫 화면을 열었을 때 **받은 CSS·JS 중 몇 %가 한 번도 안 쓰였나**.
 * 실측 예: `css/shell-critical.css` 가 112KB 인데 첫 화면에서 그중 얼마가 쓰이는지 아무도 몰랐다.
 *
 * 판정은 **비율이 아니라 바이트**로 한다 — 비율은 파일을 쪼개면 저절로 좋아진다(고친 게 아닌데
 * 좋아 보인다). 안 쓰는 **양**이 줄어야 회선이 는다.
 *
 * 기준선은 `data/coverage-baseline.json`. 없으면 「통과」가 아니라 **못 돌림**이다.
 * 갱신은 사람이 의도적으로: `--update` (커밋에 남아 리뷰에 걸린다).
 *
 * 사용: node scripts/audit-coverage.mjs [--update]   (npm run audit:coverage)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const BASELINE = path.join(root, 'data/coverage-baseline.json');
const UPDATE = process.argv.includes('--update');

/** 기준선보다 이만큼 늘면 회귀. 커버리지는 회차마다 몇 KB 씩 흔들려서 빠듯하게 잡으면 애먼 빨간불이 난다. */
const GROW_BYTES = 24 * 1024;

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[coverage] 못 돌림 — js/toolbox.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
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
  if (ext === '.html') body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await Promise.all([page.coverage.startJSCoverage(), page.coverage.startCSSCoverage()]);
await page.goto(BASE + '/apps/karmolab/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof Toolbox !== 'undefined', null, { timeout: 30000 }).catch(() => {});
/* 첫 화면이 **자리를 잡을 때까지**. 여기서 일찍 끊으면 늦게 도는 코드가 통째로 「안 쓰임」이 된다
   (마스코트·글꼴·계정은 한가해진 뒤에 온다). */
await page.waitForTimeout(4000);
const [js, css] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);

/** 우리 파일만 본다 — 남의 CDN 이나 인라인 조각을 섞으면 무엇을 고쳐야 할지 흐려진다. */
function summarize(entries, kind) {
  const rows = [];
  for (const entry of entries) {
    if (!entry.url.includes('/apps/karmolab/')) continue;
    const total = entry.text ? entry.text.length : 0;
    if (!total) continue;
    const used = (entry.ranges || []).reduce((sum, r) => sum + (r.end - r.start), 0);
    rows.push({
      file: entry.url.split('/apps/karmolab/')[1].split('?')[0],
      kind,
      total,
      unused: total - used,
    });
  }
  return rows;
}

const rows = [...summarize(css, 'css'), ...summarize(js, 'js')].sort((a, b) => b.unused - a.unused);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
const cssRows = rows.filter((r) => r.kind === 'css');
const jsRows = rows.filter((r) => r.kind === 'js');

/* 한 파일도 못 받아 온 쪽은 **0 이 아니라 못 잼**이다. 0 으로 적으면 「안 쓰는 코드가 없다」로
   읽혀서, 계측이 조용히 죽은 날에도 제일 좋은 성적표가 나온다. 실제로 JS 쪽이 그렇게 나왔다. */
const totals = {
  cssUnused: cssRows.length ? sum(cssRows, 'unused') : null,
  cssTotal: cssRows.length ? sum(cssRows, 'total') : null,
  jsUnused: jsRows.length ? sum(jsRows, 'unused') : null,
  jsTotal: jsRows.length ? sum(jsRows, 'total') : null,
};

await browser.close();
server.close();

const part = (label, unused, total) =>
  unused == null ? `${label} 못 잼` : `${label} 안 쓰임 ${kb(unused)} / ${kb(total)} (${((unused / total) * 100).toFixed(0)}%)`;
console.log(`[coverage] 첫 화면 — ${part('CSS', totals.cssUnused, totals.cssTotal)} · ${part('JS', totals.jsUnused, totals.jsTotal)}`);
if (totals.jsUnused == null) {
  console.log('[coverage]   JS 는 한 파일도 못 받았다 — 「안 쓰는 JS 가 없다」가 아니라 못 잰 것이다.');
}
for (const row of rows.slice(0, 8)) {
  console.log(`[coverage]   ${kb(row.unused).padStart(8)} 안 쓰임 / ${kb(row.total).padStart(8)}  ${row.file}`);
}

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ note: '첫 화면에서 안 쓰인 바이트. audit-coverage.mjs --update 로만 갱신한다.', at: new Date().toISOString(), totals }, null, 1) + '\n',
    'utf8'
  );
  console.log('[coverage] 기준선 갱신');
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.log('[coverage] 기준선 없음 — 이건 통과가 아니라 **못 돌림**이다 (`--update` 로 한 번 박아라)');
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).totals || {};
const fails = [];
for (const key of ['cssUnused', 'jsUnused']) {
  const was = base[key];
  if (was == null || totals[key] == null) continue; // 못 잰 회차는 판정하지 않는다
  if (totals[key] - was >= GROW_BYTES) fails.push(`${key} ${kb(was)} → ${kb(totals[key])} (+${kb(totals[key] - was)})`);
}
if (fails.length) {
  console.error('[coverage] FAIL — 안 쓰는 코드가 늘었다');
  for (const line of fails) console.error('  - ' + line);
  console.error('  의도한 증가면 `npm run audit:coverage -- --update` 로 기준선을 옮겨라(커밋에 남는다).');
  process.exit(1);
}
console.log('[coverage] OK — 기준선 대비 회귀 없음');
