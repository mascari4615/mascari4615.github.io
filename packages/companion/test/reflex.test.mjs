import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, reflexFor } from '../dist/index.js';

test('인사·작별·고마움·짧은 호응은 생각 없이 답한다', () => {
  for (const said of ['안녕', '잘 자', '고마워', '응']) {
    assert.notEqual(reflexFor(said), null, `${said} 는 반사로 답해야 한다`);
  }
});

test('사연 있는 말은 반사하지 않는다 — 두뇌로 넘긴다', () => {
  for (const said of ['오늘 좀 힘들었어', '나 저번에 말한 그거 어떻게 됐지?', '이거 어떻게 생각해?']) {
    assert.equal(reflexFor(said), null);
  }
});

test('길면 반사하지 않는다 — 짧아 보여도 사연이 있을 수 있다', () => {
  assert.equal(reflexFor('안녕 오늘 뭐 하고 있었어'), null);
});

test('결에 따라 대꾸가 달라진다', () => {
  const 처짐 = reflexFor('안녕', { energy: 0.1, roll: () => 0 });
  const 생생 = reflexFor('안녕', { energy: 0.9, roll: () => 0 });
  assert.notEqual(처짐, 생생);
});

test('같은 대꾸를 연달아 하지 않는다', () => {
  const first = reflexFor('응', { roll: () => 0 });
  const second = reflexFor('응', { last: first, roll: () => 0 });
  assert.notEqual(second, first);
});

test('빈 말에는 반사할 것도 없다', () => {
  assert.equal(reflexFor('   '), null);
});

test('반사가 있으면 두뇌를 아예 안 부른다', async () => {
  let thought = 0;
  const brain = { name: 'spy', async think() { thought += 1; return '깊은 생각'; } };
  const said = [];
  const body = {
    name: 'web',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { said.push(u.text); } },
  };
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
    reflex: (s) => (s.text === '안녕' ? '응, 왔네.' : null),
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });

  assert.equal(thought, 0, '두뇌를 안 불러야 한다');
  assert.deepEqual(said, ['응, 왔네.']);
});

test('반사할 말이 아니면 평소대로 두뇌가 답한다', async () => {
  let thought = 0;
  const brain = { name: 'spy', async think() { thought += 1; return '깊은 생각'; } };
  const said = [];
  const body = {
    name: 'web',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { said.push(u.text); } },
  };
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
    reflex: () => null,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '오늘 어땠어?', at: Date.now() });

  assert.equal(thought, 1);
  assert.deepEqual(said, ['깊은 생각']);
});

test('반사로 한 말도 기억에는 남는다 — 나눈 말이니까', async () => {
  const memory = new InMemoryMemory();
  const body = {
    name: 'web',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak() {} },
  };
  const companion = new Companion({
    bodies: [body], brain: { name: 'b', async think() { return '안 불림'; } },
    memory, attention: alwaysRespond, reflex: () => '응, 왔네.',
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });

  assert.deepEqual(memory.all().map((e) => e.text), ['안녕', '응, 왔네.']);
});

test('말 안 걸기로 정했으면 반사도 안 한다', async () => {
  const said = [];
  const body = {
    name: 'web',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { said.push(u.text); } },
  };
  const companion = new Companion({
    bodies: [body], brain: { name: 'b', async think() { return '뭐라도'; } },
    memory: new InMemoryMemory(),
    attention: { name: '조용', shouldRespond: () => ({ respond: false, reason: '지금은 아니다' }) },
    reflex: () => '응, 왔네.',
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });

  assert.deepEqual(said, []);
});
