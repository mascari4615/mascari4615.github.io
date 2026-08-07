import assert from 'node:assert/strict';
import test from 'node:test';

import { 말걸어도되나, 어떤자리, 자리결 } from '../dist/index.js';

test('창 제목으로 어떤 자리인지 가린다', () => {
  assert.equal(어떤자리('Zoom Meeting'), '통화');
  assert.equal(어떤자리('무한도전 51화 - YouTube - Chrome'), '보는중');
  assert.equal(어떤자리('room.ts - companion - Visual Studio Code'), '만드는중');
  assert.equal(어떤자리('Steam'), '노는중');
  assert.equal(어떤자리('오류 해결 - Stack Overflow'), '읽는중');
});

test('모르면 모른다고 한다 — 억지로 붙이면 엉뚱한 자리에서 입을 다문다', () => {
  assert.equal(어떤자리('알 수 없는 프로그램'), null);
  assert.equal(어떤자리(''), null);
  assert.equal(어떤자리(null), null);
});

test('끼어들면 안 되는 것이 먼저다 — 통화 중에 뜬 게임 창에 속으면 사고다', () => {
  assert.equal(어떤자리('Zoom Meeting — Steam 알림'), '통화');
});

// ── 말 걸어도 되나 ──────────────────────────────────────────────────

test('통화 중에는 먼저 말 안 건다', () => {
  const r = 말걸어도되나('Zoom Meeting');
  assert.equal(r.된다, false);
  assert.match(r.왜, /통화/);
});

test('뭔가 보는 중에도 먼저 말 안 건다', () => {
  assert.equal(말걸어도되나('영화 - Netflix').된다, false);
});

test('만드는 중에는 말 걸어도 된다 — 곁에 있는 존재는 조용하기만 하면 안 된다', () => {
  assert.equal(말걸어도되나('main.ts - Visual Studio Code').된다, true);
});

test('모르면 말 건다 — 몸 사리면 영영 조용해진다', () => {
  const r = 말걸어도되나('알 수 없는 창');
  assert.equal(r.된다, true);
  assert.match(r.왜, /모르겠다/);
});

test('창 제목이 없어도 말 건다 — 화면을 못 봤다고 입을 닫으면 안 된다', () => {
  assert.equal(말걸어도되나(null).된다, true);
});

// ── 자리에 맞는 결 ──────────────────────────────────────────────────

test('만드는 중이면 흐름을 끊지 말라고 얹는다', () => {
  assert.match(자리결('app.ts - Visual Studio Code'), /짧게/);
});

test('통화 중에는 물어봐도 아주 짧게', () => {
  assert.match(자리결('Zoom Meeting'), /아주 짧게/);
});

test('모르는 자리엔 아무 말도 안 얹는다 — 늘 붙으면 재료만 먹는다', () => {
  assert.equal(자리결('알 수 없는 창'), '');
  assert.equal(자리결(null), '');
});
