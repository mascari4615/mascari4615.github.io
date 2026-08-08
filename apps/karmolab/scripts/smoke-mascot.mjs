/**
 * 마스코트 — 진짜로 살아 있나 (TASK-KL-134)
 *
 * 마스코트는 「부위 그림 + 값」으로 만들어진다. 그래서 조용히 죽는 길이 많다 —
 * 아틀라스 좌표가 틀어져도 칸은 그대로 있고, 조각 이름을 오타 내도 화면은
 * 멀쩡해 보이고(그냥 표정이 안 바뀔 뿐), 설정 값이 저장만 되고 안 먹어도
 * 아무도 안 알려 준다. 이 검사는 그 조용한 실패들을 실제 화면에서 찔러 본다:
 *
 *   ① 부위가 다 붙고, 그림은 아틀라스 한 장만 받는다
 *   ② 부위마다 아틀라스의 다른 칸을 가리킨다 (좌표가 죽으면 전부 같은 칸)
 *   ③ 표정을 바꾸면 조각이 갈리고, 그 자리 기본 부품은 숨는다 (안 그러면 눈이 넷)
 *   ④ 환호하면 두 팔이 올라간다
 *   ⑤ 설정(크기·프레이밍·끄기·움직임)이 화면에 실제로 반영된다
 *   ⑥ 움직임을 끄면 눈이 멈춘다 (보간이 끝난 뒤 흔들림으로 판정)
 *   ⑦ 끌어다 놓으면 가까운 벽에 붙고, 새로고침해도 그 벽이다
 *
 * 사용: node scripts/smoke-mascot.mjs
 *       URL=http://127.0.0.1:8813/apps/karmolab/index.html node scripts/smoke-mascot.mjs
 */
import { chromium } from 'playwright';

const URL_TARGET = process.env.URL || 'https://blog.mascari4615.com/karmolab/';
const problems = [];
const note = (ok, msg) => { if (!ok) problems.push(msg); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => problems.push(`페이지 스크립트가 죽었다: ${e.message}`));

const imageRequests = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('/img/mascot/') && /\.(webp|png|jpe?g)$/.test(u)) imageRequests.push(u.split('/').pop());
});

const res = await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
if (!res || res.status() !== 200) problems.push(`첫 화면이 안 열린다 (http ${res && res.status()})`);

await page.waitForSelector('.mdd-av-part', { timeout: 20000 });
await page.waitForTimeout(1500);

/* ① 부위가 붙었고 그림은 한 장만 받았다 */
const partCount = await page.locator('.mdd-av-part').count();
note(partCount >= 15, `부위가 ${partCount}개뿐이다 (아틀라스나 매니페스트가 안 왔다)`);
note(imageRequests.length === 1 && imageRequests[0].startsWith('atlas'),
  `마스코트 그림 요청이 ${imageRequests.length}건이다: ${imageRequests.join(', ')}`);

/* ② 부위마다 다른 칸 */
const positions = await page.evaluate(() => [...document.querySelectorAll('.mdd-av-part')]
  .map((e) => getComputedStyle(e).backgroundPosition));
note(new Set(positions).size >= partCount - 1,
  `부위 ${partCount}개가 아틀라스에서 ${new Set(positions).size}칸만 가리킨다 (좌표가 죽었다)`);

/* 부위 표시 상태를 이름으로 읽는다 */
const shown = () => page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.mdd-av-part')) {
    out[el.dataset.part] = getComputedStyle(el).display !== 'none';
  }
  const arm = document.querySelector('.mdd-av-part[data-part="arm-r"]');
  out.__armR = arm ? arm.style.transform : '';
  return out;
});

const setMood = async (m) => { await page.evaluate(`Mdd.setMood('${m}')`); await page.waitForTimeout(700); };

/* ③ 표정 교체 + 기본 부품 숨김 */
await setMood('idle');
let v = await shown();
note(v.mouth === true && v.eyewhite === true, '평소인데 기본 눈·입이 숨어 있다');
note(v['mouth-open'] === false && v['eyes-happy'] === false, '평소인데 표정 조각이 켜져 있다');

