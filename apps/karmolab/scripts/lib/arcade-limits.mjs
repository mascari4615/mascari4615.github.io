/**
 * 놀이마다 박혀 있는 **제 시간 limit**을 모은다 (2026-08-17).
 *
 * 왜: 둘러보기 검사는 판이 끝나기를 기다리는데, 아무 단추나 누르는 손으로는 스도쿠가 풀릴 리 없다.
 * 그런 판은 **제 시간이 다 돼야** 끝난다 — 그래서 검사는 시계를 감아 그 시간을 건너뛴다.
 * 감는 양이 **가장 긴 제한보다 짧으면** 그 놀이가 뽑히는 순간 무조건 빨강이다(실측: 스도쿠 300초 vs 자름 150초).
 * 그 어긋남을 사람 기억이 아니라 시험이 지키게 하려고 값을 여기서 읽는다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const playground = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'src/widgets/arcade/games');

/** @returns {{name: string, limit: number}[]} 제한이 박힌 놀이들 */
export function playLimits(dir = playground) {
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('-view.ts')) continue;
    const m = /const LIMIT_MS = (\d+)/.exec(readFileSync(join(dir, f), 'utf8'));
    if (m) out.push({ name: f.replace(/\.ts$/, ''), limit: Number(m[1]) });
  }
  return out;
}

/** 가장 긴 limit(ms). 하나도 못 읽으면 0 — 부르는 쪽이 「못 읽었다」로 다뤄야 한다. */
export function longestLimit(dir = playground) {
  return playLimits(dir).reduce((n, x) => Math.max(n, x.limit), 0);
}
