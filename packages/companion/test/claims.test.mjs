import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Companion,
  InMemoryMemory,
  alwaysRespond,
  claimRetryNote,
  findClaim,
  mouthGate,
  unbackedClaim,
} from '../dist/index.js';

// ── 주장 가리기 ─────────────────────────────────────────────────────

test('했다는 말을 알아본다', () => {
  for (const t of ['적어 뒀어', '메모해 뒀어', '찾아봤어', '열어 뒀어']) {
    assert.notEqual(findClaim(t), null, `${t}`);
  }
});

test('하겠다는 말은 주장이 아니다 — 이걸 안 가르면 아무 약속도 못 한다', () => {
  for (const t of ['적어 둘게', '찾아볼게', '열어 줄까', '해 볼게']) {
    assert.equal(findClaim(t), null, `${t}`);
  }
});

test('그냥 하는 말은 주장이 아니다', () => {
  assert.equal(findClaim('오늘 회의 길었네'), null);
});

test('무슨 손이 필요한지 안다', () => {
  assert.ok(findClaim('적어 뒀어').needs.includes('적어두기'));
});

// ── 뒷받침 없는 주장 ────────────────────────────────────────────────

test('손을 안 쓰고 했다고 하면 잡는다', () => {
  const why = unbackedClaim('그거 적어 뒀어', []);
  assert.notEqual(why, null);
  assert.match(why, /안 하고/);
});

test('실제로 손을 썼으면 안 잡는다', () => {
  assert.equal(unbackedClaim('그거 적어 뒀어', ['적어두기']), null);
});

test('다른 손을 썼으면 그건 뒷받침이 아니다', () => {
  assert.notEqual(unbackedClaim('그거 적어 뒀어', ['시계']), null);
});

test('하겠다는 말은 손 없이도 괜찮다', () => {
  assert.equal(unbackedClaim('그거 적어 둘게', []), null);
});

test('아무 주장도 없으면 조용하다', () => {
  assert.equal(unbackedClaim('오늘 회의 길었네', []), null);
});

test('손 이름이 조금 달라도 알아본다 — 이름 하나만 보면 이름 바꾸는 순간 검사가 죽는다', () => {
  assert.equal(unbackedClaim('찾아봤어', ['파일찾기']), null);
  assert.equal(unbackedClaim('알려 줄게 이따', ['알려주기']), null);
});

// ── 다시 시킬 때 ────────────────────────────────────────────────────

test('손을 쓰라고 시키지 않는다 — 시키면 안 해도 될 일까지 한다', () => {
  const note = claimRetryNote('안 하고 「적어 뒀다」고 말했다');
  assert.match(note, /안 했다고 하거나/);
  assert.match(note, /못 하는 걸 못 한다고 하는 건 흠이 아니다/);
});

// ── 관문과 이어 보기 ────────────────────────────────────────────────

test('뒷받침 없는 주장은 관문에서 다시 시킨다', async () => {
  let 이유 = null;
  const gate = mouthGate({
    alsoRetryWhen: (t) => unbackedClaim(t, []),
    retry: async (why) => { 이유 = why; return '아직 안 적었어.'; },
  });
  assert.equal(await gate('그거 적어 뒀어'), '아직 안 적었어.');
  assert.match(이유, /안 하고/);
});

test('실제로 한 말은 그대로 나간다', async () => {
  const gate = mouthGate({ alsoRetryWhen: (t) => unbackedClaim(t, ['적어두기']) });
  assert.equal(await gate('그거 적어 뒀어'), '그거 적어 뒀어');
  assert.equal(gate.stopped(), 0);
});

// ── core 가 쓴 손을 알려 주나 ───────────────────────────────────────

test('core 가 이번에 쓴 손을 관문에 알려 준다 — 표는 그 전에 걷어내지므로 뒤에서는 알 길이 없다', async () => {
  let 받은손 = null;
  const said = [];
  const 손 = { name: '적어두기', describe: '적는다', async use() { return null; } };
  const companion = new Companion({
    bodies: [{ name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak(u) { said.push(u.text); } } }],
    brain: { name: 'b', async think() { return '[[적어두기: 우유]] 적어 뒀어'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    hands: [손],
    beforeSpeak: (text, ctx) => { 받은손 = ctx.usedHands; return text; },
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '우유 적어 둬', at: Date.now() });

  assert.deepEqual([...받은손], ['적어두기']);
  assert.deepEqual(said, ['적어 뒀어']);
});

test('손을 안 쓰면 빈 채로 알려 준다', async () => {
  let 받은손 = null;
  const companion = new Companion({
    bodies: [{ name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } }],
    brain: { name: 'b', async think() { return '적어 뒀어'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    hands: [{ name: '적어두기', describe: '적는다', async use() { return null; } }],
    beforeSpeak: (text, ctx) => { 받은손 = ctx.usedHands; return text; },
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '우유 적어 둬', at: Date.now() });

  assert.deepEqual([...받은손], []);
});

test('손이 없어도 관문은 돈다', async () => {
  let 불렸나 = false;
  const companion = new Companion({
    bodies: [{ name: 'web', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } }],
    brain: { name: 'b', async think() { return '그냥 말'; } },
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
    beforeSpeak: (text, ctx) => { 불렸나 = Array.isArray(ctx.usedHands) || ctx.usedHands !== undefined; return text; },
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '안녕', at: Date.now() });
  assert.equal(불렸나, true);
});

test('안 했다는 말은 주장이 아니다 — 정직을 벌하면 안 된다', () => {
  for (const t of ['아무것도 안 적어뒀어', '아직 안 찾아봤어', '못 열어 뒀어', '적어 둔 게 없어']) {
    assert.equal(findClaim(t), null, `${t} 는 안 했다는 말이다`);
  }
});

test('그래도 진짜 주장은 여전히 잡는다', () => {
  assert.notEqual(findClaim('그거 적어 뒀어'), null);
  assert.notEqual(unbackedClaim('찾아봤어 거기 있더라', []), null);
});
