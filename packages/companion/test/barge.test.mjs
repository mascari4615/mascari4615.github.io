import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, isRealBargeIn, shouldBargeIn } from '../dist/index.js';

// ── 맞장구인가 끼어들기인가 ─────────────────────────────────────────

test('맞장구는 끼어들기가 아니다 — 듣고 있다는 신호다', () => {
  for (const t of ['응', '어…', '음', 'ㅋㅋㅋ', 'ㅎㅎ', '그래', '맞아', '오케이', '그렇구나']) {
    assert.equal(isRealBargeIn(t), false, `${t} 는 맞장구다`);
  }
});

test('할 말이 있으면 끼어들기다', () => {
  for (const t of ['그거 아니고', '오늘 회의 길었어', '뭐 하고 있어?', '셰이더 고쳤어']) {
    assert.equal(isRealBargeIn(t), true, `${t} 는 끼어들기다`);
  }
});

test('멈추라는 뜻이 뚜렷하면 끼어들기다', () => {
  for (const t of ['잠깐', '아니', '그만', '기다려', '아냐']) {
    assert.equal(isRealBargeIn(t), true, `${t} 는 멈추라는 말이다`);
  }
});

test('「아니」는 맞장구처럼 짧아도 끼어들기다 — 뒤집겠다는 신호다', () => {
  assert.equal(isRealBargeIn('아니'), true);
  assert.equal(isRealBargeIn('아'), false, '「아」는 그냥 소리다');
});

test('빈 말은 끼어들기가 아니다', () => {
  assert.equal(isRealBargeIn('   '), false);
});

// ── 통로와 내용을 둘 다 ─────────────────────────────────────────────

const 감각 = (channel, text) => ({ channel, kind: 'text', text, at: 1 });

test('끊는 통로가 아니면 내용과 상관없이 안 끊는다 — 곁눈질이 말을 끊으면 안 된다', () => {
  assert.equal(shouldBargeIn(감각('screen', '화면을 봤다. 창은 「유니티」'), ['web']), false);
});

test('끊는 통로여도 맞장구면 안 끊는다', () => {
  assert.equal(shouldBargeIn(감각('web', '응'), ['web']), false);
});

test('끊는 통로에 할 말이면 끊는다', () => {
  assert.equal(shouldBargeIn(감각('web', '잠깐 아니야'), ['web']), true);
});

// ── core 와 이어 보기 ───────────────────────────────────────────────

const 느린두뇌 = (ms) => ({
  name: 'slow',
  async think() { await new Promise((r) => setTimeout(r, ms)); return '길게 하던 말'; },
});

test('내용을 안 보면 맞장구에도 말이 잘린다 — 지금까지 그랬다', async () => {
  const 멈춤 = [];
  const companion = new Companion({
    bodies: [{
      name: 'web',
      sense: { name: 's', start() {} },
      voice: { name: 'v', speak() {}, hush() { 멈춤.push('멈췄다'); } },
    }],
    brain: 느린두뇌(120),
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    interruptChannels: ['web'],
  });
  await companion.start();
  const 첫말 = companion.feed(감각('web', '오늘 얘기 좀 하자'));
  await new Promise((r) => setTimeout(r, 30));
  await companion.feed(감각('web', '응'));
  await 첫말;
  assert.ok(멈춤.length > 0, '내용을 안 보면 맞장구에도 멈춘다');
});

test('내용을 보면 맞장구에는 안 멈춘다', async () => {
  const 멈춤 = [];
  const companion = new Companion({
    bodies: [{
      name: 'web',
      sense: { name: 's', start() {} },
      voice: { name: 'v', speak() {}, hush() { 멈춤.push('멈췄다'); } },
    }],
    brain: 느린두뇌(120),
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    interruptChannels: ['web'],
    urgentWhen: (s) => isRealBargeIn(s.text),
  });
  await companion.start();
  const 첫말 = companion.feed(감각('web', '오늘 얘기 좀 하자'));
  await new Promise((r) => setTimeout(r, 30));
  await companion.feed(감각('web', '응'));
  await 첫말;
  assert.deepEqual(멈춤, [], '맞장구에는 안 멈춰야 한다');
});

test('진짜 끼어들기에는 여전히 멈춘다', async () => {
  const 멈춤 = [];
  const companion = new Companion({
    bodies: [{
      name: 'web',
      sense: { name: 's', start() {} },
      voice: { name: 'v', speak() {}, hush() { 멈춤.push('멈췄다'); } },
    }],
    brain: 느린두뇌(120),
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    interruptChannels: ['web'],
    urgentWhen: (s) => isRealBargeIn(s.text),
  });
  await companion.start();
  const 첫말 = companion.feed(감각('web', '오늘 얘기 좀 하자'));
  await new Promise((r) => setTimeout(r, 30));
  await companion.feed(감각('web', '잠깐만'));
  await 첫말;
  assert.ok(멈춤.length > 0);
});

test('안 주면 예전 그대로 — 통로만 본다', async () => {
  const 멈춤 = [];
  const companion = new Companion({
    bodies: [{
      name: 'web',
      sense: { name: 's', start() {} },
      voice: { name: 'v', speak() {}, hush() { 멈춤.push('멈췄다'); } },
    }],
    brain: 느린두뇌(120),
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    interruptChannels: ['web'],
  });
  await companion.start();
  const 첫말 = companion.feed(감각('web', '얘기하자'));
  await new Promise((r) => setTimeout(r, 30));
  await companion.feed(감각('web', 'ㅋㅋ'));
  await 첫말;
  assert.ok(멈춤.length > 0);
});
