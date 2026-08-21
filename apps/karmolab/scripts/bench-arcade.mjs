/**
 * 오락실 저울 — 게임마다 봇끼리 수천 판, 그래서 무엇이 기울어 있나 (TASK-KL-264 F1)
 *
 * 51개를 만들면서 한 번도 **재 본 적이 없다.** 「해 보니 되더라」는 51번 반복할 수 없는 말이라,
 * 어느 판이 앞자리에게 유리한지·어느 판이 봇끼리 영원히 비기는지 아무도 몰랐다.
 *
 * 커널이 화면도 그물망도 안 쓰고 시계를 밖에서 받으므로 **창 없이 몇 초에 수천 판**을 돌린다.
 * 이건 새로 만든 능력이 아니라 커널을 그렇게 지어 둔 값을 이제 찾아 쓰는 것이다.
 *
 * 재는 것 넷 (봇은 자리마다 **같은** 함수다 — 그래서 자리별 차이가 곧 판의 기울기다):
 *  ① **자리 편향** — 1번 자리 승률이 공평한 몫(1/자리수)에서 얼마나 벗어나나
 *  ② **무승부율** — 봇끼리 늘 비기면 그 판은 사람에게도 밋밋하다
 *  ③ **판 길이** — 진짜 몇 초짜리 놀이인가 (로비에 「30초/3분」을 적으려면 이 수가 있어야 한다)
 *  ④ **점수 폭** — 1등과 꼴찌가 얼마나 벌어지나 (0이면 이겨도 이긴 것 같지 않다)
 *
 * 결과는 `data/arcade-balance.json` 한 곳에 적는다 — 로비의 길이 태그도, 다음 사람의
 * 「이 판 왜 이래?」도 같은 수를 봐야 한다. **표를 두 벌 만들면 갈린다.**
 *
 * 사용: npm run bench:arcade [-- --n 200]
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const argN = Number((process.argv.find((a) => a.startsWith('--n=')) || '').slice(4)) || 200;
const OUT = 'data/arcade-balance.json';
/** 시계를 미는 간격. 실시간 판의 tick 도 이 간격으로 돈다. */
const STEP = 50;
/** 이만큼 밀어도 안 끝나면 「안 끝나는 판」으로 적는다 (계약 검사가 따로 막고 있다). */
const CAP = 400000;

const dir = mkdtempSync(join(tmpdir(), 'bench-'));
const out = join(dir, 'arcade.mjs');
await build({
  entryPoints: ['src/widgets/arcade/index.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent'
});
const { Match, GAMES, META, partySize } = await import(pathToFileURL(out).href);
const kindOf = (id) => META.find((m) => m.id === id)?.kind ?? '?';

/* **몇 명으로 재는가** = 오락실이 실제로 앉히는 수. `seating.ts` 가 정본이고 여기서 다시
   정하지 않는다 — 재는 인원과 노는 인원이 다르면 이 표는 아무 말도 안 하는 표가 된다. */

/** 봇만 앉혀 한 판. 끝난 시각(가상 ms)과 자리별 점수를 돌려준다. */
function play(game, seed) {
  const seats = Array.from({ length: partySize(game) }, (_, i) => ({ name: `b${i}`, bot: true }));
  const m = new Match(game, seed, seats);
  for (let now = 0; now <= CAP; now += STEP) {
    m.step(now);
    if (m.view().finished) return { ms: now, scores: m.view().seats.map((s) => s.score) };
  }
  return { ms: CAP, scores: m.view().seats.map((s) => s.score), stuck: true };
}

const rows = [];
const t0 = Date.now();
for (const g of GAMES) {
  const n = partySize(g);
  const wins = new Array(n).fill(0);
  let draws = 0, stuck = 0, msSum = 0, gapSum = 0;
  const seen = new Set();
  for (let i = 0; i < argN; i++) {
    const r = play(g, 1000 + i * 7919);
    seen.add(r.scores.join(',') + '@' + r.ms);
    if (r.stuck) stuck++;
    msSum += r.ms;
    const top = Math.max(...r.scores);
    const low = Math.min(...r.scores);
    gapSum += top - low;
    const champs = r.scores.map((s, k) => (s === top ? k : -1)).filter((k) => k >= 0);
    if (champs.length === n) draws++;
    else for (const k of champs) wins[k] += 1 / champs.length;
  }
  const share = wins.map((w) => +(w / argN).toFixed(3));
  const fair = 1 / n;
  rows.push({
    id: g.id,
    kind: kindOf(g.id),
    seats: n,
    roundCount: argN,
    seatWinRate: share,
    /** 공평한 몫에서 가장 많이 벗어난 자리의 벗어난 폭 (0 = 완전 대칭) */
    slope: +Math.max(...share.map((s) => Math.abs(s - fair))).toFixed(3),
    drawRate: +(draws / argN).toFixed(3),
    /* 씨앗을 바꿔도 판이 하나뿐이면 봇끼리는 **늘 같은 판**이다. 그런 판의 「기울기」는
       200판을 잰 것이 아니라 1판을 200번 적은 것이라 수로 믿으면 안 된다. */
    singleRound: seen.size === 1,
    평균초: +(msSum / argN / 1000).toFixed(1),
    scoreSpread: +(gapSum / argN).toFixed(2),
    unfinished: stuck
  });
  process.stderr.write('.');
}
process.stderr.write('\n');

rows.sort((a, b) => b.slope - a.slope);
const pad = (s, w) => String(s).padEnd(w);
console.log(pad('게임', 14) + pad('갈래', 8) + pad('자리', 5) + pad('기울기', 8) + pad('무승부', 8) + pad('평균초', 8) + '점수폭');
for (const r of rows) {
  console.log(pad(r.id, 14) + pad(r.kind, 8) + pad(r.seats, 5) + pad(r.slope, 8) + pad(r.drawRate, 8) + pad(r.평균초, 8) + r.scoreSpread);
}

const doc = {
  note: '봇끼리 돌려 잰 오락실 저울 — 자리 편향·무승부율·판 길이. 다시 재기: npm run bench:arcade',
  measuredOn: new Date().toISOString().slice(0, 10),
  roundCount: argN,
  elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
  game: rows.sort((a, b) => a.id.localeCompare(b.id))
};
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`\n[bench] ${GAMES.length}개 × ${argN}판 = ${GAMES.length * argN}판 · ${doc.elapsedSec}초 → ${OUT}`);
