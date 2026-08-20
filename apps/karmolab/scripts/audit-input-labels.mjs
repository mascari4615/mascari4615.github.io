/**
 * 입력칸에 이름이 이어져 있는지 살핀다 (TASK-KL-089)
 *
 * 화면낭독기는 입력칸 옆에 적힌 글을 자동으로 읽어 주지 않는다. `label for` · `aria-label` 처럼
 * **이어 준 것**만 읽는다. 그래서 눈으로 볼 때는 멀쩡한 도구가 귀로 들을 때는 「편집란」 하나로만
 * 들린다 — 무엇을 넣으라는 건지 알 수 없다.
 *
 * 처음 재었을 때 그런 칸이 132개였고, 마흔 곳이 넘는 파일을 나눠 고쳐 **0개까지 갚았다**.
 * 기준치는 `data/a11y-baseline.json` 에 적어 두고 그보다 늘면 실패한다. 지금 기준은 0 이므로,
 * 이름 없는 칸이 하나라도 새로 생기면 바로 걸린다.
 * (다시 빚이 생겨 한 번에 못 갚을 때는 `--update` 로 기준치를 적어 두고 줄여 나가면 된다.)
 *
 * ── 못 잰 것은 0 이 아니다 (2026-08-14) ────────────────────────────────────────
 * 여태 장이 안 열리면 `?` 하나 찍고 넘어갔고, 도구 화면이 안 뜨면 「문제 0개」로 셌다.
 * 그러면 **사이트가 통째로 죽은 날 이 검사는 초록**이다 — 이름 없는 칸 0개이므로.
 * 실측: 라이브 점검 한 판에서 138장 중 130장이 `?` 였는데 그대로 판정이 나갔다.
 * 지금은 못 잰 것을 세고, 열에 하나를 넘으면 **CANNOT-RUN(2)** 로 끝낸다. 초록 줄에도
 * 「잰 도구 N/M」을 적는다 — 몇 장을 보고 한 말인지가 판정의 일부다.
 *
 * [빨강-확인] 2026-08-14 — 안 서 있는 주소(`BASE=http://127.0.0.1:1`)로 돌려
 *   `CANNOT-RUN — 122개 중 16개를 못 쟀다 (문턱 13)` · exit 2 · 40초 안에 끝나는 것을 봤다.
 *   (그 전에는 판정을 찍고도 프로세스가 안 죽어 200초를 기다렸다 — 이미 열고 있던 장이
 *    안 멈춰서다. 그래서 기다림을 시각으로 끊는다.)
 *
 * 사용: BASE=http://127.0.0.1:8797/apps/blog node scripts/audit-input-labels.mjs
 *       node scripts/audit-input-labels.mjs --update   (지금 값을 기준치로 다시 적는다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { withoutRetired } from './lib/retired-operations.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const BASELINE = path.join(root, 'data/a11y-baseline.json');
const update = process.argv.includes('--update');

const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
/* 접은 도구는 이제 넘김판(redirect)이라 위젯이 없다 — 재려는 것이 아예 없는 자리다. */
const ids = withoutRetired(Object.keys(seo));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const perTool = {};
/* ★ **못 잰 것을 0 으로 세지 않는다** (2026-08-14). 여태 장이 안 열리면 `?` 하나 찍고 넘어갔고,
   위젯이 안 뜨면 「문제 0개」로 셌다. 그러면 **사이트가 통째로 죽은 날 이 검사는 초록**이다 —
   이름 없는 칸 0개, 안 이어진 칸 0개이므로. 재려는 것이 안 온 것과 「없다」는 다르다. */
const unmeasured = [];
let unlinked = 0;
let nameless = 0;

// 도구가 백 개에 가까워 한 장씩 열면 몇 분씩 걸린다. 서로 무관하므로 몇 장씩 동시에 연다.
const LANES = 4;

