/**
 * 폰 화면 촬영·점검 (TASK-KL-088)
 *
 * 검색 유입은 대부분 폰인데 좁은 화면을 확인할 방법이 없었다. 고치기 전에 「보는 루프」 부터 만든다.
 * 대상은 **배포된 실물** — Jekyll 을 통과한 그것이 사용자가 보는 화면이다 (로컬 파일을 그대로 열면
 * 템플릿 구문이 남아 화면이 달라진다).
 *
 * 사용:
 *   node scripts/shoot-mobile.mjs                 # 대표 6종
 *   node scripts/shoot-mobile.mjs charcount qrgen # 지정
 *   BASE=http://localhost:4000 node scripts/...   # 다른 서버 대상
 *
 * 결과: .mobile-shots/<id>.png (전체 높이) + 가로 넘침·작은 터치영역 리포트
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, '.mobile-shots');
const BASE = process.env.BASE || 'https://blog.mascari4615.com';

const cssArgIdx = process.argv.indexOf('--css');
const injectCss = cssArgIdx > 0 ? fs.readFileSync(process.argv[cssArgIdx + 1], 'utf8') : null;
const argv = process.argv.slice(2).filter((a, i, arr) => a !== '--css' && arr[i - 1] !== '--css');
const ids = argv.length
  ? argv
  : ['charcount', 'specialchar', 'qrgen', 'jsonfmt', 'colorname', 'datecalc'];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true });
const page = await context.newPage();

const report = [];
for (const id of ids) {
  const url = id === 'hub' ? `${BASE}/karmolab/t/` : `${BASE}/karmolab/t/${id}/`;
  await page.goto(url, { waitUntil: 'networkidle' });
  // 배포 전 수정안을 미리 보기 위한 주입 (실물 위에 CSS 만 덮어쓴다)
  if (injectCss) await page.addStyleTag({ content: injectCss });
  await page.waitForTimeout(900);

  const audit = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.display === 'none' || r.width === 0) return;
      // 화면 밖으로 나간 요소 — 가로 스크롤·잘림의 원인
      if (r.right > docW + 2 || r.left < -2) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 36),
          w: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right)
        });
      }
    });
    const tiny = [...document.querySelectorAll('button, a[href], select, input')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && r.height > 0 && r.height < 36 && getComputedStyle(el).position !== 'fixed')
      .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}(${Math.round(r.height)}px)`);
    return {
      docW,
      scrollW: document.documentElement.scrollWidth,
      bodyH: document.body.scrollHeight,
      offenders: offenders.slice(0, 8),
      tiny: [...new Set(tiny)].slice(0, 6)
    };
  });

  await page.screenshot({ path: path.join(outDir, `${id}.png`), fullPage: true });
  report.push({ id, url, ...audit });
}

await browser.close();

console.log(`\n=== 폰 점검 (iPhone 13 · 390px) · ${BASE} ===`);
for (const r of report) {
  const overflow = r.scrollW > r.docW + 2;
  console.log(`\n[${r.id}] ${overflow ? `❌ 가로 넘침 ${r.scrollW} > ${r.docW}` : '✅ 가로 OK'} · 세로 ${r.bodyH}px`);
  r.offenders.forEach((o) => console.log(`   밖으로: <${o.tag} class="${o.cls}"> w=${o.w} left=${o.left} right=${o.right}`));
  if (r.tiny.length) console.log(`   작은 터치(<36px): ${r.tiny.join(', ')}`);
}
console.log(`\n스크린샷 → ${path.relative(process.cwd(), outDir)}`);
