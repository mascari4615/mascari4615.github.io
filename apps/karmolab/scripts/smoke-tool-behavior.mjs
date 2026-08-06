/**
 * 도구가 실제로 답을 내는지 확인 (TASK-KL-089)
 *
 * 이미 있는 검사 두 개는 각각 다른 층을 본다.
 *  - `smoke-tools.mjs`      : 위젯이 등록되는가 (사이드바에서 사라지지 않는가)
 *  - `smoke-live-pages.mjs` : 페이지를 열면 화면이 그려지는가
 * 둘 다 통과하면서도 **넣으면 아무 일도 안 일어나는** 상태가 될 수 있다. 검색으로 들어온
 * 사람에게 그건 빈 페이지와 같고, 그대로 되돌아 나간다. 그래서 값을 넣고 답이 나오는지 본다.
 *
 * 전 도구를 자동으로 다루기는 어렵다(그림·소리·파일을 받는 도구가 많다). 대신 글자를 받아
 * 글자를 내는 대표 도구를 골라 둔다 — 여기가 깨지면 공통 배관이 상한 것이다.
 *
 * 사용: node scripts/smoke-tool-behavior.mjs            (기본 = 아래 목록 전부)
 *       BASE=http://127.0.0.1:8797/apps/blog node ...   (로컬 사본 대상)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';

/** [도구, 넣을 값, (필요하면) 눌러야 하는 것, 결과에 보여야 하는 것] */
const CASES = [
  ['charcount', '안녕하세요 반갑습니다', null, /11|공백/],
  ['base64', '안녕', null, /7JWI64WV/],
  ['slug', 'Hello World', null, /hello-world/],
  ['radix', '255', null, /FF|ff|1111\s?1111/],
  ['caseconv', 'hello world', null, /HELLO WORLD|Hello World|helloWorld/],
  ['hashgen', 'abc', null, /a9993e|ba7816/i],
  ['jsonfmt', '{"a":1}', '정렬', /"a"/],
  ['textclean', '  여러   공백  ', '중간 공백 하나로', /여러 공백/]
];

const only = process.argv.slice(2);
const cases = only.length ? CASES.filter(([id]) => only.includes(id)) : CASES;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const failures = [];

for (const [id, input, press, expect] of cases) {
  const page = await ctx.newPage();
  const scope = `#page-${id}`;
  try {
    await page.goto(`${BASE}/karmolab/t/${id}/`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(800);

    const field = await page.$(`${scope} textarea, ${scope} input[type="text"], ${scope} input[type="number"], ${scope} input:not([type])`);
    if (!field) throw new Error('값을 넣을 곳이 없다');
    await field.fill(input);

    if (press) {
      const hit = await page.evaluate(
        ({ s, label }) => {
          const el = [...document.querySelector(s).querySelectorAll('button, label, .btn, input[type="checkbox"]')].find(
            (e) => (e.textContent || '').trim().includes(label) || (e.getAttribute('aria-label') || '').includes(label)
          );
          if (!el) return false;
          el.click();
          return true;
        },
        { s: scope, label: press }
      );
      if (!hit) throw new Error(`「${press}」 를 못 찾았다`);
    }
    await page.waitForTimeout(1000);

    // 결과가 화면 글자로 나오는 도구도, 결과칸 안에 담기는 도구도 있다 — 둘 다 본다.
    const blob = await page.$eval(scope, (e) => `${e.innerText || ''}\n${[...e.querySelectorAll('input, textarea')].map((x) => x.value || '').join('\n')}`);
    const after = blob.split(input).join('');
    if (!expect.test(after)) throw new Error(`넣어도 답이 안 나온다 — ${after.replace(/\s+/g, ' ').trim().slice(0, 70)}`);
    process.stdout.write('.');
  } catch (e) {
    failures.push(`${id}: ${String(e.message).slice(0, 90)}`);
    process.stdout.write('x');
  }
  await page.close();
}

process.stdout.write('\n');
await browser.close();

if (failures.length) {
  console.error(`[smoke-tool-behavior] 답이 안 나오는 도구 ${failures.length}건 / ${cases.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-tool-behavior] ${cases.length}개 도구가 넣은 값에 답을 낸다`);
