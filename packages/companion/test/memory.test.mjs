import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  Companion,
  DistillingMemory,
  InMemoryMemory,
  JsonlFileMemory,
  alwaysRespond,
  brainDistiller,
  echoBrain,
} from '../dist/index.js';

function tempPath(name) {
  return join(mkdtempSync(join(tmpdir(), 'companion-mem-')), name);
}

function entry(text, at = Date.now()) {
  return { role: 'sensed', channel: 'test', text, at };
}

test('파일 기억은 껐다 켜도 이어진다', () => {
  const path = tempPath('conversation.jsonl');
  const first = new JsonlFileMemory(path);
  first.remember(entry('어제 한 말'));
  first.remember({ role: 'said', channel: 'test', text: '어제 한 답', at: Date.now() });

  // 프로세스가 새로 뜬 상황 = 같은 파일을 처음부터 읽는 새 객체.
  const second = new JsonlFileMemory(path);
  assert.deepEqual(second.recent(10).map((e) => e.text), ['어제 한 말', '어제 한 답']);
});

test('깨진 줄이 하나 있어도 나머지 기억은 읽힌다', () => {
  const path = tempPath('conversation.jsonl');
  const memory = new JsonlFileMemory(path);
  memory.remember(entry('멀쩡한 줄'));
  appendFileSync(path, '{이건 깨진 줄\n', 'utf8');
  memory.remember(entry('그 뒤 줄'));

  const reread = new JsonlFileMemory(path);
  assert.deepEqual(reread.recent(10).map((e) => e.text), ['멀쩡한 줄', '그 뒤 줄']);
});

test('쌓이면 접어서 「아는 것」을 남기고 파일에도 쓴다', async () => {
  const notePath = tempPath('아는-것.md');
  let calls = 0;
  const memory = new DistillingMemory({
    inner: new InMemoryMemory(),
    distill: async ({ fading }) => { calls += 1; return `아는 것 ${calls}: 대화 ${fading.length}개를 접었다`; },
    every: 3,
    notePath,
  });

  assert.equal(memory.longTerm(), null, '처음엔 아는 게 없다');

  for (let i = 0; i < 3; i += 1) await memory.remember(entry(`말 ${i}`));
  await memory.condense();

  assert.match(memory.longTerm(), /^아는 것/);
  assert.ok(existsSync(notePath), '아는 것이 파일로 남아야 한다');
  assert.match(readFileSync(notePath, 'utf8'), /아는 것/);
});

test('접기가 실패해도 대화는 멀쩡하다', async () => {
  const memory = new DistillingMemory({
    inner: new InMemoryMemory(),
    distill: async () => { throw new Error('두뇌가 안 됨'); },
    every: 2,
  });

  await memory.remember(entry('하나'));
  await memory.remember(entry('둘'));
  await memory.condense();

  assert.equal(memory.longTerm(), null, '아는 것은 안 생기지만');
  assert.deepEqual(memory.recent(10).map((e) => e.text), ['하나', '둘'], '대화는 남아 있다');
});

test('접었던 「아는 것」이 다음에 두뇌까지 전달된다', async () => {
  const memory = new DistillingMemory({
    inner: new InMemoryMemory(),
    distill: async () => '이 사람은 큐브를 만들고 있다.',
    every: 999,
  });
  await memory.remember(entry('시작'));
  await memory.condense();

  let seen = null;
  const brain = { name: 'spy', async think(input) { seen = input.longTerm; return null; } };
  const body = { name: 'test', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const companion = new Companion({ bodies: [body], brain, memory, attention: alwaysRespond });

  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '안녕', at: Date.now() });

  assert.equal(seen, '이 사람은 큐브를 만들고 있다.');
});

test('아는 것을 안 만드는 기억이면 두뇌는 없는 채로 받는다', async () => {
  let seen = 'sentinel';
  const brain = { name: 'spy', async think(input) { seen = input.longTerm; return null; } };
  const body = { name: 'test', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
  });

  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '안녕', at: Date.now() });

  assert.equal(seen, null);
});

test('졸이는 지시문에는 지금까지 아는 것과 최근 대화가 함께 들어간다', async () => {
  let prompt = '';
  const distill = brainDistiller(async (p) => { prompt = p; return '새로 아는 것'; });
  const result = await distill({ known: '전에 알던 것', fading: [entry('최근에 한 말')] });

  assert.equal(result, '새로 아는 것');
  assert.match(prompt, /전에 알던 것/);
  assert.match(prompt, /최근에 한 말/);
});

test('두뇌가 답을 못 주면 알던 것을 그대로 지킨다', async () => {
  const distill = brainDistiller(async () => null);
  assert.equal(await distill({ known: '알던 것', fading: [entry('뭐라도')] }), '알던 것');
});

test('졸이는 기억도 평범한 기억처럼 코어에 꽂힌다', async () => {
  const spoken = [];
  const body = {
    name: 'test',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { spoken.push(u.text); } },
  };
  const memory = new DistillingMemory({ inner: new InMemoryMemory(), distill: async () => '', every: 999 });
  const companion = new Companion({ bodies: [body], brain: echoBrain, memory, attention: alwaysRespond });

  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '안녕', at: Date.now() });

  assert.deepEqual(spoken, ['(echo) 안녕']);
});
