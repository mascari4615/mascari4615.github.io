import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorable } from '../src/mirror-policy.mjs';

test('화면에서 열리는 것만 열람 저장에 둔다', () => {
  for (const p of ['a.png', 'dir/b.JPG', 'x/y/c.webp', 'note.txt', 'data.json']) {
    assert.equal(mirrorable(p), true, p);
  }
});

test('영상·기타는 정본에만 둔다 — 값만 나가고 화면은 안 달라진다', () => {
  for (const p of ['big.mp4', 'clip.MKV', 'pack.zip', 'setup.exe', 'a.psd']) {
    assert.equal(mirrorable(p), false, p);
  }
});

test('확장자가 없거나 이상하면 안 둔다', () => {
  assert.equal(mirrorable('README'), false);
  assert.equal(mirrorable(''), false);
  assert.equal(mirrorable('dir.png/inside'), false, '폴더 이름의 확장자에 속으면 안 된다');
  assert.equal(mirrorable('.gitignore'), false, '점으로 시작하는 이름은 확장자가 아니다');
  assert.equal(mirrorable(null), false);
});
