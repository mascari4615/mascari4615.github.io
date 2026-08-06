import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  clockHand,
  fileInfoHand,
  findFileHand,
  needsPermission,
  openHand,
  readNotesHand,
} from '../dist/index.js';

function tempTree() {
  const root = mkdtempSync(join(tmpdir(), 'companion-hands-'));
  mkdirSync(join(root, '안쪽'), { recursive: true });
  writeFileSync(join(root, '장보기목록.md'), '우유\n', 'utf8');
  writeFileSync(join(root, '안쪽', '영수증-2026.txt'), 'x', 'utf8');
  return root;
}

test('파일찾기는 이름 조각으로 아래 폴더까지 뒤진다', async () => {
  const root = tempTree();
  const found = await findFileHand([root]).run('영수증');
  assert.match(found, /영수증-2026\.txt/);
});

test('없는 걸 찾으면 없다고 한다 — 지어내지 않는다', async () => {
  const root = tempTree();
  assert.match(await findFileHand([root]).run('없는것'), /못 찾았다/);
});

test('무엇을 찾을지 안 주면 조용히 넘어가지 않는다', async () => {
  await assert.rejects(() => findFileHand(['.']).run('   '));
});

test('파일정보는 크기와 시각을 돌려준다', async () => {
  const root = tempTree();
  const info = await fileInfoHand().run(join(root, '장보기목록.md'));
  assert.match(info, /크기/);
  assert.match(info, /마지막 수정/);
});

test('없는 파일 정보를 물으면 없다고 한다', async () => {
  await assert.rejects(() => fileInfoHand().run(join(tmpdir(), '있을리없는파일.xyz')));
});

test('적어둔 게 없으면 없다고 한다', async () => {
  const empty = join(mkdtempSync(join(tmpdir(), 'companion-note-')), '적어둔-것.md');
  assert.match(await readNotesHand(empty).run(''), /아직 적어 둔 게 없다/);
});

test('시계는 지금 날짜를 돌려준다', async () => {
  const now = await clockHand().run('');
  assert.match(now, new RegExp(String(new Date().getFullYear())));
});

test('승낙이 필요한 손은 물어보고, 아니라고 하면 아무 일도 안 한다', async () => {
  let ran = false;
  const risky = { name: '열기', what: '', needs: '', async run() { ran = true; return '했다'; } };
  const guarded = needsPermission(risky, { async confirm() { return false; } });

  const said = await guarded.run('무언가');
  assert.equal(ran, false);
  assert.match(said, /하지 않았다/);
});

test('승낙하면 그때 실제로 한다', async () => {
  let ran = false;
  const risky = { name: '열기', what: '', needs: '', async run() { ran = true; return '했다'; } };
  const guarded = needsPermission(risky, { async confirm() { return true; } });

  assert.equal(await guarded.run('무언가'), '했다');
  assert.equal(ran, true);
});

test('물어볼 때 무엇을 하려는지 그대로 보여준다', async () => {
  let asked = '';
  const guarded = needsPermission(openHand(), {
    async confirm(what) { asked = what; return false; },
  });
  await guarded.run('C:/어딘가/파일.txt');
  assert.match(asked, /열기: C:\/어딘가\/파일\.txt/);
});
