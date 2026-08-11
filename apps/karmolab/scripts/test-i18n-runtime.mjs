import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'karmolab-i18n-'));
const outfile = path.join(tempDir, 'i18n.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/lib/i18n.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2020',
    outfile
  });

  const i18n = await import(pathToFileURL(outfile).href);
  assert.equal(i18n.t('missing.contract.key', undefined, 'safe fallback'), 'safe fallback');

  assert.throws(
    () => i18n.t('missing.contract.key'),
    (error) => error instanceof i18n.MissingTranslationError && error.key === 'missing.contract.key'
  );

  console.log('[i18n-runtime] missing keys fail without returning the key');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
