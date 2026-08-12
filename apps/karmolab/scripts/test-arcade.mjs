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
const { Match, GAMES, gameById, seedFrom } = await import(pathToFileURL(out).href);

let fails = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  [O] ${name}`);
  else { console.log(`  [X] ${name}`); fails++; }
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

console.log('[arcade] 씨앗 — 같은 방은 같은 판');
{
  const a = new Match(gameById('reflex'), seedFrom('KRM7'), [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  const b = new Match(gameById('reflex'), seedFrom('KRM7'), [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  const va = a.view().state, vb = b.view().state;
  ok(va.order === vb.order && JSON.stringify(va.choices) === JSON.stringify(vb.choices), '같은 씨앗 → 같은 문제');
  const c = new Match(gameById('reflex'), seedFrom('ZZZZ'), [{ name: 'a', bot: false }, { name: 'b', bot: false }]);
  ok(c.view().state.order !== va.order || JSON.stringify(c.view().state.choices) !== JSON.stringify(va.choices), '다른 씨앗 → 다른 문제');
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
