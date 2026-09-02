/**
 * 판이 되살아나는가. 51개 전부, 창 없이 (TASK-KL-264 코어)
 *
 * 씨앗 + 누른 것만으로 판이 다시 만들어져야 한다. 이게 참이 아니면 고스트도, 버그 재현도,
 * 되감기 관전도, 비동기 턴제도 전부 못 선다. 그래서 이 검사가 그 넷의 받침이다.
 *
 * 방법: 게임마다 ① 사람 자리 하나를 **아무렇게나 눌러 가며** 끝까지 굴리고 ② 그 기록으로
 * 되살려 ③ 끝 상태, 점수가 같은지 본다. 아무렇게나 누르는 것이 중요하다. 아무도 안 누르면
 * 사람 수가 0줄이라 봇만 다시 굴린 것과 구별이 안 된다.
 *
 * 어긋나면 **어디서부터인지 짚는다** (2026-09-01, 레퍼런스 대조).
 * 결정적 시뮬레이션을 쓰는 곳들의 정석은 틱마다 상태 해시를 남겨 두고 처음 갈린 틱 찾기
 * (deterministic lockstep 의 desync 추적). 끝 상태만 견주면 "다르다"까지만 알고 어디서부터인지는
 * 손으로 찾아야 한다. 야추가 그 사고를 겪었다(판을 만든 정의가 빠져 딴 판이 됐다).
 * 정본 실측: `memo/projects/karmolab/reference/deterministic-replay.md`
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

const sp = join(dir, 's.mjs');
await build({ entryPoints: ['src/widgets/arcade/setups.ts'], bundle: true, format: 'esm', platform: 'node', outfile: sp, logLevel: 'silent' });
const { SETUPS } = await import(pathToFileURL(sp).href);

const rp = join(dir, 'r.mjs');
await build({ entryPoints: ['src/widgets/arcade/replay.ts'], bundle: true, format: 'esm', platform: 'node', outfile: rp, logLevel: 'silent' });
const { record, playback, sameAs, ReviewRun } = await import(pathToFileURL(rp).href);

let bad = 0;
const ok = (cond, name, detail = '') => {
  if (!cond) { console.log(`  [X] ${name}${detail ? '. ' + detail : ''}`); bad++; }
};

const review = new ReviewRun([
  { at: 0, v: {} },
  { at: 100, v: {} },
  { at: 200, v: {} }
], [3, 4]);
ok(review.at === 2 && review.total === 2, '복기는 마지막 장면에서 준비된다');
review.seek(-1);
ok(review.at === 0, '복기 위치는 장면 범위를 벗어나지 않는다');
review.seek(review.total);
let tick = () => {};
let delay = 0;
let drops = 0;
const clock = (next, ms) => {
  tick = next;
  delay = ms;
  return () => { drops += 1; };
};
review.setPlaying(true, () => review.seek(review.at + 1), clock);
ok(review.playing && review.at === 0 && delay === 900, '끝에서 재생하면 처음으로 감는다');
tick();
ok(review.at === 1, '재생 시계가 한 장면을 넘긴다');
review.cycleSpeed();
review.setPlaying(true, () => review.seek(review.at + 1), clock);
ok(review.speed === 2 && delay === 450 && drops === 1, '속도를 바꾸면 앞 시계를 끊고 박자를 고친다');
review.branch = true;
review.seek(0);
ok(review.at === 1, '곁가지에서는 복기 위치가 움직이지 않는다');
review.stop();
ok(!review.playing && drops === 2, '복기를 접으면 재생 시계를 끊는다');

/** 씨앗에서 나오는 난수. 아무렇게나도 다시 돌릴 수 있어야 검사가 흔들리지 않는다. */
function lcg(seed) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * 기본값이 아닌 설정 한 벌. 시작 전에 고르는 값이 되살리기에 안 실리면 딴 판이 펴짐
 *
 * 2026-08-30 야추 사고가 그것이었다(판을 만든 정의와 옵션이 빠져 딴 판). 그런데 이 검사는
 * 옵션을 아예 안 태우고 있어서 그 사고를 못 잡았음. 게임마다 첫 갈래의 **마지막 값**을 고름.
 * 기본값과 다른 값이라야 빠졌을 때 티가 남
 */