await setMood('happy');
v = await shown();
note(v['eyes-happy'] === true && v['mouth-open'] === true, 'happy 인데 표정 조각이 안 켜졌다');
note(v.eyewhite === false && v.mouth === false,
  'happy 에서 기본 눈·입이 안 숨었다 — 조각과 겹쳐 눈이 넷으로 보인다');

await setMood('shock');
v = await shown();
note(v['eyes-wide'] === true && v['mouth-wide'] === true, 'shock 인데 놀란 눈·입이 안 켜졌다');

/* ④ 환호 = 두 팔 */
await setMood('cheer');
v = await shown();
const deg = parseFloat((v.__armR.match(/rotate\((-?[\d.]+)deg\)/) || [])[1] || '0');
note(Math.abs(deg) > 25, `환호인데 오른팔이 ${deg}도밖에 안 올라갔다`);

/* ⑤ 설정이 화면에 먹는다 */
const charBox = () => page.evaluate(() => {
  const c = document.querySelector('.mdd-container');
  const ch = document.querySelector('.mdd-char');
  const av = document.querySelector('.mdd-av');
  const r = ch.getBoundingClientRect();
  return { display: getComputedStyle(c).display, w: Math.round(r.width), h: Math.round(r.height),
           opacity: getComputedStyle(ch).opacity, aspect: av ? av.style.aspectRatio : '' };
});
await page.evaluate("Mdd.setMood('idle')");
await page.evaluate('Mdd.setPrefs({ width: 240 })');
await page.waitForTimeout(400);
let box = await charBox();
note(box.w === 240, `크기를 240 으로 했는데 ${box.w}px 이다`);

await page.evaluate("Mdd.setPrefs({ framing: 'full' })");
await page.waitForTimeout(400);
box = await charBox();
note(box.aspect === '500 / 940', `전신으로 바꿨는데 비율이 ${box.aspect} 다`);

await page.evaluate("Mdd.setPrefs({ framing: 'bust', enabled: false })");
await page.waitForTimeout(300);
box = await charBox();
note(box.display === 'none', '껐는데 마스코트가 그대로 보인다');
await page.evaluate('Mdd.setPrefs({ enabled: true, width: 120 })');
await page.waitForTimeout(300);

/* ⑥ 움직임을 끄면 눈이 멈춘다 */
await page.evaluate('Mdd.setPrefs({ motion: false })');
const eye = await page.evaluate(async () => {
  Mdd.setMood('idle');
  await new Promise((r) => setTimeout(r, 1200));     // 값이 목표로 흘러갈 시간을 준다
  const el = document.querySelector('.mdd-av-part[data-part="eyewhite"]');
  const vals = [];
  for (let i = 0; i < 100; i++) {
    const m = /scaleY\(([\d.]+)\)/.exec(el.style.transform || '');
    if (m) vals.push(parseFloat(m[1]));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return vals.length ? Math.max(...vals) - Math.min(...vals) : null;
});
note(eye !== null && eye < 0.01, `움직임을 껐는데 눈이 ${eye} 만큼 흔들린다`);
await page.evaluate('Mdd.setPrefs({ motion: true })');

/* ⑦ 끌어다 놓으면 벽에 붙고, 새로고침해도 그 벽 */
const wallGap = () => page.evaluate(() => {
  const r = document.querySelector('.mdd-container').getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top),
           right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) };
});
const dragTo = async (x, y) => {
  const b = await page.locator('.mdd-char').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
};
await dragTo(320, 420);
let gap = await wallGap();
note(gap.left === 16, `왼쪽으로 끌었는데 왼쪽 벽과 ${gap.left}px 떨어져 있다`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mdd-av-part', { timeout: 20000 });
await page.waitForTimeout(1200);
gap = await wallGap();
note(Math.abs(gap.left - 16) <= 2, `새로고침했더니 왼쪽 벽과 ${gap.left}px 로 벌어졌다`);

await browser.close();

if (problems.length) {
  console.error('[smoke-mascot] 문제 ' + problems.length + '건');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('[smoke-mascot] OK — 부위 ' + partCount + '개 · 그림 요청 1건 · 표정/팔/설정/자리 전부 반응');
