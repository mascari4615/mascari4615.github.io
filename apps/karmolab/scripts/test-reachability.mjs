/**
 * 나만 안 되나? 판정. **모르는 것을 모른다고 하는가** (TASK-KL-238 / 45 downdetector).
 *
 * 이런 도구가 가장 크게 해를 끼치는 방식은 안 된다를 자신 있게 잘못 말하는 것이다.
 * 대조군이 반반이면 판정을 **보류**해야 하고, 대조군을 안 쟀으면 아무 말도 하면 안 된다.
 * 그래서 여기서 지키는 것은 맞히는 능력이 아니라 **함부로 말하지 않는 규율**이다.
 *
 * 사용: node scripts/test-reachability.mjs   (npm run test:reach)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: ${got} (기대 ${want})`);

async function load() {
  const stamp = Date.now();
  const entry = path.join(os.tmpdir(), `reach-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/reachability.ts'))};\n`);
  const out = path.join(os.tmpdir(), `reach-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const R = await load();
const ok = (name, ms = 100) => ({ name, ok: true, ms });
const no = (name) => ({ name, ok: false });

/* 된다 / 느리다 */
eq(R.verdict({ target: ok('t', 100), controls: [ok('a'), ok('b')] }), 'up', '대상이 되면 된다');
eq(R.verdict({ target: ok('t', R.SLOW_MS), controls: [ok('a')] }), 'slow', '오래 걸리면 느리다고 말한다');
eq(R.verdict({ target: ok('t', R.SLOW_MS - 1), controls: [ok('a')] }), 'up', '기준 미만은 그냥 된다');

/* 내 쪽 / 저쪽 */
eq(R.verdict({ target: no('t'), controls: [no('a'), no('b')] }), 'mine', '대조군도 다 죽으면 내 쪽');
eq(R.verdict({ target: no('t'), controls: [ok('a'), ok('b')] }), 'theirs', '대조군이 다 살면 저쪽');

/* ★ 모르면 모른다 */
eq(R.verdict({ target: no('t'), controls: [ok('a'), no('b')] }), 'unclear', '대조군 반반이면 판정 보류');
eq(R.verdict({ target: no('t'), controls: [] }), 'unclear', '대조군이 없으면 아무 말도 안 한다');

/* 주소 만들기 */
eq(R.toUrl('naver.com'), 'https://naver.com', '스킴이 없으면 https 를 붙인다');
eq(R.toUrl('  https://a.com/b  '), 'https://a.com/b', '앞뒤 공백, 경로를 지킨다');
eq(R.toUrl('http://a.com/'), 'http://a.com', '끝의 빗금 하나는 지운다');
eq(R.toUrl('localhost:8813'), 'https://localhost:8813', 'localhost 는 점이 없어도 받는다');
eq(R.toUrl('사이트'), null, '점 없는 이름은 오타로 본다');
eq(R.toUrl(''), null, '빈 칸은 null');
eq(R.toUrl('   '), null, '공백만도 null');
eq(R.toUrl('ht!tp://x'), null, '주소가 아니면 null');

eq(R.hostOf('https://a.b.com/x?y=1'), 'a.b.com', '크게 쓸 이름은 호스트');
eq(R.hostOf('그냥 글자'), '그냥 글자', '주소가 아니면 그대로 돌려준다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n나만 안 되나. ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('나만 안 되나. 전부 통과');
