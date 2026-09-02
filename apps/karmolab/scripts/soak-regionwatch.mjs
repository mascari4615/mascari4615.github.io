/**
 * 화면 영역 지켜보기 내구 시험. **덮어 둔 탭에서 N분 동안 판정이 유지되는가**
 *
 * 헤드리스는 화면을 못 잡으므로 진짜 브라우저(Edge 채널)와 진짜 화면 공유를 사용
 * 창 둘: 도구 창과 무대 창(색 상자와 숫자). 도구 창은 최소화해 숨은 페이지로
 * Playwright 기본 플래그(`--disable-backgrounding-occluded-windows` 등)는 페이지를 절대 안 숨기므로 제외
 * 도구는 화면 전체를 받으므로 앞에 있는 무대를 봄. 사용자가 다른 창을 앞에 두고 쓰는 상황과 같음
 * 화면 공유 창 고르기는 실행 인자로 자동. 잠긴 화면이나 원격 세션에서는 캡처 거부 가능
 *
 * 재는 것: 분당 숫자 읽기 횟수(기대 약 60), 색이 바뀔 때마다 울리는지와 지연, 카운트다운마다 한 번 우는지, JS 힙 증가.
 * 창이 화면에 뜨므로 CI 용이 아님. 손으로 돌림.
 * 한계: Playwright 가 붙은 Edge 는 최소화해도 document.hidden 이 안 바뀔 수 있다 (2026-09-03 실측). 그때는 숨김 검사 대신
 * 분당 읽기 수치와 실사용의 도구 화면 "분당 판정" 표시로 확인
 *
 * 사용: node scripts/soak-regionwatch.mjs [--minutes 10]
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const args = process.argv.slice(2);
const mi = args.indexOf('--minutes');
const MINUTES = mi >= 0 ? Number(args[mi + 1]) || 10 : 10;

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};

const browser = await chromium.launch({
  channel: 'msedge',
  headless: false,
  ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  args: ['--auto-select-desktop-capture-source=Entire screen', '--use-fake-ui-for-media-stream', '--window-position=0,0', '--window-size=1280,900']
});
const stageCtx = await browser.newContext({ viewport: null });
const toolCtx = await browser.newContext({ viewport: null });

/* ── 무대 창. 화면 좌표를 스스로 계산해 알려 준다 ── */
const stage = await stageCtx.newPage();
await stage.goto(`${BASE}#uikit`, { waitUntil: 'domcontentloaded' });
const rects = await stage.evaluate(() => {
  const BOX = { x: 40, y: 40, w: 160, h: 100 };
  const DIGIT = { x: 300, y: 40, w: 200, h: 100 };
  const el = document.createElement('div');
  el.id = 'soakStage';
  el.style.cssText = 'position:fixed;left:0;top:0;width:560px;height:180px;background:#202830;z-index:2147483647;';
  el.innerHTML =
    `<div id="soakBox" style="position:absolute;left:${BOX.x}px;top:${BOX.y}px;width:${BOX.w}px;height:${BOX.h}px;background:#20c040"></div>` +
    `<div id="soakDigit" style="position:absolute;left:${DIGIT.x}px;top:${DIGIT.y}px;width:${DIGIT.w}px;height:${DIGIT.h}px;background:#101418;color:#f4f4f4;font:bold 64px Arial,sans-serif;display:flex;align-items:center;justify-content:center"></div>`;
  document.body.appendChild(el);
  window.__stageLog = [];
  window.__stage = {
    box(color) {
      document.getElementById('soakBox').style.background = color;
      window.__stageLog.push({ k: 'box', v: color, t: Date.now() });
    },
    digits(text) {
      document.getElementById('soakDigit').textContent = text;
      window.__stageLog.push({ k: 'digits', v: text, t: Date.now() });
    }
  };
  /* 뷰포트 원점의 화면 좌표. 창 테두리와 탭 줄 높이를 뺀 값 */
  const ox = window.screenX + (window.outerWidth - window.innerWidth) / 2;
  const oy = window.screenY + (window.outerHeight - window.innerHeight) - (window.outerWidth - window.innerWidth) / 2;
  const shift = (r) => ({ x: Math.round(r.x + ox), y: Math.round(r.y + oy), w: r.w, h: r.h });
  return { box: shift(BOX), digit: shift(DIGIT), ox, oy, dpr: window.devicePixelRatio };
});
console.log(`무대 화면 좌표: 상자 ${JSON.stringify(rects.box)}, 숫자 ${JSON.stringify(rects.digit)}, dpr ${rects.dpr}`);

