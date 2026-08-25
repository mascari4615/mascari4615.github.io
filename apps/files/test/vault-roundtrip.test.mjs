import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  VaultCorruptError,
  VaultUnlockError,
  VaultPathError,
  memoryStore,
  createVault,
  unlockVault,
  putFile,
  getFile,
  listFiles,
  flushIndex,
} from '../src/vault.mjs';

const PASS = 'test-passphrase-not-a-secret';
const NEEDLE_PATH = 'dir/needle-name.bin';
const NEEDLE_BODY = 'needle-body-plaintext-xyz';

function latin1(store) {
  let s = '';
  for (const [k, v] of store.snapshot()) {
    s += k + '\0';
    s += Buffer.from(v).toString('latin1');
  }
  return s;
}

async function fresh(pass = PASS) {
  const store = memoryStore();
  const session = await createVault(store, pass, { iterations: 8_000 });
  return { store, session };
}

test('픽스처 sha256 왕복', async () => {
  const { session } = await fresh();
  const bytes = new TextEncoder().encode('round-trip-bytes-01');
  const want = createHash('sha256').update(bytes).digest('hex');
  const put = await putFile(session, 'a/b.txt', bytes, { chunkSize: 8 });
  assert.equal(put.sha256, want);
  assert.ok(put.chunks >= 2);
  const got = await getFile(session, 'a/b.txt');
  assert.equal(got.entry.sha256, want);
  assert.deepEqual(got.bytes, bytes);
});

test('빈 파일도 왕복', async () => {
  const { session } = await fresh();
  const empty = new Uint8Array(0);
  await putFile(session, 'empty.bin', empty);
  const got = await getFile(session, 'empty.bin');
  assert.equal(got.bytes.length, 0);
  assert.equal(got.entry.chunks, 0);
});

test('한글 경로 왕복', async () => {
  const { session } = await fresh();
  const bytes = new TextEncoder().encode('본문');
  await putFile(session, '폴더/이름.txt', bytes);
  const got = await getFile(session, '폴더/이름.txt');
  assert.equal(new TextDecoder().decode(got.bytes), '본문');
});

test('위변조 1바이트에 복호 실패', async () => {
  const { store, session } = await fresh();
  await putFile(session, 'x.bin', new TextEncoder().encode('aaaa'), { chunkSize: 2 });
  const keys = [...store.snapshot().keys()].filter((k) => k.startsWith('c/'));
  assert.ok(keys.length > 0);
  const k = keys[0];
  const blob = await store.get(k);
  blob[blob.length - 1] ^= 0x01;
  await store.put(k, blob);
  await assert.rejects(() => getFile(session, 'x.bin'), VaultCorruptError);
});

test('이름·본문이 암호문에 평문으로 안 남음', async () => {
  const { store, session } = await fresh();
  await putFile(session, NEEDLE_PATH, new TextEncoder().encode(NEEDLE_BODY));
  const dump = latin1(store);
  assert.equal(dump.includes(NEEDLE_PATH), false);
  assert.equal(dump.includes('needle-name'), false);
  assert.equal(dump.includes(NEEDLE_BODY), false);
  const keys = [...store.snapshot().keys()].join(' ');
  assert.equal(keys.includes('needle'), false);
});

test('목록은 복호 뒤에만 이름이 나온다', async () => {
  const { session } = await fresh();
  await putFile(session, NEEDLE_PATH, new TextEncoder().encode('z'));
  const listed = await listFiles(session);
  assert.deepEqual(listed.map((f) => f.path), [NEEDLE_PATH]);
});

test('틀린 열쇠는 목록을 안 연다', async () => {
  const { store } = await fresh();
  await assert.rejects(() => unlockVault(store, 'wrong-pass'), VaultUnlockError);
});

test('경로 탈출은 거절', async () => {
  const { session } = await fresh();
  const bytes = new Uint8Array([1]);
  await assert.rejects(() => putFile(session, '../x', bytes), VaultPathError);
  await assert.rejects(() => putFile(session, 'a\\b', bytes), VaultPathError);
});

test('청크는 하나씩 바로 저장 — 암호문 통째 배열을 안 만든다', async () => {
  const { session } = await fresh();
  let puts = 0;
  const inner = session.store.put.bind(session.store);
  session.store.put = async (key, bytes) => {
    puts += 1;
    await inner(key, bytes);
  };
  const bytes = new Uint8Array(20).fill(7);
  await putFile(session, 'n.bin', bytes, { chunkSize: 8 });
  assert.ok(puts >= 3, `chunk puts + index, got ${puts}`);
});

test('deferIndex 는 idx 를 묶어서 쓴다', async () => {
  const { store, session } = await fresh();
  session.deferIndex = true;
  let idxPuts = 0;
  const inner = store.put.bind(store);
  store.put = async (k, b) => {
    if (k === 'idx') idxPuts += 1;
    return inner(k, b);
  };
  await putFile(session, 'a.bin', new TextEncoder().encode('a'));
  await putFile(session, 'b.bin', new TextEncoder().encode('b'));
  assert.equal(idxPuts, 0);
  await flushIndex(session);
  assert.equal(idxPuts, 1);
  assert.deepEqual((await listFiles(session)).map((f) => f.path).sort(), ['a.bin', 'b.bin']);
});
