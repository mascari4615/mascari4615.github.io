#!/usr/bin/env node
/**
 * 도구 상세 장이 **첫 그림에 실제로 쓰는** 스타일의 합집합을 잰다 (TASK-KL-323 1걸음).
 *
 * 왜 합집합인가: 장마다 쓰는 규칙이 다르다. 한 장만 보고 자르면 다른 장이 번쩍인다.
 * 왜 「첫 그림」인가: 지금 톱니(`audit-blocking-css`)는 **한참 뒤까지** 쓰인 것을 세므로
 * 정작 *잘라도 되는 양*을 말해 주지 못한다. 자를 크기는 첫 그림 순간의 합집합이 정한다.
 *
 * 재는 법: 스타일 덮개(coverage)를 켜고 열되, **첫 그림 직후에 멈춘다**(`load` 도 기다리지 않는다).
 * 그 뒤 쓰이는 규칙은 미뤄도 되는 것들이다 — 그게 이 측정의 전부다.
 *
 * 쓰임: BASE=https://blog.mascari4615.com node scripts/measure-detail-critical.mjs [id...]
 * 이 스크립트는 **재기만 한다** — 아무것도 안 막고 아무것도 안 굽는다(끝값 늘 0, 못 재면 1).
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const page2 = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const IDS = page2.length ? page2 : ['loan', 'charcount', 'jsonfmt', 'qrgen', 'unitconv', 'colorpick'];

const sum = new Map(); // 파일 → { 전체, 조각: Set<범위키>, 바이트: Set<위치> }

const browser = await chromium.launch();
for (const id of IDS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.coverage.startCSSCoverage();
  /* 첫 그림까지만 — `domcontentloaded` 뒤 그림이 한 장 나오면 거기서 끊는다. */
  await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'domcontentloaded' });
  /* 셸이 주소를 한 번 고쳐 잡는 장이 있다 — 그때 이 평가는 날아간다. 날아가면 다시 한 번 센다.
     못 세면 그 장을 조용히 빼지 않고 말한다(빠진 장은 합집합을 **작게** 만들어 잘못 자르게 한다). */
  const pause = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  try { await pause(); } catch { await page.waitForLoadState('domcontentloaded'); await pause(); }
  const cov = await page.coverage.stopCSSCoverage();
  for (const e of cov) {
    const name = e.url.split('/').pop().split('?')[0];
    if (!/^(tools|shell-critical)\./.test(name)) continue;
    const cell = sum.get(name) || { all: e.text.length, usedSlot: new Set() };
    cell.전체 = Math.max(cell.전체, e.text.length);
    for (const r of e.ranges) for (let i = r.start; i < r.end; i += 1) cell.쓴자리.add(i);
    sum.set(name, cell);
  }
  await ctx.close();
}
await browser.close();

if (sum.size === 0) {
  console.error('[detail-critical] 잰 것이 없다 — 주소·파일 이름을 보라 (통과가 아니다)');
  process.exit(1);
}
console.log(`[detail-critical] 장 ${IDS.length}개 · **첫 그림까지** 쓰인 것의 합집합`);
for (const [이름, 칸] of sum) {
  const used = 칸.쓴자리.size;
  console.log(`  ${이름}  ${(used / 1024).toFixed(1)}KB / ${(칸.전체 / 1024).toFixed(1)}KB  (${((used / 칸.전체) * 100).toFixed(1)}%)`);
}
const totalUsed = [...sum.values()].reduce((s, c) => s + c.쓴자리.size, 0);
const grandTotal = [...sum.values()].reduce((s, c) => s + c.전체, 0);
console.log(`  합계  ${(totalUsed / 1024).toFixed(1)}KB / ${(grandTotal / 1024).toFixed(1)}KB — 자를 수 있는 몫 ${((1 - totalUsed / grandTotal) * 100).toFixed(0)}%`);
