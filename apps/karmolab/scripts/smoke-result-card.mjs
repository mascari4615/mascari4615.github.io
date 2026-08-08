/**
 * 결과를 그림으로 — 계산기 답이 카드가 되는가 (TASK-KL-196 F)
 *
 * 왜 화면 검사인가: 이 기능은 **도구가 그린 모양을 읽어서** 산다(`.cc-stat`). 그 모양이
 * 바뀌거나 단추가 안 붙으면 아무 시험도 안 깨지는데 사람은 아무것도 못 얻는다.
 * 결과물은 그림이라 실제로 그려서 크기·바탕·글자 화소를 재야 한다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-result-card.mjs
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.route('**/kl/**', (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));
const missing = [];
page.on('response', (r) => {
  if (r.status() === 404 && /\/js\//.test(r.url())) missing.push(r.url());
});

// 체질량지수 — 값 두 개면 답이 나오는, 가장 단순한 계산기.
await page.goto(`${URL_TARGET}#bmi`, { waitUntil: 'networkidle', timeout: 30000 });
/* 도구는 **묶음 화면**으로 열린다(`#bmi` → 건강 묶음). 「활성 화면의 첫 입력칸」으로
   집으면 같은 묶음의 다른 도구(퍼센트) 칸을 잡는다 — 여기서 한 번 헛짚었다.
   이 도구의 제 id 로 집는다. */
await page.waitForSelector('#bmH', { timeout: 15000 });

// ① 값을 넣기 전에는 단추가 없어야 한다 — 눌러도 아무 일 없는 단추가 제일 나쁘다.
await page.waitForTimeout(900);
/* 이 도구는 기본값(170·65)이 박혀 있어 열자마자 답이 있다 — 그러면 단추도 바로 붙는 것이
   맞다. 「답이 없을 때 안 붙는다」는 값을 지워서 본다. */
await page.fill('#bmH', '');
await page.dispatchEvent('#bmH', 'input');
await page.waitForTimeout(400);
const card0 = await page.evaluate(() =>
  window.KarmoResultCard.readResult(document.getElementById('bmH').closest('.tool-page'), 'x'));
if (card0) problems.push('값을 지웠는데도 카드에 담을 답이 있다고 한다');

// ② 진짜 값을 넣는다 → 답이 생기고 단추가 붙는다.
await page.fill('#bmH', '175');
await page.fill('#bmW', '70');
await page.dispatchEvent('#bmW', 'input');
await page.waitForSelector('.tool-card-btn', { timeout: 15000 });

// ③ 카드를 실제로 그려서 잰다.
const card = await page.evaluate(async () => {
  const host = document.getElementById('bmH').closest('.tool-page');
  const data = window.KarmoResultCard.readResult(host, '체질량지수');
  if (!data) return { none: true };
  const blob = await window.KarmoResultCard.draw(data);
  if (!blob) return { none: true };
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3).join(',');
  const body = ctx.getImageData(140, 180, 800, 260).data;
  let ink = 0;
  for (let i = 0; i < body.length; i += 4) if (body[i] < 120 && body[i + 1] < 120) ink++;
  return {
    w: bitmap.width, h: bitmap.height, bg: px(900, 40), bar: px(20, 315), ink,
    headline: data.headline, rows: data.rows.length, dataUrl: canvas.toDataURL('image/png')
  };
});

if (card.none) problems.push('답이 있는데 카드를 못 만들었다');
else {
  if (card.w !== 1200 || card.h !== 630) problems.push(`카드 크기가 ${card.w}x${card.h} 다`);
  if (card.bg !== '242,242,238') problems.push(`바탕색이 ${card.bg} 다`);
  if (card.bar === card.bg) problems.push('왼쪽 띠가 없다');
  if (card.ink < 2000) problems.push(`글자가 거의 안 찍혔다 (어두운 화소 ${card.ink}개)`);
  if (card.rows < 1) problems.push('딸린 줄이 하나도 안 실렸다');
  /* 175cm·70kg = 22.9. 사람이 물어본 값이 카드의 주인공이어야 한다 — 분류 글자(「정상」)가
     주인공이면 정작 그 수가 카드에 없다. */
  if (!/22\.9/.test(card.headline)) problems.push(`카드의 큰 값이 화면의 수와 다르다: 「${card.headline}」`);
  if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, Buffer.from(card.dataUrl.split(',')[1], 'base64'));
}

if (missing.length) problems.push(`받아야 할 조각이 없다(404): ${missing.join(', ')}`);

await browser.close();

if (problems.length) {
  console.error('❌ 결과 카드\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`✅ 결과 카드 — 값 넣기 전엔 단추 없음 · 답 나오면 붙음 · 카드에 「${card.headline}」 + ${card.rows}줄`);
