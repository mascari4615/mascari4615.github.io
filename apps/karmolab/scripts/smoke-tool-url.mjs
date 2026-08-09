/**
 * 주소만으로 도구가 그 상태로 열리는지 확인한다 (S1 — 흡수계획 06 P1)
 *
 * `test-core.mjs` 는 주소를 **읽는 함수**가 맞는지 본다. 그건 화면과 무관하다.
 * 여기서 보는 것은 그 다음 — **위젯이 실제로 그 값으로 그려지는가**. 둘은 다르다:
 * 읽기는 맞는데 위젯이 안 받아 쓰면, 검사는 초록이고 링크는 아무 일도 안 한다.
 *
 * 그래서 진짜 브라우저에 위젯을 올리고 **주소를 바꿔 가며** 화면 값을 읽는다.
 *  ① 주소 없이 열면 평소 모습 (예시 글)
 *  ② `?op=encode&text=…` 로 열면 그 글이 들어가 있고 결과가 이미 나와 있다
 *  ③ `?op=decode&code=…` 는 반대 방향
 *  ④ 잘못된 주소는 **조용히 무시하지 않고** 상태줄에 이유를 말한다
 *
 * 사용: node scripts/smoke-tool-url.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const failures = [];
const check = (ok, why) => {
  process.stdout.write(ok ? '.' : 'x');
  if (ok === false) failures.push(why);
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>t</title>' })
);
const script = read('js/widgets/tools/base64.js');

/** 주어진 주소로 열어 위젯을 한 번 그린 뒤, 화면에 뭐가 들어갔는지 돌려준다. */
async function open(search) {
  await page.goto('http://localhost/' + search);
  await page.evaluate(() => {
    window.__reg = {};
    window.Toolbox = { register: (t) => { window.__reg[t.id] = t; }, trackUse() {}, copyText() {}, mountTool() { return true; } };
  });
  await page.addScriptTag({ content: script });
  return page.evaluate(() => {
    const tool = window.__reg['base64'];
    if (!tool) return { missing: true };
    const host = document.createElement('div');
    document.body.appendChild(host);
    tool.tabs[0].build(host);
    return {
      text: host.querySelector('#b6Text').value,
      code: host.querySelector('#b6Code').value,
      urlSafe: host.querySelector('#b6Url').checked,
      status: host.querySelector('#b6Status').textContent,
      statusClass: host.querySelector('#b6Status').className
    };
  });
}

// ① 평소 (주소에 아무것도 없음) — 있던 동작이 그대로여야 한다
const plain = await open('');
check(plain.missing !== true, '위젯이 등록되지 않았다');
eq(plain.text, '안녕하세요', '주소 없이 열면 예시 글');
eq(plain.code, '7JWI64WV7ZWY7IS47JqU', '예시 글의 결과가 이미 나와 있다');

// ② 주소로 부르기 — 이 한 줄이 S1 이 값을 내는 자리다
const enc = await open('?op=encode&text=' + encodeURIComponent('링크로 열었다'));
eq(enc.text, '링크로 열었다', '주소의 글이 칸에 들어간다');
check(enc.code.length > 0 && enc.code !== plain.code, `결과가 새로 계산돼야 한다 (${enc.code})`);

const safe = await open('?op=encode&text=' + encodeURIComponent('~~~???') + '&urlSafe=true');
eq(safe.urlSafe, true, 'urlSafe 체크가 켜진다');
check(/[+/=]/.test(safe.code) === false, `URL-safe 로 나와야 한다: ${safe.code}`);

// ③ 반대 방향
const dec = await open('?op=decode&code=7JWI64WV7ZWY7IS47JqU');
eq(dec.text, '안녕하세요', '주소의 Base64 가 글자로 풀린다');

// ④ 잘못된 주소는 말을 한다 (조용한 무시 금지)
const badOp = await open('?op=없는연산');
check(badOp.status.includes('없는연산'), `없는 연산이면 이유를 말해야 한다: ${badOp.status}`);
check(badOp.statusClass.includes('error'), '오류 표시가 붙어야 한다');
eq(badOp.text, '안녕하세요', '오류가 나도 도구는 평소처럼 쓸 수 있어야 한다');

const missing = await open('?op=encode');
check(missing.status.includes('text'), `빠진 칸을 말해야 한다: ${missing.status}`);

await browser.close();
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[smoke-tool-url] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[smoke-tool-url] 주소로 부르기 — 전부 통과');
