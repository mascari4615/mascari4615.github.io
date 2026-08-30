// **한 판을 한 이름으로** (TASK-KAR-201).
//
// 121, 123회차에 손이 막혔는데 사람에겐 침묵을 좇을 때, 로그를 눈으로 이어 붙였다 . 
// `[손]` 은 여기, `[두뇌]` 는 저기, `[입]` 은 또 저기에 찍히는데 **어느 줄이 같은 판인지**
// 표시가 없다. 판이 겹치면(화면 곁눈질이 사람 말 뒤에 끼면) 어느 게 어느 것인지 못 가른다.
//
// 밖에서는 이걸 추적(trace)이라 부르고, 한 판의 모든 단계가 같은 id 를 갖는다
// (OTel GenAI 규약. 원장 2026-08-21). 우리는 그 무거운 걸 안 들이고 **이름 하나만** 딴다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { Companion } from '../dist/index.js';

function bareMemory() {
  const rows = [];
  return { async remember(e) { rows.push(e); }, async recent() { return rows; } };
}

test('한 판에는 이름이 붙고, 두뇌도 그 이름을 본다', async () => {
  const seen = [];
  const reports = [];
  const companion = new Companion({
    brain: { name: 'b', async think(input) { seen.push(input.turn); return '응'; } },
    memory: bareMemory(),
    attention: { async shouldRespond() { return { respond: true, reason: '검사' }; } },
    onCycle: (report) => reports.push(report),
  });
  await companion.feed({ channel: 'web', text: '안녕', at: Date.now(), test: true });

  assert.equal(typeof seen[0], 'string');
  assert.ok(seen[0].length > 0, '두뇌가 판 이름을 모르면 그 줄을 못 묶는다');
  assert.equal(reports[0].turn, seen[0], '같은 판이면 같은 이름이어야 한다');
});

test('판마다 이름이 다르다. 같으면 묶는 뜻이 없다', async () => {
  const seen = [];
  const companion = new Companion({
    brain: { name: 'b', async think(input) { seen.push(input.turn); return '응'; } },
    memory: bareMemory(),
    attention: { async shouldRespond() { return { respond: true, reason: '검사' }; } },
  });
  await companion.feed({ channel: 'web', text: '하나', at: Date.now(), test: true });
  await companion.feed({ channel: 'web', text: '둘', at: Date.now(), test: true });
  assert.equal(new Set(seen).size, 2);
});

test('이름은 짧다. 로그 앞에 붙는 것이라 길면 줄을 덮는다', async () => {
  const seen = [];
  const companion = new Companion({
    brain: { name: 'b', async think(input) { seen.push(input.turn); return '응'; } },
    memory: bareMemory(),
    attention: { async shouldRespond() { return { respond: true, reason: '검사' }; } },
  });
  await companion.feed({ channel: 'web', text: '안녕', at: Date.now(), test: true });
  assert.ok(seen[0].length <= 6, `판 이름이 길다: ${seen[0]}`);
});
