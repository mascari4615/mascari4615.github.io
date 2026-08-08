/**
 * 자랑 카드 — 그림이 실제로 그려지고 밖으로 나가는가 (TASK-KL-195)
 *
 * 왜 화면 검사인가: 이건 **그림**이다. 단위 시험으로는 「함수가 Blob 을 돌려줬다」까지밖에
 * 못 본다 — 글꼴이 폴백으로 찍혔는지, 숫자가 판 밖으로 나갔는지, 바탕이 통째로 검은지는
 * 브라우저가 실제로 그려 봐야 안다. 그래서 카드를 떠서 **크기와 색을 잰다**.
 *
 * 서버는 끊고 본다. 로그인 안 한 사람도 자랑은 되어야 한다(그때는 글자만 복사).
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-brag.mjs
 *       SHOT=1 이면 카드를 파일로 떨군다 (눈으로 보고 싶을 때).
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-write'] });
await context.route('**/kl/**', (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

await page.goto(URL_TARGET, { waitUntil: 'networkidle', timeout: 30000 });
// 다섯 판을 다 한 사람으로 만든다 — 각 놀이가 실제로 쓰는 저장 모양 그대로.
await page.evaluate(() => {
  const k = new Date(Date.now() + 9 * 3600e3);
  const day = `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
  localStorage.setItem('daily:pokemon:2026-08-08', JSON.stringify({ status: 'won' }));
  localStorage.setItem('karmolab_quest', JSON.stringify({ [day]: { tries: 2 } }));
  localStorage.setItem('karmolab_higher_day', JSON.stringify({ day, rounds: 3 }));
  localStorage.setItem('karmolab_twenty_day', JSON.stringify({ day, rounds: 1 }));
  localStorage.setItem('karmolab_worldcup_history', JSON.stringify([{ at: new Date(Date.now() + 9 * 3600e3).toISOString() }]));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#homeToday .lt-brag', { timeout: 15000 });

// ① 카드가 그려지는가 — 크기·바탕색·왼쪽 띠까지 실제 화소로 잰다.
const card = await page.evaluate(async () => {
  const blob = await window.KarmoToday.card({ done: 5, total: 5, run: 3 });
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3).join(',');
  // 큰 글자가 실제로 찍혔나 = 본문 영역에서 어두운 화소를 센다 (빈 카드면 0 이다).
  const body = ctx.getImageData(150, 180, 700, 220).data;
  let ink = 0;
  for (let i = 0; i < body.length; i += 4) if (body[i] < 120 && body[i + 1] < 120) ink++;
  const dataUrl = canvas.toDataURL('image/png');
  return { w: bitmap.width, h: bitmap.height, bg: at(900, 60), bar: at(20, 315), ink, dataUrl };
});

if (!card) problems.push('카드가 안 그려졌다 (Blob 없음)');
else {
  if (card.w !== 1200 || card.h !== 630) problems.push(`카드 크기가 ${card.w}x${card.h} 다 (1200x630 이어야 링크 미리보기가 꽉 찬다)`);
  if (card.bg !== '242,242,238') problems.push(`바탕색이 ${card.bg} 다 (밝은 포스터가 아니다)`);
  if (card.bar === card.bg) problems.push('왼쪽 띠가 없다');
  if (card.ink < 3000) problems.push(`글자가 거의 안 찍혔다 (어두운 화소 ${card.ink}개)`);
  if (process.env.SHOT) {
    fs.writeFileSync(process.env.SHOT, Buffer.from(card.dataUrl.split(',')[1], 'base64'));
  }
}

// ② 자랑 단추를 실제로 눌러 본다 — 서버가 없으니 글자 복사로 떨어져야 한다(막히면 그렇게 말한다).
await page.click('#homeToday .lt-brag');
await page.waitForFunction(() => !/그리는 중/.test(document.querySelector('#homeToday .lt-brag')?.textContent || ''), null, {
  timeout: 20000
});
const label = await page.locator('#homeToday .lt-brag').innerText();
if (!/복사|공유/.test(label)) problems.push(`자랑을 눌렀는데 「${label}」로 끝났다`);

await browser.close();

if (problems.length) {
  console.error('❌ 자랑 카드\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`✅ 자랑 카드 — 1200x630 밝은 포스터 · 글자 찍힘 · 단추 누르면 「${label}」 (서버 끊고)`);
