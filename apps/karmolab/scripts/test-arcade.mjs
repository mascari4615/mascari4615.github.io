/**
 * 오락실 커널 검증 (TASK-KL-242)
 *
 * 커널이 화면도 그물망도 안 쓰기 때문에 **창을 안 띄우고** 판을 끝까지 돌려 볼 수 있다.
 * 시계는 이 스크립트가 직접 민다 — 4초짜리 판 다섯을 진짜로 기다리면 51개는 못 돌린다.
 *
 * 여기서 지키는 것:
 *  - 같은 씨앗 = 같은 판 (안 그러면 여럿이 딴 문제를 본다)
 *  - 사람이 하나도 없어도 판이 끝난다 (= 싱글이 멀티와 같은 코드라는 증거)
 *  - 못 두는 수는 조용히 흘린다 (남의 창에서 오는 수는 못 믿는다)
 *
 * `npm run test:arcade`
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'arcade-'));
const out = join(dir, 'arcade.mjs');
await build({
  entryPoints: ['src/widgets/arcade/index.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent'
});
const { Match, GAMES, gameById, seedFrom, META } = await import(pathToFileURL(out).href);

let fails = 0;
const ok = (cond, name, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else { console.log(`  [X] ${name}${detail ? ' — ' + detail : ''}`); fails++; }
};

/** 판을 끝까지 민다. 사람 자리는 `play` 가 대신 둔다(없으면 아무도 안 둔다). */
function run(game, seed, seats, play, maxMs = 200000) {
  const m = new Match(game, seed, seats);
  for (let now = 0; now <= maxMs; now += 50) {
    m.step(now);
    const v = m.view();
    if (v.finished) return m;
    if (play && !v.roundOver) play(m, v, now);
  }
  return m;
}

console.log('[arcade] 명부');
ok(GAMES.length >= 2, `게임 ${GAMES.length}개 등록`);
ok(GAMES.every((g) => g.id && g.seats[0] >= 1 && g.rounds >= 1), '모든 게임이 id·자리수·판수를 갖췄다');
ok(new Set(GAMES.map((g) => g.id)).size === GAMES.length, 'id 가 겹치지 않는다');
{
  /* 갈래 명패가 빠진 게임은 **로비에서 통째로 사라진다**(갈래별로 묶어 그리기 때문).
     타입은 안 잡아 주고 화면 검사도 「없는 것」은 못 본다 — 그래서 여기서 센다. */
  const metaIds = new Set(META.map((m) => m.id));
  const missing = GAMES.map((g) => g.id).filter((id) => !metaIds.has(id));
  ok(missing.length === 0, '모든 게임이 갈래 명패를 갖는다', missing.join(', '));
  const orphan = META.map((m) => m.id).filter((id) => !GAMES.some((g) => g.id === id));
  ok(orphan.length === 0, '명패에 없는 게임이 안 남아 있다', orphan.join(', '));
}

/**
 * **모든 게임이 지켜야 하는 것.** 게임을 51개까지 늘려도 여기에 자동으로 걸린다 —
 * 새 게임을 넣을 때 검사를 새로 짤 필요가 없다는 뜻이고, 그게 51개가 가능한 이유다.
 */
