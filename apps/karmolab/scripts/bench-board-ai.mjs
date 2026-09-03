/**
 * 보드 봇 리그. 사목, 뒤집기, 체커의 단계 1~5 가 **위가 아래를 이기는가** (change.arcade-reference-followup)
 *
 * 오목 리그(`bench-gomoku-ai.mjs`)와 같은 잣대. 인접 위 단계가 60% 넘게. 한 수 CPU ms 도 같이
 *
 *   node scripts/bench-board-ai.mjs [--n=20] [--only four|reversi|checkers]
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const N = Number((process.argv.find((a) => a.startsWith('--n=')) || '').slice(4)) || 20;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const dir = mkdtempSync(join(tmpdir(), 'board-ai-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { Match, gameById } = await import(pathToFileURL(out).href);

/* 자리마다 다른 단계. 규칙이 `ctx.opts.ai` 하나만 읽으므로 자리별로 opts 를 바꿔 끼운다 */
function play(id, levels, seed) {
  const game = gameById(id);
  const per = levels.map((ai) => ({ ai }));
  const wrapped = { ...game, bot: (s, seat, ctx) => game.bot(s, seat, { ...ctx, opts: per[seat] }) };
  const m = new Match(wrapped, seed, [{ name: 'a', bot: true }, { name: 'b', bot: true }], {});
  const t0 = process.cpuUsage();
  let v;
  for (let t = 0; t <= 900000; t += 200) { m.step(t); v = m.view(); if (v.finished) break; }
  const cpu = process.cpuUsage(t0);
  const ms = (cpu.user + cpu.system) / 1000;
  const sc = v.seats.map((s) => s.score);
  const win = sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : -1;
  return { win, ms, moves: m.moves ?? 0, finished: v.finished };
}

let bad = 0;
for (const id of ['four', 'reversi', 'checkers']) {
  if (only && id !== only) continue;
  console.log(`[board-ai] ${id}. ${N}판씩, 색 번갈아`);
  const perLevelMs = {};
  for (const [hi, lo] of [[2, 1], [3, 2], [4, 3], [5, 4], [5, 3]]) {
    let w = 0, d = 0, unfinished = 0;
    for (let g = 0; g < N; g += 1) {
      const flip = g % 2 === 1;
      const r = play(id, flip ? [lo, hi] : [hi, lo], 1000 + g);
      if (!r.finished) unfinished += 1;
      /* 무승부는 반. 위 단계끼리는 비기는 판이 많다 */
      if (r.win < 0) { d += 1; w += 0.5; }
      else if ((r.win === 0) !== flip) w += 1;
      perLevelMs[hi] = (perLevelMs[hi] || 0) + r.ms;
    }
    const pct = Math.round((w / N) * 100);
    const need = hi - lo === 1 ? 60 : 65;
    const ok = pct >= need;
    if (!ok) bad += 1;
    console.log(`  [${ok ? 'O' : 'X'}] ${hi} vs ${lo}: 위 ${pct}% (${w}/${N}, 무승부 ${d}${unfinished ? ', 안 끝남 ' + unfinished : ''}) 기준 ${need}%`);
  }
  console.log('  판당 CPU ms (위 단계 기준): ' + Object.entries(perLevelMs).map(([l, ms]) => `${l}단계 ${(ms / (l === '5' ? 2 * N : N)).toFixed(0)}`).join(', '));
}
console.log(bad ? `[board-ai] 실패 ${bad}건` : '[board-ai] 통과. 위가 아래를 이긴다');
process.exit(bad ? 1 : 0);
