import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const 뿌리 = join(dirname(fileURLToPath(import.meta.url)), '..');
const 창 = readFileSync(join(뿌리, 'assets', 'face.html'), 'utf8');
const 꾸밈 = readFileSync(join(뿌리, 'assets', 'ui.css'), 'utf8');

/**
 * 「지금 뭐 하는 중」 표시가 **실제로 보이는지**를 잠근다.
 *
 * 조수님: 「얘 계속 떠 있긴 한데, 뭐하는지 솔직히 모르겠음.」 파 보니 둘이 겹쳐 있었다 —
 * 상태를 알리는 함수가 받은 글을 **그대로 버리고** 있었고, 글을 띄우던 자리는 전체화면에서
 * **통째로 숨겨져** 있었다. 부르는 데는 스무 군데가 넘는데 보이는 데가 없었다.
 *
 * 둘 다 조용히 되돌아갈 수 있는 종류라 기계로 잠근다.
 */

test('표시할 자리가 창에 있다', () => {
  assert.match(창, /id="doing"/);
  assert.match(창, /id="doingIco"/);
});

test('상태를 알리는 함수가 받은 글을 안 버린다 — 여기서 버려서 스무 곳이 헛돌았다', () => {
  const 몸 = 창.slice(창.indexOf('function setState('), 창.indexOf('function setState(') + 400);
  assert.match(몸, /그리기\(/, 'setState 가 화면에 아무것도 안 그리면 부르는 곳이 다 헛돈다');
  assert.match(몸, /말/, '두 번째로 받은 글을 안 쓰면 「뭐 하는 중」이 영영 안 보인다');
});

test('전체화면에서 안 숨긴다 — 조수님이 실제로 쓰는 모드가 이쪽이다', () => {
  const 숨김줄 = 꾸밈.split('\n').filter((l) => l.includes('display: none !important'));
  for (const 줄 of 숨김줄) {
    assert.equal(줄.includes('.doing'), false, `전체화면에서 표시를 숨기면 안 된다: ${줄}`);
  }
  assert.match(꾸밈, /body\.full \.doing \{ display: inline-flex !important/);
});

test('탈난 것을 가만히 있는 것처럼 그리지 않는다', () => {
  assert.match(창, /탈났나/);
  assert.match(창, /ico\.textContent = 탈 \? '⚠'/);
});

test('아이콘 표에 안 쓰는 갈래를 남겨 두지 않는다 — 만들어 놓고 안 붙인 것과 같다', () => {
  const 표 = 창.slice(창.indexOf('const 하는일아이콘'), 창.indexOf('const 하는일아이콘') + 300);
  for (const 갈래 of (표.match(/(\w+):/g) ?? []).map((x) => x.slice(0, -1))) {
    assert.ok(창.includes(`setState('${갈래}'`), `${갈래} 를 아무도 안 쓴다`);
  }
});
