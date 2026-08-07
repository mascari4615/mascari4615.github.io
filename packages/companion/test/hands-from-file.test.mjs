import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { autoUse, handFrom, hintFrom, insideFence, loadHands, readSpec } from '../dist/index.js';

const 임시 = () => mkdtempSync(join(tmpdir(), 'hands-'));

// ── 명세 읽기 ───────────────────────────────────────────────────────

test('제대로 적은 명세를 읽는다', () => {
  const spec = readSpec({ name: '할일보기', what: '할 일 목록을 본다', kind: 'read-file', path: '/tmp/todo.md' });
  assert.equal(spec.name, '할일보기');
  assert.equal(spec.feedsBack, true, '읽는 손은 되돌려주는 게 기본이다');
});

test('빠진 게 있으면 안 읽는다', () => {
  assert.equal(readSpec({ what: '설명만 있다', kind: 'read-file', path: '/x' }), null);
  assert.equal(readSpec({ name: '이름만' }), null);
  assert.equal(readSpec(null), null);
  assert.equal(readSpec('글자'), null);
});

test('모르는 갈래는 안 만든다 — 아무거나 실행하는 문은 열지 않는다', () => {
  assert.equal(readSpec({ name: 'x', what: 'y', kind: 'run-command', path: 'rm -rf /' }), null);
  assert.equal(readSpec({ name: 'x', what: 'y', kind: 'write-file', path: '/x' }), null);
});

test('되돌려줄지 끌 수 있다', () => {
  assert.equal(readSpec({ name: 'x', what: 'y', kind: 'read-file', path: '/x', feedsBack: false }).feedsBack, false);
});

// ── 울타리 ──────────────────────────────────────────────────────────

test('울타리를 안 주면 어디든 된다 — 내 컴퓨터다', () => {
  assert.equal(insideFence('/anywhere/x', undefined), true);
});

