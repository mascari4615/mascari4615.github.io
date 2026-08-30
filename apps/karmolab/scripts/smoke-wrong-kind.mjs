/** Wrong-kind uploads must be rejected without breaking valid uploads (TASK-KL-303). */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const failures = [];
const check = (name, condition, detail) => {
  if (!condition) failures.push(`${name}. ${detail}`);
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);
const site = await serveRepo();
const browser = await chromium.launch();

async function open(tool) {
  const page = await browser.newPage();
  await page.goto(`${site.base}/apps/karmolab/index.html#${tool}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pfFile', { state: 'attached', timeout: 30000 });
  return page;
}

try {
  for (const [tool, file] of [
    ['pdf', { name: '노래.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('sound') }],
    ['image', { name: '문서.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }],
    ['sound', { name: '사진.png', mimeType: 'image/png', buffer: png }]
  ]) {
    const page = await open(tool);
    await page.setInputFiles('#pfFile', file);
    await page.waitForTimeout(900);
    const hint = (await page.locator('#pfDropHint').innerText().catch(() => '')).trim();
    check(`${tool}: wrong kind`, /갈래가 아닙니다|Not the kind|種類ではありません/.test(hint), hint);
    check(`${tool}: names file`, hint.includes(file.name), hint);
    check(`${tool}: rejects file`, !(await page.locator('#pfFileBar').isVisible()), hint);
    await page.close();
  }

  const page = await open('image');
  await page.setInputFiles('#pfFile', { name: '사진.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => !document.querySelector('#pfFileBar')?.hidden, undefined, { timeout: 20000 });
  check('valid kind accepted', (await page.locator('#pfName').innerText()).includes('사진.png'), 'file row missing');
  check('valid kind not rejected', !/갈래가 아닙니다|Not the kind/.test(await page.locator('#pfDropHint').innerText().catch(() => '')), 'rejection shown');
  await page.close();
} catch (error) {
  failures.push(`smoke aborted: ${error.message}`);
} finally {
  await browser.close();
  await site.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('[smoke-wrong-kind] invalid files rejected; valid file accepted');
