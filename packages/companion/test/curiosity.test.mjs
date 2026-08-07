import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fileCuriosity, maybeAsk, wonderHand } from '../dist/index.js';

function tempStore() {
  return fileCuriosity(join(mkdtempSync(join(tmpdir(), 'companion-wonder-')), '궁금한-것.md'));
}

test('궁금한 걸 담아 두고 꺼낸다', () => {
  const store = tempStore();
  assert.equal(store.next(), null, '처음엔 담아 둔 게 없다');
  store.wonder('그 게임 왜 만들기 시작했는지');
  assert.equal(store.next(), '그 게임 왜 만들기 시작했는지');
});

test('같은 걸 두 번 담지 않는다', () => {
  const store = tempStore();
  store.wonder('왜 밤에만 일하는지');
  store.wonder('왜 밤에만 일하는지');
  assert.equal(store.size(), 1);
});

test('오래 담아 둔 것부터 꺼낸다 — 새 궁금증이 옛것을 덮지 않게', () => {
  const store = tempStore();
  store.wonder('첫 번째');
  store.wonder('두 번째');
  assert.equal(store.next(), '첫 번째');
});

test('물어본 것은 다시 안 묻는다', () => {
  const store = tempStore();
  store.wonder('첫 번째');
  store.wonder('두 번째');
  store.asked('첫 번째');
  assert.equal(store.next(), '두 번째');
  store.wonder('첫 번째'); // 다시 담으려 해도
  assert.equal(store.size(), 1, '이미 물어본 건 도로 담기지 않는다');
});

test('껐다 켜도 궁금증은 남는다 — 어제 궁금했던 걸 오늘 묻는다', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'companion-wonder-')), '궁금한-것.md');
  fileCuriosity(path).wonder('그 고양이 이름');
  assert.equal(fileCuriosity(path).next(), '그 고양이 이름');
});

test('사람이 열어 봐도 읽히는 형태로 남는다', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'companion-wonder-')), '궁금한-것.md');
  const store = fileCuriosity(path);
  store.wonder('첫 번째');
  store.wonder('두 번째');
  store.asked('첫 번째');
  const body = readFileSync(path, 'utf8');
  assert.match(body, /두 번째/);
  assert.match(body, /- 첫 번째/, '물어본 것은 지운 표시로 남는다');
});

test('빈 궁금증은 담지 않는다', () => {
  const store = tempStore();
  store.wonder('   ');
  assert.equal(store.size(), 0);
});

test('손으로 담으면 실제로 들어간다', async () => {
  const store = tempStore();
  const said = await wonderHand(store).run('왜 마녀 게임인지');
  assert.match(said, /담아뒀다/);
  assert.equal(store.next(), '왜 마녀 게임인지');
});

test('가끔만 꺼낸다 — 매번 꺼내면 취조가 된다', () => {
  const store = tempStore();
  store.wonder('뭐 하나 궁금한 게');
  assert.equal(maybeAsk(store, { chance: 0.25, roll: () => 0.9 }), '', '운이 아니면 안 꺼낸다');
  assert.match(maybeAsk(store, { chance: 0.25, roll: () => 0.1 }), /뭐 하나 궁금한 게/);
});

test('담아 둔 게 없으면 꺼낼 것도 없다', () => {
  assert.equal(maybeAsk(tempStore(), { chance: 1, roll: () => 0 }), '');
});

test('꺼낼 때는 어색하면 넘기라고 함께 일러 준다', () => {
  const store = tempStore();
  store.wonder('무언가');
  assert.match(maybeAsk(store, { chance: 1, roll: () => 0 }), /어색하면 그냥 넘겨라/);
});

// ── 자동으로 궁금해하기 (판단에 안 맡긴다) ───────────────────────────────

import { noticeCuriosity } from '../dist/index.js';

test('사람이 꺼낸 새 얘기를 자동으로 담아 둔다', () => {
  const store = tempStore();
  const about = noticeCuriosity('나 요즘 마녀 나오는 게임 만드는 중이야', null, store);
  assert.ok(about !== null);
  assert.match(store.next(), /마녀|게임|만드는/);
});

test('씨앗은 짧게 담는다 — 문장째 담으면 꺼낼 때 그 문장을 읊는다 (31회차에 뒤집었다)', () => {
  const 곳 = [];
  const store = { wonder: (x) => 곳.push(x), next: () => 곳[0] ?? null, asked: () => {}, size: () => 곳.length };
  const 씨앗 = noticeCuriosity('어제 그 셰이더 결국 못 고쳤어', null, store);
  assert.match(씨앗, /셰이더/);
  assert.equal(씨앗.includes('어제 그'), false, '문장을 물고 있으면 안 된다');
});

test('이미 아는 얘기는 궁금해하지 않는다', () => {
  const store = tempStore();
  const about = noticeCuriosity('마녀 게임 얘기', '- 마녀 게임을 만든다\n- 유니티를 쓴다', store);
  assert.equal(about, null);
  assert.equal(store.size(), 0);
});

test('짧은 대꾸에는 궁금할 게 없다', () => {
  const store = tempStore();
  assert.equal(noticeCuriosity('응 그래', null, store), null);
  assert.equal(store.size(), 0);
});

test('흔한 말만 있는 문장은 담지 않는다', () => {
  const store = tempStore();
  assert.equal(noticeCuriosity('그거 진짜 그냥 그래', null, store), null);
});

test('같은 걸 연달아 담지 않는다', () => {
  const store = tempStore();
  noticeCuriosity('나 요즘 마녀 게임 만드는 중', null, store);
  noticeCuriosity('나 요즘 마녀 게임 만드는 중', null, store);
  assert.equal(store.size(), 1);
});
