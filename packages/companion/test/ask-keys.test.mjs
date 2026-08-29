// 창이 **보내는 이름**과 서버가 **읽는 이름**이 같은가 (TASK-KAR-201).
//
// 136회차에 창과 모듈이 서로 다른 이름을 믿고 있어서 마이크 문이 통째로 안 섰다.
// 밖에서는 그걸 경계에 사는 버그라 부른다. 두 쪽이 공유한다고 **믿는** 약속 안에 살고,
// 컴파일러는 그 경계를 못 넘는다(원장 2026-08-21).
//
// 창과 서버 사이에도 같은 경계가 있다: `/ears/stop?말한ms=...&크기=...`.
// 한쪽에서 이름을 바꾸면 **조용히** 값이 사라진다. 오류도 안 난다. 그게 더 나쁘다.
//
// 그래서 이름을 **한 곳에 선언**하고 양쪽이 그걸 쓴다. 검사는 창이 그 목록 밖의 이름을
// 쓰고 있지 않은지 본다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { askKeys } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const face = readFileSync(join(here, '..', 'assets', 'face.html'), 'utf8');

test('이름이 한 곳에 선언돼 있다', () => {
  assert.equal(typeof askKeys, 'object');
  assert.ok(Object.keys(askKeys).length > 0);
  for (const name of Object.values(askKeys)) assert.equal(typeof name, 'string');
});

test('창이 보내는 이름이 전부 그 목록에 있다', () => {
  /* 창은 `encodeURIComponent('말한ms')}=...` 모양으로 붙인다. */
  const sent = [...face.matchAll(/encodeURIComponent\('([^']+)'\)\}=/g)].map((hit) => hit[1]);
  assert.ok(sent.length > 0, '창이 아무 것도 안 보낸다면 이 검사가 뜻이 없다');
  const known = new Set(Object.values(askKeys));
  for (const name of sent) {
    assert.ok(known.has(name), `창은 ${name} 를 보내는데 서버가 읽는 이름 목록에 없다. 조용히 사라진다`);
  }
});

test('목록 값에 겹치는 이름이 없다. 겹치면 한쪽 값이 덮인다', () => {
  const values = Object.values(askKeys);
  assert.equal(new Set(values).size, values.length);
});
