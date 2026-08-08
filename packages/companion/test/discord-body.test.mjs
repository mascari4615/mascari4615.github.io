import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, discordBody } from '../dist/index.js';

/* 디스코드 몸 = 관객이 있는 자리. 토큰은 이 기계에 없으므로(prod 는 노트북) **붙는 물건을
   갈아끼워** 전 경로를 시험한다 — 「접속이 되나」와 「몸이 제대로 붙나」는 다른 물음이다. */

const 가짜붙이기 = () => {
  const 보낸것 = [];
  let 듣기 = null;
  return {
    보낸것,
    말시키기: (말) => 듣기?.(말),
    붙이기: {
      들어올때: (f) => { 듣기 = f; },
      채널잡기: (채널) =>
        채널 === '없는방' ? null : { 보내기: async (글) => { 보낸것.push({ 채널, 글 }); } },
    },
  };
};

const 얘만들기 = (몸, memory = new InMemoryMemory()) => ({
  memory,
  companion: new Companion({
    bodies: [몸],
    memory,
    attention: alwaysRespond,
    brain: { name: 'echo', async think(input) { return `(대답) ${input.sensation.text}`; } },
  }),
});

test('디스코드에서 온 말이 누가 했는지와 함께 들어온다', async () => {
  const g = 가짜붙이기();
  const { companion, memory } = 얘만들기(discordBody({ 붙이기: g.붙이기 }));
  await companion.start();
  g.말시키기({ 글: '안녕', 누가: '민수', 채널: '방1', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  const 들은것 = memory.all().find((e) => e.role === 'sensed');
  assert.equal(들은것.text, '안녕');
  assert.equal(들은것.누가, '민수');
  assert.equal(들은것.channel, 'discord');
});

test('말이 그 방으로 돌아간다', async () => {
  const g = 가짜붙이기();
  const { companion } = 얘만들기(discordBody({ 붙이기: g.붙이기 }));
  await companion.start();
  g.말시키기({ 글: '안녕', 누가: '민수', 채널: '방1', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  assert.deepEqual(g.보낸것, [{ 채널: '방1', 글: '(대답) 안녕' }]);
});

test('여러 방이면 마지막으로 말이 온 방으로 답한다 — 딴 데 대고 말하면 안 된다', async () => {
  const g = 가짜붙이기();
  const { companion } = 얘만들기(discordBody({ 붙이기: g.붙이기 }));
  await companion.start();
  g.말시키기({ 글: '여기', 누가: '민수', 채널: '방1', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  g.말시키기({ 글: '이쪽', 누가: '지훈', 채널: '방2', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  assert.deepEqual(g.보낸것.map((x) => x.채널), ['방1', '방2']);
});

test('제 말은 안 듣는다 — 안 그러면 끝없이 돈다', async () => {
  const g = 가짜붙이기();
  const { companion, memory } = 얘만들기(discordBody({ 붙이기: g.붙이기 }));
  await companion.start();
  g.말시키기({ 글: '내가 한 말', 누가: '욘', 채널: '방1', 봇인가: true });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  assert.deepEqual(memory.all(), []);
});

test('정한 방 밖에서는 안 듣는다 — 남의 방에 끼어들면 안 된다', async () => {
  const g = 가짜붙이기();
  const { companion, memory } = 얘만들기(discordBody({ 붙이기: g.붙이기, 채널들: ['방1'] }));
  await companion.start();
  g.말시키기({ 글: '여기서 하는 얘기', 누가: '남', 채널: '방9', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  assert.deepEqual(memory.all(), []);
});

test('빈 말은 흘린다', async () => {
  const g = 가짜붙이기();
  const { companion, memory } = 얘만들기(discordBody({ 붙이기: g.붙이기 }));
  await companion.start();
  g.말시키기({ 글: '   ', 누가: '민수', 채널: '방1', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  assert.deepEqual(memory.all(), []);
});

test('방을 못 잡아도 얘는 안 죽는다', async () => {
  const g = 가짜붙이기();
  const 남긴말 = [];
  const { companion } = 얘만들기(discordBody({ 붙이기: g.붙이기, log: (m) => 남긴말.push(m) }));
  await companion.start();
  g.말시키기({ 글: '안녕', 누가: '민수', 채널: '없는방', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  await companion.stop();

  assert.equal(g.보낸것.length, 0);
  assert.ok(남긴말.some((m) => m.includes('못 잡았다')), `남긴 말: ${남긴말.join(' / ')}`);
});

test('코어 하나에 몸 둘 — 곁(웹)과 관객(디스코드)이 같은 기억을 나눠 쓴다', async () => {
  const g = 가짜붙이기();
  const 웹말 = [];
  const 웹몸 = {
    name: 'web',
    sense: { name: 'web:sense', start() {} },
    voice: { name: 'web:voice', speak(u) { 웹말.push(u.text); } },
  };
  const memory = new InMemoryMemory();
  const companion = new Companion({
    bodies: [웹몸, discordBody({ 붙이기: g.붙이기 })],
    memory,
    attention: alwaysRespond,
    brain: { name: 'echo', async think(input) { return `(대답) ${input.sensation.text}`; } },
  });
  await companion.start();

  // 관객 쪽에서 한 마디
  g.말시키기({ 글: '다들 안녕', 누가: '민수', 채널: '방1', 봇인가: false });
  await new Promise((r) => setTimeout(r, 60));
  // 곁에서 한 마디
  await companion.feed({ channel: 'web', kind: 'text', text: '나도 있어', at: Date.now() });
  await companion.stop();

  // 각자 제 몸으로 답이 나갔다.
  assert.deepEqual(g.보낸것.map((x) => x.글), ['(대답) 다들 안녕']);
  assert.deepEqual(웹말, ['(대답) 나도 있어']);
  // 기억은 하나다 — 누가 어디서 한 말인지 함께.
  assert.deepEqual(
    memory.all().filter((e) => e.role === 'sensed').map((e) => `${e.channel}/${e.누가 ?? '-'}`),
    ['discord/민수', 'web/-'],
  );
});
