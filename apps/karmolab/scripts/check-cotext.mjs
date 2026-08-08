// 함께 편집 규칙(RGA) 수렴 시험 — 라이브러리 없이, 진짜 무작위로 흔들어 본다.
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const out = path.join(mkdtempSync(path.join(os.tmpdir(),'cotext-')),'cotext.mjs');
await build({ entryPoints:['src/cotext.ts'], outfile: out, format:'esm', bundle:true });
const { pathToFileURL } = await import('node:url');
const { CoText } = await import(pathToFileURL(out).href);

let fail = 0;
const check = (name, cond, extra='') => { if(!cond){ fail++; console.log('✗',name,extra);} else console.log('✓',name); };

// ① 둘이 같은 자리에 동시에 넣어도 두 화면이 같은 글에 닿는다
for (let trial=0; trial<200; trial++) {
  const a = new CoText('a'), b = new CoText('b');
  const opsA=[], opsB=[];
  for (const ch of 'hello') opsA.push(a.localInsert(a.text.length, ch));
  // b 는 a 의 연산을 받은 뒤 자기 것을 만든다
  opsA.forEach(op=>b.apply(op));
  const posA = Math.floor(Math.random()*6), posB = Math.floor(Math.random()*6);
  const oa = a.localInsert(posA, 'X');
  const ob = b.localInsert(posB, 'Y');
  // 서로의 연산을 (뒤죽박죽 순서로) 받는다
  a.apply(ob); b.apply(oa);
  if (a.text !== b.text) { check('동시 삽입 수렴', false, `${a.text} vs ${b.text}`); break; }
}
if (!fail) check('동시 삽입 수렴 200회', true);

// ② 지우기와 넣기가 엇갈려도 수렴
for (let trial=0; trial<200; trial++) {
  const a = new CoText('a'), b = new CoText('b');
  const seed=[];
  for (const ch of 'abcdef') seed.push(a.localInsert(a.text.length, ch));
  seed.forEach(op=>b.apply(op));
  const oa = a.localDelete(1+Math.floor(Math.random()*6));
  const ob = b.localInsert(Math.floor(Math.random()*7), 'Z');
  if (oa) b.apply(oa);
  a.apply(ob);
  if (a.text !== b.text) { check('삭제/삽입 수렴', false, `${a.text} vs ${b.text}`); break; }
}
if (!fail) check('삭제/삽입 수렴 200회', true);

// ③ 같은 연산을 두 번 받아도 한 번만 (그물이 겹칠 수 있다)
{
  const a = new CoText('a'), b = new CoText('b');
  const op = a.localInsert(0,'k');
  b.apply(op); b.apply(op);
  check('중복 수신 무시', b.text==='k', b.text);
}

// ④ 화면 글자를 통째로 바꿔도 가운데만 연산이 된다
{
  const a = new CoText('a');
  a.diffTo('hello world');
  const ops = a.diffTo('hello brave world');
  check('가운데만 고침', ops.length===6, `${ops.length}개 (${a.text})`);
  check('결과 일치', a.text==='hello brave world', a.text);
}

// ⑤ 셋이 동시에 쳐도 수렴
for (let trial=0; trial<100; trial++) {
  const sites=['a','b','c'].map(id=>new CoText(id));
  const seed=[]; for (const ch of 'seed') seed.push(sites[0].localInsert(sites[0].text.length,ch));
  sites.slice(1).forEach(s=>seed.forEach(op=>s.apply(op)));
  const made=sites.map((s,i)=>s.localInsert(Math.floor(Math.random()*5), String(i)));
  sites.forEach((s,i)=>made.forEach((op,j)=>{ if(i!==j) s.apply(op); }));
  const texts=new Set(sites.map(s=>s.text));
  if (texts.size!==1) { check('3인 수렴', false, [...texts].join(' | ')); break; }
}
if (!fail) check('3인 수렴 100회', true);

console.log(fail? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail?1:0);
