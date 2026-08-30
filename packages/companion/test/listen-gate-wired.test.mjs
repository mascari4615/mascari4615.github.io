// 창이 부르는 이름과 모듈이 내놓는 이름이 **같은가** (TASK-KAR-201).
//
// 135회차에 창을 띄우다 이걸 봤다:
//
//   [창] 처리 안 된 실패: TypeError: m.듣는문 is not a constructor
//
// 모듈은 `listenGate` 를 내놓는데 창은 `듣는문` 을 찾고 있었다. 어느 시점에 이름을 영문으로
// 바꾸면서 **창 쪽이 안 따라온 것**이다. 그 결과 늘 듣기를 만드는 함수가 null 로 남고,
// **마이크 문이 통째로 안 선다**. 98회차에 조수님이 내 보이스가 전혀 안 들어가는 것
// 같은데라고 한 그 자리일 수 있다.
//
// 111회차에 같은 종류를 겪었다: **같은 이름을 두 곳에 적으면 하나가 낡는다.** 창은 브라우저
// 코드라 단위 검사로 못 돌리지만, **두 파일이 같은 이름을 말하는지**는 여기서 잠글 수 있다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const gate = readFileSync(join(assets, 'listen-gate.js'), 'utf8');
const face = readFileSync(join(assets, 'face.html'), 'utf8');

test('창이 부르는 이름이 모듈에 실제로 있다', () => {
  /* 창은 `import('/listen-gate.js').then((m) => ... new m.무엇())` 모양으로 부른다. */
  const called = [...face.matchAll(/new\s+m\.([A-Za-z가-힣_$][\w가-힣_$]*)/g)].map((hit) => hit[1]);
  assert.ok(called.length > 0, '창이 그 모듈을 아예 안 부른다');
  for (const name of called) {
    assert.ok(
      new RegExp(`export\\s+(class|const|function)\\s+${name}\\b`).test(gate),
      `창은 ${name} 를 부르는데 모듈에는 없다. 마이크 문이 통째로 안 선다`,
    );
  }
});

test('모듈이 내놓는 이름은 영문이다. 한글 식별자는 안 쓴다', () => {
  const exported = [...gate.matchAll(/export\s+(?:class|const|function)\s+([^\s(=<]+)/g)].map((hit) => hit[1]);
  assert.ok(exported.length > 0);
  for (const name of exported) {
    assert.doesNotMatch(name, /[가-힣]/, `내놓는 이름에 한글이 섞였다: ${name}`);
  }
});

test('창이 부르는 자리, 메서드도 모듈에 다 있다', () => {
  /* 135회차에 잡은 건 클래스 이름 하나였는데, 고치고 나니 **메서드, 속성도 전부** 한글로
     남아 있었다(`문.들었다` `문.열림` `문.설정` ...). 이름을 영문화할 때 창이 통째로 뒤처진
     것이다. 하나만 고치면 다음 줄에서 또 죽으므로 **전부** 잠근다. */
  const used = [...face.matchAll(/문\??\.([A-Za-z가-힣_$][\w가-힣_$]*)/g)].map((hit) => hit[1]);
  assert.ok(used.length > 0, '창이 그 문을 아예 안 쓴다');
  for (const name of [...new Set(used)]) {
    assert.doesNotMatch(name, /[가-힣]/, `창이 아직 한글 이름을 부른다: 문.${name}`);
  }
});
