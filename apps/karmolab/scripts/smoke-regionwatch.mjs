/**
 * 화면 영역 지켜보기 브라우저 시험. 헤드리스 크로미움은 화면을 못 잡으므로
 * `getDisplayMedia` 를 **캔버스 스트림**으로 바꿔 끼움. 도구는 스트림의 출처를 모름
 *
 * 무대(640x360 캔버스) 위에 색 상자와 숫자를 그리고, 도구가
 *  ① 달라지면 울리고, 같아지면 울리고, 그 사이엔 조용한지
 *  ② rearm 안에서는 침묵하고 지나면 다시 우는지
 *  ③ 숫자를 읽어 N초 이하에서 한 번 우는지 (tesseract, 동일 출처 vendor)
 *  ④ 추세 기록: 오르는 숫자의 분당 변화, 목표 도달 한 번, 멈춤 알림, 구간 새로, CSV
 *  ⑤ 슬롯 추가와 저장, 내 알림음 올리기와 고르기, 단축키로 멈춤과 시작
 *  ⑥ 멈춤 뒤 상태가 처음으로 돌아가는지, 콘솔 오류가 없는지
 * 를 확인
 *
 * 사용: node scripts/smoke-regionwatch.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

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

const SW = 640;
const SH = 360;
const BOX = { x: 40, y: 40, w: 160, h: 100 };
const DIGIT = { x: 300, y: 40, w: 200, h: 100 };
const NUM = { x: 40, y: 200, w: 320, h: 80 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
/* 콘솔은 이 도구와 tesseract 에 관한 오류만 센다. 시험 서버에는 글 색인과 계정 서버가 없어 404 와 CORS 가 원래 뜸 */
page.on('console', (m) => {
  const text = m.text();
  if (m.type() === 'error' && /regionwatch\.js|regionwatch-core|tesseract/i.test(text) && !/yawnbot\.mascari4615\.com/.test(text)) errors.push('console: ' + text);
});

/* 무대와 가짜 화면 공유. 저장된 슬롯(영역, 모드)은 미리 박아 두고 기준 그림만 화면에서 찍기 */
await page.addInitScript(
  ({ SW, SH, BOX, DIGIT, NUM }) => {
    const stage = document.createElement('canvas');
    stage.width = SW;
    stage.height = SH;
    const g = stage.getContext('2d');
    const state = { box: '#20c040', digits: '', number: '' };
    const paint = () => {
      g.fillStyle = '#202830';
      g.fillRect(0, 0, SW, SH);
      g.fillStyle = state.box;
      g.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
      g.fillStyle = '#101418';
      g.fillRect(DIGIT.x, DIGIT.y, DIGIT.w, DIGIT.h);
      if (state.digits) {
        g.fillStyle = '#f4f4f4';
        g.font = 'bold 64px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(state.digits, DIGIT.x + DIGIT.w / 2, DIGIT.y + DIGIT.h / 2);
      }
      g.fillStyle = '#101418';
      g.fillRect(NUM.x, NUM.y, NUM.w, NUM.h);
      if (state.number) {
        g.fillStyle = '#f4f4f4';
        g.font = 'bold 48px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(state.number, NUM.x + NUM.w / 2, NUM.y + NUM.h / 2);
      }
    };
    paint();
    setInterval(paint, 100);
    window.__stage = {
      set(k, v) {
        state[k] = v;
        paint();
      }
    };
    const fires = [];
    const reads = [];
    const trends = [];
    window.__rw = { fires, reads, trends };
    window.addEventListener('regionwatch:fire', (e) => fires.push({ ...e.detail, at: performance.now() }));
    window.addEventListener('regionwatch:read', (e) => reads.push(e.detail));
    window.addEventListener('regionwatch:trend', (e) => trends.push(e.detail));
    const md = navigator.mediaDevices;
    md.getDisplayMedia = async () => stage.captureStream(10);
    const slot = (name, mode, rect, extra = {}) => ({
      name,
      enabled: true,
      rect,
      ref: null,
      thumb: '',
      mode,
      threshold: 0.9,
      lead: 5,
      sound: 'ping',
      rearm: 1,
      randomDelay: false,
      ...extra
    });
    const off = (name) => slot(name, 'match', null, { enabled: false });
    /* 화면 크기별 프로필. 마지막 슬롯은 다른 크기의 것, 640x360 프로필은 따로.
       공유가 시작돼 크기를 알면 그 프로필로 갈아 끼워야 한다 */
    const mine = [slot('chg', 'change', BOX, { rearm: 3 }), slot('mat', 'match', BOX), slot('cnt', 'count', DIGIT, { lead: 5 }), slot('trd', 'trend', NUM, { target: 112000, idleSec: 6 }), off('5'), off('6')];
    const other = [slot('old1', 'match', { x: 0, y: 0, w: 50, h: 50 }), off('old2'), off('old3'), off('old4'), off('old5'), off('old6')];
    localStorage.setItem(
      'regionwatch.v1',
      JSON.stringify({ sw: 1280, sh: 720, volume: 0, notify: false, slots: other, profiles: { '1280x720': other, [`${SW}x${SH}`]: mine } })
    );
  },
  { SW, SH, BOX, DIGIT, NUM }
);

