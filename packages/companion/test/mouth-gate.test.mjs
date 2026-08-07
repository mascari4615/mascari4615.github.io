import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, mouthGate, retryNote } from '../dist/index.js';

const 첫째 = () => 0;

test('멀쩡한 말은 그대로 나간다 — 관문은 조용해야 한다', async () => {
  const gate = mouthGate();
  assert.equal(await gate('응… 그러게.'), '응… 그러게.');
  assert.equal(gate.stopped(), 0);
});

test('새는 말은 잡는다', async () => {
  const gate = mouthGate({ roll: 첫째 });
  const out = await gate('네, 무엇을 도와드릴까요?');
  assert.notEqual(out, '네, 무엇을 도와드릴까요?');
  assert.equal(gate.stopped(), 1);
});

test('새면 한 번 다시 시킨다 — 그게 통과하면 그걸 쓴다', async () => {
  let 몇번 = 0;
  const gate = mouthGate({
    retry: async () => { 몇번 += 1; return '응… 뭔데.'; },
  });
  assert.equal(await gate('무엇을 도와드릴까요'), '응… 뭔데.');
  assert.equal(몇번, 1);
});

test('다시 시킨 것도 새면 그건 안 쓴다', async () => {
  const gate = mouthGate({
    retry: async () => '죄송하지만 도와드리기 어렵습니다',
    fallbacks: ['…'],
  });
  assert.equal(await gate('무엇을 도와드릴까요'), '…');
});

test('다시 시키는 건 딱 한 번이다 — 계속 다시 시키면 대답이 늦어진다', async () => {
  let 몇번 = 0;
  const gate = mouthGate({
    retry: async () => { 몇번 += 1; return '역시 도와드리겠습니다'; },
    fallbacks: ['…'],
  });
  await gate('무엇을 도와드릴까요');
  assert.equal(몇번, 1);
});

test('다시 시키기가 고장 나도 입은 열린다', async () => {
  const gate = mouthGate({
    retry: async () => { throw new Error('두뇌가 죽었다'); },
    fallbacks: ['…음.'],
  });
  assert.equal(await gate('도와드리겠습니다'), '…음.');
});

test('다시 시킬 데가 없으면 바로 짧게 넘긴다', async () => {
  const gate = mouthGate({ fallbacks: ['…아니다.'] });
  assert.equal(await gate('무엇을 도와드릴까요'), '…아니다.');
});

test('끝내 안 돼도 입을 다물지는 않는다 — 침묵은 고장처럼 보인다', async () => {
  const gate = mouthGate({ roll: 첫째 });
  const out = await gate('네, 도와드리겠습니다.');
  assert.notEqual(out, null);
  assert.notEqual(out.trim(), '');
});

test('무엇을 샌 것으로 볼지는 인격마다 정한다', async () => {
  const gate = mouthGate({ rules: { avoid: [/냐옹/] }, fallbacks: ['…'] });
  assert.equal(await gate('무엇을 도와드릴까요'), '무엇을 도와드릴까요');
  assert.equal(await gate('냐옹'), '…');
});

test('몇 번 걸렀는지 밖에서 볼 수 있다 — 관문이 실제로 일하는지 알아야 한다', async () => {
  const gate = mouthGate({ fallbacks: ['…'] });
  await gate('멀쩡한 말');
  await gate('도와드리겠습니다');
  await gate('말씀해 주세요');
  assert.equal(gate.stopped(), 2);
});

test('다시 시킬 때 원래 한 말을 보여 주지 않는다 — 조금 고친 것은 여전히 미끄러진 문장이다', () => {
  const note = retryNote('말투가 조수 쪽으로 샜다');
  assert.match(note, /말투가 조수 쪽으로 샜다/);
  assert.match(note, /처음부터 다시/);
  assert.equal(note.includes('도와드'), false);
});

// ── core 이음매 ──────────────────────────────────────────────────────

const 몸 = (said) => ({
  name: 'web',
  sense: { name: 's', start() {} },
  voice: { name: 'v', speak(u) { said.push(u.text); } },
});

