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
 * 사용: BASE=http://127.0.0.1:8797/apps/blog node scripts/audit-input-labels.mjs
 *       node scripts/audit-input-labels.mjs --update   (지금 값을 기준치로 다시 적는다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const BASELINE = path.join(root, 'data/a11y-baseline.json');
const update = process.argv.includes('--update');

const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = Object.keys(seo);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const perTool = {};
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
      if (!el) return { unlinked: 0, nameless: 0 };
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
    if (r.unlinked || r.nameless) perTool[id] = r;
    unlinked += r.unlinked;
    nameless += r.nameless;
    process.stdout.write('.');
  }
}

const queue = [...ids];
await Promise.all(
  Array.from({ length: Math.min(LANES, queue.length) }, async () => {
    const page = await ctx.newPage();
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      try {
        await auditOne(page, id);
      } catch {
        process.stdout.write('?');
      }
    }
    await page.close();
  })
);
process.stdout.write('\n');
await browser.close();

if (update) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ unlinked, nameless, perTool }, null, 2)}\n`);
  console.log(`[audit-input-labels] 기준치를 다시 적었다 — 안 이어진 칸 ${unlinked}개 · 이름 없는 칸 ${nameless}개`);
  process.exit(0);
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
  `[audit-input-labels] 이름 없는 입력칸 0개 · 이어지지 않은 칸 ${unlinked}개 (기준 ${base.unlinked} 이하 유지)`
);
