import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const launch = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'launch.mjs');

function printed(args) {
  const r = spawnSync(process.execPath, [launch, ...args, '--print-env'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

test('npm run page 자리에 해당하는 기본값을 찍는다', () => {
  const e = printed([]);
  assert.equal(e.COMPANION_SURFACE, 'page');
  assert.match(e.COMPANION_BRAIN, /^(grok|claude)$/);
  assert.equal(e.COMPANION_TOOLS, 'work');
  assert.match(e.COMPANION_MEMORY_FILE, /page\.jsonl$/);
  assert.ok(e.COMPANION_WORK_DIR);
});

test('npm run page:grok 자리에 그록 작업을 찍는다', () => {
  const e = printed(['grok']);
  assert.equal(e.COMPANION_SURFACE, 'page');
  assert.equal(e.COMPANION_BRAIN, 'grok');
  assert.equal(e.COMPANION_TOOLS, 'work');
});

test('npm run page:preview 는 가짜 두뇌를 찍는다', () => {
  const e = printed(['preview']);
  assert.equal(e.COMPANION_BRAIN, 'preview');
  assert.equal(e.COMPANION_TOOLS, 'talk');
});

test('npm run page:talk 는 말 방이다', () => {
  const e = printed(['talk']);
  assert.equal(e.COMPANION_TOOLS, 'talk');
  assert.match(e.COMPANION_BRAIN, /^(grok|claude)$/);
});