await page.goto(`${BASE}#regionwatch`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#rwStart', { timeout: 20000 });

/* 화면 크기를 모를 때는 마지막 슬롯(다른 크기의 것) 표시 */
check((await page.inputValue('.rw-slot[data-i="0"] [data-k="name"]')) === 'old1', '공유 전에는 마지막 슬롯이 복구된다');

/* ① 시작. 크기를 알면 640x360 프로필로 교체 */
await page.click('#rwStart');
await page.waitForFunction(() => document.querySelector('.rw-slot[data-i="0"] [data-act="pick"]')?.textContent?.includes('160x100'), null, { timeout: 10000 });
check(true, '캔버스 스트림으로 화면이 들어왔다 (640x360)');
check((await page.inputValue('.rw-slot[data-i="0"] [data-k="name"]')) === 'chg', '640x360 프로필의 슬롯으로 바뀐다');
check((await page.inputValue('.rw-slot[data-i="0"] [data-k="mode"]')) === 'change', '슬롯 1 은 달라지면 모드');
check((await page.inputValue('.rw-slot[data-i="2"] [data-k="mode"]')) === 'count', '슬롯 3 은 남은 초 모드');
check(await page.locator('.rw-slot[data-i="2"].is-count').count() === 1, '남은 초 모드 슬롯은 N초 전 칸을 보여 준다');
check(/640x360/.test((await page.textContent('#rwProfile')) || '') && /2/.test((await page.textContent('#rwProfile')) || ''), `프로필 표시: ${await page.textContent('#rwProfile')}`);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('regionwatch.v1')));
check(saved.profiles && saved.profiles['1280x720'] && saved.profiles['1280x720'][0].name === 'old1', '다른 크기의 프로필은 그대로 남는다');
await page.click('.rw-slot[data-i="0"] [data-act="ref"]');
await page.click('.rw-slot[data-i="1"] [data-act="ref"]');
await page.waitForTimeout(800);
const simAfterRef = await page.textContent('.rw-slot[data-i="0"] .rw-sim b');
check(/9\d%|100%/.test(simAfterRef || ''), `기준 직후 닮음은 90% 이상이어야 한다 (지금 ${simAfterRef})`);
const fires0 = await page.evaluate(() => window.__rw.fires.length);
check(fires0 === 0, `기준만 찍었을 때는 조용해야 한다 (울림 ${fires0})`);

