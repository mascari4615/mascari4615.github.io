/**
 * 뜬 **뒤**의 빠르기를 잰다 — 반응·애니메이션 (TASK-KL-128 ⑭)
 *
 * 왜 따로 있나: `measure-speed.mjs` 는 **뜨는 데 걸리는 시간**만 잰다. 사용자가 말한
 * 「전반적인 반응이나 애니메이션이 버벅인다」는 다 뜬 뒤의 문제라 그 값에는 안 나온다.
 *
 * 이 하네스를 만들면서 앞선 네 가지 재는 법이 **거짓 초록**을 냈다. 다시 쓰지 마라:
 *  - `requestAnimationFrame` 간격 → 늘 60fps 로 나온다. 화면을 못 그려도 rAF 는 온다.
 *  - 헤드리스 브라우저 → 애니메이션이 있어도 3초에 16프레임만 그린다. 애니 비용이 안 보인다.
 *  - 한 변형씩 몰아서 재기 → 이 기계는 다른 작업이 붙었다 떨어졌다 해서, 같은 조건을 몇 분
 *    뒤에 재면 값이 20배까지 달라진다. 「고쳤더니 나빠졌다」가 그냥 잡음이었다.
 *  - CPU 를 재면서 「기기 느리게」를 켜 두기 → 느리게 만드는 방법이 **일부러 CPU 를 태우는**
 *    것이라, 그 태운 값이 그대로 섞인다(전 대상이 8초에 8초씩 나왔다).
 *
 * 그래서 여기서는 **대상을 번갈아** 돌리고(round-robin), 중앙값과 함께 **흔들림**을 같이 낸다.
 * 차이가 흔들림보다 작으면 「모름」이라고 말한다 — 없는 개선을 있다고 하지 않기 위해서다.
 *
 * 재는 것:
 *  - 쉬는가       손 안 대고 8초 동안 브라우저가 쓴 **CPU 초**. ★ 이 값이 KL-128 ⑭ 를 잡아냈다 —
 *                주 스레드 값은 전부 깨끗한데 이것만 10배 차이가 났다. 배경이 계속 움직이면
 *                페이지가 영영 안 쉬고, 그 값은 여기에만 나온다.
 *  - 긴프레임     같은 8초의 긴 프레임(>50ms) 합 — **주 스레드** 몫.
 *  - 타이핑       화면의 첫 글자칸에 여러 글자 — 글자 하나가 화면에 뜨기까지 최악 시간.
 *  - 스크롤       한 화면씩 여덟 번 내리는 동안의 최악 응답.
 *
 * CPU 는 **같은 PID 집합만** 빼서 잰다. 프로세스가 뜨고 죽는 사이 합계끼리 빼면 음수가 나온다.
 *
 * 주의: 도구 화면(`/t/…`)은 배포 때 찍히는 생성물이라 **소스 경로에 없다**.
 *       그래서 기본 대상은 실서비스다. 셸만 볼 거면 `BASE=http://127.0.0.1:8801/apps/karmolab`.
 *       (로컬 `/apps/blog/karmolab/` 은 지문이 박힌 **낡은 사본**이라 고친 코드가 안 보인다.)
 *
 * 사용: node scripts/measure-runtime.mjs [반복수]
 *       TARGETS=홈,도구허브 node scripts/measure-runtime.mjs 5
 *       VARIANTS=base,noanim node scripts/measure-runtime.mjs 5     # 원인 가르기(셸 한정)
 *       창이 뜬다 — 헤드리스로는 못 잰다.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'https://mascari4615.github.io/karmolab';
const REPS = Number(process.argv[2] || 5);
const CPU = Number(process.env.CPU || 4);

/** 대상 = 실제로 사람이 머무는 화면. 무거워 보이는 것과 가벼워 보이는 것을 섞어 둔다. */
const ALL_TARGETS = {
  '앱 첫 화면': '/',
  '도구 허브': '/t/',
  '대출 상환표': '/t/loan/',
  'git 명령어': '/t/gitcmd/',
  '이미지 크기': '/t/imgresize/',
  'QR 읽기': '/t/qrread/',
  '글자→그림': '/t/text2img/'
};
const TARGETS = (process.env.TARGETS || Object.keys(ALL_TARGETS).join(',')).split(',');

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
const VARIANT = process.env.VARIANTS ? process.env.VARIANTS.split(',') : ['base'];

const OBS = () => {
  window.__loaf = [];
  window.__ev = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ d: e.duration }); })
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

const mid = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
/** 흔들림 = 가운데 절반이 걸친 폭. 표준편차보다 튀는 값에 안 흔들린다. */
const spread = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)];
};

const browser = await chromium.launch({ headless: false });

