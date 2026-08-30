/**
 * 논문에게 묻기. **지어내지 않는가** (TASK-KL-238 / 34, 35, 38).
 *
 * 이런 도구의 유일한 죄는 논문이 이렇게 말했다를 **만들어 내는 것**이다. 그래서 여기서 재는 것:
 *   ① 뽑은 문장이 초록에 **실제로 있는 문장 그대로**인가
 *   ② 물음과 아무 상관 없으면 **아무것도 안 내놓는가**
 *   ③ 뒤집힌 초록을 되돌릴 때 빠진 낱말을 지어내지 않는가
 *
 * 사용: node scripts/test-paperask.mjs   (npm run test:paperask)
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

async function load(rel, name) {
  const stamp = Date.now() + name;
  const entry = path.join(os.tmpdir(), `pa-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, rel))};\n`);
  const out = path.join(os.tmpdir(), `pa-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const A = await load('src/lib/paperask.ts', 'ask');
const O = await load('src/lib/openalex.ts', 'oa');

/* ── 뒤집힌 초록 되돌리기 ── */
eq(O.abstractOf({ Deep: [0], learning: [1], works: [2] }), 'Deep learning works', '자리를 도로 맞춘다');
eq(O.abstractOf({ a: [0, 2], b: [1] }), 'a b a', '같은 낱말이 여러 자리에 있어도 된다');
eq(O.abstractOf(null), undefined, '없으면 undefined');
eq(O.abstractOf({}), undefined, '빈 목록도 undefined');
{
  // ★ 빠진 자리를 지어내지 않는다. 없는 낱말은 그냥 비운다
  const got = O.abstractOf({ start: [0], end: [3] });
  check(got.startsWith('start') && got.endsWith('end') && !/undefined|null/.test(got), '빠진 칸을 지어내지 않는다');
}
eq(O.abstractOf({ x: [-1] }), undefined, '이상한 자리는 버린다');

/* ── 문장 자르기 ── */
{
  const s = A.sentences('We use e.g. CNNs. Results show gains. Fig. 2 is nice.');
  eq(s.length, 3, '약어의 마침표에서 안 끊는다');
  check(s[0].includes('e.g.'), '약어를 원래대로 되돌린다');
}

/* ── 답 고르기 ── */
const ABS =
  'Transformers are neural networks. ' +
  'We show that attention improves translation quality significantly. ' +
  'The dataset contains one million sentence pairs.';
{
  const picks = A.answerSentences(ABS, 'does attention improve translation?', 2);
  check(picks.length > 0, '물음에 답할 문장을 고른다');
  check(picks[0].sentence.includes('attention improves translation'), '결론 문장을 앞에 둔다');
  // ★ 뽑은 문장은 **초록에 그대로 있어야 한다**
  check(picks.every((p) => ABS.includes(p.sentence)), '뽑은 문장은 원문 그대로다 (지어내기 금지)');
}
eq(A.answerSentences(ABS, '', 2).length, 0, '물음이 비면 아무것도 안 고른다');
eq(A.answerSentences(ABS, '김치 담그는 법', 2).length, 0, '상관없는 물음에는 아무 문장도 안 준다');
eq(A.answerSentences('', 'attention', 2).length, 0, '초록이 없으면 빈 목록');

/* ── 여러 편 ── */
{
  const papers = [
    { id: 'W1', year: 2017, cited: 90000, abstract: ABS },
    { id: 'W2', year: 2020, cited: 10, abstract: 'Unrelated cooking recipes about kimchi.' },
    { id: 'W3', year: 2019, cited: 500 } // 초록 없음
  ];
  const answered = A.askPapers(papers, 'attention translation quality');
  eq(answered.length, 1, '답한 논문만 남긴다 (숫자를 부풀리지 않는다)');
  eq(answered[0].paper.id, 'W1', '답한 것이 맞는 편이다');

  const t = A.tally(papers, answered);
  eq(t.asked, 3, '물어본 편수');
  eq(t.answered, 1, '답한 편수');
  eq(t.fromYear, 2017, '답한 것들의 첫 해');
  eq(t.topCited, 90000, '가장 많이 인용된 편');
  eq(A.tally([], []), null, '물어본 게 없으면 셈도 없다');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n논문에게 묻기. ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('논문에게 묻기. 전부 통과');
