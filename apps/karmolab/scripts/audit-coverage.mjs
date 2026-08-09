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

/* 화면 **폭 둘**에서 잰다. 폭이 다르면 쓰이는 규칙이 달라진다 — 데스크톱에서만 재면
   `RESPONSIVE` 구역 25KB 가 통째로 「낭비」로 보이지만, 그건 폰에서 쓰이는 것이다.
   한쪽에서만 재고 「안 쓰인다」고 적으면 지도가 사람을 엉뚱한 데로 보낸다. */
const VIEWPORTS = [
  { name: '데스크톱 1280', width: 1280, height: 800 },
  { name: '폰 390', width: 390, height: 844 },
];

const browser = await chromium.launch();

async function collect(viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await Promise.all([page.coverage.startJSCoverage(), page.coverage.startCSSCoverage()]);
  await page.goto(BASE + '/apps/karmolab/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof Toolbox !== 'undefined', null, { timeout: 30000 }).catch(() => {});
  /* 첫 화면이 **자리를 잡을 때까지**. 여기서 일찍 끊으면 늦게 도는 코드가 통째로 「안 쓰임」이 된다
     (마스코트·글꼴·계정은 한가해진 뒤에 온다). */
  await page.waitForTimeout(4000);
  const [jsOne, cssOne] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);
  await page.close();
  return { js: jsOne, css: cssOne };
}

const perView = [];
for (const viewport of VIEWPORTS) perView.push({ viewport, ...(await collect(viewport)) });
const { js, css } = perView[0]; // 기준선·판정은 데스크톱 판으로 (한 벌만 잠근다)

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

/**
 * 셸 스타일의 **구역별** 쓰임 (TASK-KL-201 ⑲).
 *
 * 파일 단위로 「96KB 중 74KB 안 쓰임」까지는 알겠는데, 그걸로는 무엇을 뒤로 뺄지 못 고른다.
 * `css/toolbox.css` 는 구역 배너(`═══ 제목 ═══`)로 나뉘어 있고 `split-css.mjs` 가 그 배너를
 * 기준으로 앞뒤를 가른다 — **같은 경계**로 쓰임을 세면 그게 곧 다음 후보 지도가 된다.
 *
 * ⚠ 여기 숫자만 보고 뒤로 빼면 안 된다. 「쓰임 0%」인데 자리를 잡는 데 관여하는 구역이 있다
 * (실측: 옆줄 차림을 빼니 목록 화면 밀림이 0.011 → 0.636). `split-css.mjs` 머리말 참고 —
 * 후보를 옮길 때는 `npm run measure:speed` 로 밀림을 전후 비교하는 것이 규약이다.
 */
function sectionUsage(entries) {
  const entry = entries.find((e) => e.url.includes('/css/shell-critical.css'));
  if (!entry || !entry.text) return null; // 못 받았으면 「0」이 아니라 없음
  const text = entry.text;
  const lines = text.split(String.fromCharCode(10));
  const marks = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\/\*\s*═+/.test(line)) {
      /* 제목은 배너 줄에 있기도 하고 **다음 줄**에 있기도 하다 — `split-css.mjs` 와 같은 규칙을
         쓴다. 여기서 규칙이 갈라지면 구역 이름이 서로 어긋나 지도가 쓸모없어진다. */
      const inline = line.replace(/^\/\*\s*═+\s*/, '').replace(/\s*═+.*$/, '').trim();
      marks.push({ at: offset, title: inline || (lines[i + 1] || '').trim() || '(제목 없음)' });
    }
    offset += line.length + 1;
  }
  if (!marks.length) return null;
  const used = new Array(text.length).fill(false);
  for (const range of entry.ranges || []) for (let i = range.start; i < range.end && i < used.length; i++) used[i] = true;
  return marks
    .map((mark, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
      let unused = 0;
      for (let j = mark.at; j < end; j++) if (!used[j]) unused += 1;
      return { title: mark.title, total: end - mark.at, unused };
    })
    .sort((a, b) => b.unused - a.unused);
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
/* 지도는 **폭을 나란히** 놓는다. 「양쪽 다 안 쓰임」인 구역만이 진짜 후보다 —
   한쪽에서만 안 쓰이는 것은 그 폭에서 쓰는 것이지 낭비가 아니다. */
const maps = perView.map((v) => ({ name: v.viewport.name, rows: sectionUsage(v.css) }));
/* 지도는 이 블록 밖에서도 쓴다(기준선 파일에 실어 계기판이 읽는다) — 못 쟀으면 `null` 이다. */
let merged = null;
if (maps.every((m) => m.rows)) {
  const byTitle = new Map();
  for (const map of maps) {
    for (const row of map.rows) {
      const acc = byTitle.get(row.title) || { title: row.title, total: row.total, per: {} };
      acc.per[map.name] = row.unused;
      byTitle.set(row.title, acc);
    }
  }
  const names = maps.map((m) => m.name);
  merged = Array.from(byTitle.values())
    .map((row) => ({ ...row, bothUnused: Math.min(...names.map((n) => row.per[n] ?? 0)) }))
    .sort((a, b) => b.bothUnused - a.bothUnused);
  console.log(`[coverage] 첫 그림을 막는 shell-critical.css — 구역별 안 쓰임 (${names.join(' / ')})`);
  for (const row of merged.slice(0, 8)) {
    const cells = names.map((n) => kb(row.per[n] ?? 0).padStart(8)).join(' /');
    console.log(`[coverage]   ${cells} / 전체 ${kb(row.total).padStart(8)}  ${row.title}`);
  }
  console.log('[coverage]   양쪽 폭에서 다 안 쓰이는 것만 후보다 — 한쪽만이면 그 폭에서 쓰는 것이다.');
  console.log('[coverage]   ⚠ 이 숫자만 보고 빼지 마라 — 쓰임 0% 인데 자리를 잡는 구역이 있다(split-css.mjs 머리말).');
} else {
  console.log('[coverage] 구역별 쓰임은 못 쟀다 — shell-critical.css 를 못 받았거나 구역 배너가 없다.');
}

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  /* 지도를 **파일로도 남긴다** — CI 로그는 흘러가 버려서 사람이 볼 수 없다. 계기판(`#perf`)이
     이 파일을 읽어 화면에 그린다. 로그에만 있는 사실은 없는 것과 비슷하다. */
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        note: '첫 화면에서 안 쓰인 바이트. audit-coverage.mjs --update 로만 갱신한다.',
        at: new Date().toISOString(),
        totals,
        files: rows.slice(0, 10),
        sections: merged ? merged.slice(0, 12) : null,
        viewports: VIEWPORTS.map((v) => v.name),
      },
      null,
      1
    ) + '\n',
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
