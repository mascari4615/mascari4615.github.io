/**
 * 로비의 「길이」 태그가 아직 참인가 (arcade-next ★3)
 *
 * **무엇을 재는지 먼저 적는다**(G1 교훈). 저울(`bench:arcade`)이 내는 수 중에서
 * 사람이 실제로 겪는 것은 **판 길이**뿐이다 — 로비 카드의 「짧다/보통/길다」가 거기서 나온다.
 * 자리 편향·무승부율은 *봇끼리의* 수치라 게이트로 걸면 G1 에서 겪은 함정에 다시 빠진다
 * (오목의 선수 필승은 튜닝 대상이 아니었다).
 *
 * 그래서 여기서 잡는 것은 하나: **판이 길어지거나 짧아져 태그가 바뀔 지경인데 표는 옛날 것**.
 * 그러면 「짧다」를 보고 고른 사람이 4분짜리를 만난다.
 *
 * 문턱을 퍼센트로 안 잡는다 — **태그가 실제로 뒤집히는가**로 잡는다. 그게 사람이 겪는 일이고,
 * 30초짜리가 32초가 된 것은 아무 일도 아니다.
 *
 * 빠르게 돌려야 CI 에 걸 수 있으므로 40판만 본다(저울 정본은 200판). 40판이면 평균이
 * 태그를 넘나들 만큼은 잡힌다 — 흔들림이 커서 애매한 판은 **경계에서만** 걸린다.
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/* 로비가 쓰는 그 값 — `src/widgets/arcade/length.ts` 와 같아야 한다. */
const SHORT = 30;
const MID = 90;
const tagOf = (sec) => (sec <= SHORT ? 'short' : sec <= MID ? 'mid' : 'long');

const N = Number(process.env.DRIFT_N || 40);
const dir = mkdtempSync(join(tmpdir(), 'drift-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { Match, GAMES, partySize } = await import(pathToFileURL(out).href);

const table = JSON.parse(readFileSync('data/arcade-balance.json', 'utf8'));
const said = Object.fromEntries(table.game.map((g) => [g.id, g.avgSeconds]));

let bad = 0;
const drifted = [];
for (const g of GAMES) {
  const n = partySize(g);
  let ms = 0;
  for (let i = 0; i < N; i++) {
    const m = new Match(g, 1000 + i * 7919, Array.from({ length: n }, (_, k) => ({ name: 'b' + k, bot: true })));
    let now = 0;
    for (; now <= 400000; now += 50) {
      m.step(now);
      if (m.view().finished) break;
    }
    ms += now;
  }
  const now = ms / N / 1000;
  const then = said[g.id];
  if (then === undefined) {
    drifted.push(`${g.id}: 표에 없다 (npm run bench:arcade)`);
    bad++;
    continue;
  }
  if (tagOf(now) !== tagOf(then)) {
    drifted.push(`${g.id}: 표 ${then}초(${tagOf(then)}) → 지금 ${now.toFixed(1)}초(${tagOf(now)})`);
    bad++;
  }
}

if (bad) {
  console.error(`[balance-drift] 로비의 길이 태그가 ${bad}개 어긋난다 — \`npm run bench:arcade\` 로 표를 다시 재라`);
  for (const d of drifted) console.error(`  - ${d}`);
  process.exit(1);
}
console.log(`[balance-drift] 통과 — ${GAMES.length}개의 길이 태그가 아직 참이다 (${N}판씩)`);
