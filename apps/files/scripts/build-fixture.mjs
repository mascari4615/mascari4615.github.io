/**
 * Pages 에 올릴 데모 금고. 열쇠는 공개 픽스처라 사적 파일 넣지 않음.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVault, putFile, memoryStore } from '../src/vault.mjs';

export const FIXTURE_PASS = 'fixture';

const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export async function buildFixtureStore() {
  const store = memoryStore();
  const session = await createVault(store, FIXTURE_PASS, { iterations: 8_000 });
  await putFile(session, 'hello.txt', new TextEncoder().encode('hello vault'));
  await putFile(session, 'pic/tiny.png', PNG_1X1);
  await putFile(session, 'dir/note.txt', new TextEncoder().encode('nested'));
  return store;
}

export async function writeFixture(outDir) {
  const store = await buildFixtureStore();
  for (const [key, bytes] of store.snapshot()) {
    const dest = join(outDir, ...key.split('/'));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(self)) {
  const dest = process.argv[2];
  if (!dest) {
    console.error('outdir');
    process.exit(2);
  }
  await writeFixture(dest);
}
