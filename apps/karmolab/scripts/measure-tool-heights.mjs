/**
 * 도구가 들어갈 자리의 높이를 미리 재 둔다 (TASK-KL-089)
 *
 * 상세 페이지는 도구를 자바스크립트로 그린다. 그 전까지 도구 자리는 높이가 0 이라,
 * 도구가 뜨는 순간 아래 설명글이 통째로 아래로 밀린다. 읽던 줄이 달아나고, 누르려던
 * 버튼이 손가락 밑에서 사라진다. 검색 순위에도 쓰이는 값인데 실측 0.86 이었다(나쁨 기준 0.25).
 *
 * 높이는 도구마다 204px ~ 8254px 로 제각각이라 한 값으로 못 막는다. 그래서 여기서
 * **도구별로 실제 높이를 재어 기록**해 두고, 페이지를 찍을 때 그만큼 자리를 비워 둔다.
 *
 * 좁은 화면과 넓은 화면에서 따로 잰다 — 같은 도구도 폭에 따라 높이가 다르다.
 *
 * 기록은 도구 내용이 바뀌면 조용히 낡는다. 낡은 채로 두면 비워 둔 자리와 실제 높이가 어긋나
 * 다시 밀리기 시작하는데, 화면은 멀쩡해 보인다. `--check` 가 그것을 잡는다.
 *
 * 사용: node scripts/measure-tool-heights.mjs            (기록에 없는 것만)
 *       node scripts/measure-tool-heights.mjs --force    (전부 다시)
 *       node scripts/measure-tool-heights.mjs --check    (안 고치고 어긋난 것만 알린다)
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/measure-tool-heights.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* 재는 대상은 **실제 사이트와 같은 HTML** 이어야 한다. 평소 로컬 서버는 저장소 파일을 그대로
 * 주므로 맨 위 설정 몇 줄이 글자로 떠서 화면이 밀리고, 그 상태로 잰 높이는 실제와 최대 80px
 * 어긋났다(실측). `npm run serve:gzip`(8801) 은 그 줄을 걷어내고 압축까지 해 준다 — 그쪽을 기본으로 쓴다. */
const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';
const outPath = path.join(root, 'data/tool-heights.json');
const force = process.argv.includes('--force');
const check = process.argv.includes('--check');
// 글꼴이 조금 달라져도 몇 px 은 흔들린다. 사람 눈에 안 띄는 그 정도는 넘긴다.
const TOLERANCE = 24;

const WIDTHS = { narrow: 390, wide: 1280 };
const LANES = 4;

const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

// 서버가 아예 안 떠 있으면 fetch 자체가 던진다 — 그냥 두면 스택만 쏟아지고 왜인지가 안 보인다.
const hubRes = await fetch(`${BASE}/karmolab/t/`).catch((e) => ({ ok: false, status: `연결 실패(${e.code || e.message})` }));
if (!hubRes.ok) {
  console.error(
    `[measure-heights] 목록을 못 받는다 (${hubRes.status}) — ${BASE}\n` +
      '  → 다른 창에서 `npm run serve:gzip` 을 먼저 띄워라 (실제 사이트와 같은 화면으로 재려면 이 서버여야 한다).'
  );
  process.exit(1);
}
const ids = [...new Set([...(await hubRes.text()).matchAll(/\/karmolab\/t\/([a-z0-9-]+)\//g)].map((m) => m[1]))];
const todo = force || check ? ids : ids.filter((id) => !prev[id]);

if (!todo.length) {
  console.log(`[measure-heights] 최신 상태 — ${ids.length}개 모두 기록에 있다 (다시 재려면 --force)`);
  process.exit(0);
}

const browser = await chromium.launch();
const out = { ...prev };
const failed = [];

/** 한 도구를 두 폭에서 열고 도구 자리의 높이를 잰다. */
async function measure(ctx, id, key) {
  const page = await ctx.newPage();
  try {
    // 페이지에는 이미 「이만큼 비워 둬라」가 박혀 있고 그것이 **최소** 높이다. 끄지 않고 재면
    // 실제가 더 작아도 박아 둔 값이 그대로 나와, 한 번 커진 기록은 영영 안 줄어든다.
    await page.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '#tool-pages{min-height:0!important}';
        document.head.appendChild(s);
      });
    });
    await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'networkidle', timeout: 30000 });
    // 글꼴이 늦게 오면 높이가 달라진다 — 다 온 뒤에 잰다.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const h = await page.evaluate(() => Math.round(document.getElementById('tool-pages')?.getBoundingClientRect().height || 0));
    if (!h) throw new Error('도구 자리를 못 찾았다');
    out[id] = { ...(out[id] || {}), [key]: h };
  } catch (e) {
    failed.push(`${id}(${key}): ${String(e.message).slice(0, 50)}`);
  }
  await page.close();
}

for (const [key, width] of Object.entries(WIDTHS)) {
  const lanes = Array.from({ length: LANES }, (_, i) => todo.filter((_, j) => j % LANES === i));
  await Promise.all(
    lanes.map(async (list) => {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      for (const id of list) await measure(ctx, id, key);
      await ctx.close();
    })
  );
  process.stdout.write(`${width}px 잼 `);
}
process.stdout.write('\n');
await browser.close();

if (failed.length) {
  console.error(`[measure-heights] 못 잰 것 ${failed.length}건`);
  failed.slice(0, 8).forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

/* --check = 안 고치고 알리기만. 기록이 낡으면 비워 둔 자리가 실제와 어긋나 다시 밀린다. */
if (check) {
  const off = [];
  for (const id of todo) {
    for (const key of Object.keys(WIDTHS)) {
      const was = prev[id]?.[key];
      const now = out[id]?.[key];
      if (was == null) off.push(`${id}(${key}): 기록에 없다`);
      else if (Math.abs(now - was) > TOLERANCE) off.push(`${id}(${key}): 기록 ${was}px 인데 실제 ${now}px`);
    }
  }
  if (off.length) {
    console.error(`[measure-heights] 자리 높이 기록이 낡았다 ${off.length}건 — 도구가 뜰 때 아래 글이 밀린다`);
    off.slice(0, 12).forEach((o) => console.error('  - ' + o));
    console.error('  → `npm run measure:heights -- --force` 로 다시 재고 페이지를 다시 찍어라');
    process.exit(1);
  }
  console.log(`[measure-heights] 기록이 실제와 맞는다 — ${todo.length}개, ${TOLERANCE}px 넘게 어긋난 것 0`);
  process.exit(0);
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`[measure-heights] ${todo.length}개를 새로 재어 기록했다 (기록 전체 ${Object.keys(sorted).length}개)`);