console.log('[arcade] 계약 — 모든 게임 공통');
for (const g of GAMES) {
  const seats = Array.from({ length: g.seats[0] }, (_, i) => ({ name: `b${i}`, bot: true }));

  /* ① 봇만으로 반드시 끝난다 — 안 끝나면 혼자 하는 사람이 영영 갇힌다.
   *
   * 안 끝났을 때 **판이 그때 어떤 모양이었는지**를 같이 적는다. 이 검사에 네 번 걸렸는데
   * (조각 맞추기·체커·당구·볼링) 매번 「안 끝난다」만 보고 원인을 손으로 파야 했다.
   * 마지막 상태를 보면 대개 한눈에 보인다 — 칠 공이 없다거나, 아무도 못 두는 자리라거나. */
  const m = run(g, 12345, seats, null, 400000);
  const dump = () => {
    const v = m.view();
    const st = v.state ?? {};
    const brief = Object.fromEntries(
      Object.entries(st).slice(0, 8).map(([k, val]) => [
        k,
        Array.isArray(val) ? `[${val.length}]` : typeof val === 'object' && val ? '{…}' : val
      ])
    );
    return `판 ${v.round + 1}/${v.rounds} · ${JSON.stringify(brief)}`;
  };
  ok(m.view().finished, `${g.id}: 봇만으로 끝까지 간다`, m.view().finished ? '' : dump());

  /* ② 쓰레기 수를 던져도 안 죽는다 — 남의 창에서 오는 수는 못 믿는다. */
  const junk = new Match(g, 7, seats);
  let threw = '';
  for (const bad of [null, undefined, {}, { cell: -1 }, { cell: 1e9 }, { col: -5 }, { choice: 99 }, 'x', 42]) {
    for (let seat = -1; seat <= g.seats[1]; seat++) {
      try { junk.dispatch(seat, bad); } catch (e) { threw = `${JSON.stringify(bad)} → ${e.message}`; }
    }
  }
  try { junk.step(50); junk.step(100); } catch (e) { threw = `step → ${e.message}`; }
  ok(!threw, `${g.id}: 이상한 수에도 안 죽는다`, threw);

  /* ③ 같은 씨앗 + 같은 수 = 같은 판. 아니면 여럿이 서로 다른 판을 본다. */
  const a1 = new Match(g, 999, seats);
  const a2 = new Match(g, 999, seats);
  ok(
    JSON.stringify(a1.view().state) === JSON.stringify(a2.view().state),
    `${g.id}: 같은 씨앗이면 첫 판이 같다`
  );

  /* ④ 판이 그물망을 건널 수 있다 — 함수나 Map 이 섞이면 손님 화면이 비어 버린다. */
  let jsonOk = true;
  try {
    const round = JSON.parse(JSON.stringify(a1.view().state));
    jsonOk = JSON.stringify(round) === JSON.stringify(a1.view().state);
  } catch {
    jsonOk = false;
  }
  ok(jsonOk, `${g.id}: 판을 통째로 흘려보낼 수 있다 (JSON)`);

  /* ⑤ 감출 것이 있는 게임은 **손님에게 갈 판에 그것이 없어야** 한다. 화면이 안 그려도 값은 간다. */
  if (g.redact) {
    const before = JSON.stringify(a1.view().state);
    const safe = JSON.stringify(g.redact(a1.view().state, 0));
    ok(before !== safe, `${g.id}: 감춘 것이 손님 판에서 지워진다`);
  }

  /* ⑥ 자리 수가 말이 된다. */
  ok(g.seats[0] >= 1 && g.seats[0] <= g.seats[1], `${g.id}: 자리 수가 말이 된다 (${g.seats.join('~')})`);
}

