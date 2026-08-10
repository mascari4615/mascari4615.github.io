/**
 * 병음이 **사람 화면에서** 되는가 (흡수 ⓒ)
 *
 * 이 갈래는 다른 도구와 다르다: 소리 표(167KB)가 묶음 안에 없고 **주소로 받아 온다.**
 * 그래서 알맹이 시험이 아무리 초록이어도, 그 주소가 배포판에서 404 면 화면은 「받는 중」에서
 * 영원히 멈춘다. 그건 오직 진짜 서버에 띄워 봐야 잡힌다 — 여기서 그걸 한다.
 *
 * 보는 것 셋:
 *   ① 「병음」을 누르면 표를 받아 오고 (주소가 살아 있다)
 *   ② 汉字 를 넣으면 hàn zì 가 나오고 (표를 제대로 편다)
 *   ③ 성조를 숫자로 바꾸면 han4 zi4 가 된다 (고르개가 붙어 있다)
 *
 * 사용: node scripts/smoke-charconv-pinyin.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const NL = String.fromCharCode(10);
const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const PORT = 8831;

/* 볼 대상이 아직 없으면 「못 돌렸다」다 — 배포 길목에서 이걸 실패로 세면 안 된다. */
/* 소리 표는 **찍어서 커밋한 자산**이다 — 없으면 「아직 안 만들었다」가 아니라 고장이다.
   그래서 여기 안 넣는다(여기 넣으면 표가 사라진 날 검사가 조용히 건너뛴다). */
const NEEDED = ['js/widgets/tools/charconv.js'];
const missing = NEEDED.filter((rel) => fs.existsSync(path.join(appRoot, rel)) === false);
if (missing.length > 0) {
  console.log(`[charconv-pinyin] CANNOT-RUN(건너뜀) — 아직 없다: ${missing.join(' · ')}`);
  console.log('  `node build.mjs` 뒤에 돌려라.');
  process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const asked = [];
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  asked.push(url);
  if (url === '/smoke') {
    /* 셸 전체가 아니라 **위젯만** 올린다. 이 검사가 보는 건 표를 받아 오는 주소지 셸이 아니다.
       (셸까지 띄우면 다른 슬롯이 셸을 고칠 때마다 이 검사가 애먼 이유로 빨개진다.) */
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><title>smoke</title>');
    return;
  }
  const file = path.join(repoRoot, url);
  if (fs.existsSync(file) === false || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('no');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('[charconv-pinyin] CANNOT-RUN — 브라우저를 못 띄웠다. `npx playwright install chromium` 이 필요하다.');
  console.error(String(error?.message ?? error).split(NL)[0]);
  server.close();
  process.exit(1);
}

const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/smoke`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.__KARMO_LOCALE = 'ko';
  window.__reg = {};
  window.Toolbox = {
    register: (t) => {
      window.__reg[t.id] = t;
    },
    trackUse() {},
    copyText() {},
    onDispose() {},
    mountTool() {
      return true;
    }
  };
});
await page.addScriptTag({ url: '/apps/karmolab/js/widgets/tools/charconv.js' });
await page.evaluate(() => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  window.__reg['charconv'].tabs[0].build(host);
});

const fails = [];
const seen = await page.waitForSelector('#ccModes button', { timeout: 10000 }).catch(() => null);
if (seen === null) {
  fails.push('문자 변환 화면이 안 뜬다 (10초)');
} else {
  await page.fill('#ccIn', '汉字');
  const btn = await page.$('#ccModes button[data-mode="pinyin"]');
  if (btn === null) {
    fails.push('「병음」 단추가 없다');
  } else {
    await btn.click();

    const marked = await page
      .waitForFunction(() => document.querySelector('#ccOut')?.value.trim() !== '', { timeout: 15000 })
      .then(() => page.inputValue('#ccOut'))
      .catch(() => null);

    if (marked === null) {
      const warn = await page.textContent('#ccWarn').catch(() => '');
      fails.push(`「병음」을 눌러도 결과가 안 나온다 (15초) — 화면 알림: ${String(warn).trim()}`);
    } else if (marked.trim() !== 'hàn zì') {
      fails.push(`汉字 → hàn zì 가 아니다: ${JSON.stringify(marked)}`);
    }

    /* 표를 **주소로 받아 왔는지**까지 본다 — 이 검사의 존재 이유다. */
    if (asked.some((u) => u.endsWith('/data/han-pinyin.json')) === false) {
      fails.push('소리 표를 주소로 받아 오지 않았다 — 묶음에 박혀 있거나 아예 안 부른다');
    }

    await page.selectOption('#ccTone', 'number');
    const numbered = await page
      .waitForFunction(() => (document.querySelector('#ccOut')?.value ?? '').includes('4'), { timeout: 5000 })
      .then(() => page.inputValue('#ccOut'))
      .catch(() => null);
    if (numbered === null || numbered.trim() !== 'han4 zi4') {
      fails.push(`성조를 숫자로 바꿔도 han4 zi4 가 아니다: ${JSON.stringify(numbered)}`);
    }
  }
}

await browser.close();
server.close();

if (fails.length > 0) {
  console.error('[charconv-pinyin] 실패:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('[charconv-pinyin] 화면에서 소리 표를 주소로 받아 汉字 → hàn zì · han4 zi4 확인');
