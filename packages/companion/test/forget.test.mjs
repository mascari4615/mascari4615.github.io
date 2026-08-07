import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DistillingMemory, InMemoryMemory, JsonlFileMemory } from '../dist/index.js';

function tempPath(name = 'conversation.jsonl') {
  return join(mkdtempSync(join(tmpdir(), 'companion-forget-')), name);
}

test('그 낱말이 든 대화를 지운다 — 몇 줄 지웠는지 알려준다', () => {
  const path = tempPath();
  const memory = new JsonlFileMemory(path);
  memory.remember({ role: 'sensed', channel: 'web', text: '내 비밀번호는 사실 1234야', at: 1 });
  memory.remember({ role: 'sensed', channel: 'web', text: '오늘 날씨 좋다', at: 2 });

  assert.equal(memory.forget('비밀번호'), 1);
  assert.deepEqual(memory.recent(10).map((e) => e.text), ['오늘 날씨 좋다']);
});

test('지운 건 파일에서도 사라진다 — 화면에서만 감추지 않는다', () => {
  const path = tempPath();
  const memory = new JsonlFileMemory(path);
  memory.remember({ role: 'sensed', channel: 'web', text: '지울 말', at: 1 });
  memory.remember({ role: 'sensed', channel: 'web', text: '남을 말', at: 2 });
  memory.forget('지울');

  const body = readFileSync(path, 'utf8');
  assert.equal(body.includes('지울 말'), false);
  assert.equal(body.includes('남을 말'), true);
});

test('껐다 켜도 지워진 채로 남는다', () => {
  const path = tempPath();
  const first = new JsonlFileMemory(path);
  first.remember({ role: 'sensed', channel: 'web', text: '지울 말', at: 1 });
  first.remember({ role: 'sensed', channel: 'web', text: '남을 말', at: 2 });
  first.forget('지울');

  assert.deepEqual(new JsonlFileMemory(path).recent(10).map((e) => e.text), ['남을 말']);
});

test('없는 낱말을 지우라고 하면 아무 일도 안 한다', () => {
  const memory = new JsonlFileMemory(tempPath());
  memory.remember({ role: 'sensed', channel: 'web', text: '안녕', at: 1 });
  assert.equal(memory.forget('없는말'), 0);
  assert.equal(memory.recent(10).length, 1);
});

test('빈 낱말로는 아무것도 안 지운다 — 실수로 전부 날아가지 않게', () => {
  const memory = new JsonlFileMemory(tempPath());
  memory.remember({ role: 'sensed', channel: 'web', text: '안녕', at: 1 });
  assert.equal(memory.forget('   '), 0);
  assert.equal(memory.recent(10).length, 1);
});

test('아는 것에서 한 줄만 지운다', async () => {
  const notePath = tempPath('아는-것.md');
  const memory = new DistillingMemory({
    inner: new InMemoryMemory(),
    distill: async () => '- 이름은 마스카리\n- 매운 걸 못 먹는다\n- 잘못 안 사실',
    every: 999,
    notePath,
  });
  // 졸이려면 접을 대화가 한 줄이라도 있어야 한다.
  await memory.remember({ role: 'sensed', channel: 'web', text: '아무 말', at: 1 });
  await memory.condense();

  assert.equal(memory.forgetKnown('잘못 안 사실'), true);
  assert.equal(memory.longTerm().includes('잘못 안 사실'), false);
  assert.equal(memory.longTerm().includes('마스카리'), true);
});

test('지운 것은 파일에도 반영된다', async () => {
  const notePath = tempPath('아는-것.md');
  const memory = new DistillingMemory({
    inner: new InMemoryMemory(),
    distill: async () => '- 남을 것\n- 지울 것',
    every: 999,
    notePath,
  });
  await memory.remember({ role: 'sensed', channel: 'web', text: '아무 말', at: 1 });
  await memory.condense();
  memory.forgetKnown('지울 것');

  const body = readFileSync(notePath, 'utf8');
  assert.equal(body.includes('지울 것'), false);
  assert.equal(body.includes('남을 것'), true);
});

test('없는 줄을 지우라고 하면 아무 일도 안 한다', async () => {
  const memory = new DistillingMemory({
    inner: new InMemoryMemory(),
    distill: async () => '- 남을 것',
    every: 999,
  });
  await memory.remember({ role: 'sensed', channel: 'web', text: '아무 말', at: 1 });
  await memory.condense();
  assert.equal(memory.forgetKnown('없는 줄'), false);
  assert.equal(memory.longTerm(), '- 남을 것');
});

test('아는 게 없으면 지울 것도 없다', () => {
  const memory = new DistillingMemory({ inner: new InMemoryMemory(), distill: async () => '', every: 999 });
  assert.equal(memory.forgetKnown('무엇이든'), false);
});
