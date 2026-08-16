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

/* ★ 이 시험이 이 파일의 존재 이유다 (2026-08-17): 더 긴 놀이가 새로 들어오면 둘러보기 검사가
   **그 놀이가 뽑힐 때만** 빨개진다 — 하루에 한 번 나오는 유령이 된다. 여기서 미리 막는다.
   ※ 처음엔 검사 **소스에서 글자**('06:00')를 찾아 쟀는데, 남이 그 줄을 조각내기로 고치자
     시험이 「못 찾았다」로 빨개졌다(CI 실측). 글자 대신 **관계**를 지킨다. */
test('감는 양 계산이 가장 긴 놀이를 덮는다', () => {
  const 가장긴 = 가장긴제한();
  assert.ok(가장긴 > 0, '놀이 제한을 하나도 못 읽었다');
  const 감을것 = Math.round(가장긴 * 1.2) + 30000; // smoke-tour.mjs 와 같은 식
  assert.ok(감을것 > 가장긴, `감는 양 ${감을것}ms 가 가장 긴 놀이 ${가장긴}ms 보다 짧다`);
});

test('둘러보기가 그 값을 손으로 안 적고 끌어다 쓴다', () => {
  const 본문 = readFileSync(join(scripts, 'smoke-tour.mjs'), 'utf8');
  assert.match(본문, /가장긴제한\(\)/, '둘러보기가 놀이 제한을 안 끌어다 쓴다 — 손으로 적으면 또 갈린다');
});
