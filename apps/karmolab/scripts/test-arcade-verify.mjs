/**
 * 서버가 판을 다시 셈하는 길이 진짜로 도는가 (change.arcade-online)
 *
 * 단위 검사는 판정을 어떻게 쓰는가만 잰다. 여기서는 **진짜 커널로 진짜 판을 굴려**
 * 패보를 만들고, 구운 묶음이 그 패보에서 같은 승자를 셈하는지
 *
 * 이게 도는 것이 서버 재검증의 유일한 증거다. 묶음이 안 구워지거나 놀이가 바뀌면
 * 여기서 빨개짐
 *
 * `npm run test:arcade:verify`
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const dir = mkdtempSync(join(tmpdir(), 'arcade-verify-'));
const esm = join(dir, 'arcade.mjs');
const cjs = join(dir, 'verifier.cjs');

await build({
  entryPoints: ['src/widgets/arcade/index.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: esm, logLevel: 'silent'
});
await build({
  entryPoints: ['src/widgets/arcade/verify-entry.ts'],
  bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: cjs, logLevel: 'silent'
});

const { Match, gameById, seedFrom } = await import(pathToFileURL(esm).href);
const { verifyTape } = createRequire(import.meta.url)(cjs);

let fails = 0;
const ok = (cond, name, detail = '') => {
  if (cond) console.log(`  [O] ${name}`);
  else { console.log(`  [X] ${name}${detail ? '. ' + detail : ''}`); fails++; }
};

/** 봇 둘이 끝까지 두는 판 하나. 사람 손이 없어도 커널이 스스로 민다 */
function playBots(id, seed) {
  const game = gameById(id);
  const seats = [{ name: '가', bot: true }, { name: '나', bot: true }];
  const m = new Match(game, seed, seats, {});
  for (let now = 0; now <= 200000; now += 50) {
    m.step(now);
    if (m.view().finished) break;
  }
  return { game, m, seats };
}

console.log('[verify] 진짜 판을 굴려 패보로 다시 셈한다');
{
  const { game, m, seats } = playBots('gomoku', seedFrom('verify-1'));
  const v = m.view();
  ok(v.finished, '봇 둘이 판을 끝냈다');

  const tape = { game: game.id, seed: m.seed ?? seedFrom('verify-1'), seats, opts: m.opts, moves: [...m.tape], end: m.clock() };
  const out = verifyTape(tape);
  ok(out.ok, '묶음이 그 패보를 되살렸다', out.why ?? '');
  ok(out.finished === true, '되살린 판도 끝난 판이다');

  const mine = v.seats.map((s) => s.score);
  ok(JSON.stringify(out.scores) === JSON.stringify(mine), '점수가 같다', `서버 ${out.scores} 브라우저 ${mine}`);

  const top = mine.indexOf(Math.max(...mine));
  ok(out.ranks?.[0] === top, '1위가 같다', `서버 ${out.ranks?.[0]} 브라우저 ${top}`);
}

console.log('[verify] 진짜로 다시 굴린다. 받아 적는 것이 아니다');
{
  /* 봇끼리 둔 판은 수가 안 적힌다. 커널이 씨앗에서 똑같이 만들어 내기 때문(replay.ts).
     그래서 민감도는 씨앗으로 잰다. 씨앗이 다르면 봇의 수가 달라지고 판도 달라진다.
     여기서 답이 안 갈리면 그건 되살린 게 아니라 받아 적은 것이다 */
  const seeds = [];
  for (let i = 0; i < 6; i++) {
    const seed = seedFrom('verify-mut-' + i);
    const { game, m, seats } = playBots('gomoku', seed);
    const out = verifyTape({ game: game.id, seed, seats, opts: m.opts, moves: [...m.tape], end: m.clock() });
    seeds.push(JSON.stringify([out.scores, out.ranks]));
  }
  ok(new Set(seeds).size > 1, '씨앗이 다르면 답도 갈린다', seeds.join(' '));

}

console.log('[verify] 못 셀 것은 못 셌다고 한다');
{
  ok(!verifyTape(null).ok, '빈 값');
  ok(!verifyTape({ game: 'nope', seed: 1, seats: [{}], moves: [] }).ok, '모르는 놀이');
  ok(!verifyTape({ game: 'gomoku', seed: 1, seats: [], moves: [] }).ok, '자리가 없는 패보');
  ok(!verifyTape({ game: 'gomoku', seed: 1, seats: [{}, {}], moves: 'x' }).ok, '수가 배열이 아님');
}

rmSync(dir, { recursive: true, force: true });
console.log(fails ? `[verify] ❌ ${fails}건 실패` : '[verify] ✅ 전부 통과');
process.exit(fails ? 1 : 0);
