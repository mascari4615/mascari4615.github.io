/**
 * 알맹이가 브라우저 없이도 도는지 확인한다 (S1 — 흡수계획 06)
 *
 * 왜 있나: `src/core/` 의 값어치는 전부 **화면 밖에서도 돈다**는 한 가지 성질에서 나온다.
 * 그 성질이 깨지면 주소 호출도, AI 에이전트(MCP)도, 이 시험 자체도 함께 죽는다 — 그런데
 * 화면은 멀쩡하니 아무도 모른다. 그래서 성질 자체를 여기서 잠근다.
 *
 * 세 겹으로 본다.
 *  ① **금지어** — 알맹이 파일이 document·window·Toolbox 따위를 쓰면 그 자리에서 실패.
 *     주석으로 「쓰지 마라」 적어 두는 것과 검사가 잡는 것은 다르다.
 *  ② **Node 에서 진짜 실행** — esbuild 로 묶어 불러와 답을 맞춰 본다. 브라우저를 안 띄운다.
 *  ③ **주소 규약** — `?op=…` 을 읽고 쓰는 길이 spec 과 어긋나지 않는지.
 *
 * 사용: node scripts/test-core.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const coreDir = path.join(root, 'src/core');

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 가 나왔다 (기대 「${want}」)`);

/** 주석과 문자열을 지운 뒤 본다 — 설명글에 적힌 낱말까지 잡으면 검사가 성가신 것이 된다. */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

// ── ① 금지어 ────────────────────────────────────────────────────────────────
const FORBIDDEN = ['document', 'window', 'Toolbox', 'Mdd', 'localStorage', 'sessionStorage', 'fetch', 'alert'];
const coreFiles = fs
  .readdirSync(coreDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.join(coreDir, f));

check(coreFiles.length > 0, 'src/core 에 알맹이 파일이 하나도 없다');

for (const file of coreFiles) {
  const body = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
  for (const word of FORBIDDEN) {
    const hit = new RegExp(`\\b${word}\\b`).test(body);
    check(hit === false, `${path.basename(file)} 가 「${word}」 를 쓴다 — 알맹이는 Node 에서도 돌아야 한다`);
  }
}

// ── 묶어서 불러오기 (Node 는 .ts 를 그대로 못 읽는다) ─────────────────────────
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karmolab-core-'));
async function load(relative) {
  const outfile = path.join(outDir, relative.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs'));
  await esbuild.build({
    entryPoints: [path.join(root, relative)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    logLevel: 'silent'
  });
  return import(pathToFileURL(outfile).href);
}

// ── ② base64 알맹이 ─────────────────────────────────────────────────────────
const b64 = await load('src/core/base64.ts');

eq(b64.spec.id, 'base64', 'spec.id 가 파일 이름과 다르다');
check('encode' in b64.spec.ops && 'decode' in b64.spec.ops, 'spec.ops 에 encode·decode 가 있어야 한다');

eq(b64.encode('hello'), 'aGVsbG8=', '영문 인코딩');
eq(b64.decode('aGVsbG8='), 'hello', '영문 디코딩');

// 이 도구가 있는 이유 자체 — btoa 만 쓰면 여기서 터진다.
eq(b64.encode('안녕하세요'), '7JWI64WV7ZWY7IS47JqU', '한글 인코딩');
eq(b64.decode('7JWI64WV7ZWY7IS47JqU'), '안녕하세요', '한글 디코딩');
eq(b64.decode(b64.encode('🦴 뼈 emoji')), '🦴 뼈 emoji', '이모지 왕복');

// URL-safe: + / 가 안 나오고 = 도 안 붙는다.
const safe = b64.encode('~~~???', true);
check(/[+/=]/.test(safe) === false, `URL-safe 인데 +/= 가 남았다: ${safe}`);
eq(b64.decode(safe), '~~~???', 'URL-safe 왕복');

// 받침 없는 = 을 채워 읽는가 (주소에 실린 값은 대개 = 이 잘려 온다).
eq(b64.decode('aGVsbG8'), 'hello', '= 빠진 값 읽기');
eq(b64.decode('  aGVs bG8=  '), 'hello', '공백 섞인 값 읽기');

eq(b64.byteLength('안녕'), 6, '한글 바이트 수');
eq(b64.byteLength(''), 0, '빈 글자 바이트 수');

// ── ③ 주소 규약 ─────────────────────────────────────────────────────────────
const url = await load('src/lib/tool-url.ts');

check(url.readInvocation(b64.spec, '') === null, 'op 이 없으면 평소대로 열려야 한다(null)');

const enc = url.readInvocation(b64.spec, '?op=encode&text=%EC%95%88%EB%85%95');
eq(enc.error, undefined, 'encode 호출에 오류가 없어야 한다');
eq(enc.op, 'encode', 'op 을 읽는다');
eq(enc.args.text, '안녕', '한글 파라미터를 읽는다');
check(enc.args.urlSafe === undefined, '안 준 선택 칸은 비어 있어야 한다');

const flag = url.readInvocation(b64.spec, '?op=encode&text=a&urlSafe=true');
eq(flag.args.urlSafe, true, 'true 를 읽는다');
eq(url.readInvocation(b64.spec, '?op=encode&text=a&urlSafe').args.urlSafe, true, '값 없이 적은 켬 표시');
eq(url.readInvocation(b64.spec, '?op=encode&text=a&urlSafe=0').args.urlSafe, false, '0 은 끔');

// 조용히 틀리지 않는가 — 잘못된 호출은 말을 해야 한다.
check(url.readInvocation(b64.spec, '?op=엉뚱').error !== undefined, '없는 연산은 오류를 말해야 한다');
check(url.readInvocation(b64.spec, '?op=encode').error !== undefined, '빠진 값은 오류를 말해야 한다');
eq(url.readInvocation(b64.spec, '?op=encode&text=a&out=raw').raw, true, 'out=raw 를 읽는다');

// 만든 링크를 되읽으면 같은 값이 나오는가 (한 바퀴).
const link = url.buildToolUrl(b64.spec, 'encode', { text: '안녕 & 반가워', urlSafe: true });
check(link.startsWith('/karmolab/t/base64/?'), `링크 앞부분이 다르다: ${link}`);
const back = url.readInvocation(b64.spec, link.slice(link.indexOf('?')));
eq(back.args.text, '안녕 & 반가워', '링크 왕복 — 텍스트');
eq(back.args.urlSafe, true, '링크 왕복 — 켬');

let threw = false;
try {
  url.buildToolUrl(b64.spec, 'encode', { 없는칸: 1 });
} catch {
  threw = true;
}
check(threw, 'spec 에 없는 칸을 넣으면 던져야 한다');

// ── 마무리 ──────────────────────────────────────────────────────────────────
fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-core] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[test-core] 알맹이 ${coreFiles.length}개 · 검사 전부 통과`);
