/**
 * 어제의 나가 어제처럼 두는가. 창 없이 (TASK-KL-264 A3)
 *
 * 고스트는 **봇의 한 종류**로 만들었다. 그러니 검사도 봇을 재듯 재면 된다:
 *   ① 기록대로 판을 굴리면 그 자리가 **같은 점수**를 낸다 (어제의 나가 맞다)
 *   ② 기록이 떨어지면 그 자리는 **가만히 있는다** (아무 수나 지어내지 않는다)
 *   ③ 나머지 자리의 봇은 **안 건드려진다** (한 자리만 갈아 끼운 것이다)
 *
 * 점수형 놀이로 잰다. 자리끼리 영향을 안 주므로 같은 수 = 같은 점수가 성립한다.
 * 차례 놀이는 남의 수가 내 수의 뜻을 바꾸므로 여기서 재는 것이 아니다.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'ghost-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { Match, gameById, partySize } = await import(pathToFileURL(out).href);
const gh = join(dir, 'g.mjs');
await build({ entryPoints: ['src/widgets/arcade/ghost.ts'], bundle: true, format: 'esm', platform: 'node', outfile: gh, logLevel: 'silent' });
const { withGhost, GHOST_NAME } = await import(pathToFileURL(gh).href);

let bad = 0;
const ok = (cond, name, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : '. ' + detail}`);
  if (!cond) bad++;
};

/**
 * 점수형 놀이. 자리끼리 서로를 안 막는다.
 *
 * `reflex` 를 꼭 넣는다. 앞의 셋은 **몇 번 눌렀나**만 세서 시각이 틀려도 점수가 같다 . 
 * 그것만 재면 어제와 같은 점수는 맞아도 어제처럼 둔다는 못 본다(되돌려 보고 알았다:
 * 고스트의 수를 0.5초씩 밀어도 안 빨개졌다). 반응 측정은 **빠르기가 곧 점수**라 시각이 틀리면
 * 바로 드러난다.
 */
const SCORED = ['reflex', 'jegi', 'whack', 'tuho'];

for (const id of SCORED) {
  const g = gameById(id);
  if (!g) { ok(false, `${id}: 놀이가 있다`); continue; }
  const n = partySize(g);
  const seats = Array.from({ length: n }, (_, i) => ({ name: `p${i}`, bot: i > 0 }));

  /* ① 사람 자리가 아무렇게나 둔 판을 하나 만든다 */
  const live = new Match(g, 2024, seats);
  let x = 12345;
  const rnd = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let now = 0; now <= 200000; now += 16) {
    if (now % 240 === 0) live.dispatch(0, [{ kick: 1 }, { hit: Math.floor(rnd() * 9) }, { power: Math.floor(rnd() * 10) }, { cell: Math.floor(rnd() * 9) }, { choice: Math.floor(rnd() * 4) }][Math.floor(rnd() * 5)]);
    live.step(now);
    if (live.view().finished) break;
  }
  const mine = live.tape.filter((m) => m.seat === 0).map((m) => ({ at: m.at, action: m.action }));
  const myScore = live.view().seats[0].score;

  /* ② 그 기록을 **마지막 자리**에 앉혀 다시 굴린다 */
  const gseat = n - 1;
  const seats2 = seats.map((s, i) => (i === gseat ? { name: GHOST_NAME, bot: true } : s));
  const ghosted = withGhost(g, gseat, { score: myScore, at: 0, moves: mine });
  const m2 = new Match(ghosted, 2024, seats2);
  for (let now = 0; now <= 200000; now += 16) {
    m2.step(now);
    if (m2.view().finished) break;
  }
  const ghostScore = m2.view().seats[gseat].score;
  ok(ghostScore === myScore, `${id}: 어제의 나가 어제와 같은 점수를 낸다`, `어제 ${myScore}, 오늘 ${ghostScore}`);
  ok(m2.view().seats[gseat].name === GHOST_NAME, `${id}: 그 자리 이름이 ${GHOST_NAME}`);
}

/* ③ 기록이 없으면 가만히 있는다. 아무 수나 지어내면 그건 어제의 내가 아니다 */
{
  const g = gameById('jegi');
  const quiet = withGhost(g, 1, { score: 0, at: 0, moves: [] });
  const m = new Match(quiet, 7, [{ name: 'a', bot: true }, { name: 'b', bot: true }, { name: 'c', bot: true }]);
  for (let now = 0; now <= 120000; now += 16) { m.step(now); if (m.view().finished) break; }
  ok(m.view().seats[1].score === 0, '기록이 없으면 그 자리는 가만히 있는다', String(m.view().seats[1].score));
  ok(m.view().seats[2].score > 0, '나머지 자리의 봇은 그대로 논다', String(m.view().seats[2].score));
}

if (bad) { console.error(`[ghost] 실패 ${bad}건`); process.exit(1); }
console.log('[ghost] 통과. 고스트는 봇의 한 종류로 붙는다');
