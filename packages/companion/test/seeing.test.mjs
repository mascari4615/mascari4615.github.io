// 사람이 「화면 뭐 보여?」라고 물을 때, 두뇌 앞에 그림이 놓여 있나.
//
// 99회차에 그림을 크게 찍게 고쳤는데도 라이브에서 「npm ci 돌고 있네…」만 나왔다 —
// 그건 그림이 아니라 **창 제목**이다. 재 보니 그림은 `screen` 감각이 만든 turn 에만
// 붙고, 사람 말 turn 에는 아예 없었다. 물어본 바로 그 순간이 눈이 감기는 순간이었다.
//
// 옛 대화를 「두뇌더러 필요하면 찾으라」고 안 하고 우리가 매번 붙이는 것과 같은 이유로,
// 눈에 보이는 것도 **매 turn 자동으로** 붙인다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion, screenSense } from '../dist/index.js';

function brainThatRecords(seen) {
  return {
    name: '기록만 하는 두뇌',
    async think(input) {
      seen.push(input);
      return '봤다';
    },
  };
}

function bareMemory() {
  const rows = [];
  return {
    async remember(entry) { rows.push(entry); },
    async recent() { return rows; },
  };
}

test('사람 말 turn 에도 지금 보이는 그림이 두뇌 앞에 놓인다', async () => {
  const seen = [];
  const companion = new Companion({
    brain: brainThatRecords(seen),
    memory: bareMemory(),
    attention: { async shouldRespond() { return { respond: true, reason: '검사' }; } },
    seeing: () => ({ imagePath: 'C:/tmp/now.png', text: '지금 앞에 있는 창 「무슨 창」' }),
  });
  await companion.feed({ channel: 'text', text: '화면에 뭐 보여?', at: Date.now(), test: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].seeing.imagePath, 'C:/tmp/now.png', '그림 없이 물으면 창 제목만 보고 답하게 된다');
  assert.match(seen[0].seeing.text, /무슨 창/, '글자로 읽은 것도 같이 간다');
});

test('눈이 없으면 없는 채로 간다 — 없는 그림을 지어내지 않는다', async () => {
  const seen = [];
  const companion = new Companion({
    brain: brainThatRecords(seen),
    memory: bareMemory(),
    attention: { async shouldRespond() { return { respond: true, reason: '검사' }; } },
  });
  await companion.feed({ channel: 'text', text: '화면에 뭐 보여?', at: Date.now(), test: true });
  assert.equal(seen[0].seeing ?? null, null);
});

test('눈은 오래된 그림을 그대로 내주지 않는다 — 묵으면 다시 찍는다', async () => {
  let shots = 0;
  let now = 1_000_000;
  const eye = screenSense({
    everyMs: 3_600_000,
    freshMs: 5_000,
    now: () => now,
    capture: async () => { shots += 1; return { title: `창${shots}`, elements: [] }; },
  });
  const first = await eye.seeing();
  assert.ok(first, '물었는데 눈이 감겨 있으면 뜬다 — 아직 못 찍었다고 빈손으로 답하지 않는다');
  assert.equal(shots, 1);

  await eye.seeing();
  assert.equal(shots, 1, '방금 찍은 것은 그대로 쓴다 — 물을 때마다 찍으면 대답이 그만큼 늦는다');

  now += 6_000; // 문턱을 넘겼다
  await eye.seeing();
  assert.equal(shots, 2, '묵은 그림을 두고 「지금 화면」이라고 말하면 안 된다');
});

test('못 찍으면 없는 채로 간다 — 없는 그림 자리를 내밀지 않는다', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => { throw new Error('화면을 못 찍었다'); },
    log: () => {},
  });
  assert.equal(await eye.seeing(), null);
});
