/**
 * 미리보기 자르기, 판정. **거짓 숫자를 안 내는가** (TASK-KL-238 / 17 squoosh).
 *
 * 눌러 보기 전에 알려 준다는 도구는 잘못 알려 주면 그냥 해롭다. 여기서 지키는 것 둘:
 *   ① 줄어든 비율은 **늘 양수**이고 방향은 따로 말한다 (-559% 줄었다가 나오면 안 된다)
 *   ② 원본보다 큰 자리를 떼어 달라고 하지 않는다 (검은 띠를 압축 자국으로 오해한다)
 *
 * 사용: node scripts/test-imgpreview.mjs   (npm run test:ipreview)
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
  const entry = path.join(os.tmpdir(), `ipreview-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/imgpreview.ts'))};\n`);
  const out = path.join(os.tmpdir(), `ipreview-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const P = await load();

/* 가운데를 뗀다 */
{
  const c = P.centerCrop(1000, 800, 200, 100, 2);
  eq(c.sw, 100, '보이는 칸의 절반만 뗀다 (가로)');
  eq(c.sh, 50, '보이는 칸의 절반만 뗀다 (세로)');
  eq(c.sx, 450, '가운데에서 뗀다 (가로)');
  eq(c.sy, 375, '가운데에서 뗀다 (세로)');
}
{
  // ★ 원본이 작으면 넘겨서 떼지 않는다
  const c = P.centerCrop(40, 30, 400, 300, 2);
  eq(c.sw, 40, '원본보다 넓게 떼지 않는다');
  eq(c.sh, 30, '원본보다 높게 떼지 않는다');
  eq(c.sx, 0, '다 뗐으면 왼쪽 끝');
  eq(c.sy, 0, '다 뗐으면 위쪽 끝');
}
{
  const c = P.centerCrop(1000, 800, 10, 10, 100);
  check(c.sw >= 1 && c.sh >= 1, '아무리 확대해도 0칸을 떼지 않는다');
}

/* 얼마나 줄었나. 방향은 kind, 크기는 늘 양수 */
{
  const s = P.saving(1000, 400);
  eq(s.kind, 'smaller', '작아지면 smaller');
  eq(s.pct, 60, '60% 줄었다');
}
{
  const s = P.saving(1000, 6590);
  eq(s.kind, 'bigger', '커지면 bigger');
  check(s.pct > 0, '커져도 비율은 양수 (-559% 줄었다 금지)');
}
eq(P.saving(1000, 1000).kind, 'same', '그대로면 same');
eq(P.saving(0, 100).kind, 'same', '0 바이트 원본은 나눌 수 없다. 지어내지 않는다');
eq(P.saving(1000, 999).kind, 'same', '반올림해서 0% 면 같다고 말한다');

/* 여러 장 어림 */
eq(P.estimateTotal(10000, 1000, 400), 4000, '한 장 비율로 전체를 어림한다');
eq(P.estimateTotal(0, 1000, 400), null, '전체가 0 이면 어림하지 않는다');
eq(P.estimateTotal(10000, 0, 400), null, '표본이 0 이면 어림하지 않는다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n미리보기. ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('미리보기. 전부 통과');
