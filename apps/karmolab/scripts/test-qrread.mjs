/**
 * QR 읽기가 진짜로 해독하는지 확인한다 (TASK-KL-088)
 *
 * 「QR 을 찾지 못했어요」는 오류가 아니라 정상 안내다. 그래서 해독이 통째로 망가져도
 * 도구는 조용히 그 말만 반복한다 — 파일도 오류도 없다.
 *
 * 그래서 **우리가 만든 QR 을 우리가 읽게** 한다. 만들기 도구가 옆 탭에 있으니
 * 두 기능이 서로를 검사하는 셈이다. 읽은 값이 넣은 값과 같아야 한다.
 * 와이파이 QR 도 넣어, 내용 종류를 알아보는지까지 본다.
 *
 * 사용: node scripts/test-qrread.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
/* ★ `/apps/karmolab/js/**` 는 디스크의 진짜 산출물로 준다 (2026-08-12) — 자매 검사들과 같은 처방. */
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.href.includes('jsqr')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: read('js/vendor/jsqr.min.js') });
  }
  const rel = url.pathname.replace(/^\/apps\/karmolab\//, '');
  if (rel !== url.pathname) {
    try {
      return route.fulfill({
        status: 200,
        contentType: rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/json; charset=utf-8',
        body: read(rel)
      });
    } catch { /* 없는 파일이면 아래 껍데기로 */ }
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
});
await page.addInitScript(() => { window.__KARMO_LOCALE = 'ko'; });
await page.goto('http://localhost/');
await page.evaluate(() => {
  window.__reg = {};
  window.Toolbox = {
    register: (t) => { window.__reg[t.id] = t; },
    trackUse() {},
    mountTool() { return true; },
    copyText: () => Promise.resolve(),
    ensureScript: (p) =>
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/apps/karmolab/js/' + p + '.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('못 불러옴: ' + p));
        document.head.appendChild(s);
      })
  };
  // 브라우저 기본 기능이 있어도 **해독기 경로**를 확인해야 하므로 일부러 감춘다
  // (기본 기능만 통과시키면 해독기가 깨져도 모른다)
  delete window.BarcodeDetector;
  // qrgen 은 화면 문구 도우미를 쓴다 — 시험에는 필요 없으니 빈 것으로 채운다
  window.Mdd = { linePreset() {} };
});
await page.addScriptTag({ content: read('js/widgets/tools/qrgen.js') });
await page.addScriptTag({ content: read('js/widgets/tools/qrread.js') });

const result = await page.evaluate(async () => {
  const gen = window.__reg['qrgen'];
  const reader = window.__reg['qrread'];
  if (!gen || !reader) return { ok: false, why: '위젯이 등록되지 않았다' };

  const genHost = document.createElement('div');
  document.body.appendChild(genHost);
  gen.tabs[0].build(genHost);

  const readHost = document.createElement('div');
  document.body.appendChild(readHost);
  reader.tabs[0].build(readHost);

  /* 둘 다 그려질 때까지 기다린다 — build() 는 말 묶음을 받아 온 뒤에 그린다. */
  for (let i = 0; (genHost.children.length === 0 || readHost.children.length === 0) && i < 320; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }

  const wait = (test, ms, why) =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      const k = () => {
        if (test()) return res();
        if (Date.now() - t0 > ms) return rej(new Error(why));
        setTimeout(k, 80);
      };
      k();
    });

  /** 만들기 탭의 캔버스에서 QR 그림을 얻는다 */
  const makeQr = async (text) => {
    const input = genHost.querySelector('textarea, input[type="text"]');
    if (!input) throw new Error('만들기 입력칸을 못 찾았다');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const cv = genHost.querySelector('canvas');
    if (!cv || !cv.width) throw new Error('QR 이 그려지지 않았다');
    return new Promise((r) => cv.toBlob(r, 'image/png'));
  };

  const readIt = async (blob) => {
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'qr.png', { type: 'image/png' }));
    const input = readHost.querySelector('#qrFile');
    readHost.querySelector('#qrOut').value = '';
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await wait(() => readHost.querySelector('#qrOut').value.length > 0, 20000, 'QR 을 읽지 못했다');
    return readHost.querySelector('#qrOut').value;
  };

  const url = 'https://blog.mascari4615.com/karmolab/t/qr/';
  const gotUrl = await readIt(await makeQr(url));
  const urlInfo = readHost.querySelector('#qrInfo').textContent;

  const wifi = 'WIFI:T:WPA;S:우리집;P:hunter2;;';
  const gotWifi = await readIt(await makeQr(wifi));
  const wifiInfo = readHost.querySelector('#qrInfo').textContent;

  return {
    ok:
      gotUrl === url &&
      urlInfo.includes('웹 주소') &&
      urlInfo.includes('blog.mascari4615.com') &&
      gotWifi === wifi &&
      wifiInfo.includes('와이파이') &&
      wifiInfo.includes('우리집'),
    why: `주소 ${gotUrl === url ? '일치' : '불일치(' + gotUrl + ')'} · 안내 [${urlInfo.slice(0, 30)}] · 와이파이 ${gotWifi === wifi ? '일치' : '불일치'} · 안내 [${wifiInfo.slice(0, 30)}]`
  };
});

await browser.close();

console.log(`${result.ok ? '  OK' : '  X '} ${result.why}`);
if (!result.ok) {
  console.error('[test-qrread] QR 읽기가 제대로 돌지 않는다');
  process.exit(1);
}
console.log('[test-qrread] 만든 QR 을 되읽고 내용 종류까지 알아보는 것 확인');
