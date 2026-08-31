/**
 * 야추 봇 리그 (`src/widgets/arcade/games/yacht-engine.ts`)
 *
 * 화면 없이 엔진만 돌려 단계별 평균, 요트, 덤 측정. 게이트에는 안 넣음(느림)
 * 열두 칸 Yacht 혼자 최적은 191.77 (memo `reference/yacht-anatomy.md`)
 *
 *   node scripts/bench-yacht.mjs [판수]
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const N = Number(process.argv[2] || 2000);
const dir = mkdtempSync(join(tmpdir(), 'ybench-'));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..').replaceAll(String.fromCharCode(92), '/');
writeFileSync(join(dir, 'e.ts'), `export { decide } from '${root}/src/widgets/arcade/games/yacht-engine';\nexport { CATS, scoreOf, totalOf } from '${root}/src/widgets/arcade/games/yacht';\n`);
const out = join(dir, 'e.mjs');
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { decide, CATS, scoreOf, totalOf } = await import(pathToFileURL(out).href);

/* 같은 씨앗이면 같은 판. 단계끼리 견주려면 같은 눈이어야 함 */
const mkRng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const UP = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

function one(level, rng) {
  const sheet = Object.fromEntries(CATS.map((c) => [c, null]));
  for (let t = 0; t < 12; t += 1) {
    let dice = Array.from({ length: 5 }, () => 1 + Math.floor(rng() * 6));
    for (let r = 2; r >= 0; r -= 1) {
      const d = decide(dice, sheet, r, level, rng);
      if (d.write) { sheet[d.write] = scoreOf(d.write, dice); break; }
      if (r === 0) { const c = CATS.find((x) => sheet[x] === null); sheet[c] = scoreOf(c, dice); break; }
      dice = dice.map((v, i) => (d.keep[i] ? v : 1 + Math.floor(rng() * 6)));
    }
  }
  const up = UP.reduce((a, c) => a + (sheet[c] ?? 0), 0);
  return { total: totalOf(sheet), yacht: (sheet.yacht ?? 0) > 0, bonus: up >= 63, up };
}

console.log(`[bench-yacht] ${N}판씩. 최적 191.77`);
for (const lv of [1, 2, 3, 4, 5]) {
  let s = 0, y = 0, b = 0, u = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i += 1) {
    const r = one(lv, mkRng(i * 7919 + 13));
    s += r.total; u += r.up;
    if (r.yacht) y += 1;
    if (r.bonus) b += 1;
  }
  const ms = Date.now() - t0;
  console.log(`  단계 ${lv}. 평균 ${(s / N).toFixed(1)} | 위 합 ${(u / N).toFixed(1)} | 요트 ${(y / N * 100).toFixed(1)}% | 덤 ${(b / N * 100).toFixed(1)}% | ${ms}ms`);
}
rmSync(dir, { recursive: true, force: true });
