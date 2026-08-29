/**
 * 판이 되살아나는가. 51개 전부, 창 없이 (TASK-KL-264 코어)
 *
 * 씨앗 + 누른 것만으로 판이 다시 만들어져야 한다. 이게 참이 아니면 고스트도, 버그 재현도,
 * 되감기 관전도, 비동기 턴제도 전부 못 선다. 그래서 이 검사가 그 넷의 받침이다.
 *
 * 방법: 게임마다 ① 사람 자리 하나를 **아무렇게나 눌러 가며** 끝까지 굴리고 ② 그 기록으로
 * 되살려 ③ 끝 상태, 점수가 같은지 본다. 아무렇게나 누르는 것이 중요하다. 아무도 안 누르면
 * 사람 수가 0줄이라 봇만 다시 굴린 것과 구별이 안 된다.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'replay-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { Match, GAMES, partySize } = await import(pathToFileURL(out).href);

const rp = join(dir, 'r.mjs');
await build({ entryPoints: ['src/widgets/arcade/replay.ts'], bundle: true, format: 'esm', platform: 'node', outfile: rp, logLevel: 'silent' });
const { record, playback, sameAs } = await import(pathToFileURL(rp).href);

let bad = 0;
const ok = (cond, name, detail = '') => {
  if (!cond) { console.log(`  [X] ${name}${detail ? '. ' + detail : ''}`); bad++; }
};

/** 씨앗에서 나오는 난수. 아무렇게나도 다시 돌릴 수 있어야 검사가 흔들리지 않는다. */
function lcg(seed) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** 사람 자리 하나가 아무 수나 두며 끝까지. 게임마다 수의 모양이 달라 몇 가지를 섞어 던진다. */
function playHuman(g, seed) {
  const seats = Array.from({ length: partySize(g) }, (_, i) => ({ name: `p${i}`, bot: i > 0 }));
  const m = new Match(g, seed, seats);
  const rnd = lcg(seed + 99);
  for (let now = 0; now <= 300000; now += 16) {
    if (now % 320 === 0) {
      const n = Math.floor(rnd() * 40);
      const shapes = [{ cell: n }, { at: n % 4, cell: n }, { choice: n % 4 }, { index: n % 5 }, { pad: n % 4 },
        { col: n % 7 }, { bid: n % 10 }, { dir: n % 4 }, { power: n % 10 }, { kind: 'play', index: n % 5 }];
      m.dispatch(0, shapes[Math.floor(rnd() * shapes.length)]);
    }
    m.step(now);
    if (m.view().finished) break;
  }
  return { m, seats };
}

console.log(`[replay] 게임 ${GAMES.length}개. 굴리고, 되살리고, 견준다`);
let moves = 0;
for (const g of GAMES) {
  const { m, seats } = playHuman(g, 31337);
  const tape = record(g, m, seats, 31337);
  moves += tape.moves.length;
  const again = playback(g, tape);
  ok(sameAs(m, again), `${g.id}: 되살린 판이 원래 판과 같다`,
    `수 ${tape.moves.length}줄, 끝 ${tape.end}ms`);
}

if (bad) { console.error(`[replay] 실패 ${bad}건`); process.exit(1); }
console.log(`[replay] 통과. 51판이 씨앗 하나와 ${moves}줄로 되살아난다`);
