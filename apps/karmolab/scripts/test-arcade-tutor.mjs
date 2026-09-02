/**
 * 배우기 장면 검사 (`src/widgets/arcade/tutor.ts`)
 *
 * 장면은 손으로 짠 좌표라 조용히 깨진다. 여기서 재는 것 넷.
 *  ① 흑과 백이 같은 수. 안 맞으면 백 차례로 끝나 사람이 못 둠
 *  ② 자리가 안 겹침
 *  ③ 정답 자리가 비어 있고 규칙이 받음. 금수면 못 둠
 *  ④ 금수를 가르치는 장은 그 자리가 정말 금수
 *
 *   node scripts/test-arcade-tutor.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'tutor-'));
const entry = join(dir, 'entry.ts');
/* 어디서 부르든 같은 곳을 본다. cwd 기준이면 저장소 뿌리에서 돌 때 깨짐(실측) */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
writeFileSync(entry, `export { gomoku } from '${root}/src/widgets/arcade/games/gomoku';\nexport { LESSONS, TutorRun, cellOf, TUTOR_SIZE } from '${root}/src/widgets/arcade/tutor';\n`);
const out = join(dir, 'tutor.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { gomoku, LESSONS, TutorRun, cellOf, TUTOR_SIZE } = await import(pathToFileURL(out).href);

let fails = 0;
const check = (name, ok, note = '') => {
  if (!ok) fails += 1;
  console.log(`  [${ok ? 'O' : 'X'}] ${name}${ok || !note ? '' : `. ${note}`}`);
};

const run = new TutorRun();
run.start();
check('진행표가 첫 장에서 시작한다', run.at === 0 && run.lesson === LESSONS[0]);
await new Promise((resolve) => run.advance(resolve, 0));
check('예약한 다음 장으로 한 번만 넘어간다', run.at === 1 && run.lesson === LESSONS[1]);
let advanced = false;
run.advance(() => { advanced = true; }, 0);
run.stop();
await new Promise((resolve) => setTimeout(resolve, 5));
check('장면 사이에 나가면 다음 장 예약을 취소한다', run.at === null && !advanced);
run.start();
let resumed = false;
run.finish(() => { resumed = true; }, 0);
run.start();
await new Promise((resolve) => setTimeout(resolve, 5));
check('다른 판을 시작하면 완료 예약을 취소한다', run.at === 0 && !resumed);
run.stop();
check('나가면 진행표와 예약을 함께 지운다', run.at === null && run.lesson === null);

const n = TUTOR_SIZE;
const ctx = { seats: [{}, {}], rng: () => 0.5, now: 0, round: 0, opts: { size: n, renju: true, limit: 0, ai: 1 } };
/** 장면을 깐 상태. 화면과 같은 방식으로 차례에 맞는 돌부터 심는다 */
function lay(lesson) {
  let s = gomoku.init(ctx);
  const want = lesson.board.slice();
  for (let guard = 0; guard < 400 && want.length; guard += 1) {
    const k = want.findIndex((b) => b.who === s.turn + 1);
    const b = want.splice(k >= 0 ? k : 0, 1)[0];
    s = gomoku.reduce(s, { cell: cellOf(b.x, b.y) }, b.who - 1, ctx);
  }
  return s;
}

console.log(`[tutor] 장면 ${LESSONS.length}장`);
LESSONS.forEach((lesson, i) => {
  const tag = `${i + 1}장(${lesson.say.replace('arcade.tutor.', '')})`;
  const black = lesson.board.filter((b) => b.who === 1).length;
  const white = lesson.board.filter((b) => b.who === 2).length;
  check(`${tag}: 흑과 백이 같은 수`, black === white, `흑 ${black} 백 ${white}`);
  const seen = new Set(lesson.board.map((b) => cellOf(b.x, b.y)));
  check(`${tag}: 자리가 안 겹친다`, seen.size === lesson.board.length);
  const laid = lay(lesson);
  const placed = laid.board.filter((v) => v).length;
  check(`${tag}: 돌이 다 놓인다`, placed === lesson.board.length, `${placed}/${lesson.board.length}`);
  check(`${tag}: 흑 차례로 끝난다`, laid.turn === 0, `turn ${laid.turn}`);
  lesson.answer.forEach((a) => {
    const cell = cellOf(a.x, a.y);
    const after = gomoku.reduce(laid, { cell }, 0, ctx);
    const took = after !== laid && after.board[cell] === 1;
    check(`${tag}: 정답 ${a.x},${a.y} 를 규칙이 받는다`, took);
  });
  /* 금수를 가르치는 장은 그 자리가 정말 금수여야 한다 */
  const forbidden = { banned: [8, 7], four4: [8, 7], over: [6, 7] }[lesson.say.replace('arcade.tutor.', '')];
  if (forbidden) {
    const cell = cellOf(forbidden[0], forbidden[1]);
    const after = gomoku.reduce(laid, { cell }, 0, ctx);
    const blocked = after.board[cell] === 0;
    check(`${tag}: ${forbidden[0]},${forbidden[1]} 가 금수다`, blocked);
  }
});

rmSync(dir, { recursive: true, force: true });
if (fails) {
  console.log(`[tutor] 실패 ${fails}건`);
  process.exit(1);
}
console.log('[tutor] 통과. 장면이 흑 차례로 끝나고, 정답은 두어지고, 금수는 막힌다');
