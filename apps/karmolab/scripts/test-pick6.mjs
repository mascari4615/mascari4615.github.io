/**
 * 추천 여섯 칸의 규율. 창 없이 (TASK-KL-264 F4)
 *
 * 추천은 근거가 있을 때만 추천이다. 근거가 코드에만 있고 검사에 없으면 다음 사람이 규칙을
 * 한 줄 고칠 때 무엇이 깨지는지 모른다. 여기서 지키는 것 넷:
 *   ① 안 해 본 것이 먼저 온다   ② 한 갈래가 둘을 안 넘는다
 *   ③ 긴 판은 많아야 하나        ④ 짧은 판이 최소 둘
 * 그리고 ⑤ 같은 상태면 같은 여섯 (눌렀다 돌아왔더니 칸이 바뀌어 있으면 아까 그것을 못 찾는다).
 */
import { build } from 'esbuild';
const r = await build({ entryPoints: ['src/widgets/arcade/pick6.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const { pick6, matches, SLOTS } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

let bad = 0;
const ok = (cond, name, detail = '') => {
  console.log(`  [${cond ? 'O' : 'X'}] ${name}${cond || !detail ? '' : '. ' + detail}`);
  if (!cond) bad++;
};

const KINDS = ['quick', 'board', 'sport', 'card', 'puzzle'];
const LENS = ['short', 'mid', 'long'];
const all = Array.from({ length: 51 }, (_, i) => ({
  id: 'g' + i, kind: KINDS[i % 5], length: LENS[i % 3]
}));

console.log('[pick6] 규율');
const fresh = pick6(all, {});
ok(fresh.length === SLOTS, `여섯 칸이 찬다`, String(fresh.length));
ok(new Set(fresh).size === fresh.length, '같은 게임이 두 번 안 나온다');

const kinds = {};
for (const id of fresh) kinds[all.find((g) => g.id === id).kind] = (kinds[all.find((g) => g.id === id).kind] || 0) + 1;
ok(Math.max(...Object.values(kinds)) <= 2, '한 갈래가 둘을 안 넘는다', JSON.stringify(kinds));

const lens = fresh.map((id) => all.find((g) => g.id === id).length);
ok(lens.filter((l) => l === 'long').length <= 1, '긴 판은 많아야 하나', lens.join(','));
ok(lens.filter((l) => l === 'short').length >= 2, '짧은 판이 최소 둘', lens.join(','));

/* ① 안 해 본 것 먼저. 절반을 해 봤다로 적으면 안 해 본 쪽만 떠야 한다. */
const played = {};
for (let i = 0; i < 40; i++) played['g' + i] = { n: 1, at: 1000 + i };
const after = pick6(all, played);
ok(after.every((id) => !played[id]), '안 해 본 것이 먼저 온다', after.join(','));

/* ⑤ 같은 상태 = 같은 여섯 */
ok(JSON.stringify(pick6(all, played)) === JSON.stringify(after), '같은 상태면 같은 여섯');

/* 다 해 봤으면 오래된 것부터 */
const allPlayed = {};
all.forEach((g, i) => { allPlayed[g.id] = { n: 1, at: 9000 - i }; });
const old = pick6(all, allPlayed);
const newest = all.slice(0, 6).map((g) => g.id);
ok(!old.some((id) => newest.includes(id)), '해 봤으면 오래된 것부터', old.join(','));

console.log('[pick6] 찾기');
ok(matches(['오목', 'board', '짧다'], '오목'), '이름으로 걸린다');
ok(matches(['오목', 'board', '짧다'], '짧'), '길이로 걸린다');
ok(matches(['오목', 'board', '짧다'], 'BOA'), '대소문자를 안 가린다');
ok(matches(['오목'], '   '), '빈 검색어면 다 보인다');
ok(!matches(['오목'], '체스'), '안 걸리는 것은 안 걸린다');

if (bad) { console.error(`[pick6] 실패 ${bad}건`); process.exit(1); }
console.log('[pick6] 통과. 안 해 본 것 먼저, 갈래, 길이 섞임, 같은 상태면 같은 여섯');
