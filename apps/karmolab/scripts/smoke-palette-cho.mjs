/**
 * ⌘K 찾기가 **초성으로도** 찾아 주는가 (KL-205 곁가지)
 *
 * 이 사이트에서 도구를 여는 가장 빠른 길이 ⌘K 다. 그리고 한국 사람은 「ㄱㅈㅅ」처럼 초성만
 * 친다 — 그게 안 되면 찾기가 반쯤 죽은 것인데, **화면에는 「결과 없음」만 뜬다.** 오류도 안 나고
 * 게이트도 안 선다. 초성 뽑는 자리를 알맹이(`core/jamo`)로 갈아 끼운 뒤라 더더욱 물어야 한다.
 *
 * 무엇을 하나: 진짜 palette 번들을 브라우저에 실어 창을 열고 「ㄱㅈㅅ」을 쳐서
 * 「글자수 세기」가 목록에 뜨는지 본다.
 *
 * 사용: node scripts/smoke-palette-cho.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const NL = String.fromCharCode(10);
const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUNDLE = 'js/palette.js';

if (fs.existsSync(path.join(appRoot, BUNDLE)) === false) {
  console.log(`[palette-cho] CANNOT-RUN(건너뜀) — 번들이 아직 없다: ${BUNDLE}`);
  console.log('  `node build.mjs` 뒤에 돌려라.');
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[palette-cho] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(NL)[0]);
  process.exit(1);
}

const page = await browser.newPage();
await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await page.goto('http://localhost/');

/*
 * 도구 목록은 `Toolbox.getTools()` 가 준다 — 셸이 들고 있는 것이다. 여기서는 두 개만 준다
 * (찾기 **규칙**을 보는 검사지 목록 검사가 아니다).
 */
await page.evaluate(() => {
  window.__KARMO_LOCALE = 'ko';
  window.KARMOLAB_LAZY_META = [
    { id: 'charcount', title: '글자수 세기', category: 'tool', desc: '글자·낱말·줄 수를 센다' },
    { id: 'mesh3d', title: '3D 뷰어', category: 'tool', desc: 'STL·OBJ 를 열어 돌려 본다' }
  ];
  window.KARMOLAB_LAZY_META_BY_ID = Object.fromEntries(window.KARMOLAB_LAZY_META.map((w) => [w.id, w]));
  window.Toolbox = {
    getTools: () => window.KARMOLAB_LAZY_META,
    isDesktopApp: () => false,
    trackUse() {}
  };
});
await page.addScriptTag({ content: fs.readFileSync(path.join(appRoot, BUNDLE), 'utf8') });

const fails = [];

/*
 * 창은 `KarmoPalette.open()` 으로 연다. ⌘K 키 묶는 자리는 셸(toolbox)이지 이 묶음이 아니라서,
 * 키를 누르는 걸로 재면 셸을 안 실은 이 검사만 애먼 이유로 빨개진다.
 */
await page.evaluate(() => window.KarmoPalette.open());
const input = await page.waitForSelector('.kp-input', { timeout: 5000 }).catch(() => null);

if (input === null) {
  fails.push('KarmoPalette.open() 을 불러도 찾기 창이 안 열린다');
} else {
  const ask = async (q) => {
    await page.fill('.kp-input', '');
    await page.fill('.kp-input', q);
    await page.waitForTimeout(150);
    return page.$$eval('.kp-row-title', (els) => els.map((e) => e.textContent.trim()));
  };

  const byCho = await ask('ㄱㅈㅅ');
  if (byCho.some((t) => t.includes('글자수 세기')) === false) {
    fails.push(`초성 「ㄱㅈㅅ」으로 「글자수 세기」가 안 나온다: ${JSON.stringify(byCho)}`);
  }

  /* 초성이 아닌 보통 글로도 여전히 되는지 — 초성 규칙을 고치다 이쪽을 깨는 일이 흔하다. */
  const byWord = await ask('글자');
  if (byWord.some((t) => t.includes('글자수 세기')) === false) {
    fails.push(`보통 글 「글자」로도 안 나온다: ${JSON.stringify(byWord)}`);
  }

  /* 아무 말이나 넣으면 안 나와야 한다 — 늘 다 보여 주면 「찾았다」가 뜻이 없다. */
  const junk = await ask('zzzq');
  if (junk.length > 0) fails.push(`없는 말인데도 뭔가 나온다: ${JSON.stringify(junk)}`);
}

await browser.close();

if (fails.length > 0) {
  console.error('[palette-cho] 실패:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('[palette-cho] ⌘K 에서 초성(ㄱㅈㅅ)·보통 글 둘 다 찾아지고, 없는 말은 안 찾아진다');
