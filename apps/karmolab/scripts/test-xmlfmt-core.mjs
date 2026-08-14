/**
 * XML 펴기·뭉치기·JSON 으로 — **값이 안 바뀌는가** (TASK-KL-238 / 42 codebeautify).
 *
 * 포맷터가 하면 안 되는 일은 하나다: **내용을 바꾸는 것.** 보기 좋게 편다면서 글자 안의 공백을
 * 먹거나 CDATA 를 풀어 버리면, 그 결과를 도로 쓰는 순간 시스템이 조용히 틀린다. 그래서 여기서
 * 크게 지키는 것은 「예쁘게 나오나」가 아니라 **펴고 뭉쳐도 같은 것인가**다.
 *
 * 사용: node scripts/test-xmlfmt-core.mjs   (npm run test:xmlfmt)
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
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

async function load() {
  const stamp = Date.now();
  const entry = path.join(os.tmpdir(), `xmlfmt-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/core/xmlfmt.ts'))};\n`);
  const out = path.join(os.tmpdir(), `xmlfmt-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const X = await load();

/* ── 편다 ── */
eq(
  X.run('format', { text: '<a><b>1</b><b>2</b></a>' }),
  '<a>\n  <b>1</b>\n  <b>2</b>\n</a>',
  '한 줄 XML 을 편다'
);
eq(X.run('format', { text: '<a><b>1</b></a>', indent: 4 }), '<a>\n    <b>1</b>\n</a>', '들여쓰기 칸 수를 받는다');
eq(X.run('format', { text: '<br/>' }), '<br />', '스스로 닫은 태그는 그 모양을 지킨다');
eq(X.run('format', { text: '<a></a>' }), '<a></a>', '빈 칸은 한 줄로');
eq(
  X.run('format', { text: '<?xml version="1.0"?>\n<a>x</a>' }),
  '<?xml version="1.0"?>\n<a>x</a>',
  '앞머리 선언을 지운 채로 내보내지 않는다'
);
eq(X.run('format', { text: '<a><!-- 메모 --><b/></a>' }), '<a>\n  <!-- 메모 -->\n  <b />\n</a>', '주석을 지우지 않는다');

/* ★ 값이 안 바뀌어야 한다 — CDATA 안은 원문 그대로. */
const cdata = '<a><![CDATA[ <b> 그대로 & 둔다 ]]></a>';
check(X.run('format', { text: cdata }).includes('<![CDATA[ <b> 그대로 & 둔다 ]]>'), 'CDATA 안은 손대지 않는다');
check(X.run('minify', { text: cdata }).includes('<![CDATA[ <b> 그대로 & 둔다 ]]>'), '뭉칠 때도 CDATA 는 그대로');

/* 속성은 순서·값을 지킨다 */
eq(
  X.run('minify', { text: '<a  x="1"   y="2" >t</a>' }),
  '<a x="1" y="2">t</a>',
  '속성은 순서·값 그대로, 사이 공백만 정리'
);
eq(X.run('minify', { text: '<a>\n  <b> 안쪽 글자 </b>\n</a>' }), '<a><b>안쪽 글자</b></a>', '태그 사이 공백만 버린다');

/* 펴고 뭉치면 처음 뭉친 것과 같아야 한다 (왕복) */
const src = '<rss version="2.0"><channel><title>제목</title><item><link>http://a/b?x=1&amp;y=2</link></item></channel></rss>';
eq(X.run('minify', { text: X.run('format', { text: src }) }), src, '펴고 다시 뭉치면 처음과 같다');

/* & 는 두 번 바뀌면 안 된다 — `&amp;` 가 `&amp;amp;` 가 되는 흔한 사고 */
eq(X.run('minify', { text: '<a>&amp; &lt; 짝</a>' }), '<a>&amp; &lt; 짝</a>', '이미 이스케이프된 것을 또 이스케이프하지 않는다');

/* ── JSON 으로 ── */
const json = JSON.parse(X.run('toJson', { text: '<a x="1"><b>t</b><b>u</b><c/></a>' }));
eq(json.a['@x'], '1', '속성은 @이름');
check(Array.isArray(json.a.b) && json.a.b.length === 2, '같은 이름이 여럿이면 배열');
eq(json.a.b[0], 't', '속성도 자식도 없으면 값 그 자체');
eq(JSON.stringify(json.a.c), '{}', '빈 칸은 빈 객체');
const mixed = JSON.parse(X.run('toJson', { text: '<a x="1">글자<b/></a>' }));
eq(mixed.a['#text'], '글자', '섞여 있으면 글자는 #text 로');

/* ── 틀린 것은 어디서 틀렸는지 ── */
const bad = (text) => {
  try {
    X.run('format', { text });
    return null;
  } catch (e) {
    return e;
  }
};
let e = bad('<a>\n<b>x</a>');
check(e !== null && /b/.test(e.message) && /a/.test(e.message), '엇갈려 닫으면 두 이름을 다 말한다');
check(e !== null && /2번째 줄/.test(e.message), '틀린 줄 번호를 짚는다');
e = bad('<a><b></b>');
check(e !== null && /안 닫혔습니다/.test(e.message), '안 닫힌 태그를 잡는다');
e = bad('<a x=1></a>');
check(e !== null && /따옴표/.test(e.message), '따옴표 없는 속성 값을 잡는다');
e = bad('   ');
check(e !== null, '빈 입력은 던진다');
e = bad('<a><!-- 안 닫힌 주석 </a>');
check(e !== null && /주석/.test(e.message), '안 닫힌 주석을 잡는다');

/* 없는 연산 */
let threw = false;
try { X.run('nope', { text: '<a/>' }); } catch { threw = true; }
check(threw, '없는 연산은 던진다');

process.stdout.write('\n');
if (failures.length) {
  console.error(`\nXML 다루기 — ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('XML 다루기 — 전부 통과');
