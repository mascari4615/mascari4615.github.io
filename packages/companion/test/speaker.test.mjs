import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond } from '../dist/index.js';

/* 화자. 여럿이 있는 자리를 위한 바탕. 여태 얘의 세상엔 사람이 한 명뿐이었다. */

const run = (seen) => {
  const body = {
    name: 'web',
    sense: { name: 'web:sense', start() {} },
    voice: { name: 'web:voice', speak() {} },
  };
  const memory = new InMemoryMemory();
  const companion = new Companion({
    bodies: [body],
    memory,
    attention: alwaysRespond,
    brain: {
      name: '엿보기',
      async think(input) {
        seen.push(input);
        return '음';
      },
    },
  });
  return { companion, memory };
};

test('누가 한 말인지 기억에 함께 담긴다', async () => {
  const seen2 = [];
  const { companion, memory } = run(seen2);
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: 1, who: '민수' });
  await companion.stop();

  const userText = memory.all().find((e) => e.role === 'sensed');
  assert.equal(userText.who, '민수');
});

test('안 주면 없는 채로 둔다. 단둘이면 이름이 필요 없다', async () => {
  const seen3 = [];
  const { companion, memory } = run(seen3);
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: 1 });
  await companion.stop();

  assert.equal(memory.all().find((e) => e.role === 'sensed').who, undefined);
});

test('여럿이 말하면 각자 이름으로 남는다. 독백이 되면 안 된다', async () => {
  const seen4 = [];
  const { companion, memory } = run(seen4);
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '나 왔어', at: 1, who: '민수' });
  await companion.feed({ channel: 'web', kind: 'text', text: '나도', at: 2, who: '지훈' });
  await companion.stop();

  const names = memory.all().filter((e) => e.role === 'sensed').map((e) => e.who);
  assert.deepEqual(names, ['민수', '지훈']);
});

test('두뇌가 받는 재료에도 화자가 실린다', async () => {
  const seen5 = [];
  const { companion } = run(seen5);
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: 1, who: '민수' });
  await companion.stop();

  assert.equal(seen5[0].sensation.who, '민수');
});
