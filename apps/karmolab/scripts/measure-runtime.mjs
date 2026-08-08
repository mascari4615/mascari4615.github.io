/**
 * 뜬 **뒤**의 빠르기를 잰다 — 반응·애니메이션 (TASK-KL-128 ⑭)
 *
 * 왜 따로 있나: `measure-speed.mjs` 는 **뜨는 데 걸리는 시간**만 잰다. 사용자가 말한
 * 「전반적인 반응이나 애니메이션이 버벅인다」는 다 뜬 뒤의 문제라 그 값에는 안 나온다.
 *
 * 이 하네스를 만들면서 앞선 세 가지 재는 법이 **거짓 초록**을 냈다. 다시 쓰지 마라:
 *  - `requestAnimationFrame` 간격 → 늘 60fps 로 나온다. 화면을 못 그려도 rAF 는 온다.
 *  - 헤드리스 브라우저 → 애니메이션이 있어도 3초에 16프레임만 그린다. 애니 비용이 안 보인다.
 *  - 한 변형씩 몰아서 재기 → 이 기계는 다른 작업이 붙었다 떨어졌다 해서, 같은 조건을 몇 분
 *    뒤에 재면 값이 20배까지 달라진다. 「고쳤더니 나빠졌다」가 그냥 잡음이었다.
 *
 * 그래서 여기서는 **변형을 번갈아** 돌리고(round-robin), 중앙값과 함께 **흔들림**을 같이 낸다.
 * 차이가 흔들림보다 작으면 「모름」이라고 말한다 — 없는 개선을 있다고 하지 않기 위해서다.
 *
 * 재는 것:
 *  - 쉬는가       손 안 대고 8초 동안 브라우저가 쓴 **CPU 초**. ★ 이 값이 문제를 잡아냈다 —
 *                주 스레드 값(아래 둘)은 전부 깨끗한데 이것만 10배 차이가 났다. 배경이
 *                계속 움직이면 페이지가 영영 안 쉬고, 그 값은 여기에만 나온다.
 *  - 가만히 둘 때  같은 8초의 긴 프레임(>50ms) 합 — **주 스레드** 몫.
 *  - 타이핑        찾는 칸에 12글자 — 글자 하나가 화면에 뜨기까지 최악 시간.
 *  - 훑기          도구 카드 위로 마우스 — 최악 응답.
 *
 * CPU 는 **같은 PID 집합만** 빼서 잰다. 프로세스가 뜨고 죽는 사이 합계끼리 빼면 음수가 나온다.
 *
 * 사용: node scripts/measure-runtime.mjs [반복수]
 *       VARIANTS=base,noblur node scripts/measure-runtime.mjs 7
 *       먼저 다른 창에서 `npm run serve:gzip` 을 띄워라. 창이 뜬다 — 헤드리스로는 못 잰다.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog/karmolab';
const REPS = Number(process.argv[2] || 7);
const CPU = Number(process.env.CPU || 4);

/** 변형 = 화면이 다 뜬 뒤 페이지 안에서 하는 손질. 제품 코드를 안 건드리고 원인을 가른다. */
const VARIANTS = {
  base: () => {},
  nodecor: () => { const d = document.querySelector('.home-decor'); if (d) d.style.display = 'none'; },
  noblur: () => { for (const it of document.querySelectorAll('.home-decor-item')) it.style.filter = 'none'; },
  noanim: () => { for (const f of document.querySelectorAll('.home-decor-float')) f.style.animation = 'none'; },
  noglass: () => {
    const s = document.createElement('style');
    s.textContent = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
    document.head.appendChild(s);
  }
};
const PICK = (process.env.VARIANTS || 'base,nodecor,noblur,noanim,noglass').split(',');

const OBS = () => {
  window.__loaf = [];
  window.__ev = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ d: e.duration, t: e.startTime }); })
    .observe({ type: 'long-animation-frame', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push(e.duration); })
    .observe({ type: 'event', durationThreshold: 16, buffered: true });
};

/** 브라우저가 쓴 CPU 초. PID 별로 재서 **양쪽 순간에 다 있던 것만** 뺀다. */
const cpuSnap = () => {
  const out = execSync('powershell -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { \\"$($_.Id) $($_.CPU)\\" }"').toString();
  const m = new Map();
  for (const line of out.trim().split(/\r?\n/)) {
    const [id, c] = line.trim().split(' ');
    if (id) m.set(id, Number(c) || 0);
  }
  return m;
};
const cpuDelta = (a, b) => { let s = 0; for (const [id, v] of b) if (a.has(id)) s += v - a.get(id); return s; };

