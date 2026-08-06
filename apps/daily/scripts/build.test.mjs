import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 이 앱의 단 하나의 약속: **주제를 늘릴 때 코드는 안 고친다.**
 * 말로 적어 두면 어느 순간 깨져 있다. 표 한 장을 넣어 페이지가 나오는지 실제로 본다.
 */
test('표를 한 장 넣으면 코드 수정 없이 페이지가 생긴다', () => {
  const probe = join(app, 'data', 'zzprobe.json');
  writeFileSync(
    probe,
    JSON.stringify({
      id: 'zzprobe',
      title: '시험주제',
      subtitle: '있는지 보려는 것',
      emoji: '🧪',
      maxGuesses: 4,
      fields: [{ key: 'n', label: '수', kind: 'number' }],
      items: [{ name: '하나', n: 1 }, { name: '둘', n: 2 }],
    }),
  );
  try {
    execFileSync(process.execPath, [join(app, 'scripts/build.mjs')], { cwd: app, stdio: 'pipe' });
    assert.ok(existsSync(join(app, 'dist/zzprobe/index.html')), '주제 페이지가 안 생겼다');
    assert.ok(existsSync(join(app, 'dist/data/zzprobe.json')), '주제 표가 안 실렸다');
    const hub = readFileSync(join(app, 'dist/index.html'), 'utf8');
    assert.match(hub, /\/daily\/zzprobe\//, '허브가 새 주제를 안 걸었다');
    assert.match(hub, /시험주제/);
  } finally {
    rmSync(probe, { force: true });
    // 시험용 주제가 배포에 섞이지 않게 dist 를 원래 표만으로 다시 만든다.
    execFileSync(process.execPath, [join(app, 'scripts/build.mjs')], { cwd: app, stdio: 'pipe' });
    assert.ok(!existsSync(join(app, 'dist/zzprobe')), '시험 주제가 dist 에 남았다');
  }
});
