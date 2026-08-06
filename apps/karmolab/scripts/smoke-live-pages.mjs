/**
 * 배포된 도구 페이지가 실제로 화면을 그리는지 확인 (TASK-KL-088)
 *
 * 도구 페이지는 HTML 이 200 이어도 **자바스크립트가 다른 곳으로 튕기면 빈 화면**이 된다.
 * 실제로 그런 일이 있었다 — 묶음으로 보내는 규칙이 상세 페이지에서도 발동해서,
 * 코드가 로드되지도 않은 묶음으로 옮겨 가 41개 페이지가 조용히 비었다.
 * 200 응답만 보면 절대 안 잡히므로, 브라우저로 열어 도구 화면이 보이는지 본다.
 *
 * 사용: node scripts/smoke-live-pages.mjs [id ...]   (기본 = 전 도구)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(seo);

const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];

for (const id of ids) {
  const url = `${BASE}/karmolab/t/${id}/`;
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const state = await page.evaluate((toolId) => {
    const el = document.getElementById('page-' + toolId);
    if (!el) return { built: false, visible: false, nodes: 0, here: location.pathname };
    const visible = getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    return { built: true, visible, nodes: el.querySelectorAll('*').length, here: location.pathname };
  }, id);

  const ok = res.status() === 200 && state.built && state.visible && state.nodes > 5;
  if (!ok) {
    failures.push(
      `${id}: http=${res.status()} 화면생성=${state.built} 보임=${state.visible} 요소=${state.nodes} 위치=${state.here}`
    );
    process.stdout.write('x');
  } else {
    process.stdout.write('.');
  }
}
process.stdout.write('\n');
await browser.close();

if (failures.length) {
  console.error(`[smoke-live-pages] 빈 화면 ${failures.length}건 / ${ids.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-live-pages] ${ids.length}개 도구 페이지 모두 화면이 보인다`);
