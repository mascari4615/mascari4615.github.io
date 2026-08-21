import assert from 'node:assert/strict';
import test from 'node:test';

import { whichHead, attachHead } from '../dist/index.js';

test('평소에는 작은 머리 — 곁에 있는 존재는 빨라야 한다', () => {
  const r = whichHead({});
  assert.equal(r.머리, 'haiku');
  assert.equal(r.why, '');
});

test('길게 털어놨으면 큰 머리 — 작은 머리는 실측에서 14자, 큰 머리는 33자였다', () => {
  const r = whichHead({ acceptSlot: true });
  assert.equal(r.머리, 'sonnet');
  assert.match(r.why, /길게 털어놨/);
});

test('공을 돌려줄 자리도 큰 머리 — 되묻기가 안 되던 것도 같은 자리였다', () => {
  assert.equal(whichHead({ tossSlot: true }).머리, 'sonnet');
});

test('얘 자신을 물었을 때와 옛일이 걸렸을 때도 큰 머리', () => {
  assert.equal(whichHead({ 자기얘기: true }).머리, 'sonnet');
  assert.equal(whichHead({ 옛일있나: true }).머리, 'sonnet');
});

test('여러 개가 겹쳐도 이유는 하나만 — 여러 줄이면 기록이 못 읽힌다', () => {
  const r = whichHead({ acceptSlot: true, tossSlot: true, 옛일있나: true });
  assert.match(r.why, /길게 털어놨/);
  assert.equal(r.why.includes('식어'), false);
});

test('어느 머리를 쓸지 밖에서 정할 수 있다 — 사람마다 쓸 수 있는 머리가 다르다', () => {
  assert.equal(whichHead({ acceptSlot: true }, { 큰머리: 'opus' }).머리, 'opus');
  assert.equal(whichHead({}, { 작은머리: 'sonnet' }).머리, 'sonnet');
});

// ── 끼웠으면 되돌린다 ─────────────────────────────────────────────

test('큰 머리를 끼우고 되돌린다 — 안 되돌리면 한 turn 이 그 뒤 전부를 느리게 만든다', () => {
  let now = 'haiku';
  const brain = { currentModel: () => now, useModel: (n) => { now = n; } };
  const restore = attachHead(brain, 'sonnet');
  assert.equal(now, 'sonnet');
  restore();
  assert.equal(now, 'haiku');
});

test('이미 그 머리면 아무것도 안 한다', () => {
  let callCount = 0;
  const brain = { currentModel: () => 'sonnet', useModel: () => { callCount += 1; } };
  attachHead(brain, 'sonnet')();
  assert.equal(callCount, 0);
});

test('머리를 못 바꾸는 두뇌여도 안 깨진다 — 가짜 두뇌로도 돌아가야 한다', () => {
  assert.doesNotThrow(() => attachHead({}, 'sonnet')());
});
