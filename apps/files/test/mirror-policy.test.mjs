import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_MAX_BYTES, mirrorable, playableKind } from '../src/mirror-policy.mjs';

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

test('영상은 크기로 가른다', () => {
  /* 실측(2026-08-29): 영상 1,031개 31.4GB 인데 100MB 이하가 997개(97%)·13.1GB.
     덩치는 큰 몇 개(5.0GB·4.3GB·1.7GB)가 먹고, 화면은 통째로 받아 복호하므로
     큰 것은 올려 봐야 브라우저가 못 버틴다. */
  assert.equal(mirrorable('a/clip.mp4', 10 * 1024 * 1024), true, '작은 영상은 싣는다');
  assert.equal(mirrorable('a/clip.mp4', VIDEO_MAX_BYTES), true, '문턱과 같으면 싣는다');
  assert.equal(mirrorable('a/clip.mp4', VIDEO_MAX_BYTES + 1), false, '문턱을 넘으면 안 싣는다');
  assert.equal(mirrorable('a/clip.mp4'), false, '크기를 모르면 안 싣는다');
  /* 그림·글은 크기를 안 본다 — 지금까지와 같다. */
  assert.equal(mirrorable('a/pic.png'), true);
});

test('playableKind 는 갈래만 본다 — 크기는 안 본다', () => {
  assert.equal(playableKind('a/clip.mp4'), true);
  assert.equal(playableKind('a/pic.png'), true);
  assert.equal(playableKind('a/game.dll'), false);
});
