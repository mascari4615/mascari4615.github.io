import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond } from '../dist/index.js';

/** 처리 순서를 기록하는 몸들. 채널마다 몸이 있어야 그 말이 밖으로 나간다. */
function watcher(names = ['web', 'screen']) {
  const order = [];
  const bodies = names.map((name) => ({
    name,
    sense: { name: `${name}:s`, start() {} },
    voice: { name: `${name}:v`, speak(u) { order.push(u.text); }, hush() {} },
  }));
  return { order, bodies, body: bodies[0] };
}

function slowBrain(ms = 40) {
  return {
    name: 'slow',
    async think(input) {
      await new Promise((r) => setTimeout(r, ms));
      return `답:${input.sensation.text}`;
    },
  };
}

const now = () => Date.now();

test('사람 말은 화면 보기보다 먼저 처리된다', async () => {
  const { bodies, order } = watcher();
  const companion = new Companion({
    bodies, brain: slowBrain(40), memory: new InMemoryMemory(),
    attention: alwaysRespond, interruptChannels: ['web'],
  });
  await companion.start();

  // 화면 보기 두 건이 줄을 서 있는데
  companion.feed({ channel: 'screen', kind: 'screen', text: '화면1', at: now() });
  companion.feed({ channel: 'screen', kind: 'screen', text: '화면2', at: now() });
  // 그 뒤에 사람이 말을 건다
  companion.feed({ channel: 'web', kind: 'text', text: '사람말', at: now() });
  await companion.drain();

  const person = order.findIndex((t) => t.includes('사람말'));
  const second = order.findIndex((t) => t.includes('화면2'));
  assert.ok(person < second, `사람 말이 먼저 나와야 한다 (실제 순서: ${order.join(' → ')})`);
});

test('사람 말끼리는 온 순서를 지킨다 — 나중 말이 앞지르지 않게', async () => {
  const { bodies, order } = watcher();
  const companion = new Companion({
    bodies, brain: slowBrain(30), memory: new InMemoryMemory(),
    attention: alwaysRespond,
  });
  await companion.start();

  companion.feed({ channel: 'web', kind: 'text', text: '첫째', at: now() });
  companion.feed({ channel: 'web', kind: 'text', text: '둘째', at: now() });
  companion.feed({ channel: 'web', kind: 'text', text: '셋째', at: now() });
  await companion.drain();

  assert.deepEqual(order, ['답:첫째', '답:둘째', '답:셋째']);
});

test('앞지르기가 없으면 온 순서 그대로다', async () => {
  const { bodies, order } = watcher();
  const companion = new Companion({
    bodies, brain: slowBrain(20), memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();

  companion.feed({ channel: 'screen', kind: 'screen', text: 'A', at: now() });
  companion.feed({ channel: 'screen', kind: 'screen', text: 'B', at: now() });
  await companion.drain();

  assert.deepEqual(order, ['답:A', '답:B']);
});

test('줄이 다 빠질 때까지 기다릴 수 있다', async () => {
  const { bodies, order } = watcher();
  const companion = new Companion({
    bodies, brain: slowBrain(15), memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();
  for (let i = 0; i < 5; i += 1) {
    companion.feed({ channel: 'web', kind: 'text', text: `말${i}`, at: now() });
  }
  await companion.drain();
  assert.equal(order.length, 5);
});

test('하나가 터져도 줄이 멈추지 않는다', async () => {
  const { bodies, order } = watcher();
  let first = true;
  const flaky = {
    name: 'flaky',
    async think(input) {
      if (first) { first = false; throw new Error('터짐'); }
      return `답:${input.sensation.text}`;
    },
  };
  const companion = new Companion({
    bodies, brain: flaky, memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();
  companion.feed({ channel: 'web', kind: 'text', text: '첫째', at: now() });
  companion.feed({ channel: 'web', kind: 'text', text: '둘째', at: now() });
  await companion.drain();

  assert.deepEqual(order, ['답:둘째']);
});