const mid = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
/** 흔들림 = 가운데 절반이 걸친 폭. 표준편차보다 튀는 값에 안 흔들린다. */
const spread = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)];
};

const browser = await chromium.launch({ headless: false });

/** 한 판: 화면을 띄우고 변형을 걸고 세 가지를 잰다 */
async function once(variant) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(OBS);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);           // 늦게 따라오는 것들이 다 앉을 때까지
  await page.evaluate(VARIANTS[variant]);
  await page.waitForTimeout(600);

  /* ① 가만히 — 손 안 댄 8초. 브라우저가 쓴 CPU 와 주 스레드 긴 프레임을 같이 본다.
     이 구간만 **기기 느리게를 끈다** — 느리게 만드는 방법이 「일부러 CPU 를 태우는 것」이라,
     켠 채로 재면 그 태운 값이 그대로 섞여 든다(전 변형이 8초에 8초씩 나왔다). */
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => { window.__loaf = []; });
  const c0 = cpuSnap();
  await page.waitForTimeout(8000);
  const cpu = cpuDelta(c0, cpuSnap());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const idle = (await page.evaluate(() => window.__loaf).catch(() => [])).filter((f) => f.d > 50).reduce((s, f) => s + f.d, 0);

  // ② 타이핑 — 글자 하나가 화면에 뜨기까지
  await page.evaluate(() => { window.__ev = []; });
  const input = page.locator('.landing-palette input, input[type="search"]').first();
  let typing = 0;
  if (await input.count()) {
    await input.click();
    for (const c of '이미지를 변환') { await page.keyboard.type(c, { delay: 0 }); await page.waitForTimeout(90); }
    await page.waitForTimeout(300);
    const ev = await page.evaluate(() => window.__ev).catch(() => []);
    typing = ev.length ? Math.max(...ev) : 0;
    await input.fill('').catch(() => {});
  }

  // ③ 훑기 — 카드 위로 마우스
  await page.evaluate(() => { window.__ev = []; });
  const cards = page.locator('.landing-cta-card');
  const n = Math.min(5, await cards.count());
  for (let i = 0; i < n; i++) { await cards.nth(i).hover().catch(() => {}); await page.waitForTimeout(130); }
  await page.waitForTimeout(300);
  /* 화면이 바뀌어 버리면 읽던 자리가 사라진다 — 그 판은 훑기 값만 버린다(0), 나머지는 산다. */
  const evh = await page.evaluate(() => window.__ev).catch(() => []);
  const hover = evh.length ? Math.max(...evh) : 0;

  await ctx.close();
  return { cpu, idle, typing, hover };
}

const acc = Object.fromEntries(PICK.map((v) => [v, { cpu: [], idle: [], typing: [], hover: [] }]));
console.log(`[measure-runtime] 기기 ${CPU}배 느리게 · 변형 ${PICK.length}종을 **번갈아** ${REPS}회`);
for (let r = 0; r < REPS; r++) {
  for (const v of PICK) {
    if (!VARIANTS[v]) { console.error(`모르는 변형: ${v}`); process.exit(1); }
    const got = await once(v);
    for (const k of Object.keys(got)) acc[v][k].push(got[k]);
  }
  process.stdout.write(`  ${r + 1}/${REPS} 판 끝\n`);
}
await browser.close();

console.log('\n변형        쉬는가(8초 CPU)   긴 프레임 합    타이핑 최악      훑기 최악');
const fmt = (a) => `${String(Math.round(mid(a))).padStart(5)}ms ±${String(Math.round(spread(a))).padStart(4)}`;
const fmtS = (a) => `${mid(a).toFixed(2).padStart(6)}s ±${spread(a).toFixed(2).padStart(5)}`;
for (const v of PICK) console.log(`${v.padEnd(10)} ${fmtS(acc[v].cpu)}   ${fmt(acc[v].idle)}   ${fmt(acc[v].typing)}   ${fmt(acc[v].hover)}`);
console.log('\n± = 가운데 절반이 걸친 폭. 두 줄의 차이가 이 폭보다 작으면 **차이가 있다고 말하면 안 된다.**');
