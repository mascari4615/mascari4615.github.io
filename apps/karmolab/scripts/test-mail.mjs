/**
 * 판을 편지로 접었다 펴도 같은 판인가 (TASK-KL-264 D5)
 *
 * 비동기 턴제의 전부가 이 한 가지에 달려 있다. 링크에 실은 글자를 상대가 폈을 때 **내가 보던
 * 그 판**이 나와야 한다. 아니면 두 사람이 다른 판을 두게 되고, 그건 놀이가 아니다.
 *
 * 그리고 남이 준 글자는 못 믿는다: 망가진 편지, 엉뚱한 편지에 **터지지 않고 null** 이어야 한다.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'mail-'));
const out = join(dir, 'a.mjs');
await build({ entryPoints: ['src/widgets/arcade/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { gameById } = await import(pathToFileURL(out).href);
const mp = join(dir, 'm.mjs');
await build({ entryPoints: ['src/widgets/arcade/mail.ts'], bundle: true, format: 'esm', platform: 'node', outfile: mp, logLevel: 'silent' });
const { fold, unfold, deal, turnOf, MAX_CHARS } = await import(pathToFileURL(mp).href);

/* 브라우저 것들을 빌려 온다. 이 파일은 창 없이 도는 검사다. */
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');

let bad = 0;
const ok = (cond, name, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : '. ' + detail}`);
  if (!cond) bad++;
};

console.log('[mail] 접었다 펴기');
const letter = { game: 'gomoku', seed: 4242, who: ['조수', '깜냥'], moves: [{ cell: 40 }, { cell: 41 }, { cell: 31 }] };
const packed = fold(letter);
ok(typeof packed === 'string' && packed.length > 0, '편지가 접힌다', String(packed).slice(0, 20));
ok(!/[+/=]/.test(packed || ''), '주소에 그대로 실을 수 있는 글자만', packed || '');
ok(JSON.stringify(unfold(packed)) === JSON.stringify(letter), '펴면 그대로다');

console.log('[mail] 못 믿을 글자');
for (const junk of ['', 'zzz', '!!!!', 'eyJhIjoxfQ', 'W10', null, undefined, '한글']) {
  let threw = '';
  let got;
  try { got = unfold(String(junk)); } catch (e) { threw = e.message; }
  ok(!threw && (got === null || typeof got === 'object'), `${String(junk).slice(0, 8)}에 안 터진다`, threw);
}
ok(unfold('W10') === null, '모양이 틀린 편지는 null');

console.log('[mail] 길이');
const long = { game: 'gomoku', seed: 1, who: ['a', 'b'], moves: Array.from({ length: 3000 }, (_, i) => ({ cell: i })) };
ok(fold(long) === null, `너무 긴 판은 null (상한 ${MAX_CHARS}자)`);
ok((fold({ game: 'gomoku', seed: 1, who: ['a', 'b'], moves: Array.from({ length: 30 }, (_, i) => ({ cell: i })) }) || '').length < 500,
  '오목 서른 수는 500자 아래');

console.log('[mail] 편지로 둔 판 = 직접 둔 판');
{
  const g = gameById('gomoku');
  const moves = [{ cell: 40 }, { cell: 0 }, { cell: 41 }, { cell: 1 }, { cell: 42 }, { cell: 2 }];
  const a = deal(g, { game: 'gomoku', seed: 9, who: ['가', '나'], moves });
  const b = deal(g, unfold(fold({ game: 'gomoku', seed: 9, who: ['가', '나'], moves })));
  ok(JSON.stringify(a.view().state) === JSON.stringify(b.view().state), '접었다 편 판이 그대로다');
  ok(a.view().state.board.filter((v) => v !== 0).length === 6, '여섯 수가 다 놓였다',
    String(a.view().state.board.filter((v) => v !== 0).length));
  ok(turnOf({ who: ['가', '나'], moves }) === 0, '여섯 수 뒤에는 첫 자리 차례');
  ok(turnOf({ who: ['가', '나'], moves: moves.slice(0, 3) }) === 1, '세 수 뒤에는 둘째 자리 차례');
}

if (bad) { console.error(`[mail] 실패 ${bad}건`); process.exit(1); }
console.log('[mail] 통과. 판이 링크 한 줄에 담겨 오간다');