function oddOpts(id) {
  const choices = SETUPS[id];
  if (!choices || !choices.length) return null;
  const out = {};
  for (const c of choices) {
    const last = c.options[c.options.length - 1];
    if (last && last.value !== c.fallback) out[c.key] = last.value;
  }
  return Object.keys(out).length ? out : null;
}

/** 사람 자리 하나가 아무 수나 두며 끝까지. 게임마다 수의 모양이 달라 몇 가지를 섞어 던진다. */
function playHuman(g, seed, opts = {}) {
  const seats = Array.from({ length: partySize(g) }, (_, i) => ({ name: `p${i}`, bot: i > 0 }));
  const m = new Match(g, seed, seats, opts);
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

/** 그 순간 판의 지문. 짧게 잘라 쌓아도 갈린 자리를 찾기에 충분 */
function stamp(m) {
  const v = m.view();
  return JSON.stringify({ s: v.state, sc: v.seats.map((x) => x.score), f: v.finished });
}

/**
 * 처음 갈린 칸 찾기. 원본과 되살린 판을 **나란히** 굴리며 칸마다 지문을 견줌
 * - 원본은 기록이 아니라 그때 그 입력으로 다시 굴림. 기록이 곧 참인지도 같이 봄
 * - 찾으면 그 칸의 시각과 양쪽 지문 앞머리를. 못 찾으면 없음
 */
function firstDiverge(g, seed) {
  const seats = Array.from({ length: partySize(g) }, (_, i) => ({ name: `p${i}`, bot: i > 0 }));
  const a = new Match(g, seed, seats);
  const b = new Match(g, seed, seats);
  const rndA = lcg(seed + 99);
  const rndB = lcg(seed + 99);
  const pick = (rnd) => {
    const n = Math.floor(rnd() * 40);
    const shapes = [{ cell: n }, { at: n % 4, cell: n }, { choice: n % 4 }, { index: n % 5 }, { pad: n % 4 },
      { col: n % 7 }, { bid: n % 10 }, { dir: n % 4 }, { power: n % 10 }, { kind: 'play', index: n % 5 }];
    return shapes[Math.floor(rnd() * shapes.length)];
  };
  for (let now = 0; now <= 300000; now += 16) {
    if (now % 320 === 0) {
      a.dispatch(0, pick(rndA));
      b.dispatch(0, pick(rndB));
    }
    a.step(now);
    b.step(now);
    const sa = stamp(a);
    const sb = stamp(b);
    if (sa !== sb) return { at: now, a: sa.slice(0, 160), b: sb.slice(0, 160) };
    if (a.view().finished || b.view().finished) break;
  }
  return null;
}

console.log(`[replay] 게임 ${GAMES.length}개. 굴리고, 되살리고, 견준다`);
let moves = 0;
let withOpts = 0;
for (const g of GAMES) {
  const { m, seats } = playHuman(g, 31337);
  const tape = record(g, m, seats, 31337);
  moves += tape.moves.length;
  const again = playback(g, tape);
  const same = sameAs(m, again);
  let where = '';
  if (!same) {
    /* 어긋남. 어디서부터인지 짚어 줌. 손으로 찾으면 반나절 */
    const d = firstDiverge(g, 31337);
    where = d
      ? `. 처음 갈린 칸 ${d.at}ms\n      원본 ${d.a}\n      다시 ${d.b}`
      : '. 같은 씨앗으로 두 번 굴린 것은 같다. 어긋남은 기록(record)이나 되살리기(playback) 쪽이다';
  }
  ok(same, `${g.id}: 되살린 판이 원래 판과 같다`,
    `수 ${tape.moves.length}줄, 끝 ${tape.end}ms${where}`);

  /* 시작 전에 고른 값이 있는 놀이는 그 값으로도 한 번. 옵션이 안 실리면 딴 판 */
  const odd = oddOpts(g.id);
  if (odd) {
    withOpts += 1;
    const run = playHuman(g, 4242, odd);
    const tp = record(g, run.m, run.seats, 4242);
    const back = playback(g, tp);
    ok(sameAs(run.m, back), `${g.id}: 고른 값(${JSON.stringify(odd)})도 되살아난다`,
      `기록에 실린 값 ${JSON.stringify(tp.opts ?? null)}`);
  }
}

if (bad) { console.error(`[replay] 실패 ${bad}건`); process.exit(1); }
console.log(`[replay] 통과. 51판이 씨앗 하나와 ${moves}줄로 되살아난다 (고른 값까지 본 놀이 ${withOpts}개)`);
