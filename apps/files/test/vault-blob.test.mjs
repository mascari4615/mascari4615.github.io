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
    canonical: 'https://files.example',
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

test('제 자리에 없으면 정본 도메인을 마저 본다', async () => {
  /* 회귀 근거(2026-08-28): Pages 껍데기(`blog…/files/`)로 열면 제 origin 에 `/blob/` 이
     없어 픽스처로 되떨어졌고, 맞는 비밀번호로도 클라우드가 안 열렸다. */
  const asked = [];
  const base = await pickVaultBase({
    origin: 'https://blog.example',
    fixture: 'https://blog.example/files/v/',
    canonical: 'https://files.example',
    fetchFn: async (url) => {
      asked.push(url);
      return { ok: url.startsWith('https://files.example/') };
    },
  });
  assert.equal(base, 'https://files.example/blob/');
  assert.deepEqual(asked, ['https://blog.example/blob/hdr', 'https://files.example/blob/hdr']);
});

test('이미 정본 도메인이면 같은 것을 두 번 묻지 않는다', async () => {
  const asked = [];
  await pickVaultBase({
    origin: 'https://files.example',
    fixture: 'https://files.example/v/',
    canonical: 'https://files.example',
    fetchFn: async (url) => {
      asked.push(url);
      return { ok: false };
    },
  });
  assert.equal(asked.length, 1);
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

test('Worker 는 없는 키를 딴 데서 가져와 채우지 않는다', async () => {
  /* 회귀 근거(2026-08-28): 빈 칸을 Pages 픽스처로 메우던 한 줄이 hdr 을 딴 소금으로 굳혀,
     맞는 비밀번호로도 클라우드가 안 열렸다. 없으면 없다고 답해야 한다. */
  const put = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('여기서 바깥을 부르면 안 된다');
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
    assert.equal(res.status, 404);
    assert.deepEqual(put, [], 'R2 에 아무것도 쓰지 않는다');
  } finally {
    globalThis.fetch = orig;
  }
});

test('Worker 는 클라우드 키 모양만 읽는다', async () => {
  const res = await worker.fetch(
    new Request('https://files.mascari4615.com/blob/hello.txt'),
    { VAULT: { get: async () => ({ body: new Uint8Array(1) }) } },
  );
  assert.equal(res.status, 400);
});
