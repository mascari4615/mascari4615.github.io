import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Companion, InMemoryMemory, JsonlFileMemory, alwaysRespond, recallHand } from '../dist/index.js';

function tempMemory() {
  return new JsonlFileMemory(join(mkdtempSync(join(tmpdir(), 'companion-recall-')), 'conversation.jsonl'));
}

test('옛 대화를 낱말로 찾는다 — 최신 것부터', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '나 고양이 키우고 싶어', at: 1 });
  memory.remember({ role: 'said', channel: 'web', text: '고양이는 손이 많이 가', at: 2 });
  memory.remember({ role: 'sensed', channel: 'web', text: '오늘 날씨 좋네', at: 3 });

  const hits = memory.search('고양이');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].at, 2, '최신 것이 먼저');
});

test('없는 낱말은 빈 손으로 돌아온다 — 지어내지 않는다', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '안녕', at: 1 });
  assert.deepEqual(memory.search('강아지'), []);
});

test('빈 낱말로는 아무것도 안 찾는다', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '안녕', at: 1 });
  assert.deepEqual(memory.search('   '), []);
});

test('찾은 것은 언제 누가 했는지까지 붙여 돌려준다', async () => {
  const hand = recallHand(() => [{ role: 'said', text: '고양이는 손이 많이 가', at: Date.UTC(2026, 0, 2, 3, 4) }]);
  const said = await hand.run('고양이');
  assert.match(said, /고양이는 손이 많이 가/);
  assert.match(said, /내가/);
  assert.match(said, /2026/);
});

test('못 찾으면 못 찾았다고 한다', async () => {
  const hand = recallHand(() => []);
  assert.match(await hand.run('강아지'), /찾은 옛 대화는 없다/);
});

test('찾기 손은 결과를 두뇌에 되돌린다고 표시돼 있다', () => {
  assert.equal(recallHand(() => []).feedsBack, true);
});

test('찾아낸 것을 보고 다시 답한다 — 찾아놓고 모른 채로 답하지 않는다', async () => {
  const seen = [];
  const brain = {
    name: 'two-step',
    async think(input) {
      seen.push(input.found ?? null);
      // 처음엔 찾아보자고 하고, 찾은 걸 받으면 그걸로 답한다.
      return input.found ? `아, ${input.found[0]}` : '[[기억찾기: 고양이]]';
    },
  };
  const spoken = [];
  const body = {
    name: 'web',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { spoken.push(u.text); } },
  };
  const hand = recallHand(() => [{ role: 'said', text: '고양이 얘기 했었다', at: 1 }]);

  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond, hands: [hand],
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '저번에 그거 뭐였지?', at: Date.now() });

  assert.equal(seen.length, 2, '두 번 생각한다 — 찾기 전과 후');
  assert.equal(seen[0], null);
  assert.match(spoken[0], /고양이 얘기 했었다/);
});

test('되돌릴 필요 없는 손은 한 번만 생각한다', async () => {
  let thoughts = 0;
  const brain = { name: 'once', async think() { thoughts += 1; return '알겠다 [[적어두기: 우유]]'; } };
  const body = { name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const hand = { name: '적어두기', what: '', needs: '', async run() { return 'ok'; } };

  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond, hands: [hand],
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '우유 적어줘', at: Date.now() });

  assert.equal(thoughts, 1);
});

// ── 자동 회상 (판단에 안 맡긴다) ─────────────────────────────────────────

import { recallFrom } from '../dist/index.js';

function tenDaysAgo() { return Date.now() - 10 * 86_400_000; }

test('지난 대화를 자동으로 찾아 붙인다 — 두뇌가 부르지 않아도', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '나 매운 거 못 먹어', at: tenDaysAgo() });
  const recall = recallFrom((w, l) => memory.search(w, l));
  const found = recall({ text: '나 저번에 못 먹는다고 한 거 뭐였지?' }, []);
  assert.equal(found.length > 0, true);
  assert.match(found.join(''), /매운 거 못 먹어/);
});

test('말끝이 달라도 찾는다 — 「먹는다고」로 「먹어」를 찾아낸다', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '나 매운 거 못 먹어', at: tenDaysAgo() });
  const found = recallFrom((w, l) => memory.search(w, l))({ text: '먹는다고 한 거' }, []);
  assert.match(found.join(''), /못 먹어/);
});

test('방금 한 말이 앞자리를 차지해도 옛 기억이 나온다', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '나 매운 거 못 먹어', at: tenDaysAgo() });
  const 방금 = { role: 'sensed', channel: 'web', text: '못 먹는다고 한 거 뭐였지?', at: Date.now() };
  memory.remember(방금);

  const found = recallFrom((w, l) => memory.search(w, l))({ text: 방금.text }, [방금]);
  assert.match(found.join(''), /매운 거 못 먹어/, '옛 기억이 나와야 한다');
  assert.equal(found.join('').includes('뭐였지'), false, '방금 한 말은 또 붙이지 않는다');
});

test('흔한 말로는 옛 대화를 헤집지 않는다', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '아무 얘기', at: tenDaysAgo() });
  assert.deepEqual(recallFrom((w, l) => memory.search(w, l))({ text: '그거 뭐야' }, []), []);
});

test('찾을 게 없으면 빈 손으로 돌아온다 — 지어내지 않는다', () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '고양이 얘기', at: tenDaysAgo() });
  assert.deepEqual(recallFrom((w, l) => memory.search(w, l))({ text: '자동차 어땠지' }, []), []);
});

test('찾은 것은 코어를 지나 두뇌까지 간다', async () => {
  const memory = tempMemory();
  memory.remember({ role: 'sensed', channel: 'web', text: '나 매운 거 못 먹어', at: tenDaysAgo() });
  // 옛말이 최근 목록 밖으로 밀려나야 「찾아올」 일이 생긴다 — 최근에 있으면 이미 보인다.
  for (let i = 0; i < 20; i += 1) {
    memory.remember({ role: 'sensed', channel: 'web', text: `그 뒤 잡담 ${i}`, at: tenDaysAgo() + i });
  }
  let seen = null;
  const brain = { name: 'spy', async think(input) { seen = input.found; return null; } };
  const body = { name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const companion = new Companion({
    bodies: [body], brain, memory, attention: alwaysRespond,
    recall: recallFrom((w, l) => memory.search(w, l)),
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '못 먹는다고 한 거 뭐였지?', at: Date.now() });

  assert.ok(Array.isArray(seen) && seen.length > 0);
  assert.match(seen.join(''), /매운 거 못 먹어/);
});
