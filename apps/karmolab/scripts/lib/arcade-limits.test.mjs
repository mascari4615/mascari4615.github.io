import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { 놀이제한들, 가장긴제한 } from './arcade-limits.mjs';

const scripts = dirname(dirname(fileURLToPath(import.meta.url)));

test('놀이들의 시간 제한을 읽는다', () => {
  const 목록 = 놀이제한들();
  assert.ok(목록.length >= 5, `제한이 박힌 놀이를 ${목록.length}개만 읽었다 — 경로가 옮겨졌는지 볼 것`);
  assert.ok(목록.every((x) => x.제한 > 0));
});

/* ★ 이 시험이 이 파일의 존재 이유다 (2026-08-17): 더 긴 놀이가 새로 들어오면
   둘러보기 검사가 **그 놀이가 뽑힐 때만** 빨개진다 — 하루에 한 번 나오는 유령이 된다.
   여기서 미리 막는다. */
test('둘러보기가 감는 시간은 가장 긴 놀이보다 길다', () => {
  const 본문 = readFileSync(join(scripts, 'smoke-tour.mjs'), 'utf8');
  const m = /fastForward\('(\d+):(\d+)'\)/.exec(본문);
  assert.ok(m, '둘러보기 검사에서 감는 시간을 못 찾았다');
  const 감는것 = (Number(m[1]) * 60 + Number(m[2])) * 1000;
  const 가장긴 = 가장긴제한();
  assert.ok(가장긴 > 0, '놀이 제한을 하나도 못 읽었다');
  assert.ok(감는것 > 가장긴, `감는 시간 ${감는것}ms 가 가장 긴 놀이 ${가장긴}ms 보다 짧다 — 그 놀이가 뽑히면 무조건 빨강이다`);
});