/* ── 도구 창. 슬롯은 미리 박아 둔다 ── */
const tool = await toolCtx.newPage();
await tool.addInitScript((r) => {
  const slot = (name, mode, rect, extra = {}) => ({ name, enabled: true, rect, ref: null, thumb: '', mode, threshold: 0.9, lead: 5, sound: 'ping', rearm: 3, randomDelay: false, ...extra });
  const off = (name) => slot(name, 'match', null, { enabled: false });
  localStorage.setItem('regionwatch.v1', JSON.stringify({ sw: 0, sh: 0, volume: 0, notify: false, slots: [slot('chg', 'change', r.box), slot('cnt', 'count', r.digit), off('3'), off('4'), off('5'), off('6')] }));
  window.__rw = { fires: [], reads: [] };
  window.addEventListener('regionwatch:fire', (e) => window.__rw.fires.push({ ...e.detail, t: Date.now() }));
  window.addEventListener('regionwatch:read', (e) => window.__rw.reads.push({ ...e.detail, t: Date.now() }));
}, rects);
await tool.goto(`${BASE}#regionwatch`, { waitUntil: 'domcontentloaded' });
await tool.waitForSelector('#rwStart', { timeout: 20000 });
await tool.click('#rwStart');
await tool.waitForFunction(() => /\d+x\d+/.test(document.querySelector('.rw-slot[data-i="0"] [data-act="pick"]')?.textContent || ''), null, { timeout: 15000 });

/* 기준을 찍으려면 무대가 화면에 보여야 한다. 도구 창을 최소화해 무대만 남기고, 그 뒤 기준 */
const cdp = await toolCtx.newCDPSession(tool);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
await stage.bringToFront();
await stage.waitForTimeout(1500);
await tool.evaluate(() => document.querySelector('.rw-slot[data-i="0"] [data-act="ref"]').click());
await stage.waitForTimeout(1500);
const sim0 = await tool.textContent('.rw-slot[data-i="0"] .rw-sim b');
check(/9\d%|100%/.test(sim0 || ''), `무대 좌표 보정: 기준 직후 닮음 90% 이상 (지금 ${sim0}). 창 테두리 계산이 틀렸으면 여기서 난다`);
const hidden = await tool.evaluate(() => document.hidden);
check(hidden === true, `도구 탭이 숨어 있어야 한다 (document.hidden ${hidden})`);
await tool.waitForFunction(() => /준비됨|ready|完了|실패|fail/i.test(document.querySelector('#rwStatus')?.textContent || ''), null, { timeout: 90000 }).catch(() => undefined);
const ocrStatus = await tool.textContent('#rwStatus');
check(!/실패|fail/i.test(ocrStatus || ''), `숫자 읽기 준비: ${ocrStatus}`);

const heap = async () => tool.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
const heap0 = await heap();
const t0 = Date.now();
const perMinute = [];
let red = false;
let digitAt = 0;
let digitVal = 20;
let lastMinute = 0;

