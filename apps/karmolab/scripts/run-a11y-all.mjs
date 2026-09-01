#!/usr/bin/env node
/**
 * 접근성 전수 훑기. 도구 233개를 axe 로 한 번씩 (2026-09-01)
 *
 * 왜 따로 있나. `test:a11y` 는 좁고 깊게 여섯 장을 스킨 둘 판 둘로 본다(24판, 1분 남짓).
 * 그 여섯 장에 없는 도구 안쪽은 아무도 안 본다. 여기는 반대로 넓고 얕게 전부 한 번씩.
 * 스킨과 판은 하나로 줄인다(classic, dark). 안 그러면 932판, 사십 분 넘음
 *
 * 느려서 묶음(gates)에는 안 넣는다. 손으로 돌리거나 밤 판에서
 *
 * 사용: npm run test:a11y:all
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(here, 'smoke-a11y.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, KL_A11Y_ALL: '1' },
});
process.exit(r.status ?? 1);
