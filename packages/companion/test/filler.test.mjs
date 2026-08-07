import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, pickFiller } from '../dist/index.js';

function watcher() {
  const said = [];
  const hums = [];
  return {
    said,
    hums,
    body: {
      name: 'web',
      sense: { name: 's', start() {} },
      voice: {
        name: 'v',
        speak(u) { said.push(u.text); },
        filler(t) { hums.push(t); },
        hush() {},
      },
    },
  };
}

function brainTaking(ms) {
  return { name: 'slow', async think() { await new Promise((r) => setTimeout(r, ms)); return '답'; } };
}

const now = () => Date.now();

test('결에 맞는 뜸을 고른다 — 늘어진 애가 「잠깐,」 하면 다른 사람이다', () => {
  assert.match(pickFiller({ energy: 0.1, roll: () => 0 }), /음…|으음…|아…|흐음…/);
  assert.match(pickFiller({ energy: 0.9, roll: () => 0 }), /음,|아 그거,|잠깐,|어디 보자,/);
});

test('같은 뜸을 연달아 내지 않는다 — 그게 더 기계 같다', () => {
  const first = pickFiller({ energy: 0.5, roll: () => 0 });
  const second = pickFiller({ energy: 0.5, last: first, roll: () => 0 });
  assert.notEqual(second, first);
});

test('답이 늦으면 뜸을 낸다', async () => {
  const { body, hums, said } = watcher();
  const companion = new Companion({
    bodies: [body], brain: brainTaking(200), memory: new InMemoryMemory(),
    attention: alwaysRespond, filler: () => '음…', fillerAfterMs: 40,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: now() });

  assert.deepEqual(hums, ['음…']);
  assert.deepEqual(said, ['답'], '뜸을 냈어도 진짜 답은 따로 나간다');
});

test('답이 빨리 오면 뜸을 안 낸다 — 늘 뜸을 들이면 그게 더 답답하다', async () => {
  const { body, hums } = watcher();
  const companion = new Companion({
    bodies: [body], brain: brainTaking(5), memory: new InMemoryMemory(),
    attention: alwaysRespond, filler: () => '음…', fillerAfterMs: 200,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: now() });

  assert.deepEqual(hums, []);
});

test('뜸을 골라 주는 쪽이 없으면 아무 일도 안 한다', async () => {
  const { body, hums } = watcher();
  const companion = new Companion({
    bodies: [body], brain: brainTaking(120), memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: now() });
  assert.deepEqual(hums, []);
});

test('말할 게 없다고 하면 뜸도 안 낸다', async () => {
  const { body, hums } = watcher();
  const companion = new Companion({
    bodies: [body], brain: brainTaking(120), memory: new InMemoryMemory(),
    attention: alwaysRespond, filler: () => null, fillerAfterMs: 30,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: now() });
  assert.deepEqual(hums, []);
});

test('뜸은 기억에 안 남는다 — 사람이 「음」 한 것을 대화로 적지 않듯이', async () => {
  const { body } = watcher();
  const memory = new InMemoryMemory();
  const companion = new Companion({
    bodies: [body], brain: brainTaking(120), memory,
    attention: alwaysRespond, filler: () => '음…', fillerAfterMs: 30,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: now() });

  assert.equal(memory.all().some((e) => e.text === '음…'), false);
});

test('뜸을 냈는지 밖에서 알 수 있다', async () => {
  const { body } = watcher();
  const reports = [];
  const companion = new Companion({
    bodies: [body], brain: brainTaking(120), memory: new InMemoryMemory(),
    attention: alwaysRespond, filler: () => '음…', fillerAfterMs: 30,
    onCycle: (r) => reports.push(r),
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: now() });

  assert.equal(reports.at(-1).hummed, true);
});
