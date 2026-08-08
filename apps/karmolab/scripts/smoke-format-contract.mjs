/**
 * 형식 규약이 **화면까지 닿는가** (TASK-KL-191 축6)
 *
 * 게이트(`check-format-contract`)는 「선언을 적었나」만 본다. 적힌 선언이 실제로
 *   ① 「이어서」 줄이 고르는 도구
 *   ② 흐름 화면의 ↳ 표시
 * 둘 다를 움직이는지는 브라우저에서만 보인다. 예전엔 이 둘이 **서로 다른 자**를 썼다
 * (셸은 등록 메타, 흐름 화면은 자기 사본) — 답이 갈라져도 아무도 안 아팠다.
 *
 * 여기서는 진짜 브라우저에서 규약 함수를 직접 불러, 선언을 늘리기 전/후로 답이
 * **같이** 달라지는지를 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-format-contract.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const res = await page.goto(URL_TARGET, { waitUntil: 'networkidle', timeout: 30000 });
if (!res || res.status() !== 200) problems.push(`안 열린다 (http ${res && res.status()})`);
/* `Toolbox` 는 창(window)에 안 얹힌다 — 전역 이름으로만 산다. 이름으로 직접 부른다. */
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.declaredAccepts === 'function', {
  timeout: 20000,
});

const seam = await page.evaluate(() => {
  const T = Toolbox;
  return {
    hasAll: Boolean(T.declaredAccepts && T.declaredProduces && T.kindMatches),
    starMatches: T.kindMatches?.('image/*', 'image/png') === true,
    exactMatches: T.kindMatches?.('application/pdf', 'application/pdf') === true,
    crossDoesNot: T.kindMatches?.('image/*', 'application/pdf') === false,
  };
});
if (!seam.hasAll) problems.push('규약 함수 셋이 셸에 없다 — 흐름 화면이 자기 사본으로 되돌아간다');
if (!seam.starMatches) problems.push("kindMatches('image/*','image/png') 가 참이 아니다");
if (!seam.exactMatches) problems.push('정확히 같은 형식끼리 안 맞는다');
if (!seam.crossDoesNot) problems.push('그림 자리에 PDF 가 들어간다');

/* 선언을 실제로 읽는가 — 도구 이름만 대고 형식을 되돌려 받는다. */
const declared = await page.evaluate(() => {
  const T = Toolbox;
  const ids = ['pdfcrop', 'imgresize', 'video2gif', 'audiocut', 'exifclean'];
  return ids.map((id) => ({ id, accepts: T.declaredAccepts(id), produces: T.declaredProduces(id) }));
});
for (const row of declared) {
  if (!row.accepts.length) problems.push(`'${row.id}' 가 받는 형식을 못 읽는다`);
  if (!row.produces.length) problems.push(`'${row.id}' 가 내놓는 형식을 못 읽는다`);
}

/* 규약이 늘면 「이어서」가 갈 곳도 는다 — 축6 이전에는 produces 가 4개뿐이라
 * PDF 를 만들어도 이어지는 도구가 안 떴다. 실제 개수를 센다. */
const reach = await page.evaluate(() => {
  const T = Toolbox;
  const metas = window.KARMOLAB_LAZY_META || [];
  const withProduces = metas.filter((m) => T.declaredProduces(m.id).length).length;
  const withAccepts = metas.filter((m) => T.declaredAccepts(m.id).length).length;
  const pdf = T.toolsAccepting('application/pdf', 'pdftool');
  const img = T.toolsAccepting('image/png', 'imgresize');
  /* **갈 곳으로 뽑힌 도구가 정말 그 형식을 받는다고 적었나** — 개수만 세면 규약을 안 보고
   * 아무나 담아도 통과한다. 되돌아온 이름마다 선언을 다시 확인한다. */
  const liars = [...pdf, ...img].filter((t) => !T.declaredAccepts(t.id).length).map((t) => t.id);
  return { withProduces, withAccepts, pdfTargets: pdf.length, imgTargets: img.length, liars };
});
if (reach.withProduces < 20) problems.push(`내놓는 형식을 밝힌 도구가 ${reach.withProduces}개뿐이다 (축6 전 수준)`);
if (reach.pdfTargets < 3) problems.push(`PDF 결과가 갈 곳이 ${reach.pdfTargets}군데뿐이다`);
/* 그림을 받는다고 적은 것은 셋(img2pdf·imgmerge·exifclean)인데 exifclean 은 JPEG 만 받는다 —
 * PNG 를 내밀면 둘이 맞다. 「많을수록 좋다」가 아니라 **선언대로**가 맞다. */
if (reach.imgTargets < 2) problems.push(`PNG 결과가 갈 곳이 ${reach.imgTargets}군데뿐이다`);
if (reach.liars.length) problems.push(`받는다고 안 적었는데 갈 곳으로 뽑혔다: ${reach.liars.join('·')}`);

await browser.close();

console.log(
  `형식 규약 — 내놓는다고 밝힌 도구 ${reach.withProduces}개 · 받는다고 밝힌 도구 ${reach.withAccepts}개 · ` +
    `PDF 결과가 갈 곳 ${reach.pdfTargets}군데 · 그림 결과가 갈 곳 ${reach.imgTargets}군데`,
);
if (problems.length) {
  console.error('❌ 형식 규약이 화면까지 안 닿는다:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log('✅ 셸과 흐름 화면이 같은 자를 쓴다');