async function once(path, variant) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(OBS);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);           // 늦게 따라오는 것들(아이콘·꾸밈)이 다 앉을 때까지
  await page.evaluate(VARIANTS[variant]).catch(() => {});
  await page.waitForTimeout(600);

  /* ① 쉬는가 — 이 구간만 「기기 느리게」를 끈다. 켠 채로 재면 느리게 만드느라 태운 CPU 가 섞인다. */
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => { window.__loaf = []; }).catch(() => {});
  const c0 = cpuSnap();
  await page.waitForTimeout(8000);
  const cpu = cpuDelta(c0, cpuSnap());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const idle = (await page.evaluate(() => window.__loaf).catch(() => []))
    .filter((f) => f.d > 50).reduce((s, f) => s + f.d, 0);

  /* ② 타이핑 — 화면마다 첫 글자칸이 다르다. 없으면 건너뛴다(0 = 잴 게 없었다). */
  await page.evaluate(() => { window.__ev = []; }).catch(() => {});
  let typing = 0;
  const input = page.locator('input[type="text"], input[type="search"], input:not([type]), textarea').first();
  if (await input.count().catch(() => 0)) {
    await input.click({ timeout: 3000 }).catch(() => {});
    for (const c of '이미지를 변환') { await page.keyboard.type(c, { delay: 0 }); await page.waitForTimeout(90); }
    await page.waitForTimeout(300);
    const ev = await page.evaluate(() => window.__ev).catch(() => []);
    typing = ev.length ? Math.max(...ev) : 0;
  }

  /* ③ 스크롤 — 굴러가는 자리를 **찾아서** 굴린다. 셸은 문서가 아니라 `.main-content` 가 구른다.
        문서만 보고 「스크롤할 게 없다」로 넘기면 정작 사람이 겪는 자리를 한 번도 안 재게 된다. */
  await page.evaluate(() => { window.__ev = []; window.__loaf = []; }).catch(() => {});
  const spot = await page.evaluate(() => {
    const cands = [document.scrollingElement, ...document.querySelectorAll('*')]
      .filter((el) => el && el.scrollHeight - el.clientHeight > 200)
      .filter((el) => el === document.scrollingElement || /auto|scroll/.test(getComputedStyle(el).overflowY));
    if (!cands.length) return null;
    const el = cands.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    if (el === document.scrollingElement) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }).catch(() => null);
  let scroll = 0;
  if (spot) {
    await page.mouse.move(spot.x, spot.y);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
    await page.waitForTimeout(300);
    const lf = await page.evaluate(() => window.__loaf).catch(() => []);
    scroll = lf.length ? Math.max(...lf.map((f) => f.d)) : 0;
  }

  await ctx.close();
  return { cpu, idle, typing, scroll };
}

const key = (t, v) => (VARIANT.length > 1 ? `${t} [${v}]` : t);
const acc = {};
for (const t of TARGETS) for (const v of VARIANT) acc[key(t, v)] = { cpu: [], idle: [], typing: [], scroll: [] };

console.log(`[measure-runtime] ${BASE} · 기기 ${CPU}배 느리게 · 대상 ${TARGETS.length}종을 **번갈아** ${REPS}회`);
for (let r = 0; r < REPS; r++) {
  for (const t of TARGETS) {
    if (!ALL_TARGETS[t]) { console.error(`모르는 대상: ${t}`); process.exit(1); }
    for (const v of VARIANT) {
      const got = await once(ALL_TARGETS[t], v);
      for (const k of Object.keys(got)) acc[key(t, v)][k].push(got[k]);
    }
  }
  process.stdout.write(`  ${r + 1}/${REPS} 판 끝\n`);
}
await browser.close();

const fmt = (a) => `${String(Math.round(mid(a))).padStart(5)}ms ±${String(Math.round(spread(a))).padStart(4)}`;
const fmtS = (a) => `${mid(a).toFixed(2).padStart(6)}s ±${spread(a).toFixed(2).padStart(5)}`;
const w = Math.max(...Object.keys(acc).map((k) => k.length)) + 1;
console.log(`\n${'화면'.padEnd(w)} 쉬는가(8초 CPU)   긴프레임 합    타이핑 최악      스크롤 최악`);
for (const k of Object.keys(acc))
  console.log(`${k.padEnd(w)} ${fmtS(acc[k].cpu)}   ${fmt(acc[k].idle)}   ${fmt(acc[k].typing)}   ${fmt(acc[k].scroll)}`);
console.log('\n± = 가운데 절반이 걸친 폭. 두 줄의 차이가 이 폭보다 작으면 **차이가 있다고 말하면 안 된다.**');
console.log('타이핑 0ms = 그 화면엔 글자칸이 없다 · 스크롤 0ms = 굴릴 것이 없다.');
