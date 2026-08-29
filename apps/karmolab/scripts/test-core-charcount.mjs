/**
 * 코어(MCP, 사슬이 쓰는 알맹이)도 **사람 눈대로** 세는가 (TASK-KL-276).
 *
 * 화면 도구는 고쳤는데([[TASK-KL-275]]) 코어가 옛 방식이면 **같은 글에 두 수**가 나온다 . 
 * 화면은 9자, MCP 는 13자. 게다가 코어의 설명문에는 이미
 * Emoji count as one character as a person sees them 이라고 **적혀 있었다**(구현만 안 그랬다).
 * 적어 둔 말과 하는 일이 다른 게 제일 나쁘다. 부르는 쪽이 확인할 방법이 없다.
 *
 * 사용: node scripts/test-core-charcount.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'corecc-'));
const out = join(dir, 'cc.mjs');
await build({ entryPoints: ['src/core/charcount.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { run } = await import(pathToFileURL(out).href);

const failures = [];
/** 공백 포함 N자 를 답에서 읽는다 */
const counted = (text) => Number((String(run('count', { text })).match(/공백 포함 (\d+)자/) || [])[1]);
const eq = (got, want, why) => {
  if (got === want) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why}. 기대 ${want}, 나온 것 ${got}`);
  }
};

eq(counted('안녕하세요'), 5, '한글 다섯 자');
eq(counted('👍'), 1, '이모지 하나');
eq(counted('👨‍👩‍👧'), 1, '가족 이모지. 예전엔 5');
eq(counted('🇰🇷'), 1, '국기. 예전엔 2');
eq(counted('👨‍👩‍👧 안녕 café'), 9, '섞인 글. 예전엔 13');
eq(counted('é'.normalize('NFD')), 1, 'NFD 로 풀린 é');

/* 한도 확인(`fits`)도 같은 수를 써야 한다. 한쪽만 고치면 9자인데 한도 초과가 뜬다 */
{
  const said = String(run('fits', { text: '👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧', basis: 'withSpace', limit: 3 }));
  if (/통과/.test(said)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`가족 이모지 셋은 한도 3 에 들어간다. 나온 것 ${said.split('\n')[0]}`);
  }
}

/* 갈래별 세기는 코드포인트 그대로여도 된다. 다만 글자 수와 뜻이 다르다는 걸 지킨다 */
{
  const said = String(run('count', { text: '가나다' }));
  if (/한글 3/.test(said)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('갈래별 세기(한글 3)는 그대로여야 한다');
  }
}

process.stdout.write('\n');
rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error(`[test-core-charcount] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-core-charcount] 코어도 사람 눈대로 센다');
