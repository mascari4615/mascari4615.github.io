/**
 * 어제의 나 검사 (`src/widgets/arcade/ghost.ts`)
 *
 * 고스트는 봇의 한 종류. 기록이 다 떨어졌을 때 자리가 어떻게 되는지는 놀이 종류마다 다름
 *  1. 차례제(야추, 오목). 기록이 떨어지면 원래 봇이 이어 앉는다. 안 그러면 차례가 거기서
 *     멈춰 판이 안 끝남. 2026-08-31 실측, 야추 두 판째가 240초 동안 미완
 *  2. 점수형(realtime, clocked). 그대로 가만히. 자리끼리 영향 없음
 *  3. 기록이 남아 있으면 언제나 기록의 수
 *
 *   node scripts/test-arcade-ghost.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'ghost-'));
const entry = join(dir, 'entry.ts');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..').replaceAll(String.fromCharCode(92), '/');
writeFileSync(entry, `export { withGhost, GHOST_NAME } from '${root}/src/widgets/arcade/ghost';\n`);
const out = join(dir, 'ghost.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { withGhost, GHOST_NAME } = await import(pathToFileURL(out).href);

let fails = 0;
const check = (name, ok, note = '') => {
  if (!ok) fails += 1;
  console.log(`  [${ok ? 'O' : 'X'}] ${name}${ok || !note ? '' : `. ${note}`}`);
};

const baseBot = () => ({ action: { kind: 'fallback' }, delayMs: 0 });
const mk = (extra) => ({ id: 'x', seats: [2, 4], rounds: 1, init: () => ({}), reduce: (s) => s, outcome: () => ({ over: false }), bot: () => baseBot(), ...extra });
const tape = { score: 10, at: 0, moves: [{ at: 1000, action: { kind: 'taped' } }] };
const ctx = (now) => ({ now, seats: [], rng: () => 0.5, opts: {} });

/* 1. 차례제. 기록이 떨어지면 원래 봇 */
const turn = withGhost(mk({}), 1, tape);
check('차례제. 기록이 남아 있으면 기록의 수', turn.bot({}, 1, ctx(0))?.action.kind === 'taped');
check('차례제. 기록이 떨어지면 원래 봇이 이어 앉는다', turn.bot({}, 1, ctx(5000))?.action.kind === 'fallback', String(turn.bot({}, 1, ctx(5000))));

/* 2. 점수형. 그대로 가만히 */
for (const kind of ['realtime', 'clocked']) {
  const score = withGhost(mk({ [kind]: true }), 1, tape);
  check(`${kind}. 기록이 떨어지면 가만히 있는다`, score.bot({}, 1, ctx(5000)) === null);
}

/* 3. 다른 자리는 늘 원래 봇 */
check('다른 자리는 원래 봇', turn.bot({}, 0, ctx(0))?.action.kind === 'fallback');
check('이름이 있다', typeof GHOST_NAME === 'string' && GHOST_NAME.length > 0);

/* 4. 차례제는 **순서로** 소비한다 (2026-09-01)
 *
 * 옛 방식(시각으로 찾기)은 커널 시계가 기록보다 앞서면 남은 수를 통째로 건너뜀
 * 두 판째부터 봇 배속 때문에 늘 그랬고, 그때부터 이름만 어제의 나
 * 아래 판은 기록이 0, 1000, 2000ms 인데 커널은 9000ms 에서 시작 */
{
  const three = { score: 30, at: 0, moves: [{ at: 0, action: { kind: 'a' } }, { at: 1000, action: { kind: 'b' } }, { at: 2000, action: { kind: 'c' } }] };
  const g = withGhost(mk({}), 1, three);
  /* 커널이 한참 지난 시각에 물어도 첫 수부터 */
  const first = g.bot({}, 1, ctx(9000));
  check('차례제. 시계가 기록보다 앞서도 첫 수부터 낸다', first?.action.kind === 'a', String(first?.action?.kind));
  /* 아직 그 수를 둘 시각이 아니면 같은 수 (커널이 여러 번 물음) */
  check('차례제. 두기 전에는 같은 수', g.bot({}, 1, ctx(9000))?.action.kind === 'a');
  /* 둔 뒤에 물으면 다음 수 */
  const after = 9000 + (first?.delayMs ?? 0);
  check('차례제. 두고 나면 다음 수', g.bot({}, 1, ctx(after))?.action.kind === 'b');
  check('차례제. 그다음 수', g.bot({}, 1, ctx(after + 5000))?.action.kind === 'c');
  /* 셋을 다 두면 그때야 원래 봇 */
  check('차례제. 다 두고 나서야 원래 봇', g.bot({}, 1, ctx(after + 20000))?.action.kind === 'fallback');
}

/* 5. 되감으면 커서도 되돌아감. 복기의 Try Play 가 딴 판이 되면 안 됨 */
{
  const two = { score: 20, at: 0, moves: [{ at: 0, action: { kind: 'a' } }, { at: 500, action: { kind: 'b' } }] };
  const g = withGhost(mk({}), 1, two);
  const one = g.bot({}, 1, ctx(1000));
  check('되감기 전 첫 수', one?.action.kind === 'a');
  g.bot({}, 1, ctx(1000 + (one?.delayMs ?? 0)));
  check('되감으면 다시 첫 수', g.bot({}, 1, ctx(0))?.action.kind === 'a');
}

/* 6. 점수형은 여전히 시각으로. 그 시각에 그 수가 나와야 어제의 나 */
{
  const timed = { score: 10, at: 0, moves: [{ at: 0, action: { kind: 'a' } }, { at: 3000, action: { kind: 'c' } }] };
  const g = withGhost(mk({ realtime: true }), 1, timed);
  check('점수형. 2000ms 에 물으면 3000ms 수', g.bot({}, 1, ctx(2000))?.action.kind === 'c');
  check('점수형. 남은 시각이 delay 로', g.bot({}, 1, ctx(2000))?.delayMs === 1000);
}

rmSync(dir, { recursive: true, force: true });
if (fails) {
  console.log(`[arcade-ghost] 실패 ${fails}건`);
  process.exit(1);
}
console.log('[arcade-ghost] 통과. 차례제는 봇이 이어 앉고, 점수형은 가만히');
