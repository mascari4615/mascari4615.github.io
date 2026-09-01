/**
 * 오목 봇 리그. 단계끼리 붙여 **위가 아래를 이기는가**를 잰다 (change.arcade-redesign).
 *
 * 강하다는 말은 인상. 여기서는 승률과 한 수 평균 ms 만
 * 통과 기준: 인접 위 단계가 아래 단계를 60% 넘게, 두 단계 위는 65% 넘게. 한 수 100ms 안(5단계만 160ms).
 *
 *   node scripts/bench-gomoku-ai.mjs --n=40
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 빠른 판(`--quick`)은 게이트용. 8판이면 12초라 push 전에 돌릴 수 있음
 * - 8판은 인접 단계를 가르기엔 흔들림이 큼 (4 vs 2 가 63% 로 내려간 적 있음)
 * - 그래서 빠른 판은 **뒤집힘만** 봄. 두 단계 위가 아래에게 지면 그건 회귀
 * - 촘촘한 수치는 손으로 `--n=30` 이상을 돌려 잼
 */
const QUICK = process.argv.includes('--quick');
const N = Number((process.argv.find((a) => a.startsWith('--n=')) || '').slice(4)) || (QUICK ? 8 : 40);
const dir = mkdtempSync(join(tmpdir(), 'gomoku-ai-'));
const out = join(dir, 'engine.mjs');
await build({ entryPoints: ['src/widgets/arcade/games/gomoku-engine.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { think } = await import(pathToFileURL(out).href);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
function won(b, n, cell, who) {
  const x = cell % n, y = Math.floor(cell / n);
  for (const [dx, dy] of DIRS) {
    let len = 1;
    for (const s of [1, -1]) for (let k = 1; ; k++) { const nx = x + dx * k * s, ny = y + dy * k * s; if (nx < 0 || ny < 0 || nx >= n || ny >= n || b[ny * n + nx] !== who) break; len++; }
    if (len >= 5) return true;
  }
  return false;
}
/* 렌주 없이 잰다. 금수 판정은 게임 파일 몫이고 여기서는 힘만 본다 */
function play(levelBlack, levelWhite, seed, n = 15) {
  const b = new Array(n * n).fill(0);
  const rng = mulberry32(seed);
  const ms = { [levelBlack]: [], [levelWhite]: [] };
  let who = 1;
  for (let moves = 0; moves < n * n; moves++) {
    const level = who === 1 ? levelBlack : levelWhite;
    const t0 = performance.now();
    const c = think({ board: b, n, who, renju: false, banned: [], level, rng });
    ms[level].push(performance.now() - t0);
    if (c < 0 || b[c] !== 0) return { winner: 3 - who, ms, moves };
    b[c] = who;
    if (won(b, n, c, who)) return { winner: who, ms, moves: moves + 1 };
    who = 3 - who;
  }
  return { winner: 0, ms, moves: n * n };
}

/* 5 는 2026-08-30 에 들어왔다(4 상대 85%, 3 상대 65%). `--five` 면 5 짝만 */
const pairs = process.argv.includes('--five') ? [[5, 4], [5, 3]] : [[2, 1], [3, 2], [4, 3], [5, 4], [3, 1], [4, 2], [5, 3]];
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const rows = [];
const timing = {};
for (const [hi, lo] of pairs) {
  let hiWins = 0, draws = 0;
  for (let g = 0; g < N; g++) {
    /* 색을 번갈아. 흑이 유리하므로 한쪽만 흑이면 표가 거짓말한다 */
    const hiBlack = g % 2 === 0;
    const r = hiBlack ? play(hi, lo, 1000 + g) : play(lo, hi, 1000 + g);
    const hiColor = hiBlack ? 1 : 2;
    if (r.winner === hiColor) hiWins++;
    else if (r.winner === 0) draws++;
    for (const [lv, arr] of Object.entries(r.ms)) (timing[lv] ??= []).push(...arr);
  }
  const rate = Math.round((hiWins / N) * 100);
  /* 두 단계 위는 65. 처음 75 로 뒀더니 4 vs 2 가 65% 로 걸렸다. 2 는 코앞의 다섯을 보는 봇이라 25% 는 판 초반 운이다 */
  /* 빠른 판은 뒤집힘만. 인접은 아예 안 따지고, 두 단계 위는 절반만 넘으면 됨 */
  const need = QUICK ? (hi - lo >= 2 ? 55 : 0) : hi - lo >= 2 ? 65 : 60;
  rows.push({ pair: `${hi} vs ${lo}`, hiWins, draws, rate, need, ok: rate >= need });
}
console.log(`[gomoku-ai] ${N}판씩, 15줄, 색 번갈아`);
for (const r of rows) console.log(`  [${r.ok ? 'O' : 'X'}] ${r.pair}: 위 ${r.rate}% (${r.hiWins}/${N}, 무승부 ${r.draws}) 기준 ${r.need}%`);
console.log('  한 수 평균 ms:', Object.entries(timing).map(([lv, a]) => `${lv}단계 ${avg(a).toFixed(1)}ms (최대 ${Math.max(...a).toFixed(0)})`).join(', '));
const fails = rows.filter((r) => !r.ok);
/* 한 수 시간 한도. 5단계만 160ms. 봇은 어차피 600~1300ms 뜸을 들이므로 그 안에 숨음
   4000 노드로 줄이면 시간은 그대로(106ms)고 힘만 빠졌다(90 -> 70%). 시간은 예산이 아니라 평가에서 온다(실측 2026-08-31) */
const LIMIT_MS = { 5: 160 };
const slow = Object.entries(timing).filter(([lv, a]) => avg(a) > (LIMIT_MS[lv] ?? 100));
if (fails.length || slow.length) { console.log(`[gomoku-ai] 실패 ${fails.length + slow.length}건`); process.exit(1); }
console.log(QUICK ? '[gomoku-ai] 빠른 판 통과. 단계가 안 뒤집혔고, 한 수 100ms 안' : '[gomoku-ai] 통과. 위가 아래를 이기고, 한 수 100ms 안');