/* 달라지면 울리고, 같아지면 모드는 조용 */
await page.evaluate(() => window.__stage.set('box', '#c02020'));
await page.waitForFunction(() => window.__rw.fires.length >= 1, null, { timeout: 5000 }).catch(() => undefined);
let fires = await page.evaluate(() => window.__rw.fires.map((f) => f.name));
check(fires.join(',') === 'chg', `빨강으로 바뀌면 달라지면 슬롯만 울린다 (지금 ${fires.join(',') || '없음'})`);

/* 다시 초록: 같아지면 슬롯이 울리고, 달라지면 슬롯은 다시 무장만 */
await page.evaluate(() => window.__stage.set('box', '#20c040'));
await page.waitForFunction(() => window.__rw.fires.length >= 2, null, { timeout: 5000 }).catch(() => undefined);
fires = await page.evaluate(() => window.__rw.fires.map((f) => f.name));
check(fires.join(',') === 'chg,mat', `초록으로 돌아오면 같아지면 슬롯이 울린다 (지금 ${fires.join(',')})`);

/* ② rearm 3초 (chg 슬롯): 첫 울림 뒤 3초 안의 빨강은 침묵, 3초가 지난 빨강은 울림.
   벽시계가 아니라 페이지 안의 시각으로 잰다. 병렬 게이트에서 느려져도 판정이 안 흔들리게 */
const gapBefore = await page.evaluate(() => performance.now() - window.__rw.fires.find((f) => f.name === 'chg').at);
await page.evaluate(() => window.__stage.set('box', '#c02020'));
await page.waitForTimeout(700);
await page.evaluate(() => window.__stage.set('box', '#20c040'));
await page.waitForTimeout(400);
fires = await page.evaluate(() => window.__rw.fires.map((f) => f.name));
if (gapBefore < 2500) check(fires.length === 2, `rearm 안에서는 침묵 (첫 울림 뒤 ${Math.round(gapBefore)}ms 에 다시 빨강, 지금 ${fires.length}번)`);
else check(true, `rearm 침묵은 못 쟀다. 첫 울림 뒤 이미 ${Math.round(gapBefore)}ms 지남`);
await page.waitForFunction(() => performance.now() - window.__rw.fires.find((f) => f.name === 'chg').at > 3200, null, { timeout: 10000 });
await page.evaluate(() => window.__stage.set('box', '#c02020'));
await page.waitForFunction((n) => window.__rw.fires.filter((f) => f.name === 'chg').length >= n, 2, { timeout: 5000 }).catch(() => undefined);
const chgFires = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'chg').length);
check(chgFires === 2, `rearm 이 지나면 다시 울린다 (chg ${chgFires}번)`);

/* ③ 숫자 읽기. 15 부터 0 까지 0.9초마다 */
await page.waitForFunction(() => /준비됨|ready|完了|실패|fail|failed/i.test(document.querySelector('#rwStatus')?.textContent || ''), null, { timeout: 90000 }).catch(() => undefined);
const ocrStatus = await page.textContent('#rwStatus');
check(!/실패|fail|failed/i.test(ocrStatus || ''), `숫자 읽기 준비: ${ocrStatus}`);
const before = await page.evaluate(() => window.__rw.fires.length);
const readsBefore = await page.evaluate(() => window.__rw.reads.length);
const idleReads = await page.evaluate(() => window.__rw.reads.filter((r) => r.slot === 2 && r.secs !== null).length);
check(idleReads === 0, `숫자가 없을 때는 숫자 없음으로 읽는다 (숫자로 읽은 것 ${idleReads})`);
for (let n = 15; n >= 0; n--) {
  await page.evaluate((d) => window.__stage.set('digits', d), String(n));
  await page.waitForTimeout(900);
}
await page.waitForTimeout(1200);
/* 카운트다운 동안의 읽기만 본다. 그 전후는 숫자 없음이 정상 */
const reads = await page.evaluate((from) => window.__rw.reads.slice(from).filter((r) => r.slot === 2), readsBefore);
const numeric = reads.filter((r) => r.secs !== null).length;
check(reads.length >= 8, `숫자 읽기가 돌았다 (읽기 ${reads.length}회)`);
check(numeric >= Math.floor(reads.length * 0.6), `카운트다운 동안 읽은 것 중 숫자가 60% 이상 (숫자 ${numeric} / ${reads.length}: ${reads.map((r) => r.text || '-').join(' ')})`);
const cntFires = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'cnt'));
check(cntFires.length === 1, `남은 초 슬롯은 한 번만 울린다 (지금 ${cntFires.length}번)`);
check(cntFires.length === 1 && cntFires[0].secs <= 5 && cntFires[0].secs >= 1, `5초 이하에서 울린다 (지금 ${cntFires[0]?.secs})`);
const others = (await page.evaluate(() => window.__rw.fires.length)) - before - cntFires.length;
check(others === 0, `숫자가 바뀌는 동안 다른 슬롯은 조용 (다른 울림 ${others})`);