async function auditOne(page, id) {
  {
    await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(400);
    const r = await page.evaluate((toolId) => {
      const el = document.getElementById('page-' + toolId);
      if (!el) return { missing: true };
      const vis = (e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
      const fields = [
        ...el.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')
      ].filter(vis);
      let a = 0;
      let b = 0;
      for (const f of fields) {
        const named =
          f.getAttribute('aria-label') ||
          f.getAttribute('title') ||
          (f.id && document.querySelector(`label[for="${f.id}"]`)) ||
          f.closest('label') ||
          f.getAttribute('placeholder');
        if (named) continue;
        if ((f.parentElement?.textContent || '').trim()) a += 1;
        else b += 1;
      }
      return { unlinked: a, nameless: b };
    }, id);
    if (r.missing) {
      unmeasured.push(`${id}: 도구 화면이 안 떴다`);
      process.stdout.write('?');
      return;
    }
    if (r.unlinked || r.nameless) perTool[id] = r;
    unlinked += r.unlinked;
    nameless += r.nameless;
    process.stdout.write('.');
  }
}

/* ★ **끝나는 시각을 정해 둔다** (2026-08-14). 사이트가 안 서 있으면 122장을 하나씩 두드리며
   몇 십 분을 태운다 — 판정은 이미 「못 쟀다」로 정해졌는데도. 시간이 다 되면 남은 것을
   못 잰 것으로 세고 나간다(그러면 아래에서 CANNOT-RUN 이 된다). */
/* 값은 **실측 위에 여유**를 얹어 정한다: 실사이트 122장이 4레인으로 300초였다(2026-08-14).
   빠듯하게 잡으면 느린 날 멀쩡한 판정이 「못 쟀다」가 된다 — 두 배로 둔다. */
const deadline = Date.now() + Number(process.env.LABELS_BUDGET_SEC || 600) * 1000;
/* 못 잰 것이 이만큼이면 판정하지 않는다 (아래 판정부와 같은 값 — 한 곳에서 정한다). */
const threshold = Math.max(5, Math.ceil(ids.length * 0.1));
const queue = [...ids];
const lane = Promise.all(
  Array.from({ length: Math.min(LANES, queue.length) }, async () => {
    const page = await ctx.newPage();
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      if (Date.now() > deadline) {
        unmeasured.push(`${id}: 시간이 다 됐다 (LABELS_BUDGET_SEC)`);
        queue.length = 0;
        break;
      }
      try {
        await auditOne(page, id);
      } catch (e) {
        /* 한 번은 봐준다 — 회선이 잠깐 흔들린 것과 진짜 못 여는 것은 다르다.
           다만 이미 여럿이 안 열렸으면 흔들린 게 아니라 **안 서 있는 것**이다. 그때는 안 봐준다. */
        let output = e;
        if (unmeasured.length < 3) {
          try {
            await auditOne(page, id);
            continue;
          } catch (e2) {
            output = e2;
          }
        }
        unmeasured.push(`${id}: ${String(output.message).split(String.fromCharCode(10))[0].slice(0, 60)}`);
        process.stdout.write('?');
        /* ★ **못 잴 게 뻔하면 그만둔다** (2026-08-14). 사이트가 안 서 있으면 122장을 25초씩
           두 번 두드리며 20분을 태운다 — 그 사이 아무도 답을 못 받는다. 문턱을 넘은 순간
           판정은 이미 「못 쟀다」로 정해졌으므로 더 두드릴 이유가 없다. */
        if (unmeasured.length >= threshold) queue.length = 0;
      }
    }
    await page.close().catch(() => {});
  })
);
/* ★ **기다림은 여기서 끝난다** (2026-08-14 실측). 줄에서 빼는 것을 그만둬도 **이미 열고 있던
   장은 안 멈춘다** — 안 서 있는 사이트에서는 그 하나가 몇 분을 붙잡아 판정이 아예 안 나왔다.
   그래서 판정은 레인을 기다리지 않고 **시각으로 끊는다**. 못 끝낸 것은 못 잰 것이다. */
await Promise.race([lane, new Promise((r) => setTimeout(r, Math.max(1000, deadline - Date.now())))]);
for (const id of queue) unmeasured.push(`${id}: 시간이 다 됐다 (LABELS_BUDGET_SEC)`);
queue.length = 0;
process.stdout.write(String.fromCharCode(10));
/* ★ **닫는 데도 시간을 준다** (2026-08-14 실측). 사이트가 안 서 있어 재기를 중간에 그만두면
   창이 안 닫히고 남아, 판정을 다 찍고도 프로세스가 안 죽는다(200초를 기다려 봤다).
   닫는 것은 뒷정리지 판정이 아니다 — 5초 안에 안 되면 그냥 나간다. */
await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);

if (update) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ unlinked, nameless, perTool }, null, 2)}\n`);
  console.log(`[audit-input-labels] 기준치를 다시 적었다 — 안 이어진 칸 ${unlinked}개 · 이름 없는 칸 ${nameless}개`);
  process.exit(0);
}

/* **잰 것이 너무 적으면 판정하지 않는다.** 여기서 초록·빨강 어느 쪽으로도 적으면 거짓이다 —
   0 은 「이름 없는 칸이 없다」가 아니라 「안 봤다」이기 때문이다. 실측 2026-08-14: 138장 중
   130장이 `?` 였는데 검사는 그대로 판정을 냈다. */
if (unmeasured.length) {
  console.error(`[audit-input-labels] 못 잰 도구 ${unmeasured.length}개 / 전체 ${ids.length}개`);
  for (const line of unmeasured.slice(0, 8)) console.error('  - ' + line);
  if (unmeasured.length > 8) console.error(`  … 그리고 ${unmeasured.length - 8}개 더`);
}
if (unmeasured.length >= threshold) {
  console.error(`[audit-input-labels] CANNOT-RUN — ${ids.length}개 중 ${unmeasured.length}개를 못 쟀다 (문턱 ${threshold}).`);
  console.error('  못 잰 것은 「이름이 다 붙어 있다」가 아니다 — 판정하지 않고 지나간다.');
  process.exit(2);
}

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { unlinked: 0, nameless: 0 };
const problems = [];
// 아무 글도 없는 칸은 늘어날 이유가 없다 — 하나라도 생기면 잡는다.
if (nameless > 0) problems.push(`이름이 아예 없는 입력칸 ${nameless}개 (기준 0)`);
if (unlinked > base.unlinked) problems.push(`이어지지 않은 입력칸이 늘었다 — ${base.unlinked}개 → ${unlinked}개`);

if (problems.length) {
  console.error('[audit-input-labels] ' + problems.join(' / '));
  const grew = Object.entries(perTool).filter(([id]) => !base.perTool || !base.perTool[id]);
  if (grew.length) console.error('  새로 생긴 도구: ' + grew.map(([id, r]) => `${id}(${r.unlinked + r.nameless})`).join(', '));
  console.error('  고쳤다면 `node scripts/audit-input-labels.mjs --update` 로 기준치를 낮춰 적어라.');
  process.exit(1);
}
console.log(
  `[audit-input-labels] 이름 없는 입력칸 0개 · 이어지지 않은 칸 ${unlinked}개 (기준 ${base.unlinked} 이하 유지)` +
    ` · 잰 도구 ${ids.length - unmeasured.length}/${ids.length}`
);
