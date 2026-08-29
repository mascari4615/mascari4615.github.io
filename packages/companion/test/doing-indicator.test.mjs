import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const window = readFileSync(join(root, 'assets', 'face.html'), 'utf8');
const decor = readFileSync(join(root, 'assets', 'ui.css'), 'utf8');

/**
 * 지금 뭐 하는 중 표시가 **실제로 보이는지**를 잠근다.
 *
 * 조수님: 얘 계속 떠 있긴 한데, 뭐하는지 솔직히 모르겠음. 파 보니 둘이 겹쳐 있었다 . 
 * 상태를 알리는 함수가 받은 글을 **그대로 버리고** 있었고, 글을 띄우던 자리는 전체화면에서
 * **통째로 숨겨져** 있었다. 부르는 데는 스무 군데가 넘는데 보이는 데가 없었다.
 *
 * 둘 다 조용히 되돌아갈 수 있는 종류라 기계로 잠근다.
 */

test('표시할 자리가 창에 있다', () => {
  assert.match(window, /id="doing"/);
  assert.match(window, /id="doingIco"/);
});

test('상태를 알리는 함수가 받은 글을 안 버린다. 여기서 버려서 스무 곳이 헛돌았다', () => {
  const body = window.slice(window.indexOf('function setState('), window.indexOf('function setState(') + 400);
  assert.match(body, /그리기\(/, 'setState 가 화면에 아무것도 안 그리면 부르는 곳이 다 헛돈다');
  assert.match(body, /말/, '두 번째로 받은 글을 안 쓰면 뭐 하는 중이 영영 안 보인다');
});

test('전체화면에서 안 숨긴다. 조수님이 실제로 쓰는 모드가 이쪽이다', () => {
  const hiddenLine = decor.split('\n').filter((l) => l.includes('display: none !important'));
  for (const line of hiddenLine) {
    assert.equal(line.includes('.doing'), false, `전체화면에서 표시를 숨기면 안 된다: ${line}`);
  }
  assert.match(decor, /body\.full \.doing \{ display: inline-flex !important/);
});

test('탈난 것을 가만히 있는 것처럼 그리지 않는다', () => {
  assert.match(window, /탈났나/);
  assert.match(window, /ico\.textContent = 탈 \? '⚠'/);
});

test('아이콘 표에 안 쓰는 갈래를 남겨 두지 않는다. 만들어 놓고 안 붙인 것과 같다', () => {
  const table = window.slice(window.indexOf('const 하는일아이콘'), window.indexOf('const 하는일아이콘') + 300);
  for (const kind of (table.match(/(\w+):/g) ?? []).map((x) => x.slice(0, -1))) {
    assert.ok(window.includes(`setState('${kind}'`), `${kind} 를 아무도 안 쓴다`);
  }
});

test('표시가 대화창과 같은 칸을 차지하지 않는다. 겹쳐서 화면이 이상해졌었다', () => {
  const cell = (picker) => {
    // 줄 첫머리에서 찾는다. 그냥 찾으면 body.full .doing { 이 먼저 걸린다.
    const i = decor.indexOf(String.fromCharCode(10) + picker);
    assert.notEqual(i, -1, `${picker} 를 못 찾았다`);
    const body2 = decor.slice(i, decor.indexOf('}', i));
    return (body2.match(/grid-row:\s*(\d+)/) ?? [])[1];
  };
  const displayCell = cell('.doing {');
  const talkCell = cell('.talk {');
  assert.notEqual(displayCell, undefined);
  assert.notEqual(displayCell, talkCell, `표시와 대화창이 같은 칸(${displayCell})이면 겹쳐 그려진다`);
});

test('방에 칸이 넷 있다. 칸보다 많은 것을 넣으면 마지막 칸에 쌓인다', () => {
  const i = decor.indexOf('.room {');
  const body3 = decor.slice(i, decor.indexOf('}', i));
  const cells = (body3.match(/grid-template-rows:\s*([^;]+);/) ?? [])[1];
  assert.equal((cells ?? '').trim().split(/\s+/).length, 4, `지금 칸: ${cells}`);
});