/* 숫자가 사라졌다 다시 카운트다운: 또 한 번 */
await page.evaluate(() => window.__stage.set('digits', ''));
await page.waitForTimeout(2500);
for (const n of [12, 8, 5, 4, 3]) {
  await page.evaluate((d) => window.__stage.set('digits', d), String(n));
  await page.waitForTimeout(900);
}
await page.waitForTimeout(1200);
const cntFires2 = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'cnt').length);
check(cntFires2 === 2, `숫자가 사라졌다 다시 내려오면 또 울린다 (지금 ${cntFires2}번)`);

/* ④ 추세 기록. 100,000 부터 0.5초마다 1,000 씩. 목표 112,000 */
check(await page.locator('.rw-slot[data-i="3"].is-trend').count() === 1, '추세 모드 슬롯은 목표와 멈춤 칸을 보여 준다');
const trendFiresBefore = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'trd').length);
let num = 100000;
for (let k = 0; k < 24; k++) {
  await page.evaluate((v) => window.__stage.set('number', v), num.toLocaleString('en-US'));
  await page.waitForTimeout(500);
  num += 1000;
}
await page.waitForTimeout(1500);
const trendLast = await page.evaluate(() => window.__rw.trends.length ? window.__rw.trends[window.__rw.trends.length - 1].find((x) => x.slot === 3) : null);
check(!!trendLast && trendLast.now !== null && trendLast.now >= 110000, `지금 값이 읽힌다 (지금 ${trendLast && trendLast.now})`);
check(!!trendLast && trendLast.perMin !== null && trendLast.perMin > 60000 && trendLast.perMin < 180000, `분당 변화가 실제(120,000/분)에 가깝다 (지금 ${trendLast && Math.round(trendLast.perMin)})`);
check(!(await page.isHidden('#rwTrend')) && /trd/.test((await page.textContent('#rwTrendRows')) || ''), '추세 판에 슬롯 줄이 있다');
const targetFires = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'trd' && f.reason === 'target').length);
check(targetFires === 1, `목표 112,000 에 닿을 때 한 번 (지금 ${targetFires})`);

/* 값이 멈추면 6초 뒤 멈춤 알림. 한 번만 */
await page.waitForTimeout(8000);
const idleFires = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'trd' && f.reason === 'idle').length);
check(idleFires === 1, `값이 멈추면 멈춤 알림 한 번 (지금 ${idleFires})`);
check(await page.locator('.rw-trend-row.is-idle').count() === 1, '멈춤 줄이 표시된다');

/* 구간 새로, CSV */
await page.click('.rw-trend-row[data-i="3"] [data-tact="segment"]');
await page.waitForTimeout(1500);
check(/구간|segment|区間/i.test((await page.textContent('#rwStatus')) || ''), `구간을 새로 시작한다 (${await page.textContent('#rwStatus')})`);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.rw-trend-row[data-i="3"] [data-tact="csv"]')]);
check(!!dl && /\.csv$/.test(dl.suggestedFilename()), `CSV 를 내려받는다 (${dl && dl.suggestedFilename()})`);
const trendReadsNumeric = await page.evaluate(() => window.__rw.reads.filter((r) => r.slot === 3 && r.value !== null && r.value !== undefined).length);
check(trendReadsNumeric >= 10, `쉼표 있는 숫자를 읽는다 (숫자 읽기 ${trendReadsNumeric}회)`);
void trendFiresBefore;

