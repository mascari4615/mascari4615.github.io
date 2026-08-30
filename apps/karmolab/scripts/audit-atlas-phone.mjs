#!/usr/bin/env node
/**
 * audit-atlas-phone. **폰으로 조종할 수 있나, 그리고 못 할 때 그렇다고 말하나** (TASK-KAR-233).
 *
 * 정본이 못 박는 제약 둘이 이 기능의 생사를 정한다:
 * , `deviceorientation` 은 **보안 컨텍스트(HTTPS)에서만** 온다. 폰이 데스크톱을
 *    `http://192.168.x.x:8813` 로 열면 **센서 API 가 아예 없다**(localhost 가 보안
 *    컨텍스트인 건 데스크톱 얘기다).
 * , iOS 는 `requestPermission()` 을 **누름 안에서** 불러야 한다.
 * 둘 다 **조용히 안 되는** 실패다. 그래서 왜 안 되는지 화면이 말하나를 먼저 건다.
 *
 * 팔은 금방 지친다(어깨를 45° 넘게 벌리면 버티는 시간이 반으로 준다). 그래서 클러치다.
 *
 * 합격선(재기 **전 바퀴에** TASK 문서에 박아 뒀다):
 *  ① HTTPS 가 아니면 **켜지지 않고 화면이 그렇게 적는다**
 *  ② 권한은 누름 안에서, 거절, 미지원을 화면이 말한다
 *  ③ **클러치**. 잡고 기울이면 움직이고, **놓으면 멈춘다**
 *  ④ 다시 잡으면 **그 자세가 0점** (기운 채로 다시 잡아도 안 튄다)
 *  ⑤ 몇 초 안 쓰면 **저절로 꺼진다**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasPath } from './lib/atlas-file.mjs';

import { untilSettled } from './lib/settle.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
const ATLAS = atlasPath(HERE);
const BUNDLE = path.join(KARMOLAB, 'js/widgets/memo-atlas.js');
if (!fs.existsSync(ATLAS) || !fs.existsSync(BUNDLE)) {
  console.log('[phone] 지도나 번들이 없다. 검사 건너뜀');
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.log('[phone] playwright 가 없다. 검사 건너뜀');
  process.exit(0);
}

const atlas = fs.readFileSync(ATLAS, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const bad = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

/** 아무 출신으로나 연다. `http://` 로 열면 보안 컨텍스트가 아니다(localhost 는 예외라 안 쓴다). */
async function open(origin) {
  const page = await ctx.newPage();
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/data/memo-atlas.json')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: atlas });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' });
  });
  await page.goto(origin);
  await page.evaluate(() => {
    window.__reg = {};
    window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, onDispose() {} };
    window.__atlasPhoneIdleMs = 400;   // 자가 오래 안 기다리게. 기능이 읽는 값이다
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const h = document.createElement('div');
    h.id = 'host'; h.style.width = '1200px'; h.style.height = '760px';
    document.body.appendChild(h);
    window.__reg['memo-atlas'].tabs[0].build(h);
  });
  await page.waitForFunction(() => Array.isArray(window.__atlasLabelBoxes), undefined, { timeout: 30000 });
  /* 더 보기 안에 있는 단추다. 열어야 누를 수 있다(사람도 그렇게 쓴다). */
  await page.click('#host [data-more]');
  await page.waitForTimeout(80);
  return page;
}

const tilt = (page, beta, gamma) => page.evaluate(([b, g]) => {
  window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: g, alpha: 0 }));
}, [beta, gamma]);
const at = (page) => page.evaluate(() => window.__atlasControl.state());
const phoneState = (page) => page.evaluate(() => window.__atlasPhone);

// ── ① HTTPS 가 아니면 켜지지 않고 화면이 말하나 ───────────────────────
{
  const page = await open('http://atlas.test/');
  const secure = await page.evaluate(() => window.isSecureContext);
  await page.click('#host [data-phone]');
  await untilSettled(page, () => page.evaluate(() => JSON.stringify([window.__atlasScale, window.__atlasVisible, window.__atlasPlaced?.length, window.__atlasLabelBoxes?.length, document.querySelector('#host')?.textContent?.length])));
  const st = await phoneState(page);
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  const saysHttps = /HTTPS/.test(text);
  console.log(`  ① http 로 열면. 보안 컨텍스트 ${secure}, 켜짐 ${st.on}, 까닭 ${st.reason}, 화면이 HTTPS 를 말하나 ${saysHttps ? '○' : '✗'}`);
  if (secure) bad.push('http://atlas.test 가 보안 컨텍스트로 나온다. 이 검사가 아무것도 안 재고 있다');
  if (st.on) bad.push('HTTPS 가 아닌데 폰 조종이 켜졌다. 센서는 안 오는데 켜진 척한다');
  if (!saysHttps) bad.push('HTTPS 가 아니라서 안 된다는 말을 화면이 안 한다. 조용히 안 되는 게 가장 나쁘다');
  await page.close();
}