/* ── N분 동안: 8초마다 상자 색 토글, 1초마다 숫자 카운트다운(20에서 0, 4초 쉼) ── */
while (Date.now() - t0 < MINUTES * 60000) {
  const el = Date.now() - t0;
  if (Math.floor(el / 8000) % 2 === 1 && !red) {
    red = true;
    await stage.evaluate(() => window.__stage.box('#c02020'));
  } else if (Math.floor(el / 8000) % 2 === 0 && red) {
    red = false;
    await stage.evaluate(() => window.__stage.box('#20c040'));
  }
  if (el - digitAt >= 1000) {
    digitAt = el;
    digitVal -= 1;
    if (digitVal < -4) digitVal = 20;
    await stage.evaluate((v) => window.__stage.digits(v), digitVal >= 0 ? String(digitVal) : '');
  }
  const minute = Math.floor(el / 60000);
  if (minute > lastMinute) {
    lastMinute = minute;
    const s = await tool.evaluate((from) => {
      const reads = window.__rw.reads.filter((r) => r.t >= from).length;
      const fires = window.__rw.fires.filter((r) => r.t >= from);
      return { reads, chg: fires.filter((f) => f.name === 'chg').length, cnt: fires.filter((f) => f.name === 'cnt').length, hidden: document.hidden };
    }, Date.now() - 60000);
    s.heapMB = Math.round((await heap()) / 1048576);
    perMinute.push(s);
    console.log(`${minute}분: 읽기 ${s.reads}회, 색 울림 ${s.chg}, 카운트다운 울림 ${s.cnt}, 숨김 ${s.hidden}, 힙 ${s.heapMB}MB`);
  }
  await stage.waitForTimeout(200);
}

/* ── 판정 ── */
const all = await tool.evaluate(() => window.__rw);
const log = await stage.evaluate(() => window.__stageLog);
const reds = log.filter((l) => l.k === 'box' && l.v === '#c02020');
const chgFires = all.fires.filter((f) => f.name === 'chg');
const latencies = reds.map((r) => {
  const f = chgFires.find((x) => x.t >= r.t && x.t < r.t + 6000);
  return f ? f.t - r.t : null;
});
const missed = latencies.filter((l) => l === null).length;
const okLat = latencies.filter((l) => l !== null).sort((a, b) => a - b);
const median = okLat.length ? okLat[Math.floor(okLat.length / 2)] : null;
const cycles = log.filter((l) => l.k === 'digits' && l.v === '5').length;
const cntFires = all.fires.filter((f) => f.name === 'cnt').length;
const heap1 = await heap();
const readMinutes = perMinute.map((m) => m.reads);
const lowMinutes = readMinutes.filter((n) => n < 40).length;

console.log('');
console.log(`색 바뀜 ${reds.length}회 중 놓침 ${missed}, 울림 지연 중앙값 ${median}ms, 최대 ${okLat[okLat.length - 1] ?? '-'}ms`);
console.log(`카운트다운 ${cycles}회 중 울림 ${cntFires}회`);
console.log(`분당 읽기: ${readMinutes.join(', ')}`);
console.log(`힙 ${Math.round(heap0 / 1048576)}MB -> ${Math.round(heap1 / 1048576)}MB`);
check(missed === 0, `색이 바뀔 때마다 울려야 한다 (놓침 ${missed}/${reds.length})`);
check(median !== null && median < 2000, `울림 지연 중앙값 2초 미만 (지금 ${median}ms)`);
check(lowMinutes === 0, `숨은 탭에서도 분당 읽기 40회 이상 (모자란 분 ${lowMinutes})`);
check(cntFires >= cycles - 1 && cntFires <= cycles + 1, `카운트다운마다 한 번 (카운트다운 ${cycles}, 울림 ${cntFires})`);
check(heap1 - heap0 < 80 * 1048576, `힙 증가 80MB 미만 (${Math.round((heap1 - heap0) / 1048576)}MB)`);

await browser.close();
frozen?.close();
process.stdout.write('\n');
if (failures.length) {
  console.error(`[soak-regionwatch] 실패 ${failures.length}건`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`[soak-regionwatch] ${MINUTES}분 전부 통과`);
