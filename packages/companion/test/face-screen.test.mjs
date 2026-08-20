import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

import { webBody } from '../dist/index.js';

/**
 * **진짜 창을 띄워서** 잠근다 — 글자 맞춰보기가 아니라.
 *
 * 여기 잠그는 넷은 전부 「조용히 되돌아가는」 종류다(2026-08-19 실측):
 *
 *   ① 보낸 말이 거절돼도(400) 화면이 아무 말도 안 했다 — `/say` 의 **답을 아예 안 봤다.**
 *      내 말풍선은 멀쩡히 뜨고 얘는 영영 대답을 안 한다. 「내 말을 못 알아듣는 것 같다」의 정체.
 *   ② 알아챈 것이 말 방(page)에서 통째로 빠졌다 — `알아챈것()` 첫 줄이 `if (pageSurface) return`.
 *      「들었다: …」도 「기억에 담았다」도 긴 채팅 화면엔 한 줄도 안 떴다.
 *   ③ 우클릭 설정창에 **닫는 단추가 없었다.** 뚫린 창에서는 바깥이 클릭을 안 받고, 창에
 *      초점이 없으면 Esc 도 안 먹는다 — 한 번 열면 못 닫는 창.
 *   ④ 창을 열자마자 `body3d` TDZ 로 터졌다(`text.focus()` → setState). ①②를 고쳐
 *      실패가 화면에 빨갛게 뜨자 **그 자리에서** 잡힌 것이다.
 *
 * 글자 맞춰보기(다른 test/*.test.mjs 가 쓰는 손)로는 ④를 절대 못 잡는다. 그래서 여기만
 * 진짜 브라우저를 쓴다. 크로뮴이 없으면 **건너뛰지 않고 실패한다** — 조용히 안 도는
 * 검사는 없는 검사다(`npx playwright install chromium`).
 */

const port2 = 4631;
const url2 = `http://127.0.0.1:${port2}`;

/** 크로뮴이 없으면 **건너뛰지 않고 실패한다** — 조용히 안 도는 검사는 없는 검사다. */
function chromium2() {
  try {
    return require('playwright').chromium;
  } catch {
    return null;
  }
}

const require = createRequire(import.meta.url);
const chromium = chromium2();

test('창 검사 — 실패는 빨갛게, 알아챔은 말 방에도, 설정창은 닫힌다', { concurrency: false }, async (t) => {
  assert.notEqual(chromium, null, '크로뮴이 없다. `npx playwright install chromium` — 검사를 건너뛰지 않는다');

  const body = webBody({ port: port2, open: false });
  body.sense.start(() => {});
  const browser = await chromium.launch();
  const consoleMask = [];

  const openWindow = async (after = '') => {
    const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
    page.on('pageerror', (e) => consoleMask.push(`${after || '/'} pageerror: ${e.message}`));
    await page.goto(url2 + '/' + after, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    return page;
  };

  try {
    await t.test('거절당한 말이 대화창에 빨갛게 남는다 — 조용히 사라지면 고장과 구분이 안 된다', async () => {
      // 말 방(page)은 어느 줄에서 일할지 고르기 전엔 입력칸이 잠긴다 — 치는 검사는 이쪽 창에서.
      const page = await openWindow();
      // 서버가 400 + 안받은이유 로 돌려보내는 글(깨진 글)을 일부러 보낸다.
      await page.fill('#text', '�����');
      await page.press('#text', 'Enter');
      await page.waitForSelector('.line.fail', { timeout: 5000 });

      /* **거절 때문에** 뜬 줄인지 본다 — 아무 빨간 줄이나 세면 안 된다. 이 검사 자리에는
         모델 파일이 없어서 「3D 몸을 못 세웠다」도 같이 빨갛게 뜬다(그건 그것대로 맞다). */
      const all = await page.locator('.line.fail .what').allInnerTexts();
      const reject = all.find((t) => t.includes('보낸 말이'));
      assert.ok(reject !== undefined, `보낸 말이 거절된 것을 화면이 안 알렸다: ${JSON.stringify(all)}`);
      assert.match(reject, /깨져/, `왜 안 됐는지가 그 줄에 있어야 한다: ${reject}`);

      // 빨간지도 본다 — 「떴다」와 「눈에 띈다」는 다른 말이다.
      const color = await page.locator('.line.fail .what', { hasText: '보낸 말이' }).first()
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      const [r, g, b] = (color.match(/\d+/g) ?? []).map(Number);
      assert.ok(r > 180 && r > g + 80 && r > b + 80, `실패 줄이 안 빨갛다: ${color}`);
      await page.close();
    });

    await t.test('알아챈 것이 말 방(page)에도 뜬다 — 여기서 통째로 빠져 있었다', async () => {
      const page = await openWindow('?surface=page');
      body.알아챔('기억에 담았다 — 검사');
      await page.waitForSelector('.line.notice', { timeout: 5000 });
      const content = await page.locator('.line.notice .what').last().innerText();
      assert.match(content, /기억에 담았다/, `알아챈 것이 말 방 대화창에 안 뜬다: ${content}`);
      await page.close();
    });

    await t.test('우클릭 설정창을 단추로 닫을 수 있다 — Esc·바깥누르기는 뚫린 창에서 안 먹는다', async () => {
      const page = await openWindow();
      await page.locator('.stage').click({ button: 'right' });
      assert.equal(await page.locator('#menu').isVisible(), true, '우클릭했는데 설정이 안 열렸다');
      assert.equal(await page.locator('#menuClose').isVisible(), true, '닫는 단추가 눈에 안 보인다');
      await page.click('#menuClose');
      assert.equal(await page.locator('#menu').isVisible(), false, '단추를 눌렀는데 안 닫힌다');
      await page.close();
    });

    await t.test('창을 여는 것만으로 터지는 자리가 없다 — body3d 가 TDZ 로 터지던 자리', () => {
      assert.deepEqual(consoleMask, [], `창이 열리다 터졌다: ${consoleMask.join(' · ')}`);
    });
  } finally {
    await browser.close();
    await body.sense.stop?.();
  }
});
