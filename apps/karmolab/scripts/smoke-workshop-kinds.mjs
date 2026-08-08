/**
 * 작업실이 **그림만 받던 것** (TASK-KL-191 축3)
 *
 * 「만든 것을 건다」고 해 놓고, 도구 160개 중 그림을 내놓는 스물 남짓만 걸 수 있었다.
 * PDF·소리·영상·글은 단추 자체가 안 떴다 — 그리고 이어질 도구가 없는 결과는 줄 전체가
 * 안 그려져서, 걸 방법이 아예 사라졌다.
 *
 * 여기서는 진짜 브라우저에서 세 가지를 본다:
 *   ① 그림이 아닌 결과에도 「작업실에 걸기」가 뜬다
 *   ② 이어질 도구가 하나도 없어도 그 단추는 뜬다 (줄이 통째로 사라지지 않는다)
 *   ③ 눌렀을 때 서버로 가는 것이 **갈래와 단서**를 담고, 미리보기가 없으면 없다고 말한다
 *
 * 서버는 안 쓴다 — 나가는 요청을 가로채 무엇을 보내려 했는지만 본다.
 *
 * 사용: URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-workshop-kinds.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

/** 서버로 나가는 것을 잡아 둔다 — 붙이지도 않은 서버에 진짜로 보내지 않는다. */
const posted = [];
await context.route('**/kl/me/works', async (route) => {
  posted.push(JSON.parse(route.request().postData() || '{}'));
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"works":[]}' });
});
await context.route('**/kl/uploads', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"prev12345678"}' });
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.offerNext === 'function', {
  timeout: 20000,
});

/** 로그인한 척 — 걸기 단추는 로그인해야 뜬다(그 판정만 필요하다). */
await page.evaluate(() => {
  window.KarmoAccount = {
    ...(window.KarmoAccount || {}),
    apiBase: 'https://example.invalid',
    state: { account: { handle: 'probe' }, loading: false },
  };
});

const offer = (type, name, text) =>
  page.evaluate(
    ([t, n, body]) => {
      document.querySelectorAll('.kl-probe-anchor').forEach((el) => el.remove());
      const anchor = document.createElement('div');
      anchor.className = 'kl-probe-anchor';
      document.body.appendChild(anchor);
      const blob = new Blob([body], { type: t });
      Toolbox.offerNext(anchor, { blob, name: n, from: 'probe-tool' });
    },
    [type, name, text],
  );

/* 줄은 화면 맨 아래에 붙는다 — 앱 레이아웃이 그 위를 덮어 진짜 클릭이 안 닿는다.
 * 검사할 것은 「눌렀을 때 무엇이 나가나」지 「덮였나」가 아니라, 단추에게 직접 시킨다. */
const clickHang = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('.tool-next-row button')].find((b) =>
      (b.textContent || '').includes('작업실에 걸기'),
    );
    if (!btn) throw new Error('걸기 단추가 없다');
    btn.click();
  });

/* ① 글 결과 — 받아 줄 도구가 없는 갈래다. 예전엔 줄 자체가 안 떴다. */
await offer('text/csv', '표.csv', '이름,값\n가,1\n나,2');
const hangCount = await page.locator('.tool-next-row button', { hasText: '작업실에 걸기' }).count();
if (hangCount !== 1) problems.push(`글 결과에 걸기 단추가 ${hangCount}개 (이어질 도구가 없어도 떠야 한다)`);

await clickHang();
await page.waitForTimeout(1200);
const textWork = posted.at(-1);
if (!textWork) problems.push('걸기를 눌렀는데 서버로 아무것도 안 갔다');
else {
  if (textWork.kind !== 'text') problems.push(`글인데 갈래가 '${textWork.kind}' 로 갔다`);
  if (textWork.preview !== false) problems.push('올린 그림이 없는데 미리보기가 있다고 말한다');
  if (!textWork.note || !textWork.note.includes('이름,값')) problems.push(`글 앞머리가 안 실렸다: ${textWork.note}`);
}

/* ② 소리 결과 — 미리보기를 못 만드는 갈래. 크기 한 줄이 유일한 단서다. */
await offer('audio/wav', '소리.wav', 'x'.repeat(3000));
await clickHang();
await page.waitForTimeout(1200);
const audioWork = posted.at(-1);
if (audioWork?.kind !== 'audio') problems.push(`소리인데 갈래가 '${audioWork?.kind}' 로 갔다`);
if (audioWork?.preview !== false) problems.push('소리에 미리보기가 있다고 말한다');
if (!/[KM]?B$/.test(audioWork?.note ?? '')) problems.push(`크기 한 줄이 안 실렸다: ${audioWork?.note}`);

/* ③ 그림 결과 — 예전과 같이 미리보기를 올리고 그 열쇠를 쓴다(되던 것이 그대로여야 한다). */
await offer('image/png', '그림.png', 'fake-png-bytes');
await clickHang();
await page.waitForTimeout(1500);
const imageWork = posted.at(-1);
if (imageWork?.kind !== 'image') problems.push(`그림인데 갈래가 '${imageWork?.kind}' 로 갔다`);
if (imageWork?.preview !== true) problems.push('그림인데 미리보기가 없다고 말한다');
if (imageWork?.id !== 'prev12345678') problems.push(`올린 그림의 열쇠를 안 쓴다: ${imageWork?.id}`);

await browser.close();

console.log(`작업실 — 걸린 갈래: ${posted.map((p) => p.kind).join(' · ')}`);
if (problems.length) {
  console.error('❌ 작업실이 아직 그림만 받는다:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log('✅ 글·소리·그림 셋 다 걸리고, 미리보기 없는 것은 없다고 말한다');
