import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, avoidRepeats, readMood } from '../dist/index.js';

const minutes = 60_000;
const time = 60 * minutes;

test('밤에는 처지고 낮에는 깨어 있다', () => {
  const dawn = readMood({ hour: 3, sinceTalkedMs: 10 * minutes, recentTurns: 1 });
  const daytime = readMood({ hour: 14, sinceTalkedMs: 10 * minutes, recentTurns: 1 });
  assert.ok(dawn.energy < daytime.energy, '새벽이 낮보다 처져 있어야 한다');
  assert.match(dawn.note, /졸리다|처져/);
});

test('오래 혼자 있었으면 반가움이 는다', () => {
  const justNow = readMood({ hour: 14, sinceTalkedMs: 2 * minutes, recentTurns: 5 });
  const day = readMood({ hour: 14, sinceTalkedMs: 9 * time, recentTurns: 0 });
  assert.ok(day.warmth > justNow.warmth);
  assert.match(day.note, /반갑다/);
});

test('말수가 없고 혼자면 심심해진다', () => {
  const bored = readMood({ hour: 14, sinceTalkedMs: 3 * time, recentTurns: 0 });
  const busy = readMood({ hour: 14, sinceTalkedMs: 1 * minutes, recentTurns: 9 });
  assert.ok(bored.boredom > busy.boredom);
  assert.match(bored.note, /심심/);
});

test('새벽까지 안 자면 그걸 알아챈다', () => {
  assert.match(readMood({ hour: 3, sinceTalkedMs: 1 * minutes, recentTurns: 4 }).note, /이 시간까지/);
});

test('기분은 늘 한 줄로 나온다. 빈 채로 두뇌에 가지 않게', () => {
  for (const hour of [0, 7, 13, 20, 23]) {
    const note = readMood({ hour, sinceTalkedMs: 30 * minutes, recentTurns: 2 }).note;
    assert.ok(note.length > 10, `${hour}시 기분이 비었다`);
  }
});

test('최근에 말을 연 방식을 다시 쓰지 말라고 일러 준다', () => {
  const recent = [
    { role: 'said', channel: 'web', text: '응... 그러게 말이야', at: 1 },
    { role: 'sensed', channel: 'web', text: '나 왔어', at: 2 },
    { role: 'said', channel: 'web', text: '음... 오늘도 늦었네', at: 3 },
  ];
  const note = avoidRepeats(recent);
  assert.match(note, /응.../);
  assert.match(note, /음.../);
  assert.match(note, /또 시작하지 마라/);
});

test('한 말이 없으면 반복 주의도 없다. 빈 잔소리를 안 붙인다', () => {
  assert.equal(avoidRepeats([{ role: 'sensed', channel: 'web', text: '안녕', at: 1 }]), '');
});

test('기분은 코어를 지나 두뇌까지 그대로 간다', async () => {
  let seen = null;
  const brain = { name: 'spy', async think(input) { seen = input.mood; return null; } };
  const body = { name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
    mood: () => '지금 네 상태: 졸리다.',
  });

  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });

  assert.equal(seen, '지금 네 상태: 졸리다.');
});

test('기분을 안 주면 없는 채로 간다', async () => {
  let seen = 'sentinel';
  const brain = { name: 'spy', async think(input) { seen = input.mood; return null; } };
  const body = { name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
  });

  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });

  assert.equal(seen, undefined);
});
