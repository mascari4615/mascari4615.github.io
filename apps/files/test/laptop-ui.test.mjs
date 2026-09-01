import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app.mjs');

test('노트북 목록이 부르는 머리글 함수가 화면에 있다', async () => {
  const source = await readFile(APP, 'utf8');
  assert.match(source, /function\s+listHead\s*\(/);
  assert.match(source, /box\.innerHTML\s*=\s*listHead\s*\(\)/);
});
