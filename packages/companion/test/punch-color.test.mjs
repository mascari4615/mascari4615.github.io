import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 뚫어낼 색 — **양쪽이 같은 색을 알아야** 창이 투명해진다.
 *
 * 창을 띄우는 쪽은 한 색을 뚫어내고, 페이지는 그 색을 칠한다. 한쪽만 알면 뚫을 픽셀이
 * 없어서 창이 통째로 하얘진다 — 실제로 그랬다(「흰 화면만 보여」). 두 쪽이 각자 값을 들고
 * 있으면 아무 경고 없이 어긋나므로, 여기서 **계약을 기계로 붙잡아 둔다.**
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const 읽기 = (...p) => readFileSync(join(root, ...p), 'utf8');

test('창 띄우는 쪽은 색을 주소와 스크립트 **양쪽에** 넘긴다', () => {
  const web = 읽기('src', 'body', 'web.ts');
  const 색 = /const KEY = '([0-9A-Fa-f]{6})'/.exec(web);
  assert.notEqual(색, null, '뚫을 색이 한 곳에 정해져 있어야 한다');
  assert.match(web, /t=\$\{KEY\}/, '주소로 페이지에 알려 줘야 한다');
  assert.match(web, /'-KeyColor', KEY/, '창 띄우는 스크립트에도 같은 값을 넘겨야 한다');
});

test('페이지는 받은 색을 바탕에 칠한다 — 안 칠하면 뚫을 게 없다', () => {
  const page = 읽기('assets', 'face.html');
  assert.match(page, /URLSearchParams\(location\.search\)\.get\('t'\)/, '주소에서 색을 읽어야 한다');
  assert.match(page, /document\.body\.style\.background/, '바탕에 실제로 칠해야 한다');
});

test('페이지는 아무 값이나 칠하지 않는다 — 주소는 남이 건드릴 수 있다', () => {
  const page = 읽기('assets', 'face.html');
  assert.match(page, /\[0-9a-fA-F\]\{6\}/, '여섯 자리 색만 받아야 한다');
});

test('창 띄우는 스크립트는 색을 밖에서 받는다 — 안에 박아 두면 또 어긋난다', () => {
  const ps1 = 읽기('assets', 'pin-window.ps1');
  assert.match(ps1, /\[string\]\$KeyColor/, '색을 매개변수로 받아야 한다');
  assert.match(ps1, /MakeColorTransparent\(\$handle, \$key\)/, '받은 색으로 뚫어야 한다');
});

test('색 뒤집기 — 윈도우는 0x00BBGGRR 로 받는다', () => {
  const ps1 = 읽기('assets', 'pin-window.ps1');
  // 뒤집지 않으면 빨강과 파랑이 바뀌어 엉뚱한 색이 뚫린다.
  assert.match(ps1, /\$b -shl 16/);
  assert.match(ps1, /\$g -shl 8/);
});

test('투명하게 안 띄울 땐 색을 안 넘긴다 — 평범한 탭이 분홍색이면 안 된다', () => {
  const web = 읽기('src', 'body', 'web.ts');
  assert.match(web, /transparent \? `\$\{url\}/, '투명일 때만 주소에 붙어야 한다');
  assert.match(web, /\.\.\.\(transparent \? \['-Transparent', '-KeyColor', KEY\] : \[\]\)/);
});