console.log('[arcade] 씨앗 — 같은 방은 같은 판');
{
  const a = new Match(gameById('reflex'), seedFrom('KRM7'), [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  const b = new Match(gameById('reflex'), seedFrom('KRM7'), [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  const va = a.view().state, vb = b.view().state;
  ok(va.order === vb.order && JSON.stringify(va.choices) === JSON.stringify(vb.choices), '같은 씨앗 → 같은 문제');
  const c = new Match(gameById('reflex'), seedFrom('ZZZZ'), [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  ok(c.view().state.order !== va.order || JSON.stringify(c.view().state.choices) !== JSON.stringify(va.choices), '다른 씨앗 → 다른 문제');
}

console.log('[arcade] 난수 — 판 중에 굴려도 값이 바뀐다');
{
  /* 주사위처럼 판 중에 뽑는 게임이 있으므로, 같은 판 안에서 rng 를 두 번 부르면 달라야 한다.
     예전에는 부를 때마다 새로 만들어 늘 같은 값이 나왔다(굴리는 게임이 아예 불가능했다). */
  const probe = {
    id: 'probe-rng', seats: [1, 1], rounds: 1,
    init: (ctx) => ({ rolls: [ctx.rng()] }),
    reduce: (s, a, seat, ctx) => ({ rolls: [...s.rolls, ctx.rng()] }),
    outcome: (s) => (s.rolls.length >= 6 ? { over: true, scores: [1] } : { over: false }),
    bot: () => null
  };
  const m = new Match(probe, 4242, [{ name: 'me', bot: false }]);
  for (let i = 0; i < 5; i++) m.dispatch(0, {});
  const rolls = m.view().state.rolls;
  ok(new Set(rolls).size === rolls.length, `같은 판에서 부를 때마다 다른 값 (${rolls.length}개)`);

  const a = new Match(probe, 4242, [{ name: 'me', bot: false }]);
  const b = new Match(probe, 4242, [{ name: 'me', bot: false }]);
  for (let i = 0; i < 3; i++) { a.dispatch(0, {}); b.dispatch(0, {}); }
  ok(
    JSON.stringify(a.view().state.rolls) === JSON.stringify(b.view().state.rolls),
    '같은 씨앗이면 굴린 값의 차례까지 같다'
  );
}

console.log('[arcade] 반응 측정 — 실시간·동시');
{
  /* 아무도 손을 안 뻗어도 제한시간이 지나면 판이 넘어가고, 다섯 판 뒤 끝난다. */
  const m = run(gameById('reflex'), 1, [{ name: 'a', bot: false }, { name: 'b', bot: false }], null, 60000);
  ok(m.view().finished, '아무도 안 골라도 다섯 판 뒤 끝난다');
  ok(m.seats.every((s) => s.score === 0), '아무도 안 골랐으면 점수는 0');
}
{
  /* 사람 자리를 늘 정답으로 채우면 5점. 봇보다 언제나 빠르게(50ms) 누른다. */
  const m = run(gameById('reflex'), 7, [{ name: '나', bot: false }, { name: '봇', bot: true }], (mm, v, now) => {
    if (now - v.state.startedAt >= 50 && !v.state.picks[0]) mm.dispatch(0, { choice: v.state.answer });
  }, 60000);
  ok(m.view().finished, '끝났다');
  ok(m.seats[0].score === 5, `늘 먼저 맞히면 5점 (실제 ${m.seats[0].score})`);
}
{
  /* 사람이 하나도 없는 방 — 봇만으로도 판이 끝난다. 싱글이 멀티와 같은 코드라는 증거. */
  const m = run(gameById('reflex'), 3, [{ name: 'b1', bot: true }, { name: 'b2', bot: true }, { name: 'b3', bot: true }], null, 60000);
  ok(m.view().finished, '봇만 셋이어도 끝난다');
  ok(m.seats.length === 3, '자리 셋이 유지된다');
}
{
  /* 판마다 제한시간이 줄어든다 */
  const g = gameById('reflex');
  const m = new Match(g, 5, [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  const first = m.view().state.endsAt - m.view().state.startedAt;
  const limits = [first];
  for (let now = 0; now <= 60000 && !m.view().finished; now += 50) {
    const before = m.view().round;
    m.step(now);
    const v = m.view();
    if (v.round !== before && !v.finished) limits.push(v.state.endsAt - v.state.startedAt);
  }
  ok(limits.length >= 4 && limits.every((l, i) => i === 0 || l < limits[i - 1]), `판마다 짧아진다 (${limits.join(' → ')})`);
}

console.log('[arcade] 컬링 — 물리가 커널 안에서 돈다');
{
  const g = gameById('curling');
  const seats = [{ name: '나', bot: false }, { name: '봇', bot: true }];

  /* ① 던지면 미끄러지다 **반드시 선다**. 안 서면 판이 영영 안 넘어간다. */
  const m = new Match(g, 21, seats);
  m.dispatch(0, { aim: 0, power: 0.6 });
  let stoppedAt = -1;
  for (let now = 0; now < 60000; now += 16) {
    m.step(now);
    if (!m.view().state.moving) { stoppedAt = now; break; }
  }
  ok(stoppedAt > 0, `던진 돌이 선다 (${stoppedAt}ms)`);

  /* ② 같은 힘 = 같은 자리. 기기가 느리든 빠르든 결과가 같아야 한다. */
  const run = (stepMs) => {
    const mm = new Match(g, 21, [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
    mm.dispatch(0, { aim: 0.1, power: 0.7 });
    for (let now = 0; now < 60000 && mm.view().state.moving; now += stepMs) mm.step(now);
    const st = mm.view().state.stones[0];
    return st ? `${st.x.toFixed(3)},${st.y.toFixed(3)}` : 'none';
  };
  ok(run(16) === run(50), `한 걸음이 프레임이 아니라 시간이다 (16ms=${run(16)} · 50ms=${run(50)})`);

  /* ③ 판 밖으로 나간 돌은 사라진다. */
  const hard = new Match(g, 5, [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  hard.dispatch(0, { aim: 0, power: 1 });
  for (let now = 0; now < 60000 && hard.view().state.moving; now += 16) hard.step(now);
  const inField = hard.view().state.stones.every((st) => st.y > -20 && st.y < 300);
  ok(inField, '판 밖으로 나간 돌은 남지 않는다');
}

console.log('[arcade] 오목 — 차례·보드');
{
  const g = gameById('gomoku');
  const m = new Match(g, 1, [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  m.dispatch(1, { cell: 40 });
  ok(m.view().state.board[40] === 0, '남의 차례에 둔 수는 흘린다');
  m.dispatch(0, { cell: 40 });
  ok(m.view().state.board[40] === 1, '내 차례에는 놓인다');
  m.dispatch(1, { cell: 40 });
  ok(m.view().state.board[40] === 1 && m.view().state.turn === 1, '이미 놓인 칸은 흘린다 (차례도 안 넘어간다)');
  m.dispatch(1, { cell: 0 });
  m.dispatch(0, { cell: 999 });
  ok(m.view().state.turn === 0, '판 밖의 칸도 흘린다');
}
{
  /* 가로 다섯 = 승리 */
  const g = gameById('gomoku');
  const m = new Match(g, 1, [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  for (let i = 0; i < 5; i++) {
    m.dispatch(0, { cell: 9 * 2 + i });
    if (i < 4) m.dispatch(1, { cell: 9 * 5 + i });
  }
  ok(m.view().state.won === 0, '가로 다섯을 잡아낸다');
  m.step(0); m.step(1000);
  ok(m.view().finished, '한 판짜리 게임은 이기면 끝난다');
  ok(m.seats[0].score === 1 && m.seats[1].score === 0, '이긴 자리만 1점');
  ok(m.winners().map((s) => s.name).join() === 'a', '이긴 사람이 나온다');
}
{
  /* 봇 대 봇 — 멈추지 않고 끝난다(무승부든 승부든) */
  const m = run(gameById('gomoku'), 11, [{ name: 'b1', bot: true }, { name: 'b2', bot: true }], null, 300000);
  ok(m.view().finished, '봇끼리 두면 반드시 끝난다');
  ok(m.view().state.won !== -1, `승부가 난다 (won=${m.view().state.won})`);
}
{
  /* 사람이 하나면 남은 자리는 봇이 앉는다 — 「싱글 모드」 없이 혼자 놀 수 있다 */
  const m = new Match(gameById('gomoku'), 2, [{ name: '나', bot: false }]);
  ok(m.seats.length === 2 && m.seats[1].bot, '모자란 자리는 봇이 채운다');
}

console.log(fails ? `[arcade] 실패 ${fails}건` : '[arcade] 커널 통과 — 씨앗·실시간·차례·봇·못 두는 수');
rmSync(dir, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