/* ⑤ 슬롯 추가, 내 알림음, 단축키 */
await page.click('#rwAddSlot');
await page.waitForTimeout(300);
check((await page.locator('.rw-slot').count()) === 7, `슬롯 추가로 일곱이 된다 (지금 ${await page.locator('.rw-slot').count()})`);
const savedSlots = await page.evaluate(() => JSON.parse(localStorage.getItem('regionwatch.v1')).profiles['640x360'].length);
check(savedSlots === 7, `추가한 슬롯이 프로필에 저장된다 (지금 ${savedSlots})`);

/* 0.2초짜리 wav 를 만들어 올린다. 8kHz 8bit 단일 채널 */
const wav = (() => {
  const rate = 8000;
  const n = Math.round(rate * 0.2);
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(100 * Math.sin((i / rate) * 2 * Math.PI * 660));
  return b;
})();
await page.setInputFiles('#rwSoundFile', { name: 'beep.wav', mimeType: 'audio/wav', buffer: wav });
await page.waitForFunction(() => /beep\.wav/.test(document.querySelector('#rwSounds')?.textContent || ''), null, { timeout: 5000 }).catch(() => undefined);
check(/beep\.wav/.test((await page.textContent('#rwSounds')) || ''), `내 알림음이 저장되고 이름이 보인다 (${await page.textContent('#rwSounds')})`);
check((await page.locator('.rw-slot[data-i="0"] [data-k="sound"] option[value="custom1"]').count()) === 1, '소리 고르기에 내 소리 1 이 있다');
await page.selectOption('.rw-slot[data-i="0"] [data-k="sound"]', 'custom1');
await page.waitForTimeout(3300);
await page.evaluate(() => window.__stage.set('box', '#20c040'));
await page.waitForTimeout(600);
const beforeCustom = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'chg').length);
await page.evaluate(() => window.__stage.set('box', '#c02020'));
await page.waitForFunction((n) => window.__rw.fires.filter((f) => f.name === 'chg').length > n, beforeCustom, { timeout: 5000 }).catch(() => undefined);
const afterCustom = await page.evaluate(() => window.__rw.fires.filter((f) => f.name === 'chg').length);
check(afterCustom === beforeCustom + 1, `내 소리를 고른 슬롯도 울린다 (${beforeCustom} -> ${afterCustom})`);

/* 단축키: Alt+Shift+S 로 멈추고 다시 시작 */
await page.keyboard.press('Alt+Shift+KeyS');
await page.waitForTimeout(400);
check(!(await page.isDisabled('#rwStart')), '단축키로 멈춘다');
await page.keyboard.press('Alt+Shift+KeyS');
await page.waitForFunction(() => document.querySelector('#rwStart')?.disabled === true, null, { timeout: 5000 }).catch(() => undefined);
check(await page.isDisabled('#rwStart'), '단축키로 다시 시작한다');

/* ⑥ 멈춤 */
await page.click('#rwStop');
await page.waitForTimeout(400);
check(!(await page.isDisabled('#rwStart')) && (await page.isDisabled('#rwStop')), '멈추면 시작 버튼이 살아난다');
check((await page.textContent('.rw-slot[data-i="0"] .rw-sim b')) === '-', '멈추면 닮음 표시가 비워진다');
check(errors.length === 0, `콘솔 오류 없음 (지금 ${errors.length}: ${errors.slice(0, 2).join(' | ')})`);

await browser.close();
frozen?.close();
process.stdout.write('\n');
if (failures.length) {
  console.error(`[smoke-regionwatch] 실패 ${failures.length}건`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[smoke-regionwatch] 전부 통과');