test('관문이 없으면 그냥 지나간다 — 있던 것이 안 변한다', async () => {
  const said = [];
  const companion = new Companion({
    bodies: [몸(said)],
    brain: { name: 'b', async think() { return '무엇을 도와드릴까요'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });
  assert.deepEqual(said, ['무엇을 도와드릴까요']);
});

test('걸린 말은 입 밖으로 안 나간다', async () => {
  const said = [];
  const companion = new Companion({
    bodies: [몸(said)],
    brain: { name: 'b', async think() { return '무엇을 도와드릴까요'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    beforeSpeak: () => '…응.',
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });
  assert.deepEqual(said, ['…응.']);
});

test('안 할 말은 기억에도 안 남는다 — 남으면 다음 번 재료가 되어 굳는다', async () => {
  const memory = new InMemoryMemory();
  const said = [];
  const companion = new Companion({
    bodies: [몸(said)],
    brain: { name: 'b', async think() { return '무엇을 도와드릴까요'; } },
    memory,
    attention: alwaysRespond,
    beforeSpeak: () => '…응.',
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });

  const 한말 = memory.all().filter((e) => e.role === 'said').map((e) => e.text);
  assert.deepEqual(한말, ['…응.']);
  assert.equal(한말.includes('무엇을 도와드릴까요'), false);
});

test('관문이 아무 말도 말라고 하면 입을 다문다', async () => {
  const said = [];
  const memory = new InMemoryMemory();
  const companion = new Companion({
    bodies: [몸(said)],
    brain: { name: 'b', async think() { return '아무 말'; } },
    memory,
    attention: alwaysRespond,
    beforeSpeak: () => null,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });
  assert.deepEqual(said, []);
  assert.deepEqual(memory.all().filter((e) => e.role === 'said'), []);
});

test('관문이 고장 나도 입을 막지 않는다 — 말 못 하는 것보다 새는 편이 낫다', async () => {
  const said = [];
  const companion = new Companion({
    bodies: [몸(said)],
    brain: { name: 'b', async think() { return '그래도 할 말'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    beforeSpeak: () => { throw new Error('관문 고장'); },
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });
  assert.deepEqual(said, ['그래도 할 말']);
});

test('진짜 관문을 core 에 물리면 새는 말이 안 나간다', async () => {
  const said = [];
  const companion = new Companion({
    bodies: [몸(said)],
    brain: { name: 'b', async think() { return '네, 무엇을 도와드릴까요?'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    beforeSpeak: mouthGate({ retry: async () => '응… 왜.', }),
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });
  assert.deepEqual(said, ['응… 왜.']);
});

test('아쉬울 뿐인 이유로 걸린 말은 버리지 않는다 — 막는 자리가 답을 더 나쁘게 만들면 안 된다', async () => {
  const 적힌것 = [];
  const gate = mouthGate({
    alsoRetryWhen: (t) => (t.length < 12 ? '받아 줄 자리인데 한마디로 끊었다' : null),
    아쉬울뿐인가: (why) => why.includes('한마디로 끊었다'),
    retry: async () => '응',            // 다시 시켜도 여전히 짧다
    fallbacks: ['…'],
    log: (m) => 적힌것.push(m),
  });
  // 실측: 「뭐가 재밌었어?」(11자)가 걸려서 「…」로 떨어졌다
  assert.equal(await gate('뭐가 재밌었어?'), '뭐가 재밌었어?');
  assert.match(적힌것.join(' '), /원래 말이 얼버무림보다는 낫다/);
});

test('해로운 이유는 그대로 버린다 — 지어낸 말을 들려주느니 「…」가 낫다', async () => {
  const gate = mouthGate({
    alsoRetryWhen: (t) => (t.includes('지어냄') ? '안 보고 지어냈다' : null),
    아쉬울뿐인가: (why) => why.includes('한마디로 끊었다'),
    retry: async () => '또 지어냄',
    fallbacks: ['…'],
  });
  assert.equal(await gate('지어냄'), '…');
});