// ── ②③④⑤ HTTPS 에서 ────────────────────────────────────────────────
{
  const page = await open('https://atlas.test/');
  await page.click('#host [data-phone]');
  await page.waitForTimeout(120);
  let st = await phoneState(page);
  console.log(`  ② https 로 열면. 켜짐 ${st.on}, 권한 ${st.permission}`);
  if (!st.on) bad.push(`HTTPS 인데도 안 켜진다 (까닭 ${st.reason})`);
  const hidden = await page.evaluate(() => document.querySelector('#host [data-grab]')?.hidden);
  if (hidden !== false) bad.push('켰는데 잡기 단추가 안 보인다. 클러치 없이 손을 들고 있게 만든다');

  /* ③ 잡고 기울이면 움직이고, 놓으면 멈춘다. */
  const before = await at(page);
  await tilt(page, 0, 0);                       // 안 잡은 채. 움직이면 안 된다
  await page.waitForTimeout(60);
  await tilt(page, 20, 20);
  await page.waitForTimeout(60);
  const idle = await at(page);
  if (Math.abs(idle.x - before.x) > 0.5 || Math.abs(idle.y - before.y) > 0.5) {
    bad.push('안 잡았는데도 지도가 움직인다. 클러치가 없다');
  }
  await page.dispatchEvent('#host [data-grab]', 'pointerdown');
  await tilt(page, 0, 0);                       // 잡은 첫 판 = 0점
  await page.waitForTimeout(60);
  const zeroed = await at(page);
  await tilt(page, 12, 15);
  await page.waitForTimeout(60);
  const moved = await at(page);
  const dist = Math.hypot(moved.x - zeroed.x, moved.y - zeroed.y);
  console.log(`  ③ 잡고 기울이면. ${dist.toFixed(0)}px 움직인다`);
  if (!(dist > 20)) bad.push(`잡고 기울여도 ${dist.toFixed(0)}px 밖에 안 움직인다. 조종이 안 된다`);

  await page.dispatchEvent('#host [data-grab]', 'pointerup');
  const held = await at(page);
  await tilt(page, -30, -30);
  await page.waitForTimeout(60);
  const after = await at(page);
  const drift = Math.hypot(after.x - held.x, after.y - held.y);
  console.log(`  ③ 놓고 더 기울이면. ${drift.toFixed(0)}px (0 이어야 한다)`);
  if (drift > 0.5) bad.push(`놓았는데도 ${drift.toFixed(0)}px 움직인다. 손을 떼도 지도가 혼자 간다`);

  /* ④ 기운 채로 다시 잡아도 안 튄다. 그 자세가 새 0점. */
  await page.dispatchEvent('#host [data-grab]', 'pointerdown');
  await tilt(page, -30, -30);
  await page.waitForTimeout(60);
  const regrab = await at(page);
  const jump = Math.hypot(regrab.x - after.x, regrab.y - after.y);
  console.log(`  ④ 기운 채로 다시 잡으면. ${jump.toFixed(0)}px 튄다 (0 이어야 한다)`);
  if (jump > 0.5) bad.push(`다시 잡을 때 ${jump.toFixed(0)}px 튄다. 편한 자세에서 못 잡는다`);
  await page.dispatchEvent('#host [data-grab]', 'pointerup');

  /* ⑤ 한동안 안 쓰면 저절로 꺼진다.
     재움-의도: **아무것도 안 하는 시간 자체가 조건**이다. 기다릴 값이 없다. */
  await page.waitForTimeout(700);
  st = await phoneState(page);
  const text = await page.evaluate(() => document.querySelector('#host')?.textContent || '');
  console.log(`  ⑤ 400ms 넘게 안 쓰면. 켜짐 ${st.on}, 까닭 ${st.reason}`);
  if (st.on) bad.push('한동안 안 써도 안 꺼진다. 켜 둔 걸 잊으면 배터리와 손이 상한다');
  if (st.reason !== 'idle') bad.push(`저절로 꺼진 까닭이 ${st.reason} 이다 (idle 이어야 한다)`);
  if (!/안 움직였/.test(text)) bad.push('저절로 꺼졌는데 화면이 아무 말도 안 한다');
  await page.close();
}

await browser.close();

if (bad.length) {
  console.log('[phone] **폰 조종이 서지 않는다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  memo-atlas.ts 의 phone, onTilt, grabDown 을 봐라.');
  process.exit(1);
}
console.log('[phone] HTTPS 가 아니면 그렇게 말하고, 잡는 동안만 움직이고, 다시 잡으면 그 자세가 가운데다');
