import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchStore,
  getFile,
  listDir,
  listFiles,
  previewKind,
  unlockVault,
} from '../src/vault.mjs';
import { FIXTURE_PASS, buildFixtureStore, writeFixture } from '../scripts/build-fixture.mjs';

test('listDir 는 한 칸만 보여 준다', () => {
  const files = [
    { path: 'hello.txt', size: 1 },
    { path: 'pic/tiny.png', size: 2 },
    { path: 'dir/note.txt', size: 3 },
    { path: 'dir/sub/a.txt', size: 4 },
  ];
  const root = listDir(files, '');
  assert.deepEqual(root.folders, ['dir', 'pic']);
  assert.deepEqual(root.files.map((f) => f.path), ['hello.txt']);
  const nested = listDir(files, 'dir');
  assert.deepEqual(nested.folders, ['sub']);
  assert.deepEqual(nested.files.map((f) => f.path), ['dir/note.txt']);
});

test('previewKind', () => {
  assert.equal(previewKind('a.PNG'), 'image');
  assert.equal(previewKind('a.mp4'), 'video');
  assert.equal(previewKind('a.txt'), 'text');
  assert.equal(previewKind('a.bin'), 'file');
});

test('fetchStore 는 404 를 빈 값으로, 쓰기는 거절', async () => {
  const fetchFn = async (url) => {
    if (String(url).endsWith('/hdr')) {
      return { status: 200, ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
    }
    return { status: 404, ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const store = fetchStore('https://example/v', fetchFn);
  const hdr = await store.get('hdr');
  assert.equal(hdr.length, 2);
  assert.equal(await store.get('nope'), null);
  await assert.rejects(() => store.put('x', new Uint8Array(1)), /read-only/);
});

test('픽스처 클라우드를 열어 글·그림을 메모리에서 읽는다', async () => {
  const store = await buildFixtureStore();
  const session = await unlockVault(store, FIXTURE_PASS);
  const listed = await listFiles(session);
  assert.deepEqual(listed.map((f) => f.path).sort(), ['dir/note.txt', 'hello.txt', 'pic/tiny.png']);
  const hello = await getFile(session, 'hello.txt');
  assert.equal(new TextDecoder().decode(hello.bytes), 'hello vault');
  const png = await getFile(session, 'pic/tiny.png');
  assert.equal(png.bytes[0], 0x89);
  assert.equal(png.bytes[1], 0x50);
});

test('픽스처를 디스크에 써도 평문 이름이 키에 없다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'files-fix-'));
  try {
    await writeFixture(dir);
    const hdr = await readFile(join(dir, 'hdr'));
    assert.ok(hdr.length >= 8);
    await assert.rejects(() => readFile(join(dir, 'hello.txt')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
