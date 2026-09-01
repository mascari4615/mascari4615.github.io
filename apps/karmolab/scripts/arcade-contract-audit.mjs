/**
 * 오락실 계약 감사. 판마다 무엇이 빠졌나 (`memo/projects/karmolab/features/play.md`)
 *
 * 계약 셋을 사람이 목록으로 적으면 금방 낡음. 파일을 보고 매번 새로 셈
 *   입체: `games/<조각>-view3d.ts` 실재. 없으면 그 판은 평면뿐
 *   소리: 화면이 `blip` 이나 방 소리를 부름. 없으면 손맛 반
 *   막힘 반응: 안 되는 것에 `blip('bad')` 나 빨간 점등
 *   끌기: 누르기 말고 끌어서도 됨 (`handNow` 나 `pointerdown`)
 *
 * 리포트 전용. 막지는 않음. `--strict` 면 하나라도 빠졌을 때 1 로 나감
 * `--json` 이면 기계가 읽는 꼴. `--only <조각>` 이면 그 판만
 *
 * 다시 재는 법: `node scripts/arcade-contract-audit.mjs`
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const GAMES = 'src/widgets/arcade/games';
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';

if (!existsSync(GAMES)) {
  console.log(`[arcade-contract] 못 쟀다. 화면 폴더가 없다: ${GAMES}`);
  process.exit(2);
}

const chunks = readdirSync(GAMES)
  .filter((f) => f.endsWith('-view.ts'))
  .map((f) => f.slice(0, -'-view.ts'.length))
  .filter((c) => !only || c === only)
  .sort();

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const rows = chunks.map((c) => {
  const flat = read(join(GAMES, `${c}-view.ts`));
  const d3path = join(GAMES, `${c}-view3d.ts`);
  const solid = read(d3path);
  const both = flat + solid;
  return {
    game: c,
    d3: existsSync(d3path),
    sound: /\bblip\(|roomAmbience\(|amb\.\w+\(/.test(both),
    refuse: /blip\('bad'\)|\bnope\(/.test(both),
    drag: /handNow\(|pointerdown/.test(both)
  };
});

const cols = ['d3', 'sound', 'refuse', 'drag'];
const label = { d3: '입체', sound: '소리', refuse: '막힘 반응', drag: '끌기' };
const bad = rows.filter((r) => cols.some((k) => !r[k]));

if (has('--json')) {
  console.log(JSON.stringify({ total: rows.length, missing: bad.length, rows }, null, 1));
  process.exit(has('--strict') && bad.length ? 1 : 0);
}

console.log(`[arcade-contract] 판 ${rows.length}개. 계약을 다 채운 판 ${rows.length - bad.length}개`);
for (const k of cols) {
  const n = rows.filter((r) => !r[k]).length;
  console.log(`  ${label[k]} 빠짐 ${n}개`);
}
if (bad.length) {
  console.log('');
  console.log('  판           입체 소리 막힘 끌기');
  for (const r of bad) {
    const mark = (v) => (v ? ' O  ' : ' X  ');
    console.log(`  ${r.game.padEnd(12)}${mark(r.d3)}${mark(r.sound)}${mark(r.refuse)}${mark(r.drag)}`);
  }
  console.log('');
  console.log('  정본: memo/projects/karmolab/features/play.md 의 놀이 화면이 지켜야 할 셋');
}
process.exit(has('--strict') && bad.length ? 1 : 0);
