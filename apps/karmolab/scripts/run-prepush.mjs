#!/usr/bin/env node
/** push 전 빠른 검사. 목록은 `lib/gate-sets.mjs` 한 곳에 있다(두 벌이면 갈라진다). */
import { spawnSync } from 'node:child_process';
import { PREPUSH } from './lib/gate-sets.mjs';

const r = spawnSync(process.execPath, ['scripts/run-gates.mjs', ...PREPUSH], { stdio: 'inherit' });
process.exit(r.status ?? 1);
