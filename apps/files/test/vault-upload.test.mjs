import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createVault, getFile, memoryStore } from '../src/vault.mjs';
import { putFileFromPath, sha256File } from '../src/vault-node.mjs';
import { rcloneStore } from '../src/store-rclone.mjs';
import { walkFiles } from '../src/walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PASS = 'test-passphrase-not-a-secret';

async function withTree(build) {
  const root = await mkdtemp(join(tmpdir(), 'files-vault-'));
  try {
    await build(root);
    return await (async () => {
      const result = { root, files: await walkFiles(root) };
      return result;
    })();
  } catch (e) {
    await rm(root, { recursive: true, force: true });
    throw e;
  }
}

test('디스크에서 읽어 왕복 — 암호문 파일을 뿌리에 안 남김', async () => {
  const pack = await withTree(async (root) => {
    await mkdir(join(root, 'dir'));
    await writeFile(join(root, 'dir', 'needle.bin'), 'stream-body-xyz');
  });
  try {
    const store = memoryStore();
    const session = await createVault(store, PASS, { iterations: 8_000 });
    const rel = 'dir/needle.bin';
    const abs = join(pack.root, 'dir', 'needle.bin');
    const want = createHash('sha256').update('stream-body-xyz').digest('hex');
    const put = await putFileFromPath(session, rel, abs, { chunkSize: 4 });
    assert.equal(put.sha256, want);
    assert.ok(put.chunks >= 2);
    const got = await getFile(session, rel);
    assert.equal(new TextDecoder().decode(got.bytes), 'stream-body-xyz');
    const names = await readdir(pack.root, { recursive: true });
    assert.equal(names.some((n) => String(n).includes('c/') || String(n).endsWith('.enc')), false);
  } finally {
    await rm(pack.root, { recursive: true, force: true });
  }
});

test('sha256File 이 디스크 바이트와 같다', async () => {
  const pack = await withTree(async (root) => {
    await writeFile(join(root, 'a.bin'), 'hash-me');
  });
  try {
    const want = createHash('sha256').update('hash-me').digest('hex');
    assert.equal(await sha256File(join(pack.root, 'a.bin')), want);
  } finally {
    await rm(pack.root, { recursive: true, force: true });
  }
});

test('walk 는 node_modules 를 건너뛰고 상대 경로만 준다', async () => {
  const pack = await withTree(async (root) => {
    await mkdir(join(root, 'ok'));
    await writeFile(join(root, 'ok', 'a.txt'), 'a');
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'x', 'skip.txt'), 'no');
  });
  try {
    assert.deepEqual(pack.files.map((f) => f.rel), ['ok/a.txt']);
  } finally {
    await rm(pack.root, { recursive: true, force: true });
  }
});

test('모의 rclone 으로 헤더·청크가 원격 키로만 간다', async () => {
  const remote = new Map();
  const run = async (args, stdin) => {
    const [cmd, path] = args;
    if (cmd === 'rcat') {
      remote.set(path, Buffer.from(stdin));
      return Buffer.alloc(0);
    }
    if (cmd === 'cat') {
      if (!remote.has(path)) throw new Error('missing');
      return remote.get(path);
    }
    throw new Error(cmd);
  };
  const store = rcloneStore('gdrive:karm-files-vault', { run });
  const session = await createVault(store, PASS, { iterations: 8_000 });
  const bytes = new TextEncoder().encode('rclone-body');
  const { putFile } = await import('../src/vault.mjs');
  await putFile(session, 'x.bin', bytes);
  const keys = [...remote.keys()].join('\n');
  assert.equal(keys.includes('x.bin'), false);
  assert.ok(keys.includes('gdrive:karm-files-vault/hdr'));
  assert.ok(keys.includes('gdrive:karm-files-vault/idx'));
  const got = await getFile(session, 'x.bin');
  assert.equal(new TextDecoder().decode(got.bytes), 'rclone-body');
});

test('원본 경로 env 없으면 CANNOT-RUN', async () => {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, '..', 'src', 'upload.mjs')], {
      env: { ...process.env, FILES_VAULT_ROOT: '', FILES_VAULT_PASS: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.on('close', resolve);
  });
  assert.equal(code, 2);
});
