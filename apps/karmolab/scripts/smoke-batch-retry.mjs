/**
 * 여러 장 중 **몇 장이 깨졌을 때** 그 사실이 남는지 (TASK-KL-302)
 *
 * 전에는 안 남았다. 한 장이 깨지면 그 말을 하긴 했는데, 곧이어 나오는 「n장 다 됐습니다」가
 * 그 말을 **덮었다**. 스무 장을 넣고 두 장이 깨지면 사람이 보는 것은 18 이라는 숫자뿐이라,
 * 어느 것이 왜 안 됐는지 알 수 없고 다시 하려면 스무 장을 통째로 다시 넣어야 했다.
 *
 * 그래서 **깨진 그림을 일부러 섞어** 넣고 본다:
 *   ① 끝말에 실패한 파일 **이름이 남는가**
 *   ② 「안 된 것만 다시」 단추가 **깨진 것 수만큼** 나오는가
 *   ③ 성공한 것들은 그대로 목록에 있는가 (하나 깨졌다고 나머지를 버리지 않는다)
 *
 * 사용: node scripts/smoke-batch-retry.mjs
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name} — ${detail}`);
};

const site = await serveRepo();
const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(`${site.base}/apps/karmolab/index.html#imgbatch`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ibRun', { timeout: 30000 });

  /* 진짜 PNG 하나 + 그림이 아닌 것 둘. 뒤엣것은 `loadImage` 가 못 열어 실패로 떨어진다. */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
  );
  await page.setInputFiles('#ibFile', [
    { name: 'good.png', mimeType: 'image/png', buffer: png },
    { name: 'broken-1.png', mimeType: 'image/png', buffer: Buffer.from('이건 그림이 아니다') },
    { name: 'broken-2.png', mimeType: 'image/png', buffer: Buffer.from('이것도 아니다') }
  ]);
  await page.click('#ibRun');

  await page.waitForFunction(
    () => /안 됩니다|failed|失敗/.test(document.querySelector('#ibStatus')?.textContent || ''),
    undefined,
    { timeout: 30000 }
  );

  const status = (await page.locator('#ibStatus').innerText()).trim();
  check('실패한 이름이 끝말에 남는다', status.includes('broken-1.png'), `상태줄: ${status}`);
  check('실패한 이름이 둘 다 남는다', status.includes('broken-2.png'), `상태줄: ${status}`);
  check('성공한 수도 말한다', /1/.test(status), `상태줄: ${status}`);

  const bar = page.locator('#ibFails');
  check('다시 하는 자리가 보인다', await bar.isVisible(), '숨어 있다');
  const btn = bar.locator('button');
  const btnText = (await btn.innerText()).trim();
  check('깨진 것 수만큼 적힌다', btnText.includes('2'), `단추: ${btnText}`);

  const rows = await page.locator('#ibList .tool-list-row').count();
  check('성공한 것은 목록에 남는다', rows === 1, `줄 ${rows}개`);

  /* 눌러도 깨진 것은 여전히 깨진다 — 사라지지 않고 그대로 남아야 한다(거짓 성공 금지) */
  await btn.click();
  await page.waitForFunction(
    () => /안 됩니다|failed|失敗/.test(document.querySelector('#ibStatus')?.textContent || ''),
    undefined,
    { timeout: 30000 }
  );
  const after = (await page.locator('#ibStatus').innerText()).trim();
  check('다시 해도 거짓 성공하지 않는다', after.includes('broken-1.png'), `상태줄: ${after}`);
  check('다시 한 뒤에도 단추가 남는다', await bar.locator('button').isVisible(), '단추가 사라졌다');
} catch (e) {
  failures.push(`검사가 끝까지 못 갔다: ${e.message}`);
} finally {
  await browser.close();
  await site.close();
}

if (failures.length) {
  console.log(`[smoke-batch-retry] 실패 ${failures.length}건`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('[smoke-batch-retry] 여러 장 중 깨진 것 — 이름이 남고, 그것만 다시 할 수 있다 (8가지 확인)');
