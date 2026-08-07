/**
 * 앱 아이콘 생성 (TASK-KL-089)
 *
 * 왜: `manifest.json` 이 192·512 아이콘을 가리키는데 그 파일이 아예 없었다(둘 다 404).
 * 그 상태로 설치하면 아이콘이 빈 앱이 되고, 브라우저에 따라 설치 자체를 막는다.
 *
 * 카드와 같은 손으로 그린다 — 밤하늘 바탕에 금색. 다만 아이콘은 홈 화면에서 둥글게·모나게
 * 잘리므로(maskable) 가운데 80% 안에만 그림을 둔다. 가장자리는 배경만 남긴다.
 *
 * 사용: node scripts/gen-app-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'img');
const SIZES = [192, 512];
// iOS 는 홈 화면에 추가할 때 이 파일을 쓴다. 없으면 화면을 찍어 아이콘으로 삼아 브랜드가 사라진다.
// 애플 쪽은 모서리를 알아서 깎으므로 안전 영역을 덜 비워도 된다.
const APPLE_TOUCH = 180;

const html = (size) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; }
  body {
    background: #0b0d12;
    display: flex; align-items: center; justify-content: center;
  }
  /* 잘려도 안 없어지도록 가운데 80% 안에만 그린다 */
  .safe {
    width: 80%; height: 80%;
    display: flex; align-items: center; justify-content: center;
  }
  svg { width: 100%; height: 100%; color: #d4a849; }
</style></head>
<body>
  <div class="safe">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <!-- 작업실의 도구를 한 획으로: 눈금 셋 -->
      <path d="M4 6h16M4 12h11M4 18h7" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  </div>
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(html(size), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(outDir, `icon-${size}.png`), type: 'png' });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: APPLE_TOUCH, height: APPLE_TOUCH }, deviceScaleFactor: 1 });
  await page.setContent(html(APPLE_TOUCH).replace('width: 80%; height: 80%;', 'width: 88%; height: 88%;'), {
    waitUntil: 'load'
  });
  await page.screenshot({ path: path.join(outDir, 'apple-touch-icon.png'), type: 'png' });
  await page.close();
}

await browser.close();

if (!fs.existsSync(path.join(outDir, 'apple-touch-icon.png'))) {
  console.error('[gen-app-icons] apple-touch-icon.png 을 못 만들었다');
  process.exit(1);
}

// 만든 것이 manifest 가 기대하는 것과 맞는지 그 자리에서 확인한다.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const problems = [];
for (const icon of manifest.icons || []) {
  const file = path.join(root, icon.src.replace(/^\/apps\/karmolab\//, ''));
  if (!fs.existsSync(file)) problems.push(`${icon.src} 파일이 없다`);
}
if (problems.length) {
  problems.forEach((p) => console.error('[gen-app-icons] ' + p));
  process.exit(1);
}
console.log(`[gen-app-icons] ${SIZES.join('·')} 아이콘 생성 — manifest 가 가리키는 파일이 모두 있다`);