test('울타리 안이면 된다', () => {
  const 집 = 임시();
  try {
    assert.equal(insideFence(join(집, 'a', 'b.md'), 집), true);
    assert.equal(insideFence(집, 집), true);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('울타리 밖이면 손을 안 만든다', () => {
  const 집 = 임시();
  try {
    assert.equal(insideFence(join(집, '..', '남의것.md'), 집), false);
    const hand = handFrom(
      { name: 'x', what: 'y', kind: 'read-file', path: join(집, '..', '남의것.md') },
      { within: 집 },
    );
    assert.equal(hand, null);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

// ── 실제로 읽기 ─────────────────────────────────────────────────────

test('파일을 읽어 준다', async () => {
  const 집 = 임시();
  try {
    const p = join(집, 'todo.md');
    writeFileSync(p, '우유 사기\n셰이더 고치기\n', 'utf8');
    const hand = handFrom({ name: '할일', what: '할 일', kind: 'read-file', path: p });
    assert.match(await hand.run(''), /우유 사기/);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('넘긴 말이 있으면 그 줄만 — 큰 파일을 통째로 주면 오히려 방해다', async () => {
  const 집 = 임시();
  try {
    const p = join(집, 'todo.md');
    writeFileSync(p, '우유 사기\n셰이더 고치기\n', 'utf8');
    const hand = handFrom({ name: '할일', what: '할 일', kind: 'read-file', path: p });
    const 결과 = await hand.run('셰이더');
    assert.match(결과, /셰이더/);
    assert.equal(결과.includes('우유'), false);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('찾는 게 없으면 통째로 준다 — 빈손보다 낫다', async () => {
  const 집 = 임시();
  try {
    const p = join(집, 'todo.md');
    writeFileSync(p, '우유 사기\n', 'utf8');
    const hand = handFrom({ name: '할일', what: '할 일', kind: 'read-file', path: p });
    assert.match(await hand.run('없는말'), /우유/);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('파일이 없으면 없다고 한다 — 죽지 않는다', async () => {
  const hand = handFrom({ name: 'x', what: 'y', kind: 'read-file', path: '/없는/파일.md' });
  assert.match(await hand.run(''), /없다/);
});

test('폴더를 읽어 준다', async () => {
  const 집 = 임시();
  try {
    writeFileSync(join(집, 'a.md'), '', 'utf8');
    mkdirSync(join(집, '안쪽'));
    const hand = handFrom({ name: '폴더', what: '폴더', kind: 'read-dir', path: 집 });
    const 결과 = await hand.run('');
    assert.match(결과, /a\.md/);
    assert.match(결과, /안쪽\//, '폴더는 표시가 다르다');
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('얼마나 읽을지 정할 수 있다', async () => {
  const 집 = 임시();
  try {
    for (let i = 0; i < 20; i += 1) writeFileSync(join(집, `${i}.md`), '', 'utf8');
    const hand = handFrom({ name: '폴더', what: '폴더', kind: 'read-dir', path: 집, limit: 3 });
    assert.equal((await hand.run('')).split('\n').length, 3);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

// ── 폴더에서 통째로 읽기 ────────────────────────────────────────────

test('폴더 안의 명세들을 손으로 만든다', () => {
  const 집 = 임시();
  try {
    writeFileSync(join(집, '1.json'), JSON.stringify({ name: '할일', what: '할 일', kind: 'read-file', path: join(집, 'x.md') }), 'utf8');
    writeFileSync(join(집, '2.json'), JSON.stringify({ name: '폴더', what: '폴더', kind: 'read-dir', path: 집 }), 'utf8');
    assert.deepEqual(loadHands(집).hands.map((h) => h.name), ['할일', '폴더']);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('폴더가 없으면 빈손이다 — 죽지 않는다', () => {
  assert.deepEqual(loadHands('/없는/폴더').hands, []);
});

test('깨진 파일은 왜 빠졌는지 남긴다 — 조용히 사라지면 알 길이 없다', () => {
  const 집 = 임시();
  const 남긴것 = [];
  try {
    writeFileSync(join(집, '깨진것.json'), '{{{', 'utf8');
    assert.deepEqual(loadHands(집, { log: (m) => 남긴것.push(m) }).hands, []);
    assert.equal(남긴것.some((m) => m.includes('깨진것.json')), true);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('명세가 아닌 것도 왜 빠졌는지 남긴다', () => {
  const 집 = 임시();
  const 남긴것 = [];
  try {
    writeFileSync(join(집, '엉뚱.json'), JSON.stringify({ 아무거나: 1 }), 'utf8');
    loadHands(집, { log: (m) => 남긴것.push(m) });
    assert.equal(남긴것.some((m) => m.includes('손 명세로 안 보인다')), true);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('이름이 겹치면 뒤엣것을 버린다 — 두 손이 같은 이름이면 어느 쪽인지 알 수 없다', () => {
  const 집 = 임시();
  const 남긴것 = [];
  try {
    writeFileSync(join(집, '1.json'), JSON.stringify({ name: '같은이름', what: 'a', kind: 'read-dir', path: 집 }), 'utf8');
    writeFileSync(join(집, '2.json'), JSON.stringify({ name: '같은이름', what: 'b', kind: 'read-dir', path: 집 }), 'utf8');
    assert.equal(loadHands(집, { log: (m) => 남긴것.push(m) }).hands.length, 1);
    assert.equal(남긴것.some((m) => m.includes('이름이 겹쳐')), true);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('json 이 아닌 파일은 안 본다', () => {
  const 집 = 임시();
  try {
    writeFileSync(join(집, '메모.txt'), 'name: 할일', 'utf8');
    assert.deepEqual(loadHands(집).hands, []);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

// ── 언제 쓸지 ───────────────────────────────────────────────────────

test('명세에 언제 쓸지를 적을 수 있다 — 능력만 있고 쓰임이 없으면 없는 것과 같다', () => {
  const spec = readSpec({ name: '할일', what: '할 일', kind: 'read-file', path: '/x', when: ['할 일', '뭐 하기로'] });
  assert.deepEqual(spec.when, ['할 일', '뭐 하기로']);
  const hint = hintFrom(spec);
  assert.equal(hint.hand, '할일');
  assert.equal(hint.when.test('오늘 할 일 뭐였지'), true);
  assert.equal(hint.when.test('오늘 날씨 어때'), false);
});

test('안 적으면 저절로는 안 쓰인다 — 그 사실을 남긴다', () => {
  const 집 = 임시();
  const 남긴것 = [];
  try {
    writeFileSync(join(집, '1.json'), JSON.stringify({ name: '할일', what: '할 일', kind: 'read-dir', path: 집 }), 'utf8');
    const { hands, hints } = loadHands(집, { log: (m) => 남긴것.push(m) });
    assert.equal(hands.length, 1, '손은 만들어진다');
    assert.deepEqual(hints, [], '저절로 쓸 힌트는 없다');
    assert.equal(남긴것.some((m) => m.includes('언제 쓸지를 안 적어서')), true);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('사람이 적은 말에 특수 기호가 있어도 안 터진다', () => {
  const hint = hintFrom(readSpec({ name: 'x', what: 'y', kind: 'read-file', path: '/x', when: ['(뭐지?)', 'a.b'] }));
  assert.equal(hint.when.test('(뭐지?)'), true);
  assert.equal(hint.when.test('axb'), false, '점이 아무 글자나 되면 안 된다');
});

test('빈 말은 힌트로 안 센다', () => {
  assert.equal(hintFrom(readSpec({ name: 'x', what: 'y', kind: 'read-file', path: '/x', when: ['', '  '] })), null);
});

test('힌트로 실제 손이 골라진다', async () => {
  const 집 = 임시();
  try {
    const p = join(집, 'todo.md');
    writeFileSync(p, '우유 사기\n', 'utf8');
    writeFileSync(join(집, '1.json'), JSON.stringify({
      name: '할일', what: '할 일', kind: 'read-file', path: p, when: ['할 일'],
    }), 'utf8');
    const { hands, hints } = loadHands(집);
    const 찾은것 = await autoUse('오늘 할 일 뭐였지', hands, { hints });
    assert.equal(찾은것.length, 1);
    assert.match(찾은것[0], /우유 사기/);
  } finally { rmSync(집, { recursive: true, force: true }); }
});

test('힌트에 안 걸리면 안 쓴다', async () => {
  const 집 = 임시();
  try {
    writeFileSync(join(집, '1.json'), JSON.stringify({
      name: '할일', what: '할 일', kind: 'read-dir', path: 집, when: ['할 일'],
    }), 'utf8');
    const { hands, hints } = loadHands(집);
    assert.deepEqual(await autoUse('오늘 날씨 어때', hands, { hints }), []);
  } finally { rmSync(집, { recursive: true, force: true }); }
});
