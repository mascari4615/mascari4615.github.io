/**
 * 편 가르기의 규율. 창 없이 (TASK-KL-264 E1)
 *
 * 편은 점수를 어떻게 세나까지다. 그 선을 넘지 않는지, 그리고 넘기 전까지는 정확한지를 본다.
 */
import { build } from 'esbuild';
const r = await build({ entryPoints: ['src/widgets/arcade/teams.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const { split, isTeamy, teamScores, winner, TEAM_NAMES } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

let bad = 0;
const ok = (cond, name, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : '. ' + detail}`);
  if (!cond) bad++;
};

console.log('[teams] 가르기');
ok(JSON.stringify(split(4)) === '[0,1,0,1]', '넷은 번갈아 갈린다', JSON.stringify(split(4)));
ok(JSON.stringify(split(6)) === '[0,1,0,1,0,1]', '여섯도 번갈아', JSON.stringify(split(6)));
/* 앞자리 둘을 묶으면 차례 놀이에서 한 편이 연달아 둔다. 그래서 번갈아여야 한다. */
ok(split(4)[0] !== split(4)[1], '이웃한 자리는 서로 다른 편');
ok(!isTeamy(2) && !isTeamy(3), '둘, 셋은 편이 아니다');
ok(isTeamy(4) && isTeamy(6), '넷부터 편이 선다');
ok(TEAM_NAMES.length === 2, '편은 둘뿐');

console.log('[teams] 셈');
const p = split(4);
ok(JSON.stringify(teamScores(p, [3, 1, 2, 5])) === '[5,6]', '편 점수는 그 편 자리들의 합', JSON.stringify(teamScores(p, [3, 1, 2, 5])));
ok(winner(p, [3, 1, 2, 5]) === 1, '많이 낸 편이 이긴다');
ok(winner(p, [3, 3, 3, 3]) === null, '같으면 비긴다');
ok(JSON.stringify(teamScores(p, [0, 0, 0, 0])) === '[0,0]', '아무도 못 내면 0대 0');
/* 자리 수가 계획보다 많거나 적어도 안 터진다. 사람이 빠진 판에서 그럴 수 있다. */
ok(JSON.stringify(teamScores(p, [1, 2])) === '[1,2]', '자리가 모자라도 센다', JSON.stringify(teamScores(p, [1, 2])));
ok(JSON.stringify(teamScores(p, [1, 1, 1, 1, 9])) === '[2,2]', '계획 밖 자리는 안 센다', JSON.stringify(teamScores(p, [1, 1, 1, 1, 9])));

if (bad) { console.error(`[teams] 실패 ${bad}건`); process.exit(1); }
console.log('[teams] 통과. 편은 점수를 세는 방식까지다');
