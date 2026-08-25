import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickVaultBase } from '../src/vault-base.mjs';
import { teeStore } from '../src/store-tee.mjs';
import { memoryStore } from '../src/vault.mjs';
import { loadEnvFile } from '../src/env-file.mjs';
import worker from '../worker.mjs';

test('hdr 가 있으면 /blob/, 없으면 픽스처', async () => {
  const fixture = 'https://example/files/v/';
  const miss = await pickVaultBase({
    origin: 'https://files.example',
    fixture,
    fetchFn: async () => ({ ok: false }),
  });
  assert.equal(miss, fixture);
  const hit = await pickVaultBase({
    origin: 'https://files.example',
    fixture,
    fetchFn: async () => ({ ok: true }),
  });
  assert.equal(hit, 'https://files.example/blob/');
});

test('teeStore 는 정본을 먼저 쓰고 여분 실패를 삼킨다', async () => {
  const a = memoryStore();
  const b = {
    put: async () => {
      throw new Error('r2 down');
    },
    get: async () => null,
  };
  const tee = teeStore(a, b);
  await tee.put('hdr', new Uint8Array([9]));
  const got = await a.get('hdr');
  assert.equal(got[0], 9);
});

test('loadEnvFile 은 비어 있는 칸만 채운다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'files-env-'));
  const path = join(dir, '.env');
  delete process.env.FILES_VAULT_ENVTEST;
  try {
    await writeFile(path, 'FILES_VAULT_ENVTEST=fromfile\n');
    await loadEnvFile(path);
    assert.equal(process.env.FILES_VAULT_ENVTEST, 'fromfile');
  } finally {
    delete process.env.FILES_VAULT_ENVTEST;
    await rm(dir, { recursive: true, force: true });
  }
});

test('Worker /blob 은 바인딩 없으면 503', async () => {
  const res = await worker.fetch(new Request('https://files.mascari4615.com/blob/hdr'), {});
  assert.equal(res.status, 503);
});

test('Worker /blob 은 R2 키를 그대로 읽는다', async () => {
  const res = await worker.fetch(new Request('https://files.mascari4615.com/blob/hdr'), {
    VAULT: {
      async get(key) {
        assert.equal(key, 'hdr');
        return { body: new Uint8Array([1, 2, 3]) };
      },
    },
  });
  assert.equal(res.status, 200);
  const buf = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...buf], [1, 2, 3]);
});

test('Worker 빈 R2 는 Pages v/ 에서 채워 넣는다', async () => {
  const put = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/v/hdr')) {
      return { ok: true, arrayBuffer: async () => new Uint8Array([9, 8]).buffer };
    }
    return { ok: false };
  };
  try {
    const res = await worker.fetch(new Request('https://files.mascari4615.com/blob/hdr'), {
      VAULT: {
        async get() {
          return null;
        },
        async put(key) {
          put.push(key);
        },
      },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(put, ['hdr']);
  } finally {
    globalThis.fetch = orig;
  }
});

test('Worker 는 금고 키 모양만 읽는다', async () => {
  const res = await worker.fetch(
    new Request('https://files.mascari4615.com/blob/hello.txt'),
    { VAULT: { get: async () => ({ body: new Uint8Array(1) }) } },
  );
  assert.equal(res.status, 400);
});
