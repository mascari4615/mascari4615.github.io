import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  Companion,
  InMemoryMemory,
  alwaysRespond,
  describeHands,
  findRequests,
  noteHand,
  remindHand,
  useHands,
} from '../dist/index.js';

test('말 속의 손 표시를 걷어내고 무슨 일인지 알아낸다', () => {
  const { clean, requests } = findRequests('알겠다. [[적어두기: 우유 사기]] 그럼 이따 보자.');
  assert.equal(clean, '알겠다. 그럼 이따 보자.');
  assert.deepEqual(requests, [{ name: '적어두기', argument: '우유 사기' }]);
});

test('표시가 없으면 말은 그대로다', () => {
  const { clean, requests } = findRequests('그냥 한 말.');
  assert.equal(clean, '그냥 한 말.');
  assert.deepEqual(requests, []);
});

test('적어두기는 실제로 파일에 남는다', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'companion-hand-')), '적어둔-것.md');
  const hand = noteHand(path);
  await hand.run('우유 사기');
  assert.ok(existsSync(path));
  assert.match(readFileSync(path, 'utf8'), /우유 사기/);
});

test('알려주기는 시간과 내용을 갈라 받는다', async () => {
  let scheduled = null;
  const hand = remindHand((afterMs, what) => { scheduled = { afterMs, what }; });
  await hand.run('25 | 스트레칭');
  assert.deepEqual(scheduled, { afterMs: 25 * 60_000, what: '스트레칭' });
});

test('알려주기에 엉뚱한 걸 주면 조용히 넘어가지 않는다', async () => {
  const hand = remindHand(() => {});
  await assert.rejects(() => hand.run('나중에 알려줘'));
});

test('없는 손을 부르거나 하나가 실패해도 나머지는 한다', async () => {
  const done = [];
  const good = { name: '되는손', what: '', needs: '', async run(a) { done.push(a); return 'ok'; } };
  const bad = { name: '터지는손', what: '', needs: '', async run() { throw new Error('터짐'); } };
  const results = await useHands([good, bad], [
    { name: '없는손', argument: 'x' },
    { name: '터지는손', argument: 'y' },
    { name: '되는손', argument: 'z' },
  ]);
  assert.deepEqual(done, ['z']);
  assert.deepEqual(results, ['ok']);
});

test('할 수 있는 일 안내에는 부르는 법이 들어간다', () => {
  const note = describeHands([noteHand('/tmp/x.md')]);
  assert.match(note, /\[\[적어두기: 적을 내용\]\]/);
});

test('코어를 지나면 손 표시는 사람에게 안 보이고 일은 실제로 된다', async () => {
  const spoken = [];
  const used = [];
  const hand = { name: '적어두기', what: '', needs: '', async run(a) { used.push(a); return 'ok'; } };
  const brain = { name: 'b', async think() { return '알겠다. [[적어두기: 우유]] 이따 보자.'; } };
  const body = {
    name: 'test',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { spoken.push(u.text); } },
  };

  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond, hands: [hand],
  });
  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '우유 좀 적어줘', at: Date.now() });

  assert.deepEqual(spoken, ['알겠다. 이따 보자.']);
  assert.deepEqual(used, ['우유']);
});

test('손이 없으면 표시는 건드리지 않는다', async () => {
  const spoken = [];
  const brain = { name: 'b', async think() { return '[[적어두기: 우유]] 끝'; } };
  const body = {
    name: 'test',
    sense: { name: 's', start() {} },
    voice: { name: 'v', speak(u) { spoken.push(u.text); } },
  };
  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '뭐라도', at: Date.now() });

  assert.deepEqual(spoken, ['[[적어두기: 우유]] 끝']);
});
