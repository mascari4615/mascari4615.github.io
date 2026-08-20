#!/usr/bin/env node
/**
 * 「새로 나옴」 표와 사이트맵 변경일이 **개발 머신에만 남는 것**을 막는다 (2026-08-16)
 *
 * `gen-tool-pages.mjs` 는 두 기록 파일을 쓴다:
 *   - `data/tools-seen.json`     도구를 처음 본 날 → 14일간 「새로 나옴」 표
 *   - `data/tools-modified.json` 화면에 나가는 글자의 지문이 바뀐 날 → 사이트맵 lastmod
 *
 * 이 둘은 **개발 머신에서 갱신해 커밋해야 한다**. 배포 러너에서 써 봐야 안 남고,
 * 러너는 「기록에 없는 도구」를 새것으로 보지 않기 때문이다(배포마다 전부 새것이 되는 것을 막으려고).
 *
 * 그래서 안 커밋하면 이렇게 된다 — 실제로 2026-08-16 에 당했다:
 *   도구 여덟 개를 새로 냈는데 사이트에서는 **하나도 새것으로 안 보이고**,
 *   그 여덟 장이 사이트맵에 **변경일 없이** 실린다(크롤러가 다시 올지를 그 값으로 정한다).
 * 게이트도 화면도 초록이라 아무도 모른다 — 그래서 여기서 본다.
 *
 * 나감값: 0 = 기록이 커밋과 같다 · 1 = 갱신해 놓고 안 담았다 · 2 = 못 쟀다(CANNOT-RUN)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const karmolab = path.resolve(here, '..');

/** 못 재면 조용히 넘어가지 않는다 — 「초록」 과 「안 봤음」 은 다르다. */
function git(args) {
  const r = spawnSync('git', args, { cwd: karmolab, encoding: 'utf8' });
  if (r.error !== undefined || r.status !== 0) {
    const why = r.error?.message ?? ((r.stderr || '').trim() || `git ${args[0]} rc=${r.status}`);
    console.error(`[audit-tool-state] CANNOT-RUN: ${why}`);
    process.exit(2);
  }
  return r.stdout;
}

const records = ['data/tools-seen.json', 'data/tools-modified.json'];

/* 추적 안 되는 파일이면 위 이야기가 통째로 성립하지 않는다 — 못 쟀다고 말한다. */
const tracked = git(['ls-files', '--', ...records])
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s !== '');
const missingOnes = records.filter((f) => tracked.includes(f) === false);
if (missingOnes.length > 0) {
  console.error(`[audit-tool-state] CANNOT-RUN: git 이 안 담고 있는 기록 — ${missingOnes.join(', ')}`);
  process.exit(2);
}

const dirty = git(['status', '--porcelain', '--', ...records])
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s !== '');

if (dirty.length > 0) {
  console.error('[audit-tool-state] 도구 기록을 갱신해 놓고 커밋에 안 담았다:');
  for (const line of dirty) console.error(`  ${line}`);
  console.error('  → 이대로 밀면 새 도구에 「새로 나옴」 표가 안 붙고, 사이트맵에 변경일 없이 실린다.');
  console.error(`  → 커밋에 같이 담아라: ${records.map((f) => `apps/karmolab/${f}`).join(' ')}`);
  process.exit(1);
}

console.log(`[audit-tool-state] 도구 기록 ${records.length}개가 커밋과 같다`);
