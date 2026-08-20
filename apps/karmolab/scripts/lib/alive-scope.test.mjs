import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolsToOpen } from './alive-scope.mjs';

test('손댄 도구만 고른다', () => {
  assert.deepEqual(toolsToOpen(['apps/karmolab/src/widgets/bluemarble/bluemarble.ts']), ['bluemarble']);
});

test('여러 도구를 손댔으면 그만큼', () => {
  const 답 = toolsToOpen([
    'apps/karmolab/src/widgets/tierlist/dnd.ts',
    'apps/karmolab/src/widgets/tierlist/render.ts',
    'apps/karmolab/src/widgets/tools/docscan.ts',
  ]).sort();
  assert.deepEqual(답, ['tierlist', 'tools']);
});

test('껍데기를 건드렸으면 전부 본다 — 어느 도구든 죽을 수 있다', () => {
  for (const f of ['apps/karmolab/src/toolbox.ts', 'apps/karmolab/index.html',
    'apps/karmolab/src/lib/i18n.ts', 'apps/karmolab/src/widgets-lazy-meta.ts']) {
    assert.equal(toolsToOpen([f, 'apps/karmolab/src/widgets/x/x.ts']), null, f);
  }
});

test('못 물어봤으면 좁히지 않는다 — 모르는 것을 아는 척하지 않는다', () => {
  assert.equal(toolsToOpen(null), null);
  assert.equal(toolsToOpen(undefined), null);
});

test('도구와 상관없는 파일만 바뀌었으면 열 것이 없다', () => {
  assert.deepEqual(toolsToOpen(['memo/rules/quality.md', 'apps/karmolab/scripts/x.mjs']), []);
});

/* ★ CI 는 갓 꺼낸 체크아웃이라 바뀐 파일 목록이 **빈다**. 그걸 「0개」로 읽으면 이 검사가
   CI 에서 한 번도 안 돈다 — 빈 신호는 「없다」가 아니라 「모른다」다 (2026-08-17). */
test('신호가 아예 없으면 좁히지 않는다(= 전부)', () => {
  assert.equal(toolsToOpen([]), null);
});
