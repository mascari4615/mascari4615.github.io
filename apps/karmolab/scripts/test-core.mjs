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
import { SOURCE_LOCALE } from './lib/locales.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const coreDir = path.join(root, 'src/core');

/**
 * 노드에서 `t()` 가 원본 열쇠를 그대로 뱉지 않게, 원본 로케일 묶음을 미리 박는다.
 *
 * 브라우저는 `build-i18n` 이 `window.__KARMO_I18N` 을 채워 주지만, 이 시험은 브라우저 없이
 * core 모듈을 직접 부르므로 같은 상태를 손으로 맞춰 줘야 한다.
 */
globalThis.window = {
  __KARMO_LOCALE: SOURCE_LOCALE,
  __KARMO_I18N: {
    [SOURCE_LOCALE]: Object.fromEntries(
      fs
        .readdirSync(path.join(root, 'i18n', SOURCE_LOCALE))
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(root, 'i18n', SOURCE_LOCALE, f), 'utf8'))])
    )
  }
};

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

// ── ②-2 hashgen 알맹이 ──────────────────────────────────────────────────────
// 계산기를 밖에서 받는 구조라, 여기선 node:crypto 를 손으로 준다. 브라우저는 CryptoJS 를 준다 —
// 같은 알맹이에 다른 손. 두 손이 같은 답을 내는지는 smoke-core-parity.mjs 가 본다.
const crypto = await import('node:crypto');
const hg = await load('src/core/hashgen.ts');

// SHA3_512·KECCAK512 는 알맹이가 직접 계산하므로 이 계산기로 안 온다 (오면 던져서 알려 준다).
const NODE_ALGO = { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512', RIPEMD160: 'ripemd160' };
const nodeBackend = (algo, text) => {
  const name = NODE_ALGO[algo];
  if (name === undefined) throw new Error(`계산기에 오면 안 되는 알고리즘이 왔다: ${algo}`);
  return crypto.createHash(name).update(text, 'utf8').digest('hex');
};

// ── ②-1 SHA-3 을 우리가 직접 쓴 것 — 정답지(OpenSSL)와 대조 ────────────────────
// 「암호를 직접 짜지 마라」의 예외로 삼은 근거가 이 블록이다. 눈으로 「맞겠지」 하는 자리를 없앤다.
const s3 = await load('src/core/sha3.ts');

for (const bits of [224, 256, 384, 512]) {
  for (const sample of ['', 'a', 'KarmoLab', '안녕하세요', '🦴 뼈', 'x'.repeat(200)]) {
    eq(s3.sha3(sample, bits), crypto.createHash(`sha3-${bits}`).update(sample, 'utf8').digest('hex'), `SHA3-${bits} 「${sample.slice(0, 12)}」`);
  }
}

// 흡수 구간 경계(rate)에서 채움이 틀리기 쉽다 — 길이를 1바이트씩 밀며 전부 대 본다.
let fuzzBad = 0;
for (let len = 0; len < 400; len++) {
  const sample = 'z'.repeat(len);
  if (s3.sha3(sample, 512) !== crypto.createHash('sha3-512').update(sample).digest('hex')) fuzzBad++;
}
check(fuzzBad === 0, `길이 0~399 중 ${fuzzBad}개가 OpenSSL 과 다르다 (채움·경계 문제)`);

// 무작위 바이트로도. 여기까지 맞으면 「우연히 맞았다」가 아니다.
let randBad = 0;
for (let i = 0; i < 300; i++) {
  const buf = crypto.randomBytes(1 + Math.floor(Math.random() * 300));
  const hex = s3.keccakHex(new Uint8Array(buf), 512, 0x06);
  if (hex !== crypto.createHash('sha3-512').update(buf).digest('hex')) randBad++;
}
check(randBad === 0, `무작위 300건 중 ${randBad}건이 OpenSSL 과 다르다`);

// Keccak(표준화 이전)은 OpenSSL 에 없다. 널리 알려진 값으로 못 박는다.
eq(
  s3.keccak('', 512),
  '0eab42de4c3ceb9235fc91acffe746b29c29a8c366b7c60e4e67c466f36a4304c00fa9caf9d87976ba469bcbe06713b435f091ef2769fb160cdab33d3670680e',
  'Keccak-512 빈 글자 (알려진 값)'
);
check(s3.keccak('a', 512) !== s3.sha3('a', 512), 'Keccak 과 SHA-3 은 달라야 한다 (채움 한 바이트 차이)');

eq(hg.spec.id, 'hashgen', 'hashgen spec.id');
eq(hg.hashAll('KarmoLab', nodeBackend).find((r) => r.algo === 'SHA3_512').hex, crypto.createHash('sha3-512').update('KarmoLab').digest('hex'), '알맹이가 직접 낸 SHA3-512 가 OpenSSL 과 같다');
const rows = hg.hashAll('KarmoLab', nodeBackend);
eq(rows.length, 7, '알고리즘 7종이 나온다');
eq(rows[0].algo, 'MD5', '흔한 것부터 보여 준다');
eq(rows.find((r) => r.algo === 'SHA256').hex, crypto.createHash('sha256').update('KarmoLab').digest('hex'), 'SHA-256 값');
eq(hg.hashAll('', nodeBackend)[0].hex, '', '빈 글자는 빈 값 (0 을 해시하지 않는다)');
eq(hg.hashAll('a', nodeBackend, true)[0].hex, nodeBackend('MD5', 'a').toUpperCase(), '대문자 표기');

// 남이 준 체크섬은 지저분하게 온다 — 그걸 못 맞추면 「같은 파일인데 다르다」가 된다.
eq(hg.normalizeExpected('  ABCDEF  '), 'abcdef', '공백·대문자 정리');
eq(hg.normalizeExpected('sha256:ABCdef'), 'abcdef', '머리말 떼기');
eq(hg.normalizeExpected('ab cd\nef'), 'abcdef', '줄바꿈 섞인 값');
const fileHashes = { 'SHA-256': 'deadbeef', 'SHA-1': 'cafe' };
eq(hg.findMatch(fileHashes, 'DEADBEEF'), 'SHA-256', '대문자로 줘도 찾는다');
eq(hg.findMatch(fileHashes, 'sha256: deadbeef'), 'SHA-256', '머리말 붙여 줘도 찾는다');
eq(hg.findMatch(fileHashes, '0000'), null, '없으면 null');
eq(hg.findMatch(fileHashes, '   '), null, '빈 값이면 null');
eq(hg.bufToHex(new Uint8Array([0, 1, 255]).buffer), '0001ff', '16진수 표기 (0 채움)');

// ── ②-3 epoch 알맹이 ────────────────────────────────────────────────────────
const ep = await load('src/core/epoch.ts');

eq(ep.spec.id, 'epoch', 'epoch spec.id');

// 예전에 여기서 서기 5만 년이 나왔다. 네 단위가 같은 순간을 가리켜야 한다.
const SEC = 1750000000;
eq(ep.parseTimestamp(String(SEC)).ms, SEC * 1000, '10자리 = 초');
eq(ep.parseTimestamp(String(SEC * 1000)).ms, SEC * 1000, '13자리 = 밀리초');
eq(ep.parseTimestamp(String(SEC * 1000) + '000').ms, SEC * 1000, '16자리 = 마이크로초');
eq(ep.parseTimestamp(String(SEC * 1000) + '000000').ms, SEC * 1000, '19자리 = 나노초');
eq(ep.parseTimestamp('1750000000').unit.key, 'sec', '무엇으로 읽었는지 key 로 든다');
eq(ep.parseTimestamp('1750000000000000000').unit.key, 'ns', '나노초라고 말한다');
eq(ep.unitKo('sec'), '초 (10자리)', 'unit key → 한국어');
check(new Date(ep.parseTimestamp('1750000000000000000').ms).getUTCFullYear() < 3000, '나노초를 밀리초로 읽어 5만 년이 나오면 안 된다');

eq(ep.parseTimestamp(''), null, '빈 값은 null');
eq(ep.parseTimestamp('abc'), null, '숫자가 없으면 null');
eq(ep.parseTimestamp('1,750,000,000').ms, SEC * 1000, '쉼표 섞여 와도 읽는다');

// 「지금」을 인자로 받으므로 답이 흔들리지 않는다.
const NOW = 1_750_000_000_000;
eq(ep.humanDelta(NOW, NOW), '방금', '같은 순간');
eq(ep.humanDelta(NOW - 3 * 86400000, NOW), '3일 전', '과거');
eq(ep.humanDelta(NOW + 2 * 3600000, NOW), '2시간 후', '미래');
eq(ep.humanDeltaParts(NOW, NOW).tense, 'now', '같은 순간은 now');
eq(ep.humanDeltaParts(NOW + 2 * 3600000, NOW).tense, 'future', '미래 tense');

const epRows = ep.stampRows(NOW, NOW);
eq(epRows.length, 9, '보여 줄 줄 수');
eq(epRows.find(([k]) => k === '초 (10자리)')[1], String(SEC), '초 값');
eq(epRows.find(([k]) => k === 'ISO 8601')[1], new Date(NOW).toISOString(), 'ISO 값');
eq(ep.weekdayKo(2), '화', '요일 key → 한국어');
eq(ep.toLocalInput(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02T03:04:05', 'datetime-local 모양 (로컬 시간대)');

// ── ②-4 bizno 알맹이 (한국 규칙 — LLM 이 자릿수만 맞춰 지어내는 자리) ────────
const bz = await load('src/core/bizno.ts');

eq(bz.spec.id, 'bizno', 'bizno spec.id');
// 검증 숫자를 규칙대로 만들어 스스로 대 본다 (특정 실제 사업자 번호를 박지 않는다).
const bizBody = '123456789';
const bizExpect = bz.checkBiz(bizBody + '0').expect;
check(bz.checkBiz(bizBody + String(bizExpect)).ok === true, '규칙대로 만든 번호는 통과해야 한다');
check(bz.checkBiz(bizBody + String((bizExpect + 1) % 10)).ok === false, '검증 숫자를 하나 틀리면 걸러야 한다');
eq(bz.checkBiz('12345'), null, '10자리가 아니면 null');
eq(bz.checkBiz('12345678a0'), null, '숫자가 아니면 null');
eq(bz.onlyDigits('123-45-67890'), '1234567890', '하이픈을 떼고 본다');
eq(bz.formatBiz('1234567890'), '123-45-67890', '표기 모양');
eq(bz.kindOf('01'), 'Individual taxable business', '가운데 두 자리 = 사업자 구분 (01)');
eq(bz.kindOf('80'), 'Religious organization', '80');
eq(bz.kindOf('81'), 'For-profit corporation HQ', '81');
eq(bz.kindOf('89'), 'Non-profit corporation HQ/branch', '89');
eq(bz.kindOf('90'), 'Individual tax-free business / non-profit', '90');
const corpExpect = bz.checkCorp('123456789012' + '0').expect;
check(bz.checkCorp('123456789012' + String(corpExpect)).ok === true, '법인번호도 규칙대로면 통과');
check(bz.run('check', { number: '123-45-6789' + String(bizExpect) }).includes('Check digit: valid'), 'run 이 사람 말로 답한다');
check(bz.run('check', { number: '1234567890' }).includes('National Tax Service'), '형식 경계를 반드시 말한다');

// ── ②-5 birth 알맹이 (한국 나이 3종 — 쓰는 곳마다 답이 다르다) ───────────────
const bi = await load('src/core/birth.ts');
const TODAY = new Date(2026, 7, 9); // 2026-08-09

eq(bi.spec.id, 'birth', 'birth spec.id');
const info = bi.birthInfo('1990-05-05', TODAY);
eq(info.age, 36, '만 나이 (생일 지남)');
eq(info.yearAge, 36, '연 나이');
eq(info.koreanAge, 37, '세는 나이');
eq(bi.birthInfo('1990-12-25', TODAY).age, 35, '만 나이 (생일 아직 — 하나 뺀다)');
eq(bi.birthInfo('1990-08-09', TODAY).age, 36, '생일 당일은 이미 지난 것으로 센다');
eq(bi.birthInfo('1990-08-09', TODAY).untilNext, 0, '생일 당일은 0일 남음');
eq(bi.birthInfo('1990-08-10', TODAY).untilNext, 1, '내일 생일');

eq(info.zodiacIndex, 10, '1990년생 = 말띠 index');
eq(bi.zodiacKo(info.zodiacIndex), '말', '띠 index → 한국어');
eq(bi.signOf(1, 19), '염소자리', '1/19 = 염소자리 (경계)');
eq(bi.signOf(1, 20), '물병자리', '1/20 = 물병자리 (경계)');
eq(bi.signOf(12, 21), '사수자리', '12/21 = 사수자리 (경계)');
eq(bi.signOf(12, 22), '염소자리', '12/22 = 염소자리 (경계)');
eq(bi.birthInfo('2000-02-29', TODAY).weekdayIndex, 2, '윤년 2/29 는 화요일 index');
eq(bi.weekdayKo(2), '화', '요일 index → 한국어');
eq(bi.gemKo(5), '에메랄드', '탄생석 month → 한국어');

eq(bi.birthInfo('1990-02-30', TODAY), null, '없는 날짜는 null (Date 가 3월로 넘기는 것을 막는다)');
eq(bi.birthInfo('2030-01-01', TODAY), null, '미래 생일은 null');
eq(bi.birthInfo('1990/05/05', TODAY), null, '형식이 다르면 null');
check(bi.run('info', { date: '1990-05-05' }, { now: TODAY }).includes('만 나이: 36세'), 'run 이 세 나이를 함께 낸다');
check(bi.run('info', { date: '1990-05-05' }, { now: TODAY }).includes('세는 나이: 37세'), '세는 나이도 함께');

// ── ②-6 jamo 알맹이 (한글 — 우리 말고 아무도 안 하는 것) ─────────────────────
const jm = await load('src/core/jamo.ts');

eq(jm.spec.id, 'jamo', 'jamo spec.id');
eq(jm.split('강').join('/'), 'ㄱ/ㅏ/ㅇ', '받침 있는 글자');
eq(jm.split('가').join('/'), 'ㄱ/ㅏ/', '받침 없으면 종성은 빈 값');
eq(jm.split('A'), null, '한글이 아니면 null');
eq(jm.split(' '), null, '띄어쓰기도 null');

// 겹받침 — LLM 이 특히 자주 틀리는 자리 (ㄳ 을 ㄱ+ㅅ 두 개로 쪼개 버린다).
eq(jm.split('넋')[2], 'ㄳ', '겹받침 ㄳ 은 한 덩어리');
eq(jm.split('닭')[2], 'ㄺ', '겹받침 ㄺ');
eq(jm.split('값')[2], 'ㅄ', '겹받침 ㅄ');
eq(jm.split('가')[2], '', '종성 없음');
// 유니코드 한글 블록의 양 끝
eq(jm.split('가').join(''), 'ㄱㅏ', '블록 첫 글자');
eq(jm.split('힣').join('/'), 'ㅎ/ㅣ/ㅎ', '블록 마지막 글자');

eq(jm.initials('한글 자모'), 'ㅎㄱ ㅈㅁ', '초성만 (한글 아닌 글자는 그대로)');
eq(jm.decompose('강'), 'ㄱㅏㅇ', '자모 나열');
eq(jm.decompose('a강!'), 'aㄱㅏㅇ!', '섞여 있어도 한글만 쪼갠다');

// 되돌리기 — 「종성이냐 다음 글자의 초성이냐」가 이 도구의 진짜 어려운 자리다.
eq(jm.compose('ㄱㅏㅇ'), '강', '종성으로 붙는다');
eq(jm.compose('ㄱㅏㅁㅏ'), '가마', 'ㅁ 뒤에 모음이 오면 다음 글자의 초성이다');
eq(jm.compose('ㄱㅏㅁ'), '감', '뒤에 모음이 없으면 종성');
eq(jm.compose('ㄴㅓㄳ'), '넋', '겹받침도 되돌린다');
eq(jm.compose('ㅎㅏㄴㄱㅡㄹ'), '한글', '여러 글자');
eq(jm.compose('abc'), 'abc', '한글이 없으면 그대로');
eq(jm.compose(jm.decompose('닭갈비')), '닭갈비', '쪼갰다 되돌리면 원래대로');
eq(jm.compose(jm.decompose('값어치')), '값어치', '겹받침 + 다음 글자가 ㅇ 인 경우');
check(jm.run('split', { text: '강' }).includes('종성 ㅇ'), 'run split 이 사람 말로 답한다');
eq(jm.run('initials', { text: '한글' }), 'ㅎㄱ', 'run initials');
eq(jm.run('join', { text: 'ㄱㅏㅇ' }), '강', 'run join');

// ── ②-7 vat 알맹이 (LLM 이 총액의 10% 를 빼 답하는 자리) ─────────────────────
const vt = await load('src/core/vat.ts');

eq(vt.spec.id, 'vat', 'vat spec.id');

// 이 도구가 있는 이유 자체 — 110,000 의 공급가는 100,000 이지 99,000 이 아니다.
const ex = vt.vatExtract(110000);
eq(ex.supply, 100000, '총액 110,000 → 공급가 100,000 (÷1.1)');
eq(ex.tax, 10000, '총액 110,000 → 세액 10,000');
eq(ex.total, 110000, '총액은 그대로');
check(ex.supply !== 99000, '총액 × 10% 를 빼면 99,000 — 그 답이면 틀린 것');

const ad = vt.vatAdd(1000000);
eq(ad.supply, 1000000, '공급가 그대로');
eq(ad.tax, 100000, '부가세 10%');
eq(ad.total, 1100000, '합계');

// 세 줄이 서로 안 맞으면 세금계산서에 못 옮긴다 — 딱 떨어지지 않는 값으로 확인.
for (const amount of [12345, 99999, 1, 7, 1234567]) {
  const a = vt.vatAdd(amount);
  check(a.supply + a.tax === a.total, `더하기 ${amount}: 공급가+세액 ≠ 합계 (${a.supply}+${a.tax}≠${a.total})`);
  const e = vt.vatExtract(amount);
  check(e.supply + e.tax === e.total, `빼내기 ${amount}: 공급가+세액 ≠ 합계 (${e.supply}+${e.tax}≠${e.total})`);
}

eq(vt.vatExtract(11111).supply, 10100, '절사가 기본 (실무) — 10100.909… 를 내림');
eq(vt.vatExtract(11111, 10, 'round').supply, 10101, '반올림 선택 — 같은 값이 10101 이 된다');
eq(vt.vatAdd(1000, 0).tax, 0, '세율 0% 면 세액 0');
eq(vt.vatAdd(1000, 20).total, 1200, '세율 20%');
eq(vt.won(1234567), '₩1,234,567', '금액 표기');

check(vt.run('extract', { amount: 110000 }).includes('Supply: ₩100,000'), 'run extract');
check(vt.run('extract', { amount: 110000 }).includes('total ÷ 1.10'), '어떻게 계산했는지 말한다');
check(vt.run('add', { amount: 1000000 }).includes('Total: ₩1,100,000'), 'run add');
check(vt.run('add', { amount: 12345 }).includes('Check: supply + VAT'), '세 줄이 맞는지 스스로 보여 준다');
let vatThrew = false;
try {
  vt.run('add', { amount: 'abc' });
} catch {
  vatThrew = true;
}
check(vatThrew, '숫자가 아니면 던진다');

// ── ②-8 interest 알맹이 (적금을 「총액 × 연이율」로 답하는 자리) ──────────────
const it = await load('src/core/interest.ts');

eq(it.spec.id, 'interest', 'interest spec.id');

// 예금 = 단리. 1000만원 · 연 4% · 12개월 → 40만원.
eq(it.depositInterest(10000000, 4, 12), 400000, '예금 단리 1년');
eq(it.depositInterest(10000000, 4, 6), 200000, '예금 6개월은 절반');
eq(it.depositInterest(10000000, 0, 12), 0, '이율 0 이면 이자 0');

/* 이 도구가 있는 이유 자체 — 월 50만 × 12개월 · 연 4%.
   흔한 오답: 600만 × 4% = 240,000원.
   실제: 먼저 넣은 돈만 오래 굴러서 (12+11+…+1)/12 개월치 = 130,000원. */
const savingGross = it.savingInterest(500000, 4, 12);
eq(Math.round(savingGross), 130000, '적금 12개월 세전 이자');
check(Math.round(savingGross) !== 240000, '「원금합계 × 연이율」(240,000)이면 틀린 것');
eq(Math.round(it.savingInterest(500000, 4, 1)), 1667, '1개월이면 한 번만 굴러간다 (한 달치 이자)');

// 세금 — 15.4% 는 소득세 14% + 지방소득세 1.4%.
const at = it.afterTax(6000000, 130000);
eq(Math.round(at.tax), 20020, '이자소득세 15.4%');
eq(Math.round(at.net), 109980, '세후 이자');
eq(Math.round(at.payout), 6109980, '세후 수령액 = 원금 + 세후이자');

// 대출 원리금균등 — 3천만원 · 연 5% · 60개월.
const pay = it.annuityPayment(30000000, 5, 60);
check(pay > 566000 && pay < 567000, `Monthly payment should be 566,xxx: ${Math.round(pay)}`);
check(pay * 60 > 30000000, '총 상환액은 원금보다 크다');
eq(it.annuityPayment(1200000, 0, 12), 100000, '무이자면 그냥 나눈다');

check(it.run('saving', { monthly: 500000, rate: 4, months: 12 }).includes('₩130,000'), 'run saving 세전 이자');
check(it.run('saving', { monthly: 500000, rate: 4, months: 12 }).includes('that is wrong'), '흔한 오답을 짚어 준다');
check(it.run('deposit', { amount: 10000000, rate: 4, months: 12 }).includes('Interest income tax'), 'run deposit 세금 표기');
check(it.run('loan', { amount: 30000000, rate: 5, months: 60 }).includes('Monthly payment'), 'run loan');
let itThrew = false;
try {
  it.run('deposit', { amount: -1, rate: 4, months: 12 });
} catch {
  itThrew = true;
}
check(itThrew, '음수 금액은 던진다');

// ── ②-9 hangulkey 알맹이 (자판 배열 = 지역 지식, 우리 말고 없다) ──────────────
const hk = await load('src/core/hangulkey.ts');

eq(hk.spec.id, 'hangulkey', 'hangulkey spec.id');
eq(hk.engToKor('dkssud'), '안녕', '대표 예시');
eq(hk.engToKor('dkssudgktpdy'), '안녕하세요', '긴 문장');
eq(hk.korToEng('안녕하세요'), 'dkssudgktpdy', '반대 방향');
eq(hk.engToKor(hk.korToEng('한글 자판')), '한글 자판', '왕복 (띄어쓰기 포함)');

// 이 도구의 어려운 자리 ① 받침이 다음 글자 초성으로 넘어간다.
eq(hk.engToKor('rksk'), '가나', 'ㄱㅏㄴㅏ — ㄴ 이 다음 글자 초성으로');
eq(hk.engToKor('dkswk'), '안자', '겹받침 아니어도 넘어간다');
// ② 겹받침이면 **뒷자음만** 넘어간다.
eq(hk.engToKor('dkswk'), '안자', 'ㅇㅏㄴㅈㅏ');
eq(hk.korToEng('앉'), 'dksws'.slice(0, 4), '앉 = ㅇㅏㄴㅈ');
// ③ 겹모음
eq(hk.engToKor('dhk'), '와', 'ㅗ+ㅏ = ㅘ (d=ㅇ · h=ㅗ · k=ㅏ)');
eq(hk.engToKor('dml'), '의', 'ㅡ+ㅣ = ㅢ');
eq(hk.korToEng('의'), 'dml', '겹모음을 두 키로 되돌린다');
eq(hk.korToEng('와'), 'dhk', '겹모음 반대 방향');
// ④ 쌍자음은 대문자 키
eq(hk.engToKor('Rk'), '까', '대문자 R = ㄲ');
eq(hk.korToEng('까'), 'Rk', '쌍자음은 대문자로 되돌린다');

eq(hk.engToKor('hello world'), 'ㅗ디ㅣㅐ 재깅', '아무 영문이나 두벌식으로 읽는다');
eq(hk.engToKor('123 !@'), '123 !@', '숫자·기호는 그대로');
eq(hk.korToEng('abc'), 'abc', '한글 아닌 것은 그대로');
eq(hk.hasHangul('dkssud'), false, '영문만이면 false');
eq(hk.hasHangul('안녕 hi'), true, '한글이 섞이면 true');
eq(hk.run('auto', { text: 'dkssud' }), '안녕', 'auto — 영문이면 한글로');
eq(hk.run('auto', { text: '안녕' }), 'dkssud', 'auto — 한글이면 영문으로');

// ── ②-10 loan 알맹이 (상환 방식마다 답이 다르다) ─────────────────────────────
const ln = await load('src/core/loan.ts');

eq(ln.spec.id, 'loan', 'loan spec.id');

const P = 30000000;
const eq1 = ln.equalPayment(P, 5, 60);
const pp = ln.equalPrincipal(P, 5, 60);
const bu = ln.bullet(P, 5, 60);
eq(eq1.length, 60, '회차 수');
check(Math.abs(eq1[0].pay - eq1[59].pay) < 0.01, '원리금균등은 매달 같은 금액');
check(eq1[0].interest > eq1[59].interest, '초반이 이자 비중이 크다');
check(Math.abs(eq1[59].left) < 1, '마지막에 잔액 0');
check(pp[0].pay > pp[59].pay, '원금균등은 상환액이 줄어든다');
check(Math.abs(pp[0].principal - pp[59].principal) < 0.01, '원금균등은 원금 몫이 같다');

// 「어느 방식이 이자가 적나」 — LLM 이 원리금균등 하나로 뭉개는 자리.
const iEq = ln.totalInterest(eq1);
const iPp = ln.totalInterest(pp);
const iBu = ln.totalInterest(bu);
check(iPp < iEq, `원금균등 총이자(${Math.round(iPp)})가 원리금균등(${Math.round(iEq)})보다 적어야 한다`);
check(iEq < iBu, `원리금균등이 만기일시(${Math.round(iBu)})보다 적어야 한다`);
eq(bu[59].principal, P, '만기일시는 마지막에 원금을 한 번에');
eq(bu[0].principal, 0, '만기일시는 처음엔 원금을 안 갚는다');

// 거치기간 = 이자만 → 총이자가 늘어난다.
const graced = ln.withGrace(P, 5, 12, eq1);
eq(graced.length, 72, '거치 12개월이 앞에 붙는다');
eq(graced[0].principal, 0, '거치 중엔 원금 0');
check(ln.totalInterest(graced) > iEq, '거치기간이 붙으면 총이자가 늘어난다');

// 더 갚기 = 기간 단축 + 이자 절약.
const extra = ln.withExtra(eq1, 5, 200000);
check(extra.length < eq1.length, `더 갚으면 기간이 짧아져야 한다 (${extra.length} < 60)`);
check(ln.totalInterest(extra) < iEq, '더 갚으면 이자가 준다');
eq(ln.withExtra(eq1, 5, 0).length, 60, '0 이면 그대로');

eq(ln.equalPayment(1200000, 0, 12)[0].pay, 100000, '무이자면 그냥 나눈다');
check(ln.run('compare', { amount: P, rate: 5, months: 60 }).includes('Equal principal'), 'run compare 가 셋을 나란히');
check(ln.run('schedule', { amount: P, rate: 5, months: 60, extra: 200000 }).includes('months shorter'), 'run schedule 이 절약을 말한다');
let lnThrew = false;
try {
  ln.run('schedule', { amount: P, rate: 5, months: 60, method: '엉뚱' });
} catch {
  lnThrew = true;
}
check(lnThrew, '모르는 상환 방식은 던진다');

// ── ②-11 grade 알맹이 (단순 평균 ≠ 평점) ─────────────────────────────────────
const gr = await load('src/core/grade.ts');

eq(gr.spec.id, 'grade', 'grade spec.id');

/* 이 도구가 있는 이유 자체 — 3학점 A+ 와 1학점 F 는 무게가 다르다.
   단순 평균: (4.5 + 0) / 2 = 2.25
   가중 평균: (3×4.5 + 1×0) / 4 = 3.375  ← 이게 평점 */
const mixed = gr.parseCourses('3 A+\n1 F', gr.SCALE_45);
eq(mixed.gpa, 3.375, '학점 가중 평균');
eq(mixed.simple, 2.25, '단순 평균은 다르다');
check(mixed.gpa !== mixed.simple, '둘이 같으면 이 도구가 필요 없다');
eq(mixed.credits, 4, '이수 학점');
eq(mixed.counted, 2, '과목 수');

// 4.5 만점과 4.3 만점이 둘 다 국내에서 쓰인다 — A+ 만 다르다.
eq(gr.SCALE_45['A+'], 4.5, '4.5 만점의 A+');
eq(gr.SCALE_43['A+'], 4.3, '4.3 만점의 A+');
eq(gr.SCALE_45['A0'], gr.SCALE_43['A0'], 'A0 는 두 기준이 같다');
eq(gr.maxOf(gr.scaleOf('43')), 4.3, 'scaleOf(43)');
eq(gr.maxOf(gr.scaleOf(undefined)), 4.5, '기본은 4.5');
eq(gr.parseCourses('3 A+', gr.SCALE_43).gpa, 4.3, '같은 A+ 라도 기준이 다르면 값이 다르다');

// 사람이 적는 모양 — 「A」 한 글자, 쉼표, 공백 여럿.
eq(gr.parseCourses('3 A', gr.SCALE_45).gpa, 4.0, '「A」 한 글자는 A0 로 본다');
eq(gr.parseCourses('3,A+', gr.SCALE_45).gpa, 4.5, '쉼표 구분');
eq(gr.parseCourses('3   B0', gr.SCALE_45).gpa, 3.0, '공백 여럿');
eq(gr.parseCourses('1.5 A+', gr.SCALE_45).credits, 1.5, '소수 학점');
// 못 읽은 줄은 조용히 버리지 않는다.
const withBad = gr.parseCourses('3 A+\n이건 뭐지\n3 Z+', gr.SCALE_45);
eq(withBad.bad.length, 2, '못 읽은 줄을 모아 둔다');
eq(withBad.counted, 1, '읽은 것만 센다');

// 목표 평점 — 식을 뒤집는 자리.
const need = gr.neededAverage(3 * 4.5, 3, 4.0, 3, 4.5);
eq(Number(need.required.toFixed(2)), 3.5, '현재 4.5(3학점) → 목표 4.0 이면 남은 3학점에 3.5 필요');
check(need.possible, '3.5 는 만점 안이라 가능');
check(gr.neededAverage(0, 3, 4.4, 3, 4.5).possible === false, '만점으로도 안 되는 목표는 불가능이라 말한다');
check(gr.neededAverage(3 * 4.5, 3, 2.0, 3, 4.5).alreadyThere, '남은 학점을 0점 받아도 목표를 넘으면 「이미 넘었다」');

check(gr.run('gpa', { courses: '3 A+\n1 F' }).includes('3.38'), 'run gpa 가 가중 평균을 낸다');
check(gr.run('gpa', { courses: '3 A+\n1 F' }).includes('GPA is above'), '단순 평균과 헷갈리지 않게 말해 준다');
check(gr.run('needed', { courses: '3 A+', target: 4.0, future: 3 }).includes('average of 3.50'), 'run needed');
let grThrew = false;
try {
  gr.run('gpa', { courses: '읽을 수 없음' });
} catch {
  grThrew = true;
}
check(grThrew, '읽을 줄이 없으면 던진다');

// ── ②-12 timecalc 알맹이 (7:45 는 7.45 가 아니다) ────────────────────────────
const tc = await load('src/core/timecalc.ts');

eq(tc.spec.id, 'timecalc', 'timecalc spec.id');

// 사람이 적는 모양이 여럿이다. 전부 「분」 하나로 모은다.
eq(tc.toMinutes('1:30'), 90, '시:분');
eq(tc.toMinutes('1:05'), 65, '분이 한 자리로 붙어도');
eq(tc.toMinutes('90m'), 90, '분 표기');
eq(tc.toMinutes('90'), 90, '숫자만이면 분');
eq(tc.toMinutes('1.5h'), 90, '소수 시간');
eq(tc.toMinutes('2h'), 120, '시간 표기');
eq(tc.toMinutes('1시30'), 90, '한글 시');
eq(tc.toMinutes('8:00'), 480, '정각');
eq(tc.toMinutes(''), null, '빈 값은 null');
eq(tc.toMinutes('아무거나'), null, '못 읽으면 null (0 으로 넘기면 합계가 조용히 틀린다)');

// 이 도구가 있는 이유 자체 — 7:45 를 7.45 로 읽으면 틀린다.
eq(tc.toMinutes('7:45'), 465, '7:45 = 465분');
eq(Number((465 / 60).toFixed(2)), 7.75, '465분 = 7.75시간 (7.45 아님)');

eq(tc.fmt(465), '7h 45m', '보기 좋은 표기');
eq(tc.fmt(-90), '-1h 30m', '음수도 부호를 붙여 그대로');
eq(tc.fmt(0), '0h 0m', '0');

// 24시를 넘거나 0시 아래로 가도 하루 안으로.
eq(tc.clock(580 + 85), '11:05', '09:40 + 1:25');
eq(tc.clock(1440), '00:00', '24시는 0시');
eq(tc.clock(1500), '01:00', '25시는 다음 날 1시');
eq(tc.clock(-60), '23:00', '0시 한 시간 전은 전날 23시');
eq(tc.dayShift(1500), 1, '하루 넘어감');
eq(tc.dayShift(-60), -1, '전날로');
eq(tc.dayShift(600), 0, '같은 날');

const sumR = tc.sumTimes('7:45\n8:20\n6:50');
eq(sumR.total, 465 + 500 + 410, '근무시간 합계');
eq(sumR.counted, 3, '읽은 줄 수');
eq(sumR.bad, 0, '못 읽은 줄 없음');
const sumBad = tc.sumTimes('7:45\n뭐지\n\n8h');
eq(sumBad.counted, 2, '빈 줄은 안 세고');
eq(sumBad.bad, 1, '못 읽은 줄은 센다');

check(tc.run('shift', { start: '09:40', duration: '1:25' }).includes('11:05'), 'run shift');
check(tc.run('shift', { start: '23:30', duration: '1:00' }).includes('1 day later'), '자정을 넘으면 말해 준다');
check(tc.run('shift', { start: '09:40', duration: '1:25', minus: true }).includes('08:15'), 'run shift 빼기');
check(tc.run('sum', { times: '7:45\n8:20' }).includes('7.75, not 7.45'), '급여 계산 함정을 짚어 준다');
let tcThrew = false;
try {
  tc.run('sum', { times: '읽을 수 없음' });
} catch {
  tcThrew = true;
}
check(tcThrew, '읽을 줄이 없으면 던진다');

// ── ②-13 uuidgen 알맹이 (LLM 의 「랜덤」은 랜덤이 아니다 — A등급) ──────────────
const uu = await load('src/core/uuidgen.ts');

eq(uu.spec.id, 'uuidgen', 'uuidgen spec.id');

// 모양 — RFC 자리·판 숫자.
const v4 = uu.uuidV4();
check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v4), `v4 모양이 아니다: ${v4}`);
const v7 = uu.uuidV7(1750000000000);
check(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v7), `v7 모양이 아니다: ${v7}`);

// v7·ulid 의 존재 이유 = **시간순 정렬**. 늦게 만든 것이 문자열 비교에서도 뒤여야 한다.
const early = uu.uuidV7(1700000000000);
const later = uu.uuidV7(1800000000000);
check(early < later, `v7 은 시간순으로 정렬돼야 한다: ${early} < ${later}`);
check(uu.ulid(1700000000000) < uu.ulid(1800000000000), 'ulid 도 시간순 정렬');
eq(uu.ulid(1750000000000).length, 26, 'ULID 는 26자');

eq(uu.nanoId(21).length, 21, 'nanoid 길이');
eq(uu.nanoId(8).length, 8, 'nanoid 짧게');
eq(uu.password(16).length, 16, 'password 길이');
check(/^[a-zA-Z0-9]+$/.test(uu.password(40)), '기호 없이면 영숫자만');
check(/[!@#$%^&*()\-_=+[\]{}]/.test([...Array(20)].map(() => uu.password(40, true)).join('')), '기호를 켜면 기호가 나온다');
// 헷갈리는 글자를 뺐다 — 손으로 옮겨 적을 때 사고가 난다.
check(/[0O1lI]/.test(uu.password(200)) === false, 'password 에 0·O·1·l·I 가 없어야 한다');

/* 이 도구의 값 자체 — **정말 겹치지 않는가.** LLM 이 지어낸 값은 같은 것이 반복된다.
   1000개를 뽑아 하나라도 겹치면 난수원이 잘못된 것이다. */
for (const [label, gen] of [['uuid4', () => uu.uuidV4()], ['nanoid', () => uu.nanoId(21)], ['password', () => uu.password(16)]]) {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(gen());
  eq(seen.size, 1000, `${label} 1000개 중 겹친 것이 있다`);
}
// 같은 밀리초에 만들어도 뒤쪽 난수가 달라 안 겹친다.
const sameMs = new Set([...Array(200)].map(() => uu.uuidV7(1750000000000)));
eq(sameMs.size, 200, '같은 시각의 v7 도 서로 달라야 한다');

eq(uu.run('generate', { count: 5 }).split('\n').length, 5, 'run 이 개수만큼');
check(uu.run('generate', { kind: 'password', length: 24 }).length === 24, 'run password 길이');
eq(uu.run('generate', { count: 1000 }).split('\n').length, 100, '개수는 100개로 자른다');
let uuThrew = false;
try {
  uu.run('generate', { kind: '엉뚱' });
} catch {
  uuThrew = true;
}
check(uuThrew, '모르는 종류는 던진다');

// ── ②-14 csvjson 알맹이 (따옴표 안 쉼표에서 열이 밀린다 — A등급) ──────────────
const cj = await load('src/core/csvjson.ts');

eq(cj.spec.id, 'csvjson', 'csvjson spec.id');

// 이 도구가 있는 이유 자체 — 쉼표로 자르면 여기서 열이 밀린다.
const tricky = cj.parseCsv('이름,메모\n홍길동,"쉼표, 들어간 값"');
eq(tricky.length, 2, '줄 수');
eq(tricky[1].length, 2, '따옴표 안 쉼표로 열이 늘면 안 된다');
eq(tricky[1][1], '쉼표, 들어간 값', '따옴표 안 쉼표를 그대로 보존');

// 따옴표 안 줄바꿈 — 이걸 놓치면 줄 수가 늘어난다.
const multiline = cj.parseCsv('a,b\n1,"두\n줄"');
eq(multiline.length, 2, '따옴표 안 줄바꿈으로 줄이 늘면 안 된다');
eq(multiline[1][1], '두\n줄', '줄바꿈 보존');
// 겹따옴표 = 따옴표 한 개
eq(cj.parseCsv('a\n"그는 ""안녕"" 이라 했다"')[1][0], '그는 "안녕" 이라 했다', '겹따옴표');
eq(cj.parseCsv('a\tb\n1\t2', '\t')[1][1], '2', '탭 구분자');
eq(cj.parseCsv('a,b\r\n1,2')[1][0], '1', 'CRLF 도 읽는다');
eq(cj.parseCsv('').length, 0, '빈 글자는 빈 표');

// 되돌리기 — 감싸야 할 값을 안 감싸면 다음 사람이 못 읽는다.
eq(cj.toCsv([{ a: '쉼표, 값' }]), 'a\n"쉼표, 값"', '쉼표가 있으면 감싼다');
eq(cj.toCsv([{ a: '따옴표"안' }]), 'a\n"따옴표""안"', '따옴표는 겹쳐 적는다');
eq(cj.toCsv([{ a: ' 앞뒤공백 ' }]), 'a\n" 앞뒤공백 "', '앞뒤 공백도 감싼다');
eq(cj.toCsv([{ a: 1 }, { b: 2 }]), 'a,b\n1,\n,2', '열이 다른 객체는 합집합으로');
eq(cj.toCsv([{ a: null }]), 'a\n', 'null 은 빈 칸');

// 왕복 — 까다로운 값을 넣었다 빼도 그대로여야 한다.
const round = cj.parseCsv(cj.toCsv([{ x: '쉼표, 와 "따옴표"' }, { x: '줄\n바꿈' }]));
eq(round[1][0], '쉼표, 와 "따옴표"', '왕복 1');
eq(round[2][0], '줄\n바꿈', '왕복 2');

eq(cj.coerce('42'), 42, '숫자로');
eq(cj.coerce('true'), true, '불리언으로');
eq(cj.coerce('null'), null, 'null 로');
eq(cj.coerce('007'), '007', '0 으로 시작하면 글자 그대로 (전화번호·우편번호)');
eq(cj.coerce(''), '', '빈 값');
eq(cj.rowsToObjects(cj.parseCsv('a,b\n1,2'))[0].a, 1, '객체로 바꾸면서 타입도');
eq(cj.rowsToObjects(cj.parseCsv('a,b\n1,2'), false)[0].a, '1', 'coerce 끄면 글자 그대로');
eq(Object.keys(cj.rowsToObjects(cj.parseCsv(',b\n1,2'))[0])[0], '열1', '머리글이 비면 열N');

check(cj.run('toJson', { csv: 'a,b\n1,2' }).includes('"a": 1'), 'run toJson');
check(cj.run('toCsv', { json: '[{"a":1}]' }) === 'a\n1', 'run toCsv');
let cjThrew = 0;
for (const bad of [{ op: 'toJson', args: { csv: 'a,b' } }, { op: 'toCsv', args: { json: '{oops' } }, { op: 'toCsv', args: { json: '{"a":1}' } }]) {
  try {
    cj.run(bad.op, bad.args);
  } catch {
    cjThrew++;
  }
}
eq(cjThrew, 3, '자료 없는 CSV·깨진 JSON·배열 아닌 JSON 은 전부 던진다');

// ── ②-15 tableconv 알맹이 (한글은 두 칸이라 세로줄이 어긋난다 — A등급) ────────
const tv = await load('src/core/tableconv.ts');

eq(tv.spec.id, 'tableconv', 'tableconv spec.id');

// 들어온 꼴을 스스로 알아본다 — 셋 다 자주 온다.
eq(tv.parse('a\tb\n1\t2').kind, 'Excel paste', '탭이 있으면 엑셀에서 복사한 것');
eq(tv.parse('a,b\n1,2').kind, 'CSV', '쉼표면 CSV');
eq(tv.parse('| a | b |\n| --- | --- |\n| 1 | 2 |').kind, 'Markdown table', '두 번째 줄이 구분선이면 마크다운');
eq(tv.parse('| a | b |\n| --- | --- |\n| 1 | 2 |').rows.length, 2, '마크다운 구분선은 줄로 안 센다');
eq(tv.parse('').rows.length, 0, '빈 글자는 빈 표');
eq(tv.parse('a,"쉼표, 값"').rows[0][1], '쉼표, 값', 'CSV 따옴표 안 쉼표');

/* 이 도구가 있는 이유 — **한글은 글자 하나가 두 칸**이다.
   그걸 안 세면 「맞춰 준다」고 해 놓고 어긋난 표가 나온다. */
eq(tv.width('가'), 2, '한글은 두 칸');
eq(tv.width('a'), 1, '영문은 한 칸');
eq(tv.width('가a'), 3, '섞이면 더한다');
eq(tv.pad('가', 4), '가  ', '두 칸을 세고 남은 만큼만 채운다');
eq(tv.pad('ab', 4), 'ab  ', '영문');

// 정렬한 마크다운은 **모든 줄의 길이가 같아야** 세로줄이 맞는다.
const md = tv.toMarkdown(tv.parse('이름\t값\n홍길동\t1\nA\t22').rows, true);
const lens = md.split('\n').map((l) => [...l].reduce((a, c) => a + tv.width(c), 0));
eq(new Set(lens).size, 1, `정렬했는데 줄 폭이 다르다: ${lens.join(',')}`);
check(md.includes('| 이름'), '머리글이 들어간다');
// 안 맞춰도 표로는 읽혀야 한다.
check(tv.toMarkdown(tv.parse('a\tb\n1\t2').rows, false).split('\n').length === 3, '정렬 끄면 3줄');

eq(tv.toCsv([['a', '쉼표, 값']]), 'a,"쉼표, 값"', 'CSV 로 낼 때 감싼다');
eq(tv.toTsv([['a', 'b']]), 'a\tb', 'TSV');
eq(JSON.parse(tv.toJson(tv.parse('a,b\n1,2').rows))[0].a, '1', 'JSON 은 머리글을 열쇠로');
eq(tv.toJson([['a']]), '[]', '머리글만 있으면 빈 배열');
// 열 수가 다른 줄이 있어도 표가 깨지면 안 된다.
eq(tv.toMarkdown([['a', 'b'], ['1']], false).split('\n')[2], '| 1 |  |', '모자란 칸은 빈 칸으로 채운다');

check(tv.run('convert', { table: 'a\tb\n1\t2' }).includes('Input: Excel paste'), 'run 이 읽은 꼴을 말한다');
check(tv.run('convert', { table: 'a\tb\n1\t2', to: 'csv' }).includes('a,b'), 'run to=csv');
let tvThrew = 0;
for (const bad of [{ table: '' }, { table: 'a\tb', to: '엉뚱' }]) {
  try {
    tv.run('convert', bad);
  } catch {
    tvThrew++;
  }
}
eq(tvThrew, 2, '빈 표·모르는 꼴은 던진다');

// ── ②-16 qrgen 알맹이 (LLM 은 QR 을 못 만든다 — A등급) ───────────────────────
const qg = await load('src/core/qrgen.ts');

eq(qg.spec.id, 'qrgen', 'qrgen spec.id');

// 문법 있는 문자열 — 여기가 조용히 깨지는 자리다.
eq(qg.escapeWifi('a;b'), 'a\\;b', '세미콜론을 감싼다');
eq(qg.escapeWifi('a:b,c"d\\e'), 'a\\:b\\,c\\"d\\\\e', '뜻 있는 글자 전부');
eq(qg.escapeWifi('보통비번'), '보통비번', '평범하면 그대로');
const wifi = qg.wifiPayload('우리집', 'pass;word');
check(wifi.includes('P:pass\\;word;'), `비밀번호의 ; 가 감싸져야 한다: ${wifi}`);
check(wifi.startsWith('WIFI:T:WPA;S:우리집;'), 'WiFi 문법 앞부분');
check(qg.wifiPayload('a', '', 'nopass').includes('P:') === false, 'nopass 면 비밀번호 칸이 없다');
check(qg.wifiPayload('a', 'p', 'WPA', true).includes('H:true;'), '숨긴 네트워크 표시');
eq(qg.wifiPayload('a', 'p', '엉뚱').includes('T:WPA;'), true, '모르는 암호화는 WPA 로');

const vc = qg.vcardPayload('홍길동', '카르모랩', '010-0000-0000');
check(vc.startsWith('BEGIN:VCARD') && vc.endsWith('END:VCARD'), 'vCard 봉투');
check(vc.includes('ORG:카르모랩') && vc.includes('TEL:010-0000-0000'), '채운 칸만 들어간다');
check(qg.vcardPayload('홍길동').includes('EMAIL:') === false, '안 준 칸은 빠진다');

// 격자 — 같은 내용이면 같은 크기, 긴 내용이면 더 커진다.
const g1 = qg.makeGrid('hello');
check(g1.count >= 21 && g1.count % 4 === 1, `QR 격자 크기가 규격을 벗어났다: ${g1.count}`);
check(qg.makeGrid('x'.repeat(300)).count > g1.count, '내용이 길면 격자가 커진다');
check(qg.makeGrid('안녕하세요').count >= 21, '한글도 담긴다 (UTF-8)');
// 오류복원 수준을 올리면 같은 내용이라도 더 커진다.
check(qg.makeGrid('hello', 'H').count >= qg.makeGrid('hello', 'L').count, 'H 가 L 보다 크거나 같다');
// 세 모서리의 찾기 무늬 — 이게 없으면 스캔이 안 된다.
for (const [r, c, label] of [[0, 0, '좌상'], [0, g1.count - 7, '우상'], [g1.count - 7, 0, '좌하']]) {
  check(g1.isDark(r, c) && g1.isDark(r + 6, c + 6), `${label} 찾기 무늬가 없다`);
}

const svg = qg.toSvg(qg.makeGrid('hello'), 256);
check(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'SVG 봉투');
check(svg.includes('width="256"'), '크기가 들어간다');
// 여백 4칸(조용한 구역)이 없으면 스캔이 안 된다 — viewBox 가 격자보다 8 커야 한다.
check(svg.includes(`viewBox="0 0 ${g1.count + 8} ${g1.count + 8}"`), `여백 4칸이 빠졌다: ${svg.slice(0, 120)}`);
check(svg.includes('<path d="M'), '검은 칸이 실제로 그려진다');

check(qg.run('svg', { text: 'https://blog.mascari4615.com' }).startsWith('<svg'), 'run svg');
check(qg.run('wifi', { ssid: 'a', password: 'b' }).startsWith('<svg'), 'run wifi');
check(qg.run('contact', { name: '홍길동' }).startsWith('<svg'), 'run contact');
let qgThrew = 0;
for (const bad of [['svg', {}], ['wifi', { ssid: '  ' }], ['contact', { name: '' }]]) {
  try {
    qg.run(bad[0], bad[1]);
  } catch {
    qgThrew++;
  }
}
eq(qgThrew, 3, '빈 내용·빈 SSID·빈 이름은 전부 던진다');

// ── ②-17 filehash 알맹이 (배포처 값은 지저분하게 온다 — A등급) ────────────────
const fh = await load('src/core/filehash.ts');

eq(fh.spec.id, 'filehash', 'filehash spec.id');
eq(Object.keys(fh.spec.ops).length, 1, '항상 던지는 죽은 연산을 목록에 두지 않는다');

// **바이트 규약** — File 이 아니라 Uint8Array 를 받으니 Node 에서 그대로 돈다.
const bytes = new TextEncoder().encode('KarmoLab');
const fileHashed = await fh.hashBytes(bytes);
eq(fileHashed['SHA-256'], crypto.createHash('sha256').update('KarmoLab').digest('hex'), '바이트 SHA-256 이 OpenSSL 과 같다');
eq(fileHashed['SHA-512'], crypto.createHash('sha512').update('KarmoLab').digest('hex'), '바이트 SHA-512');
eq(Object.keys(fileHashed).length, 3, '세 방식이 나온다');
// 같은 내용이면 hashgen(문자열) 과 같은 값이어야 한다 — 두 도구가 갈리면 안 된다.
eq((await fh.hashText('KarmoLab'))['SHA-256'], hg.hashAll('KarmoLab', nodeBackend).find((r) => r.algo === 'SHA256').hex, 'filehash 와 hashgen 이 같은 값');
eq((await fh.hashBytes(new Uint8Array(0)))['SHA-256'], crypto.createHash('sha256').digest('hex'), '빈 바이트');

// 배포처가 준 값은 지저분하다 — 그대로 비교하면 「같은 파일인데 다르다」가 된다.
eq(fh.verify(fileHashed, fileHashed['SHA-256'].toUpperCase()).matched, 'SHA-256', '대문자로 줘도 찾는다');
eq(fh.verify(fileHashed, 'sha256: ' + fileHashed['SHA-256']).matched, 'SHA-256', '머리말이 붙어도');
eq(fh.verify(fileHashed, fileHashed['SHA-1']).matched, 'SHA-1', 'SHA-1 로 준 경우');
eq(fh.verify(fileHashed, 'deadbeef').matched, null, '틀리면 null');
eq(fh.verify(fileHashed, '   ').matched, null, '빈 값이면 null');

eq(fh.size(500), '500B', '크기 표기 B');
eq(fh.size(2048), '2.0KB', 'KB');
eq(fh.size(1048576 * 3), '3.00MB', 'MB');
eq(fh.hex(new Uint8Array([0, 255]).buffer), '00ff', '16진수');

check(fh.run('verify', { actual: 'ABC', expected: 'sha256:abc' }).includes('같습니다'), 'run verify 같음');
check(fh.run('verify', { actual: 'abc', expected: 'def' }).includes('다릅니다'), 'run verify 다름');
check(fh.run('verify', { actual: 'abc', expected: 'abcd' }).includes('길이가 다릅니다'), '길이가 다르면 방식 차이를 짚어 준다');
let fhThrew = false;
try {
  fh.run('verify', { actual: '', expected: 'a' });
} catch {
  fhThrew = true;
}
check(fhThrew, '빈 값은 던진다');

// ── ②-18 workdays 알맹이 (대체공휴일 — LLM 이 거의 못 맞히는 자리) ────────────
const wd = await load('src/core/workdays.ts');

eq(wd.spec.id, 'workdays', 'workdays spec.id');

// 주말만 빼도 되는 구간 — 기본이 맞는지 먼저.
const plain = wd.addWorkdays(new Date(2026, 2, 2), 5); // 2026-03-02 월
eq(plain.end.getDay(), 1, '월요일 + 영업일 5 = 다음 월요일');
check(plain.skipped.some((s) => s.whyKey === 'weekday.saturday') && plain.skipped.some((s) => s.whyKey === 'weekday.sunday'), '주말을 건너뛴다');

// 토요일 근무를 켜면 답이 달라져야 한다 (안 달라지면 그 설정이 죽은 것).
const satOff = wd.addWorkdays(new Date(2026, 2, 2), 5, 'KR', false);
const satOn = wd.addWorkdays(new Date(2026, 2, 2), 5, 'KR', true);
check(satOn.end.getTime() < satOff.end.getTime(), '토요일도 일하면 더 빨리 끝난다');

/* 이 도구의 진짜 값 — 추석이 낀 구간은 그만큼 밀린다.
   2026 추석 = 9/24~26. 9/21(월)부터 영업일 5일이면 추석을 넘어간다. */
const chuseok = wd.addWorkdays(new Date(2026, 8, 21), 5);
check(chuseok.skipped.some((s) => s.whyKey.includes('chuseok')), `추석을 건너뛰어야 한다: ${JSON.stringify(chuseok.skipped)}`);
check(chuseok.end.getTime() > new Date(2026, 8, 26).getTime(), '추석 뒤로 밀린다');

// 공휴일 표는 열쇠로 들고 있고, 부르는 쪽이 그 열쇠를 사람 말로 바꾼다.
const names = [...wd.holidaysOf('KR', 2026).values()];
check(names.includes('newYear'), `1/1 이 holiday key 「newYear」여야 한다: ${names.slice(0, 4)}`);
check(names.some((v) => /^h\d\d$/.test(v)) === false, `깨진 열쇠가 새어 나왔다: ${names.filter((v) => /^h\d\d$/.test(v))}`);

// 쉬는 이유를 말한다 (결과 날짜만 주면 맞는지 확인할 방법이 없다).
eq(wd.reasonKeyToKo('newYear'), '신정', 'holiday key → 한국어');
eq(wd.reasonKeyToKo('weekday.sunday'), '일요일', 'weekday key → 한국어');
eq(wd.restReasonKey(new Date(2026, 0, 1), 'KR', false), 'newYear', '신정 key');
eq(wd.restReasonKey(new Date(2026, 2, 1), 'KR', false), 'weekday.sunday', '2026-03-01 은 일요일이 먼저');
eq(wd.restReasonKey(new Date(2026, 2, 3), 'KR', false), '', '평일은 빈 key');
eq(wd.restReason(new Date(2026, 0, 1), 'KR', false), '신정', '신정');
eq(wd.restReason(new Date(2026, 2, 1), 'KR', false), '일요일', '2026-03-01 은 일요일이 먼저');
eq(wd.restReason(new Date(2026, 2, 3), 'KR', false), '', '평일은 빈 문자열');

const btw = wd.countWorkdays(new Date(2026, 2, 2), new Date(2026, 2, 8));
eq(btw.total, 7, '전체 7일');
/* 5일이 아니라 **4일**이다 — 2026-03-01(삼일절)이 일요일이라 3/2 월요일이 대체공휴일이다.
   이 한 칸이 이 도구가 있는 이유고, 사람도 LLM 도 여기서 틀린다. */
eq(btw.workdays, 4, '3/2 가 삼일절 대체공휴일이라 영업일은 4일');
check(btw.skipped.some((s) => s.whyKey === 'substitute'), `대체공휴일 key 를 말해야 한다: ${JSON.stringify(btw.skipped)}`);
check(wd.countWorkdays(new Date(2026, 2, 8), new Date(2026, 2, 2)).workdays === 4, '거꾸로 줘도 같은 답');

/* **모르는 해는 모른다고 말한다** — 이게 「조용히 틀린 날짜」를 막는 자리다.
   표에 없는 해가 섞이면 그 사실을 값으로 들고 나온다. */
const far = wd.addWorkdays(new Date(2099, 0, 5), 3);
check(far.unknownYears.includes(2099), `2099 를 모른다고 해야 한다: ${JSON.stringify(far.unknownYears)}`);
eq(wd.addWorkdays(new Date(2026, 2, 2), 3).unknownYears.length, 0, '아는 해는 경고 없음');
check(wd.run('after', { start: '2099-01-05', days: 3 }).includes('믿지 마세요'), 'run 도 모르면 그렇게 말한다');

check(wd.run('after', { start: '2026-09-21', days: 5 }).includes('추석'), 'run after 가 건너뛴 날을 보여 준다');
check(wd.run('between', { start: '2026-03-02', end: '2026-03-08' }).includes('영업일 4일'), 'run between');
let wdThrew = 0;
for (const bad of [['after', { start: '엉뚱', days: 3 }], ['after', { start: '2026-03-02', days: 0 }], ['between', { start: '2026-03-02' }], ['after', { start: '2026-03-02', days: 3, region: 'ZZ' }]]) {
  try {
    wd.run(bad[0], bad[1]);
  } catch {
    wdThrew++;
  }
}
eq(wdThrew, 4, '잘못된 날짜·0일·끝날 없음·모르는 나라는 전부 던진다');

// ── ②-19 worldclock 알맹이 (서머타임 — 외운 시차는 1년에 두 번 틀린다) ────────
const wc = await load('src/core/worldclock.ts');

eq(wc.spec.id, 'worldclock', 'worldclock spec.id');

// 서머타임 없는 곳은 언제나 같다.
eq(wc.offsetMinutes('Asia/Seoul', new Date(Date.UTC(2026, 0, 15))), 540, '서울은 겨울에도 +9');
eq(wc.offsetMinutes('Asia/Seoul', new Date(Date.UTC(2026, 6, 15))), 540, '서울은 여름에도 +9');
eq(wc.offsetMinutes('UTC', new Date()), 0, 'UTC 는 0');
eq(wc.usesDst('Asia/Seoul', 2026), false, '한국은 서머타임 안 씀');

/* 이 도구가 있는 이유 자체 — 뉴욕은 계절마다 다르다.
   겨울 UTC-5 · 여름 UTC-4. 서울과의 시차가 14시간 ↔ 13시간으로 바뀐다. */
eq(wc.offsetMinutes('America/New_York', new Date(Date.UTC(2026, 0, 15))), -300, '뉴욕 1월 = UTC-5');
eq(wc.offsetMinutes('America/New_York', new Date(Date.UTC(2026, 6, 15))), -240, '뉴욕 7월 = UTC-4 (서머타임)');
eq(wc.usesDst('America/New_York', 2026), true, '뉴욕은 서머타임 씀');
const winterGap = (wc.offsetMinutes('America/New_York', new Date(Date.UTC(2026, 0, 15))) - 540) / 60;
const summerGap = (wc.offsetMinutes('America/New_York', new Date(Date.UTC(2026, 6, 15))) - 540) / 60;
eq(winterGap, -14, '서울→뉴욕 겨울 14시간');
eq(summerGap, -13, '서울→뉴욕 여름 13시간 — 외운 숫자를 쓰면 한 시간 어긋난다');
check(winterGap !== summerGap, '두 값이 같으면 이 도구가 필요 없다');

eq(wc.usesDst('Europe/London', 2026), true, '런던도 서머타임');
eq(wc.usesDst('Asia/Tokyo', 2026), false, '일본은 안 씀');
eq(wc.zoneErrorKo('출발', 'Asia/없는곳'), '출발 시간대를 못 찾았습니다: Asia/없는곳 (예: Asia/Seoul · America/New_York)', '시간대 오류 helper');

// 없는 시간대를 조용히 0 으로 처리하면 안 된다.
eq(wc.isZone('Asia/Seoul'), true, '있는 시간대');
eq(wc.isZone('Asia/없는곳'), false, '없는 시간대');

// 벽시계 ↔ 순간 왕복.
const inst = wc.wallToInstant('2026-08-09T14:00', 'Asia/Seoul');
eq(wc.wallOf(inst, 'Asia/Seoul'), '2026-08-09 14:00', '서울 벽시계 왕복');
eq(wc.wallOf(inst, 'UTC'), '2026-08-09 05:00', '같은 순간의 UTC');
/* 자정은 **00:00** 이어야 한다. `hour12:false` 만 주면 24:00 을 내는 ICU 판이 있어
   CI(리눅스)에서만 「2026-01-09 24:00」이 나와 빨개졌다 — 로컬에선 재현이 안 됐다.
   hourCycle 을 못 박았고, 여기서 잠근다. */
eq(wc.wallOf(new Date(Date.UTC(2026, 0, 9, 5, 0)), 'America/New_York'), '2026-01-09 00:00', '자정은 00:00 (24:00 아님)');
eq(wc.wallOf(new Date(Date.UTC(2026, 0, 8, 15, 0)), 'Asia/Seoul'), '2026-01-09 00:00', '서울 자정도 00:00');
eq(wc.hours(-90), '-1:30', '분 오프셋 표기');
eq(wc.parseWall('2026-08-09 14:00'), '2026-08-09T14:00', '벽시계 입력 정규화');
const wcView = wc.convertView('Asia/Seoul', 'America/New_York', '2026-08-09T14:00');
eq(wcView.toWall, '2026-08-09 01:00', 'convert helper 결과');
check(wcView.hasDstWarning === true, 'convert helper 가 경고 필요를 안다');
const wcOff = wc.offsetView('Asia/Seoul', 'Europe/London', new Date('2026-07-01T12:00:00Z'));
eq(wcOff.diff, '-8', 'offset helper 시차');
check(wcOff.dstRows.length > 0, 'offset helper DST 줄');

/* 이 셋은 **실패해도 이유를 안 말했다** — CI 에서만 「run convert (겨울 = 14시간 차)」 한 줄이
   뜨고, 로컬에서는 KST·UTC 어느 쪽으로도 재현이 안 됐다(2026-08-09). 그래서 며칠 동안
   「무엇이 나왔는지」를 아무도 몰랐고, 그 사이 배포가 통째로 막혀 있었다.
   기대와 실제를 같이 찍는다 — 다음 실패 한 번이면 원인이 보인다. 시간대·서머타임은
   기계의 tz 자료 판본에 따라 갈리므로 그 판본도 같이 남긴다. */
const tzShow = (label, got, want) =>
  check(
    got.includes(want),
    `${label}: 「${got.replace(/\s+/g, ' ').slice(0, 90)}」 가 나왔다 (기대 「${want}」 포함) · ` +
      `tz=${Intl.DateTimeFormat().resolvedOptions().timeZone} · node=${process.version}`
  );

tzShow(
  'run convert (여름 = 13시간 차)',
  wc.run('convert', { time: '2026-08-09 14:00', from: 'Asia/Seoul', to: 'America/New_York' }),
  '2026-08-09 01:00'
);
tzShow(
  'run convert (겨울 = 14시간 차)',
  wc.run('convert', { time: '2026-01-09 14:00', from: 'Asia/Seoul', to: 'America/New_York' }),
  '2026-01-09 00:00'
);
check(wc.run('convert', { time: '2026-08-09 14:00', from: 'Asia/Seoul', to: 'America/New_York' }).includes('서머타임'), '서머타임 경고를 붙인다');
check(wc.run('convert', { time: '2026-08-09 14:00', from: 'Asia/Seoul', to: 'Asia/Tokyo' }).includes('서머타임') === false, '둘 다 안 쓰면 경고 없음');
check(wc.run('offset', { from: 'Asia/Seoul', to: 'Europe/London', date: '2026-07-01' }).includes('1월'), 'offset 이 계절 차이를 보여 준다');
let wcThrew = 0;
for (const bad of [['convert', { time: '엉뚱', from: 'Asia/Seoul', to: 'UTC' }], ['convert', { time: '2026-08-09 14:00', from: 'Asia/없음', to: 'UTC' }], ['offset', { from: 'Asia/Seoul', to: 'UTC', date: '엉뚱' }]]) {
  try {
    wc.run(bad[0], bad[1]);
  } catch {
    wcThrew++;
  }
}
eq(wcThrew, 3, '잘못된 시각·없는 시간대·잘못된 날짜는 전부 던진다');

// ── ②-20 datecalc 알맹이 (「1월 31일 + 1개월」이 3월 3일이 되는 버그) ─────────
const dc = await load('src/core/datecalc.ts');

eq(dc.spec.id, 'datecalc', 'datecalc spec.id');

/* 이 도구가 있는 이유 자체 — 그냥 setMonth 하면 2월 31일이 3월 3일로 넘어간다.
   기한·구독일 계산에서 매번 나오는 버그다. */
eq(dc.toInput(dc.addMonths(new Date(2026, 0, 31), 1)), '2026-02-28', '1/31 + 1개월 = 2/28');
eq(dc.toInput(dc.addMonths(new Date(2024, 0, 31), 1)), '2024-02-29', '윤년이면 2/29');
eq(dc.toInput(dc.addMonths(new Date(2026, 0, 31), 3)), '2026-04-30', '1/31 + 3개월 = 4/30');
eq(dc.toInput(dc.addMonths(new Date(2026, 0, 15), 1)), '2026-02-15', '넘치지 않으면 그대로');
eq(dc.toInput(dc.addMonths(new Date(2026, 0, 31), -1)), '2025-12-31', '거꾸로도');
eq(dc.toInput(dc.addMonths(new Date(2026, 2, 31), -1)), '2026-02-28', '3/31 − 1개월 = 2/28');

eq(dc.isLeap(2024), true, '2024 윤년');
eq(dc.isLeap(2026), false, '2026 평년');
eq(dc.isLeap(2100), false, '100 으로 나뉘면 평년');
eq(dc.isLeap(2000), true, '400 으로 나뉘면 윤년');
eq(dc.daysInMonth(2024, 1), 29, '윤년 2월은 29일');
eq(dc.daysInMonth(2026, 1), 28, '평년 2월은 28일');

eq(dc.toInput(dc.shift(new Date(2026, 7, 9), { days: 10 })), '2026-08-19', '일 더하기');
eq(dc.toInput(dc.shift(new Date(2026, 7, 9), { weeks: 2 })), '2026-08-23', '주 더하기');
eq(dc.toInput(dc.shift(new Date(2024, 1, 29), { years: 1 })), '2025-02-28', '윤년 2/29 + 1년 = 2/28');

// 「며칠간」이 하루 갈리는 자리 — 둘 다 낸다.
const b = dc.between(new Date(2026, 7, 1), new Date(2026, 7, 10));
eq(b.days, 9, '끝날 안 세면 9일');
eq(b.inclusive, 10, '끝날까지 세면 10일');
eq(b.weeks, 1, '1주 + 2일');
eq(dc.weekdaysBetween(new Date(2026, 7, 3), new Date(2026, 7, 7)), 5, '월~금 = 평일 5일');
eq(dc.weekdaysBetween(new Date(2026, 7, 8), new Date(2026, 7, 9)), 0, '토·일만이면 0');

// D-Day 도 하루 갈린다 — 관례(시작일 1일째)와 단순 차이를 함께.
eq(dc.dday(new Date(2026, 7, 19), new Date(2026, 7, 9)).tag, 'D-10', '10일 남음');
eq(dc.dday(new Date(2026, 7, 9), new Date(2026, 7, 9)).tag, 'D-DAY', '오늘');
eq(dc.dday(new Date(2026, 7, 1), new Date(2026, 7, 9)).tag, 'D+8', '지난 날짜');
eq(dc.dday(new Date(2026, 7, 1), new Date(2026, 7, 9)).nth, 9, '시작일을 1일째로 세면 오늘이 9일째');

eq(dc.parseDate('2026-02-30'), null, '없는 날짜는 null');
eq(dc.parseDate('2026/08/09'), null, '형식이 다르면 null');
check(dc.run('shift', { date: '2026-01-31', months: 1 }).includes('마지막 날'), 'run 이 날짜를 맞췄다고 알려 준다');
check(dc.run('between', { start: '2026-08-01', end: '2026-08-10' }).includes('10일 (끝날까지 셈)'), 'run between 이 둘 다 낸다');
check(dc.run('dday', { date: '2026-08-19', today: '2026-08-09' }).includes('D-10'), 'run dday');
let dcThrew = 0;
for (const bad of [['shift', { date: '2026-08-09' }], ['shift', { date: '엉뚱', days: 1 }], ['between', { start: '2026-08-01' }], ['dday', { date: '2026-02-30' }]]) {
  try {
    dc.run(bad[0], bad[1]);
  } catch {
    dcThrew++;
  }
}
eq(dcThrew, 4, '더할 값 없음·잘못된 날짜·끝날 없음·없는 날짜는 전부 던진다');

// ── ②-21 charcount 알맹이 (「몇 글자?」의 답이 기준마다 다르다) ───────────────
const cc = await load('src/core/charcount.ts');

eq(cc.spec.id, 'charcount', 'charcount spec.id');

// 이모지는 사람이 보는 대로 한 글자여야 한다 — text.length 는 2로 센다.
eq('🦴'.length, 2, '(자바스크립트 기본은 2로 센다)');
eq(cc.chars('🦴').length, 1, '이모지는 한 글자');
eq(cc.count('🦴 뼈').withSpace, 3, '이모지+공백+한글 = 3자');

const c = cc.count('안녕 하세요');
eq(c.withSpace, 6, '공백 포함 6자');
eq(c.withoutSpace, 5, '공백 제외 5자 — 이 둘이 다른 게 요점');
eq(c.words, 2, '단어 2');
eq(c.hangul, 5, '한글 5');
eq(c.space, 1, '공백 1');

// 바이트 — 옛 시스템은 여기서 자른다. 한글은 UTF-8 3바이트, EUC-KR 2바이트.
eq(cc.byteLength('가', 'utf8'), 3, '한글 UTF-8 = 3바이트');
eq(cc.byteLength('가', 'euckr'), 2, '한글 EUC-KR = 2바이트');
eq(cc.byteLength('a', 'utf8'), 1, '영문 1바이트');
check(cc.byteLength('가나다', 'utf8') !== cc.byteLength('가나다', 'euckr'), '두 인코딩이 다르다 (같으면 이 칸이 무의미)');
eq(cc.euckrUnsafe('🦴 뼈').length, 1, 'EUC-KR 에 못 담는 글자를 집어낸다');
eq(cc.euckrUnsafe('안녕').length, 0, '한글은 담긴다');

// 문장 — 마지막에 마침표가 없어도 문장이다 (자소서 마지막 줄).
eq(cc.sentenceCount('하나. 둘. 셋.'), 3, '마침표 3개');
eq(cc.sentenceCount('하나. 둘. 셋'), 3, '마지막에 마침표가 없어도 3');
eq(cc.sentenceCount(''), 0, '빈 글은 0');
eq(cc.sentenceCount('물음표는요? 느낌표도!'), 2, '? ! 도 문장 끝');

// 원고지는 칸이라 줄이 바뀌면 남은 칸을 버린다.
eq(cc.manuscriptSheets(''), 0, '빈 글은 0장');
eq(cc.manuscriptSheets('가'.repeat(200)), 1, '200칸 = 1장');
eq(cc.manuscriptSheets('가'.repeat(201)), 2, '201칸 = 2장');
eq(cc.manuscriptSheets('가\n나'), 1, '줄이 바뀌면 남은 칸을 버린다 (2칸이 아니라 40칸 취급)');

eq(cc.count('').withSpace, 0, '빈 글');
eq(cc.count('').lines, 0, '빈 글은 0줄');
eq(cc.count('한 줄').lines, 1, '한 줄');
eq(cc.count('가\n\n나').paragraphs, 2, '빈 줄로 문단이 갈린다');

check(cc.run('count', { text: '안녕 하세요' }).includes('공백 포함 6자'), 'run count');
check(cc.run('count', { text: '안녕 하세요' }).includes('어느 기준인지'), '기준이 갈린다는 것을 말해 준다');
check(cc.run('count', { text: '🦴' }).includes('EUC-KR 로는 못 담는'), '못 담는 글자를 경고한다');
check(cc.run('fits', { text: '가'.repeat(10), limit: 20 }).includes('10 남음'), 'run fits 통과');
check(cc.run('fits', { text: '가'.repeat(30), limit: 20 }).includes('10 초과'), 'run fits 초과');
check(cc.run('fits', { text: '가'.repeat(10), limit: 20, basis: 'utf8' }).includes('UTF-8 바이트 30'), 'run fits 바이트 기준');
let ccThrew = 0;
for (const bad of [['fits', { text: 'a', limit: 0 }], ['fits', { text: 'a', limit: 10, basis: '엉뚱' }]]) {
  try {
    cc.run(bad[0], bad[1]);
  } catch {
    ccThrew++;
  }
}
eq(ccThrew, 2, '0 한도·모르는 기준은 던진다');

// ── ②-22 unitconv 알맹이 (평·돈 — LLM 이 어림값으로 답하는 자리) ─────────────
const uc = await load('src/core/unitconv.ts');

eq(uc.spec.id, 'unitconv', 'unitconv spec.id');

// 기본이 맞는지 먼저.
eq(uc.convert(1, 'km', 'm'), 1000, '1km = 1000m');
eq(uc.convert(1, 'inch', 'cm'), 2.54, '1인치 = 2.54cm');
eq(uc.convert(1, 'kg', 'g'), 1000, '1kg = 1000g');
eq(Math.round(uc.convert(1, 'mile', 'km') * 1000) / 1000, 1.609, '1마일 = 1.609km');

/* 이 도구의 값 — 한국 전통 단위. LLM 은 「1평 = 3.3㎡」로 답하는데 정확히는 3.3057851 이다.
   30평이면 0.17㎡ 차이 = 부동산에서 눈에 보이는 값. */
eq(uc.convert(1, 'pyeong', 'm2'), 3.3057851, '1평 = 3.3057851㎡');
check(uc.convert(1, 'pyeong', 'm2') !== 3.3, '3.3 으로 어림하면 안 된다');
check(Math.abs(uc.convert(30, 'pyeong', 'm2') - 99) > 0.1, `30평은 99㎡ 가 아니다: ${uc.convert(30, 'pyeong', 'm2')}`);
eq(uc.convert(1, 'don', 'g'), 3.75, '금 한 돈 = 3.75g');
eq(uc.convert(1, 'geun', 'g'), 600, '한 근 = 600g');
eq(uc.convert(1, 'nyang', 'g'), 37.5, '한 냥 = 37.5g');
eq(uc.convert(1, 'mal', 'l'), 18.039, '한 말 = 18.039L');
eq(Math.round(uc.convert(10, 'doe', 'l') * 1000) / 1000, 18.039, '열 되 = 한 말');

// 온도는 비선형 — 0 에서 안 만난다.
eq(uc.convert(0, 'c', 'f'), 32, '0°C = 32°F');
eq(uc.convert(100, 'c', 'f'), 212, '100°C = 212°F');
eq(uc.convert(-40, 'c', 'f'), -40, '-40 은 두 눈금이 만나는 점');
eq(uc.convert(0, 'c', 'k'), 273.15, '0°C = 273.15K');
eq(Math.round(uc.convert(98.6, 'f', 'c') * 10) / 10, 37, '98.6°F = 37°C');

// 데이터는 1024 기준.
eq(uc.convert(1, 'gb', 'mb'), 1024, '1GB = 1024MB');
eq(uc.convert(1, 'mb', 'b'), 1048576, '1MB = 1048576B');

// 갈래를 안 줘도 찾는다. 단 겹치는 id 는 못 찾는다 — 그때는 말해야 한다.
eq(uc.categoryOf('pyeong'), 'area', 'pyeong 은 area');
eq(uc.categoryOf('don'), 'weight', 'don 은 weight');
eq(uc.categoryOf('ms'), null, 'ms 는 speed·time 둘 다 있어 못 고른다');
eq(uc.convert(1, 'ms', 'sec', 'time'), 0.001, '갈래를 주면 된다');
/* 1m/s = 3.6km/h 인데 부동소수점은 3.6 을 정확히 못 담는다(3.5999999999999996).
   그래서 사람이 보는 값(`format`)으로 잰다 — 그게 이 함수가 있는 이유다. */
eq(uc.format(uc.convert(1, 'ms', 'kmh', 'speed')), '3.6', '같은 id 라도 갈래가 다르면 다른 답');
eq(uc.format(uc.convert(100, 'kmh', 'ms', 'speed')), '27.7777777778', '되돌리기도 사람이 읽는 값으로');

// 왕복 — 넣었다 빼면 원래대로.
for (const [v, a, b, cat] of [[7, 'pyeong', 'm2', 'area'], [3, 'don', 'g', 'weight'], [37, 'c', 'f', 'temp'], [5, 'mile', 'km', 'length']]) {
  const back = uc.convert(uc.convert(v, a, b, cat), b, a, cat);
  check(Math.abs(back - v) < 1e-9, `${a}↔${b} 왕복이 어긋난다: ${back} ≠ ${v}`);
}

check(uc.run('convert', { value: 30, from: 'pyeong', to: 'm2' }).includes('3.3057851'), 'run 이 어림 주의를 붙인다');
check(uc.run('convert', { value: 1, from: 'don', to: 'g' }).includes('3.75 g'), 'run 돈');
check(uc.run('list', {}).includes('pyeong'), 'run list');
let ucThrew = 0;
for (const bad of [{ value: 1, from: '엉뚱', to: 'm', category: 'length' }, { value: 1, from: 'ms', to: 'ms' }, { value: 'abc', from: 'm', to: 'km' }]) {
  try {
    uc.run('convert', bad);
  } catch {
    ucThrew++;
  }
}
eq(ucThrew, 3, '없는 단위·양쪽 다 갈래 모호·숫자 아님은 전부 던진다');
// 한쪽만 모호하면 **다른 쪽으로 찾아 준다** — 굳이 막을 이유가 없다.
eq(uc.convert(1, 'ms', 'sec'), 0.001, 'ms 는 모호하지만 sec 로 time 을 알아낸다');
// 환율은 **일부러 없다** — 실시간 값이라 알맹이가 가질 수 없다.
check('currency' in uc.FACTORS === false, '환율을 고정값으로 들고 있으면 안 된다');

// ── ②-23 wordfreq 알맹이 (조사를 안 떼면 상위가 같은 말로 채워진다) ───────────
const wf = await load('src/core/wordfreq.ts');

eq(wf.spec.id, 'wordfreq', 'wordfreq spec.id');

/* 이 도구가 있는 이유 자체 — 조사를 안 떼면 「도구를·도구가·도구는」이 다 다른 낱말이다. */
const sample = '도구를 만들고 도구가 좋으면 도구는 남는다';
const withP = wf.analyze(sample, { stopwords: false });
const noP = wf.analyze(sample, { particles: false, stopwords: false });
eq(withP.rows[0].word, '도구', '조사를 떼면 「도구」 하나로 묶인다');
eq(withP.rows[0].count, 3, '3회');
check(noP.rows.some((r) => r.word === '도구를'), '안 떼면 「도구를」이 따로 남는다');
check(noP.unique > withP.unique, `안 떼면 서로 다른 낱말이 더 많다 (${noP.unique} > ${withP.unique})`);

// 긴 조사부터 떼야 한다 — 「에서는」이 「에서」+「는」으로 갈리면 안 된다.
eq(wf.stripParticle('학교에서는'), '학교', '에서는 을 한 번에');
eq(wf.stripParticle('학교에서'), '학교', '에서');
eq(wf.stripParticle('사람으로부터'), '사람', '으로부터');
// 너무 짧은 말은 안 건드린다 — 「나의」에서 「의」를 떼면 뜻이 달라진다.
eq(wf.stripParticle('나의'), '나의', '두 글자는 그대로');
eq(wf.stripParticle('바다'), '바다', '조사가 아닌 끝소리는 안 뗀다');
eq(wf.stripParticle('가나다'), '가나다', '뗀 뒤 두 글자가 안 남으면 그대로');

// 뜻 없는 말 거르기.
const stopped = wf.analyze('그리고 그리고 바다 바다 바다');
check(stopped.rows.some((r) => r.word === '그리고') === false, '「그리고」는 걸러진다');
eq(stopped.rows[0].word, '바다', '남은 것 중 첫째');
check(wf.analyze('그리고 그리고 바다', { stopwords: false }).rows.some((r) => r.word === '그리고'), '끄면 안 거른다');

// 한 글자는 안 센다 (조사 떼고 남은 한 글자가 상위로 올라오면 쓸모없다).
check(wf.analyze('a b c 가 나 다').rows.length === 0, '한 글자는 안 센다');
eq(wf.analyze('').rows.length, 0, '빈 글');

// 붙어 나오는 두 낱말 — 반복하는 표현은 여기서 더 잘 보인다.
const ph = wf.analyze('좋은 하루 좋은 하루 나쁜 하루', { stopwords: false });
check(ph.phrases.some((p) => p.word === '좋은 하루' && p.count === 2), `「좋은 하루」가 2회로 잡혀야 한다: ${JSON.stringify(ph.phrases)}`);
check(ph.phrases.every((p) => p.count >= 2), '한 번만 나온 짝은 안 낸다');

// 영문은 기본이 소문자 통합.
eq(wf.analyze('Tool tool TOOL', { stopwords: false }).rows[0].count, 3, '대소문자를 묶는다');
eq(wf.analyze('Tool tool TOOL', { stopwords: false, caseSensitive: true }).rows[0].count, 1, '켜면 따로 센다');

check(wf.run('count', { text: sample }).includes('도구 — 3회'), 'run count');
check(
  wf.run('count', { text: sample }).includes('particle-stripping approximation'),
  '어림이라는 한계를 적어 둔다'
);
check(wf.run('count', { text: sample, top: 1 }).split('\n').filter((l) => /^\d+\./.test(l)).length === 1, 'top 개수를 지킨다');
let wfThrew = 0;
for (const bad of [{ text: '' }, { text: '가 나 다' }]) {
  try {
    wf.run('count', bad);
  } catch {
    wfThrew++;
  }
}
eq(wfThrew, 2, '빈 글·셀 낱말 없음은 던진다');

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

// ── ②-26 passgen 알맹이 (글자 종류로 세면 정확히 거꾸로 나온다) ──────────────
const pg = await load('src/core/passgen.ts');

eq(pg.spec.id, 'passgen', 'passgen spec.id');

/*
 * 이 도구가 있는 이유 그 자체.
 * 「대·소·숫자·기호가 다 있으면 강함」 규칙은 `Password1!` 을 통과시키고
 * `correcthorsebatterystaple` 을 탈락시킨다. 우리는 반대로 나와야 한다.
 */
const bad = pg.analyze('Password1!');
const good = pg.analyze('correcthorsebatterystaple');
check(
  good.bits > bad.bits,
  `흔한 단어+숫자+기호(${bad.bits.toFixed(1)}b) 보다 긴 낱말묶음(${good.bits.toFixed(1)}b) 이 세야 한다`
);
check(bad.score <= 1, `Password1! 은 약해야 한다 (지금 ${bad.score}/4)`);

// 치환을 되돌려도 같은 단어로 봐야 한다 — 여기서 못 잡으면 점수가 후해진다.
eq(pg.unleet('P@ssw0rd'), 'password', '치환 되돌리기');
eq(pg.unleet('L3tM31n'), 'letmein', '치환 되돌리기 2');
check(pg.analyze('P@ssw0rd').bits < 30, 'P@ssw0rd 는 30비트 미만이어야 한다');

// 판정은 **둘 중 작은 쪽**이다 — 안전 쪽으로 틀려야 한다.
for (const pw of ['qwerty123', 'abcd1234', 'aaaaaaaa', 'Tr0ub4dor&3', 'x9#Lq2!vBn']) {
  const r = pg.analyze(pw);
  check(r.bits <= r.naiveBits + 1e-9, `${pw}: 판정값이 순진한 값을 넘으면 안 된다`);
  check(r.bits <= r.patternBits + 1e-9, `${pw}: 판정값이 패턴값을 넘으면 안 된다`);
  eq(r.chunks.map((c) => c.text).join(''), pw, `${pw}: 덩어리를 이으면 원문이어야 한다`);
}

// 패턴은 실제로 잡혀야 한다 (안 잡히면 위 부등식은 그냥 통과한다 — 무의미한 초록).
const why = (pw) => pg.analyze(pw).chunks.map((c) => c.whyKey);
check(why('qwertyui').includes('keyboard'), '자판 줄을 잡는다');
check(why('abcdefgh').includes('sequence'), '연속을 잡는다');
check(why('abababab').includes('repeat'), '반복을 잡는다');
check(why('hello1998').includes('year'), '연도를 잡는다');
check(why('letmein').includes('common'), '흔한 단어를 잡는다');
check(why('x9#Lq2!v').includes('random'), '무작위는 무작위로 둔다');

// 길게 늘려도 반복이면 거의 안 늘어야 한다 (여기가 깨지면 도구가 거짓말을 한다).
const rep8 = pg.analyze('abababababababab');
const rep4 = pg.analyze('abababab');
check(rep8.bits - rep4.bits < 3, `반복은 늘려도 거의 안 는다 (${rep4.bits.toFixed(1)} → ${rep8.bits.toFixed(1)})`);

// 진짜 무작위는 길이에 비례해서 늘어야 한다.
const r10 = pg.analyze('x9#Lq2!vBn');
const r20 = pg.analyze('x9#Lq2!vBnZ4$wT7&mKe');
check(r20.bits > r10.bits * 1.7, `무작위는 길이만큼 는다 (${r10.bits.toFixed(1)} → ${r20.bits.toFixed(1)})`);

// 시간 표기 — 「4.3e12초」는 아무 것도 안 알려 준다.
eq(pg.humanTime(0.4), '즉시', '1초 미만');
check(/초$/.test(pg.humanTime(30)), '30초');
check(/분$/.test(pg.humanTime(300)), '5분');
check(pg.humanTime(1e30) === '사실상 불가능', '너무 크면 그렇게 말한다');
eq(pg.labelKo('veryWeak'), '매우 약함', '강도 key → 한국어');
eq(pg.labelKey(4), 'veryStrong', 'score → labelKey');
eq(pg.whyKo({ text: 'qwerty', bits: 1, kind: 'keyboard', whyKey: 'keyboard' }), '자판 줄', '약점 key → 한국어');

// 빈 값은 던진다 — 0점이 아니라 「잴 게 없다」다.
let pgThrew = false;
try {
  pg.analyze('');
} catch {
  pgThrew = true;
}
check(pgThrew, '빈 비밀번호는 던진다');

// 이름으로 부르는 창구가 실제로 돈다.
const pgOut = pg.run('strength', { password: 'Password1!' });
check(pgOut.includes('약'), 'run 이 판정을 글로 낸다');
check(pgOut.includes('흔한 단어'), 'run 이 왜 깎였는지 말한다');

// ── ②-29 daily 알맹이 (하루 경계·같은 시드·정답 안 새기) ──────────────────
const dl = await load('src/core/daily.ts');
eq(dl.spec.id, 'daily', 'daily spec.id');

/*
 * 이 substrate 의 유일한 함정 — **시간대**. 기기 시계로 「오늘」을 잡으면 하와이와 서울이
 * 다른 문제를 풀고, 그러면 공유 격자를 서로 견줄 수 없다. 그래서 KST 로 못을 박았고,
 * 여기서 그 못이 진짜 박혔는지 본다. (아래 시각들은 전부 같은 순간을 다르게 적은 것이다.)
 */
eq(dl.dateKST(new Date('2026-08-09T14:59:00Z')), '2026-08-09', 'UTC 14:59 = KST 23:59 → 아직 9일');
eq(dl.dateKST(new Date('2026-08-09T15:00:00Z')), '2026-08-10', 'UTC 15:00 = KST 자정 → 10일');
eq(dl.dateKST(new Date('2026-08-10T02:30:00Z')), '2026-08-10', '한국 낮');
// 로스앤젤레스 사람이 8월 9일 저녁에 열어도 한국은 이미 10일이다 — 같은 문제를 받아야 한다.
eq(dl.dateKST(new Date('2026-08-09T23:00:00-07:00')), '2026-08-10', '기기 시간대와 무관');

eq(dl.startOfDayKST('2026-08-10').toISOString(), '2026-08-09T15:00:00.000Z', 'KST 자정 = 전날 15시 UTC');
check(dl.msUntilNextKST(new Date('2026-08-09T15:00:00Z')) === 24 * 3600 * 1000, '자정 직후엔 하루가 남는다');
eq(dl.humanLeft(3 * 3600000 + 12 * 60000), '3시간 12분', '남은 시간 표기');
eq(dl.humanLeft(45 * 60000), '45분', '한 시간 미만');

/* 같은 날 같은 게임이면 누가 열어도 같은 수. 하루가 바뀌면 달라져야 한다. */
eq(dl.seedFor('a', '2026-08-10'), dl.seedFor('a', '2026-08-10'), '같은 입력 같은 시드');
check(dl.seedFor('a', '2026-08-10') !== dl.seedFor('a', '2026-08-11'), '날짜가 다르면 시드가 다르다');
check(dl.seedFor('a', '2026-08-10') !== dl.seedFor('b', '2026-08-10'), '게임이 다르면 시드가 다르다');

/* 시드가 같으면 뽑기·섞기도 같아야 한다 — 새로고침마다 문제가 바뀌면 데일리가 아니다. */
const items = ['가', '나', '다', '라', '마', '바', '사'];
const seed = dl.seedFor('x', '2026-08-10');
eq(dl.pickWith(dl.rngFrom(seed), items), dl.pickWith(dl.rngFrom(seed), items), '같은 시드 같은 뽑기');
eq(dl.shuffleWith(dl.rngFrom(seed), items).join(''), dl.shuffleWith(dl.rngFrom(seed), items).join(''), '같은 시드 같은 섞기');
check(dl.shuffleWith(dl.rngFrom(seed), items).join('') !== items.join(''), '섞이긴 한다');
eq(dl.shuffleWith(dl.rngFrom(seed), items).slice().sort().join(''), items.slice().sort().join(''), '섞어도 알맹이는 그대로');
eq(items.join(''), '가나다라마바사', '원본은 안 건드린다');

let emptyThrew = false;
try {
  dl.pickWith(dl.rngFrom(1), []);
} catch {
  emptyThrew = true;
}
check(emptyThrew, '고를 것이 없으면 던진다 (undefined 를 흘리지 않는다)');

/* 며칠째 — 공유 글의 번호. 사람들이 이걸로 같은 판인지 안다. */
eq(dl.dayNumber('2026-08-10'), 1, '첫날은 1일째');
eq(dl.dayNumber('2026-08-11'), 2, '다음 날은 2일째');

/*
 * ★ 공유 글에 **정답이 새면 안 된다.** 이 함수는 애초에 정답을 인자로 안 받는다 —
 * 받아 놓고 안 쓰면 언젠가 누가 편의로 끼워 넣는다. 그래서 「안 넣었나」가 아니라
 * 「넣을 수가 없나」를 확인한다.
 */
const M = (s2) => s2.split('').map((c) => (c === 'H' ? 'hit' : c === 'N' ? 'near' : 'miss'));
const shared = dl.shareText({
  title: '한글타자',
  date: '2026-08-11',
  rows: [M('MNMH'), M('HHHH')],
  tries: 2,
  maxTries: 6,
  url: 'https://blog.mascari4615.com/karmolab/t/chain/'
});
check(shared.startsWith('한글타자 #2 2/6'), `머리줄: ${shared.split('\n')[0]}`);
check(shared.includes('⬛🟨⬛🟩'), '격자 첫 줄');
check(/[가-힣]/.test(shared.split('\n').slice(1, 3).join('')) === false, '격자 줄에는 글자가 없다');
check(Object.keys(dl.MARK_CHAR).length === 3, '표시는 세 가지뿐');
const shareArgs = dl.shareText.length;
check(shareArgs === 1, '공유는 인자 하나(정답 자리 없음)');

// 못 맞힌 판은 X 로.
check(dl.shareText({ title: 'T', date: '2026-08-10', rows: [M('MMM')], tries: null, maxTries: 3 }).startsWith('T #1 X/3'), '실패는 X');

// 저장 열쇠에 게임·날짜가 둘 다 들어간다 (섞이면 어제 기록이 오늘로 보인다).
check(dl.playKey('g', '2026-08-10') !== dl.playKey('g', '2026-08-11'), '날짜가 열쇠에 들어간다');
check(dl.playKey('g', '2026-08-10') !== dl.playKey('h', '2026-08-10'), '게임이 열쇠에 들어간다');

// 이름으로 부르는 창구.
const dlOut = dl.run('today', { game: 'hangul-type', at: '2026-08-10T02:00:00Z' });
check(dlOut.includes('2026-08-10'), 'run 이 오늘 날짜를 낸다');
check(dlOut.includes('KST'), 'run 이 기준을 밝힌다');

// ── ②-28 chain 알맹이 (중간값이 모델을 안 거치게) ──────────────────────────
const ch = await load('src/core/chain.ts');
eq(ch.spec.id, 'chain', 'chain spec.id');

/* 가짜 손 하나로 판을 만든다 — 부르는 손을 밖에서 받는 설계라 시험이 쉽다. */
const calls = [];
const fakeCall = (tool, op, args) => {
  calls.push(`${tool}_${op}`);
  if (tool === 'upper') return String(args.text).toUpperCase();
  if (tool === 'wrap') return `[${args.text}]`;
  if (tool === 'boom') throw new Error('일부러 터짐');
  return `${tool}:${op}:${JSON.stringify(args)}`;
};

/* 이 도구가 있는 이유 자체 — 앞 결과가 뒤 인자로 들어간다. */
const two = ch.runChain(
  ch.parseSteps('[{"tool":"upper","op":"go","args":{"text":"ab"}},{"tool":"wrap","op":"go","args":{"text":"$1"}}]'),
  fakeCall
);
eq(two.length, 2, '두 단계가 다 돈다');
eq(two[1].output, '[AB]', '1번 결과가 2번 인자로 들어간다');

// 긴 글 안에 끼우기.
const inline = ch.runChain(
  ch.parseSteps('[{"tool":"upper","op":"go","args":{"text":"hi"}},{"tool":"wrap","op":"go","args":{"text":"a{{1}}b"}}]'),
  fakeCall
);
eq(inline[1].output, '[aHIb]', '{{1}} 은 글 안에 끼운다');

// 문자열이 아닌 인자는 그대로 둔다 (숫자를 글자로 바꾸면 뒤 도구가 다르게 읽는다).
eq(ch.resolve(42, ['x'], 2), 42, '숫자는 손대지 않는다');
eq(ch.resolve('$1', ['x'], 2), 'x', '$1 은 통째로 바뀐다');

/* 아직 안 나온 결과를 가리키면 **던져야 한다** — 안 그러면 「$5」 가 그대로 도구에 들어간다. */
for (const [bad, why] of [
  ['[{"tool":"upper","op":"go","args":{"text":"$1"}}]', '자기 자신'],
  ['[{"tool":"upper","op":"go","args":{"text":"a"}},{"tool":"wrap","op":"go","args":{"text":"$5"}}]', '뒤 단계']
]) {
  let threw = false;
  try {
    ch.runChain(ch.parseSteps(bad), fakeCall);
  } catch {
    threw = true;
  }
  check(threw, `${why} 를 가리키면 던진다`);
}

// 목록이 잘못됐을 때 — 셋 다 「무엇이 잘못됐는지」 말하고 멈춰야 한다.
for (const [bad, why] of [
  ['그냥글자', 'JSON 이 아님'],
  ['[]', '단계 0개'],
  ['[{"op":"go"}]', 'tool 없음'],
  ['[{"tool":"chain","op":"run","args":{}}]', 'chain 이 chain 을 부름']
]) {
  let threw = false;
  try {
    ch.parseSteps(bad);
  } catch {
    threw = true;
  }
  check(threw, `${why} → 던진다`);
}

// 상한 — 끝없이 이어 붙이지 못하게.
const many = JSON.stringify(Array.from({ length: ch.MAX_STEPS + 1 }, () => ({ tool: 'upper', op: 'go', args: {} })));
let overflowed = false;
try {
  ch.parseSteps(many);
} catch {
  overflowed = true;
}
check(overflowed, `${ch.MAX_STEPS}단계를 넘으면 던진다`);

/* 중간에 터지면 **몇 번째에서** 터졌는지 말해야 한다. 8단계짜리에서 그게 없으면 못 고친다. */
let where = '';
try {
  ch.runChain(
    ch.parseSteps('[{"tool":"upper","op":"go","args":{"text":"a"}},{"tool":"boom","op":"go","args":{}}]'),
    fakeCall
  );
} catch (e) {
  where = e.message;
}
check(where.includes('2번째'), `몇 번째에서 멈췄는지 말한다 (지금: ${where})`);
check(where.includes('일부러 터짐'), '원래 오류도 같이 말한다');

// 손이 없으면 조용히 넘어가지 않는다.
let noHand = false;
try {
  ch.run('run', { steps: '[]' }, {});
} catch {
  noHand = true;
}
check(noHand, 'deps.call 이 없으면 던진다');

// 글로 낼 때 **모든 단계**가 보여야 한다 (마지막만 주면 되짚을 수 없다).
const text = ch.run(
  'run',
  { steps: '[{"tool":"upper","op":"go","args":{"text":"ab"}},{"tool":"wrap","op":"go","args":{"text":"$1"}}]' },
  { call: fakeCall }
);
check(text.includes('1. upper_go'), '1번 단계가 보인다');
check(text.includes('2. wrap_go'), '2번 단계가 보인다');
check(text.trim().endsWith('[AB]'), '마지막 줄이 결과');

// ── ②-27 배선 — 알맹이가 있는데 화면이 안 쓰면 두 답이 갈린다 ─────────────────
/*
 * 2026-08-09 실제로 났던 일: `passgen` 알맹이를 만들었는데 화면 위젯에는 **옛 계산이 그대로**
 * 남아 있었다. 둘이 같은 질문에 정반대로 답했다(화면 「강함」 / MCP 「약함」). 타입 검사도,
 * 단위 검사도, 화면 검사도 전부 초록이었다 — 각자 자기 계산으로 맞기 때문이다.
 *
 * 그래서 **같은 이름이면 붙어 있어야 한다**를 규칙으로 박는다. 알맹이 `x` 가 있고 위젯 `x` 가
 * 있으면, 그 위젯은 `core/x` 를 불러야 한다. 화면이 없는 알맹이(도우미·MCP 전용)는 안 따진다.
 */
const widgetOf = (id) => {
  for (const rel of [`src/widgets/${id}.ts`, `src/widgets/tools/${id}.ts`]) {
    if (fs.existsSync(path.join(root, rel))) return rel;
  }
  return null;
};

let wired = 0;
for (const file of coreFiles) {
  const id = path.basename(file, '.ts');
  const rel = widgetOf(id);
  if (rel === null) continue;
  const body = fs.readFileSync(path.join(root, rel), 'utf8');
  /* 따옴표까지 봐야 한다 — `includes('core/vat')` 는 `core/vat2` 에도 걸려 안 문다(실측). */
  check(
    new RegExp(`core/${id}['"\`]`).test(body),
    `${rel} 가 core/${id} 를 안 쓴다 — 화면과 MCP 가 다른 답을 낼 수 있다`
  );
  wired++;
}
check(wired >= 20, `배선을 확인한 도구가 ${wired}개뿐 — 찾는 경로가 틀렸을 수 있다`);

// ── ②-30 AI 경로 고르기 (로컬 AI 는 「추가」이지 「전제」가 아니다) ─────────────
const ai = await load('src/lib/ai-route.ts');

/*
 * 철칙부터 잠근다 — **아무 것도 안 갖춘 사람에게도 도구는 열려야 한다.**
 * 이게 깨지면 「AI 때문에 도구가 안 열린다」가 되고, 그건 기능 추가가 아니라 기능 삭제다.
 */
const bare = ai.chooseRoute({ hasKey: false, webgpu: false, modelCached: false });
eq(bare.route, 'off', '아무 것도 없으면 도구만 (고장 아님)');
check(bare.why.includes('그대로'), `왜 그런지 사람 말로: ${bare.why}`);

eq(ai.chooseRoute({ hasKey: true, webgpu: false, modelCached: false }).route, 'remote', '키 있으면 원격');
eq(ai.chooseRoute({ hasKey: false, webgpu: true, modelCached: true }).route, 'local', '키 없어도 모델 있으면 로컬');
eq(ai.chooseRoute({ hasKey: false, webgpu: true, modelCached: false }).route, 'gate', '모델 없으면 물어본다');

/* 키가 있어도 「내보내기 싫다」를 골랐으면 그 뜻을 뒤집지 않는다. */
eq(ai.chooseRoute({ hasKey: true, webgpu: true, modelCached: true, preferLocal: true }).route, 'local', '로컬 선호가 키보다 먼저');
eq(ai.chooseRoute({ hasKey: true, webgpu: true, modelCached: false, preferLocal: true }).route, 'gate', '로컬 선호인데 모델 없으면 게이트');
/* 다만 로컬이 불가능하면 뜻을 지키다 아무 것도 못 하게 두지 않는다. */
eq(ai.chooseRoute({ hasKey: true, webgpu: false, modelCached: false, preferLocal: true }).route, 'remote', '로컬 불가면 원격으로');

/* 작은 기기는 시도조차 안 한다 — 시도해서 죽는 것보다 안 하는 편이 낫다. */
eq(ai.chooseRoute({ hasKey: false, webgpu: true, modelCached: true, tooSmall: true }).route, 'off', '버거운 기기는 끈다');

/*
 * ★ 실패는 **단계**로 가른다. 적재 실패에 「작게 해서 다시」를 권하면 안 된다 —
 * 모델이 아예 안 올라간 것이라 입력 크기와 무관하고, 그 권유는 사람을 헛돌게 한다.
 */
const loadFail = ai.explainFailure('load', 'ALLOC');
check(loadFail.say.includes('비어 있는'), '적재 실패는 「지금 비어 있는」 메모리를 짚는다');
check(/줄여|작게|해상도/.test(loadFail.say) === false, `적재 실패에 「줄여 보라」를 권하지 않는다: ${loadFail.say}`);
check(loadFail.retryable === true && loadFail.suggestRemote === true, '적재 실패는 재시도·원격 둘 다 권한다');

const run = ai.explainFailure('run');
check(/줄여/.test(run.say), '실행 중 실패는 입력을 줄이라고 한다 (여기서는 맞는 말)');
check(run.suggestRemote === false, '실행 실패는 원격을 권하지 않는다 (같은 입력이면 거기서도 무겁다)');

const unsupported = ai.explainFailure('support');
check(unsupported.retryable === false, '지원 안 하는 브라우저는 다시 해도 같다 — 버튼을 안 준다');
check(unsupported.say.includes('그대로'), '그래도 도구는 쓸 수 있다고 말한다');

/* 받기 전에 숫자를 먼저 말한다. 「잠시만 기다려 주세요」로는 아무도 못 고른다. */
const notice = ai.downloadNotice(120, 20);
check(notice.includes('120MB'), `크기를 말한다: ${notice}`);
check(/초|분/.test(notice), '걸리는 시간을 말한다');
check(notice.includes('다음부터'), '두 번째부터는 빠르다는 것도 말한다');

// ── ②-31 로컬 AI 엔진 데려오기 (한 번만·실패는 안 기억) ─────────────────────
const eng = await load('src/lib/ai-engine.ts');

check(eng.ENGINE_URL.includes('@4.2.0'), `주소에 판이 박혀 있다: ${eng.ENGINE_URL}`);
check(eng.ENGINE_URL.startsWith('https://'), '바깥에서 받는다 (저장소에 9.5MB 를 넣지 않는다)');

/* WebGPU 가 없으면 **받으러 가지도 않는다.** 못 쓸 것을 받게 하면 그건 그냥 데이터 낭비다. */
const NO_GPU = {};
const HAS_GPU = { gpu: {} };
eng.resetEngine();
let noGpu = null;
try {
  await eng.loadEngine(async () => ({ pipeline() {} }), NO_GPU);
} catch (e) {
  noGpu = e;
}
check(noGpu !== null && noGpu.info.stage === 'support', 'WebGPU 없으면 support 단계로 막는다');
check(noGpu.info.retryable === false, '다시 눌러도 같으니 버튼을 안 준다');

/* 이제 있다고 치고 — 두 곳에서 동시에 불러도 **한 번만** 받아야 한다 (9MB 를 두 번 받지 않게). */
eng.resetEngine();
let fetched = 0;
const fakeLoad = async () => {
  fetched++;
  await new Promise((r) => setTimeout(r, 10));
  return { pipeline: () => {} };
};
const [engA, engB] = await Promise.all([eng.loadEngine(fakeLoad, HAS_GPU), eng.loadEngine(fakeLoad, HAS_GPU)]);
eq(fetched, 1, '동시에 둘이 불러도 한 번만 받는다');
check(engA === engB, '둘이 같은 것을 받는다');
check(eng.engineLoaded() === true, '받아 뒀다고 표시된다');

/* 실패를 기억하면 새로고침 전까지 영영 못 켠다 — 버리고 다시 받을 수 있어야 한다. */
eng.resetEngine();
let boom = null;
try {
  await eng.loadEngine(async () => {
    throw new Error('네트워크 끊김');
  }, HAS_GPU);
} catch (e) {
  boom = e;
}
check(boom !== null && boom.info.stage === 'download', '못 받으면 download 단계');
check(boom.info.retryable === true, '다시 받아 볼 수 있다고 말한다');
check(eng.engineLoaded() === false, '실패는 기억하지 않는다');
let again = 0;
await eng.loadEngine(async () => {
  again++;
  return { pipeline: () => {} };
}, HAS_GPU);
eq(again, 1, '실패 뒤에 다시 부르면 진짜로 다시 받는다');

/* 받아지긴 했는데 모양이 다르면 — 조용히 넘기지 않는다. */
eng.resetEngine();
let odd = null;
try {
  await eng.loadEngine(async () => ({ '뭔가': 1 }), HAS_GPU);
} catch (e) {
  odd = e;
}
check(odd !== null && odd.info.stage === 'load', '모양이 다르면 load 단계로 알린다');

eng.resetEngine();

// ── ②-32 「AI 켜기」 게이트 (취소해도 도구는 멀쩡해야 한다) ────────────────
const gate = await load('src/lib/ai-gate.ts');

const makeGate = (fetchImpl) => {
  const seen = [];
  const g = new gate.AiGate({ sizeMb: 120, mbps: 20, fetch: fetchImpl, onChange: (v) => seen.push(v.state) });
  return { g, seen };
};

/* 열자마자 받지 않는다 — 오늘 이 도구를 쓰러 온 사람은 대개 AI 를 원해서 온 게 아니다. */
{
  let started = false;
  const { g } = makeGate(async () => {
    started = true;
  });
  eq(g.view().state, 'idle', '처음은 꺼져 있다');
  check(g.view().say.includes('그대로'), '꺼져 있어도 도구는 쓸 수 있다고 말한다');
  g.ask();
  eq(g.view().state, 'asking', '누르면 먼저 물어본다');
  check(started === false, '물어보는 단계에서는 아직 안 받는다');
  check(/120MB/.test(g.view().say), `받기 전에 크기를 보여 준다: ${g.view().say}`);
  check(/초|분/.test(g.view().say), '걸리는 시간도 보여 준다');
}

/* 받기 — 진행률이 오르고 끝나면 켜진다. */
{
  const { g, seen } = makeGate(async (onProgress) => {
    onProgress(30);
    onProgress(70);
  });
  g.ask();
  const ok = await g.accept();
  check(ok === true, '받으면 켜진다');
  eq(g.view().state, 'ready', '상태가 ready');
  eq(g.view().percent, 100, '끝나면 100%');
  check(seen.includes('loading'), `받는 중 상태를 거친다: ${seen.join('>')}`);
}

/*
 * ★ 이 게이트의 핵심 — **취소한 뒤에도 도구가 멀쩡해야 한다.**
 * 받다 만 상태를 남기면 다음에 무엇이 될지 아무도 모르고, 사람들은 다시는 안 누른다.
 */
{
  let aborted = false;
  let late = null;
  const { g } = makeGate(async (onProgress, signal) => {
    onProgress(40);
    signal.addEventListener('abort', () => {
      aborted = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    late = onProgress; // 취소 뒤에 늦게 오는 진행률
    onProgress(90);
  });
  g.ask();
  const running = g.accept();
  check(g.view().cancellable === true, '받는 중에는 취소할 수 있다');
  g.cancel();
  eq(g.view().state, 'idle', '취소하면 처음 상태로 (반쯤 켜진 상태를 안 남긴다)');
  eq(g.view().percent, 0, '진행률도 지운다');
  await running;
  check(aborted === true, '실제로 끊는 신호가 간다');
  check(late !== null, '늦은 진행률이 오긴 했다');
  eq(g.view().state, 'idle', '늦게 온 진행률이 화면을 되살리지 않는다');
  check(g.view().say.includes('그대로'), '취소 뒤에도 도구는 그대로');
  // 취소했다고 영영 못 켜는 것도 아니다.
  g.ask();
  eq(g.view().state, 'asking', '취소 뒤에 다시 물어볼 수 있다');
}

/* 실패 — 왜인지 말하고, 다시 해 볼 수 있는지도 말한다. */
{
  const { g } = makeGate(async () => {
    throw new Error('연결 끊김');
  });
  g.ask();
  const ok = await g.accept();
  check(ok === false, '실패하면 false');
  eq(g.view().state, 'failed', '상태가 failed');
  check(g.view().failure?.retryable === true, '받기 실패는 다시 해 볼 수 있다');
  check(g.view().say.includes('연결 끊김') || g.view().say.includes('받다'), `왜인지 말한다: ${g.view().say}`);
}

/* 다시 눌러도 같은 실패라면(지원 안 함) 버튼을 주지 않는다 — 눌러도 같은 실패는 괴롭힘이다. */
{
  const info = (await load('src/lib/ai-route.ts')).explainFailure('support');
  const err = Object.assign(new Error(info.say), { info });
  const { g } = makeGate(async () => {
    throw err;
  });
  g.ask();
  await g.accept();
  eq(g.view().state, 'failed', '지원 안 함도 failed');
  check(g.view().failure?.retryable === false, '다시 해도 같으니 재시도 X');
  const again = await g.retry();
  check(again === false, 'retry 를 불러도 안 한다');
}

// ── ②-33 로컬 전사 이음새 (16kHz 단일채널로 안 맞추면 빈 글자가 나온다) ─────
const tr = await load('src/lib/ai-transcribe.ts');

eq(tr.TARGET_HZ, 16000, 'Whisper 계열은 16kHz 고정');

/* 여러 채널은 평균 낸다 — 한쪽만 쓰면 반대쪽에만 담긴 말이 통째로 사라진다. */
const stereo = {
  sampleRate: 16000,
  numberOfChannels: 2,
  getChannelData: (i) => (i === 0 ? new Float32Array([1, 1, 1, 1]) : new Float32Array([0, 0, 0, 0]))
};
const trMixed = await tr.toModelAudio(new ArrayBuffer(0), async () => stereo);
eq(trMixed.length, 4, '길이는 그대로');
eq(trMixed[0], 0.5, '두 채널을 평균 낸다 (한쪽만 쓰지 않는다)');

/* 표본율이 다르면 다시 샘플링한다. 안 하면 모델이 돌긴 하는데 결과가 빈 글자다. */
const at48k = {
  sampleRate: 48000,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(48000)
};
const trDown = await tr.toModelAudio(new ArrayBuffer(0), async () => at48k);
eq(trDown.length, 16000, '48kHz 1초 → 16kHz 16000개');

const trSame = tr.resampleTo16k(new Float32Array([1, 2, 3]), 16000);
eq(trSame.length, 3, '이미 16kHz 면 손대지 않는다');
eq(tr.resampleTo16k(new Float32Array(32000), 32000).length, 16000, '32kHz 는 절반으로');

/* 모델이 준 것을 그대로 믿지 않는다 — 판마다 모양이 다르고, 없는 것을 지어내면 자막이 겹친다. */
eq(tr.normalize({ text: '  안녕  ' }).text, '안녕', '앞뒤 공백을 턴다');
eq(tr.normalize({}).text, '', '없으면 빈 글자 (undefined 를 흘리지 않는다)');
eq(tr.normalize({ text: 'x' }).chunks.length, 0, '토막이 없으면 빈 배열');
const trGood = tr.normalize({
  text: '안녕 반가워',
  chunks: [
    { timestamp: [0, 1.5], text: ' 안녕 ' },
    { timestamp: [1.5, null], text: '반가워' },
    { timestamp: [2, 3], text: '   ' }
  ]
});
eq(trGood.chunks.length, 1, '시각을 모르거나 빈 토막은 버린다 (0 으로 채우면 전부 첫 줄에 겹친다)');
eq(trGood.chunks[0].text, '안녕', '토막 글자도 턴다');

/* 자막으로 넘기는 모양 — 해자① 묶어 쓰기와 붙는 자리. */
const trSrt = tr.toSrt(trGood);
check(trSrt.startsWith('1' + String.fromCharCode(10) + '00:00:00,000 --> 00:00:01,500'), `SRT 시각 표기: ${trSrt.split(String.fromCharCode(10))[1]}`);
eq(tr.toSrt({ text: 'x', chunks: [] }), '', '토막이 없으면 자막도 없다 (빈 파일을 만들지 않는다)');

/* 전사 — 엔진을 가짜로 넣어 규칙만 잰다 (모델 없이도 여기까지는 잴 수 있다). */
let askedModel = null;
let askedOpts = null;
const fakeEngine = {
  pipeline: async (task, model) => {
    askedModel = { task, model };
    return async (audio, options) => {
      askedOpts = options;
      return { text: '테스트', chunks: [{ timestamp: [0, 1], text: '테스트' }] };
    };
  }
};
const trOut = await tr.transcribe(fakeEngine, new Float32Array(16000), { language: 'korean' });
eq(askedModel.task, 'automatic-speech-recognition', '전사 작업으로 부른다');
eq(askedModel.model, tr.TRANSCRIBE_MODEL, '판 박은 모델을 쓴다');
eq(askedOpts.language, 'korean', '언어를 알려 주면 넘긴다 (짧은 녹음에서 추정이 자주 틀린다)');
check(askedOpts.return_timestamps === true, '자막을 만들려면 시각이 필요하다');
eq(trOut.text, '테스트', '결과를 우리 모양으로 정리한다');

let emptyAudio = false;
try {
  await tr.transcribe(fakeEngine, new Float32Array(0));
} catch {
  emptyAudio = true;
}
check(emptyAudio, '빈 소리는 모델을 부르지 않고 던진다');

// ── ②-34 한글 타자 (영어처럼 세면 틀린다) ──────────────────────────────────
const ht = await load('src/core/hangultype.ts');
eq(ht.spec.id, 'hangultype', 'hangultype spec.id');

/* 글자 하나가 자소 둘~넷이다 — 이걸 안 세면 한타가 영타의 절반으로 나온다. */
eq(ht.타건수('가'), 2, '가 = 초성+중성');
eq(ht.타건수('강'), 3, '강 = 받침까지');
eq(ht.타건수('값'), 4, '값 = 겹받침(ㅄ)이라 넷');
eq(ht.타건수('왔'), 4, '왔 = 초성1 + 겹모음ㅘ2 + ㅆ1 (된소리는 시프트라 한 번)');
eq(ht.타건수('a'), 1, '영문은 한 번');
eq(ht.타건수(' '), 1, '공백도 한 번');
eq(ht.타건수('가a 강'), 2 + 1 + 1 + 3, '섞여도 더한다');

/* 된소리는 시프트 조합이라 한 번 — 두 번으로 세면 「빨리」가 실제보다 무거워진다. */
eq(ht.타건수('까'), 2, 'ㄲ 은 한 번');

const r1 = ht.score('안녕하세요', 5);
eq(r1.strokes, ht.타건수('안녕하세요'), '타수는 같은 셈을 쓴다');
eq(r1.perMinute, Math.round((r1.strokes / 5) * 60), '타/분');
eq(r1.accuracy, 100, '친 글을 안 주면 견줄 것이 없다');

/* 정확도는 글자 단위 — 받침 하나 틀린 것도 읽는 사람에겐 틀린 글자다. */
const r2 = ht.score('안녕하세요', 10, '안녕하세오');
eq(r2.wrong, 1, '한 글자 다름');
eq(r2.accuracy, 80, '5글자 중 1개 → 80%');

/* 중간에 그만둔 것을 100% 로 내주면 그 점수는 아무 뜻이 없다. */
const r3 = ht.score('안녕하세요', 10, '안녕');
eq(r3.wrong, 3, '모자란 만큼도 틀린 것으로 센다');
eq(r3.accuracy, 40, '5글자 중 2개만 맞음');

for (const [text, sec, why] of [['', 5, '빈 글'], ['가', 0, '0초'], ['가', -1, '음수 초']]) {
  let threw = false;
  try {
    ht.score(text, sec);
  } catch {
    threw = true;
  }
  check(threw, why + ' 는 던진다');
}

const out = ht.run('count', { text: '값' });
check(out.includes('타수: 4'), `run count: ${out.split(String.fromCharCode(10))[0]}`);
check(ht.run('speed', { text: '안녕', seconds: 2, typed: '안녕' }).includes('정확도: 100%'), 'run speed 가 정확도를 낸다');

// ── ②-35 한글 타자 데일리 (전원 같은 문장 · 문장은 안 새게) ────────────────
const dt = await load('src/core/dailytype.ts');
eq(dt.spec.id, 'dailytype', 'dailytype spec.id');

/* 데일리의 전부 — 같은 날이면 누가 열어도 같다. */
const q1 = dt.puzzleFor('2026-08-11');
const q1b = dt.puzzleFor('2026-08-11');
eq(q1.lines.join('|'), q1b.lines.join('|'), '같은 날 같은 문제');
check(dt.puzzleFor('2026-08-12').lines.join('|') !== q1.lines.join('|'), '다른 날 다른 문제');
eq(q1.lines.length, dt.LINES_PER_DAY, '한 판에 정해진 줄 수');
eq(new Set(q1.lines).size, q1.lines.length, '같은 문장이 두 번 안 나온다 (뽑기 X, 섞기 O)');
check(q1.strokes > 0, '총 타수를 알려 준다');
eq(q1.day, 2, '2026-08-11 은 2일째');

/* 문장은 우리 글에서 온다 — 손으로 적은 표가 아니다. */
const dtPool = (await load('src/core/type-pool.generated.ts')).TYPE_POOL;
check(dtPool.length >= 100, `문장 뭉치 ${dtPool.length}개`);
check(q1.lines.every((l) => dtPool.includes(l)), '문제는 뭉치 안에서만 나온다');

/* 채점 — 다 맞으면 🟩, 거의 맞으면 🟨, 아니면 ⬛. 셋이 아니면 「나아졌다」가 안 보인다. */
const dtPerfect = dt.grade(q1, { seconds: 30, typed: [...q1.lines] });
eq(dtPerfect.accuracy, 100, '그대로 치면 100%');
check(dtPerfect.marks.every((m) => m === 'hit'), '전부 맞음');
check(dtPerfect.perMinute > 0, '속도가 나온다');

const dtOneOff = [...q1.lines];
dtOneOff[0] = q1.lines[0].slice(0, -1) + '뷁'; // 한 글자만 다르게
const dtNear = dt.grade(q1, { seconds: 30, typed: dtOneOff });
eq(dtNear.marks[0], 'near', '한 글자 틀림은 「거의」 (실패와 같은 칸에 넣지 않는다)');
eq(dtNear.marks[1], 'hit', '나머지 줄은 그대로');

const dtBad = dt.grade(q1, { seconds: 30, typed: ['아무 말', '', ''] });
eq(dtBad.marks[1], 'miss', '안 친 줄은 틀림');

/* ★ 공유 글에 **문장이 새면 안 된다** — 그날 이 놀이는 끝난다. */
check(/[가-힣]{4,}/.test(dtPerfect.share.split(String.fromCharCode(10)).slice(1).join('')) === false,
  `격자 줄에 문장이 없다: ${dtPerfect.share.replace(new RegExp(String.fromCharCode(10), 'g'), ' / ')}`);
check(dtPerfect.share.startsWith('한글타자 #'), '머리줄에 번호');
check(dtPerfect.share.includes('타/분'), '속도는 자랑거리라 넣는다');
check(q1.lines.some((l) => dtPerfect.share.includes(l)) === false, '문제 문장이 통째로 안 들어간다');

/* 이름으로 부르는 창구. */
const dtOut = dt.run('today', { at: '2026-08-11T02:00:00Z' });
check(dtOut.includes('한글타자 #2'), 'run 이 오늘 문제를 낸다');
check(dtOut.includes('총 타수'), '총 타수도');
const dtScored = dt.run('today', { at: '2026-08-11T02:00:00Z', seconds: 30, typed: q1.lines.join(String.fromCharCode(10)) });
check(dtScored.includes('정확도: 100%'), '친 글을 주면 채점까지');

// ── ②-36 초성 맞히기 데일리 (정답이 새면 끝나는 놀이) ──────────────────────
const cho = await load('src/core/dailycho.ts');
eq(cho.spec.id, 'dailycho', 'dailycho spec.id');

const cq = cho.puzzleFor('2026-08-11');
eq(cq.questions.length, cho.WORDS_PER_DAY, '한 판 다섯 낱말');
eq(cho.puzzleFor('2026-08-11').questions[0].answer, cq.questions[0].answer, '같은 날 같은 문제');
check(cho.puzzleFor('2026-08-12').questions[0].answer !== cq.questions[0].answer, '다른 날 다른 문제');
eq(new Set(cq.questions.map((q) => q.answer)).size, cq.questions.length, '같은 낱말이 두 번 안 나온다');

/* 보여 주는 것은 초성뿐 — 답 글자가 섞이면 문제가 아니다. */
for (const q of cq.questions) {
  eq([...q.hint].length, q.length, '초성 수 = 글자 수');
  check(/^[ㄱ-ㅎ]+$/.test(q.hint), `초성만 보여 준다: ${q.hint}`);
  check(q.hint.includes(q.answer) === false, '문제에 답이 안 섞인다');
  check(q.tool.length > 0, '맞힌 뒤 보여 줄 도구가 붙어 있다');
}

/* 채점 — 「거의」가 있어야 실력이 느는 게 보인다(초성 퀴즈는 아깝게 빗나가는 일이 잦다). */
const allRight = cho.grade(cq, cq.questions.map((q) => q.answer));
eq(allRight.right, 5, '다 맞히면 5');
check(allRight.marks.every((m) => m === 'hit'), '전부 hit');

const choFirst = cq.questions[0];
const oneCharOff = [...choFirst.answer];
oneCharOff[0] = oneCharOff[0] === '가' ? '나' : '가';
const choNear = cho.grade(cq, [oneCharOff.join('')]);
eq(choNear.marks[0], 'near', '글자 수 같고 한 글자만 다르면 「거의」');

eq(cho.grade(cq, ['아']).marks[0], 'miss', '글자 수가 다르면 틀림');
eq(cho.grade(cq, []).marks[0], 'miss', '안 쓰면 틀림');
check(cho.grade(cq, [' ' + choFirst.answer + ' ']).marks[0] === 'hit', '앞뒤 공백은 봐준다');

/* ★ 공유 글에 정답이 새면 그날 이 놀이는 끝난다. */
const sharedCho = allRight.share;
check(cq.questions.every((q) => sharedCho.includes(q.answer) === false), `정답이 안 담긴다: ${sharedCho.split(String.fromCharCode(10)).join(' / ')}`);
check(sharedCho.startsWith('초성 #'), '머리줄에 번호');

/* 창구 — 답을 안 주면 문제만, 주면 채점과 함께 답·도구를 알려 준다. */
const choQ0 = cho.run('today', { at: '2026-08-11T02:00:00Z' });
check(choQ0.includes('초성 #2'), 'run 이 오늘 문제를 낸다');
check(cq.questions.every((q) => choQ0.includes(q.answer) === false), '답을 안 주면 정답도 안 보여 준다');
const choScored = cho.run('today', { at: '2026-08-11T02:00:00Z', answers: cq.questions.map((q) => q.answer).join(',') });
check(choScored.includes('5/5 맞힘'), 'run 이 채점한다');

const NL_ = String.fromCharCode(10);

// ── ②-37 문자 변환 허브 (눈으로 구분이 안 되는 글자들) ─────────────────────
const conv = await load('src/core/charconv.ts');
eq(conv.spec.id, 'charconv', 'charconv spec.id');

/* 전각·반각 — 화면에서는 폭만 다른데 다른 글자다. 검색이 0건 나오는 이유가 대개 이것. */
eq(conv.toHalfWidth('ＡＢ１２'), 'AB12', '전각 영숫자 → 반각');
eq(conv.toFullWidth('AB12'), 'ＡＢ１２', '반각 → 전각');
eq(conv.toHalfWidth('가나'), '가나', '한글은 안 건드린다');
eq(conv.toHalfWidth('　'), ' ', '전각 공백(U+3000)도 되돌린다');
eq(conv.toFullWidth(' '), '　', '반대도');
eq(conv.toHalfWidth(conv.toFullWidth('Hello, World! 123')), 'Hello, World! 123', '갔다 오면 그대로');
check(conv.hasFullWidth('ABＣ'), '섞인 것을 찾아낸다');
check(conv.hasFullWidth('ABC') === false, '없으면 없다고');

/* 로마자 — 글자 대응표. 음운 변화는 안 한다는 것을 **답에 적는지**까지 본다. */
eq(conv.romanize('한글'), 'hangeul', '한글 → hangeul');
eq(conv.romanize('서울'), 'seoul', '서울');
eq(conv.romanize('부산'), 'busan', '부산');
eq(conv.romanize('제주'), 'jeju', '제주');
eq(conv.romanize('가a나'), 'gaana', '한글 아닌 글자는 그대로 둔다');
eq(conv.romanize('a1'), 'a1', '영숫자는 그대로');

/* ★ 틀린 값을 맞다고 내놓지 않는다 — 「신라」는 규정상 Silla 인데 우리는 sinla 를 낸다.
 * 그 사실을 답에 적는 것이 이 도구가 믿을 만해지는 유일한 길이다. */
eq(conv.romanize('신라'), 'sinra', '음운 변화를 적용하지 않는다 (표대로 ㄹ=r → sinra)');
check(conv.needsSoundChange('신라'), '소리가 바뀔 자리를 알아본다');
check(conv.needsSoundChange('바다') === false, '받침이 없으면 걱정 없다');
check(conv.needsSoundChange('강아지') === false, '뒤가 ㅇ 이면 연음이라 표기가 안 바뀐다');
const convRoman = conv.run('roman', { text: '신라' });
check(convRoman.includes('Silla'), `규정 표기를 알려 준다: ${convRoman.split(String.fromCharCode(10)).pop()}`);

/* 자모 — 이미 있는 알맹이를 부른다(두 벌로 만들지 않는다). */
eq(conv.run('jamo', { text: '한' }), (await load('src/core/jamo.ts')).decompose('한'), 'jamo 알맹이와 같은 답');

const convWidth = conv.run('width', { text: 'ＡＢ' });
check(convWidth.startsWith('AB'), 'run width');
check(convWidth.includes('full-width characters were mixed in'), '왜 안 되던 건지 알려 준다');

/* 간체 ⟷ 번체 — 규칙이 아니라 표다(유니코드 Unihan 에서 찍었다). 표가 실제로 실렸는지부터. */
eq(conv.toSimplified('漢字變換'), '汉字变换', '번체 → 간체');
eq(conv.toTraditional('汉字变换'), '漢字變換', '간체 → 번체');
eq(conv.toSimplified('汉字'), '汉字', '이미 간체면 그대로');
eq(conv.toSimplified('가나 abc'), '가나 abc', '한글·영문은 안 건드린다');
eq(conv.toSimplified('這是漢字'), '这是汉字', '문장째로');

/* ★ 조용히 틀리지 않는 자리 — 发 는 「보내다(發)」와 「머리카락(髮)」이 합쳐진 글자다.
 * 하나를 고르되 갈렸다는 사실을 반드시 말해야 한다. 이걸 안 하면 틀린 글이 그냥 나간다. */
const convAmb = conv.ambiguousChars('发', true);
eq(convAmb.length, 1, '갈리는 글자를 골라낸다');
check(convAmb[0].candidates.length > 1, `发 의 후보가 여럿: ${convAmb[0].candidates.join('')}`);
eq(conv.ambiguousChars('汉字', true).length, 0, '안 갈리는 글자는 조용히');

const convHan = conv.run('han', { text: '漢字' });
check(convHan.startsWith('汉字'), `run han: ${convHan.split(NL_)[0]}`);
const convHanAmb = conv.run('han', { text: '发', mode: 'trad' });
check(convHanAmb.includes('need meaning/context'), '갈리는 글자는 답에 함께 적는다');
check(convHanAmb.includes('發') && convHanAmb.includes('髮'), `후보를 다 보여 준다: ${convHanAmb.split(NL_).pop()}`);

/* 병음 — 표를 **건네받는** 자리다. 표는 묶음에 없다(2만 자·167KB). */
const pyRaw = JSON.parse(fs.readFileSync('data/han-pinyin.json', 'utf8'));
const pyTable = conv.parsePinyinTable(pyRaw);
eq(conv.pinyinOf(pyTable, '汉字'), 'hàn zì', '한자 → 병음(성조 부호)');
eq(conv.pinyinOf(pyTable, '汉字', 'number'), 'han4 zi4', '성조를 숫자로');
eq(conv.pinyinOf(pyTable, '汉字', 'none'), 'han zi', '성조를 뺀다');
eq(conv.toneNumber('hàn'), 'han4', '내림 성조 = 4');
eq(conv.toneNumber('mā'), 'ma1', '평 성조 = 1');
eq(conv.toneNumber('má'), 'ma2', '오름 = 2');
eq(conv.toneNumber('mǎ'), 'ma3', '내렸다 오름 = 3');
eq(conv.toneNumber('ma'), 'ma5', '부호가 없으면 경성 = 5');
eq(conv.toneNumber('lǜ'), 'lü4', 'ü 의 두 점은 성조가 아니라 글자다 — 지우면 안 된다');
eq(conv.stripTone('lǜ'), 'lü', '성조만 빼고 ü 는 남긴다');
eq(conv.pinyinOf(pyTable, 'abc 123'), 'abc 123', '한자가 아니면 그대로');

/* ★ 표 없이 부르면 **원문을 그대로 돌려주지 않는다** — 그러면 안 바뀐 걸 모르고 넘어간다. */
let pyThrew = false;
try {
  conv.run('pinyin', { text: '汉' });
} catch {
  pyThrew = true;
}
check(pyThrew, '표 없이 부르면 못 한다고 말한다');

const pyOut = conv.run('pinyin', { text: '汉字' }, { hanPinyin: pyRaw });
check(pyOut.startsWith('hàn zì'), `run pinyin: ${pyOut.split(NL_)[0]}`);
check(pyOut.includes('character-by-character only'), '문맥은 못 본다는 사실을 답에 적는다');

let convThrew = false;
try {
  conv.run('width', { text: '' });
} catch {
  convThrew = true;
}
check(convThrew, '빈 글은 던진다');

// ── ②-38 흐른 시간 세기 (달을 30일로 나누면 틀린다) ────────────────────────
const lc = await load('src/core/livecount.ts');
eq(lc.spec.id, 'livecount', 'livecount spec.id');

const D = (s2) => new Date(s2);

/* ★ 달은 달력대로 — 30일로 나누면 3월생과 2월생의 나이가 달라진다. */
const oneMonth = lc.elapsed(D('2026-01-31T00:00:00'), D('2026-02-28T00:00:00'));
eq(oneMonth.months, 0, '1월 31일 → 2월 28일 은 아직 한 달이 안 됐다');
eq(oneMonth.days, 28, '28일 지남');
const exactMonth = lc.elapsed(D('2026-01-15T00:00:00'), D('2026-02-15T00:00:00'));
eq(exactMonth.months, 1, '15일 → 15일 은 딱 한 달');
eq(exactMonth.days, 0, '날짜 나머지 0');

const oneYear = lc.elapsed(D('2025-08-10T00:00:00'), D('2026-08-10T00:00:00'));
eq(oneYear.years, 1, '1년');
eq(oneYear.months, 0, '나머지 개월 0');

/* 시·분·초가 모자라면 윗자리에서 빌린다. */
const borrow = lc.elapsed(D('2026-08-09T23:30:00'), D('2026-08-10T00:15:00'));
eq(borrow.days, 0, '하루가 안 됐다');
eq(borrow.hours, 0, '0시간');
eq(borrow.minutes, 45, '45분');

/* 미래는 「-3일」이 아니라 「남음」이다. */
const soon = lc.elapsed(D('2026-08-20T00:00:00'), D('2026-08-10T00:00:00'));
check(soon.future === true, '미래를 알아본다');
eq(soon.days, 10, '10일');
eq(lc.humanElapsedParts(soon).tailKey, 'future', '미래 tail key');
eq(lc.humanElapsedParts(soon).parts.join(' '), '10일', '미래 parts');
check(lc.humanElapsed(soon).endsWith('남음'), `남았다고 말한다: ${lc.humanElapsed(soon)}`);
check(lc.humanElapsed(lc.elapsed(D('2026-08-01T00:00:00'), D('2026-08-10T00:00:00'))).endsWith('지남'), '과거는 지났다고');

/* 0인 앞자리는 안 읽는다 — 「0년 0개월 3일」은 읽기 나쁘다. */
const short = lc.humanElapsed(lc.elapsed(D('2026-08-07T00:00:00'), D('2026-08-10T00:00:00')));
eq(short, '3일 지남', `짧은 것은 짧게: ${short}`);
const hoursOnly = lc.humanElapsed(lc.elapsed(D('2026-08-10T00:00:00'), D('2026-08-10T05:30:00')));
check(hoursOnly.includes('시간'), `하루 미만은 시간으로: ${hoursOnly}`);
eq(lc.detailKo(lc.elapsed(D('2026-08-10T00:00:00'), D('2026-08-10T05:30:00'))), '0년 0개월 0일 5시간 30분 0초', '자세히 helper');

/* 비율 환산 — 값은 내되 「어림」은 부르는 쪽이 붙인다. */
const tenDays = lc.elapsed(D('2026-08-01T00:00:00'), D('2026-08-11T00:00:00'));
eq(lc.project(tenDays, 3), 30, '하루 3번 × 10일 = 30');
eq(lc.project(tenDays, 0), 0, '0이면 0');
let lcThrew = false;
try {
  lc.project(tenDays, -1);
} catch {
  lcThrew = true;
}
check(lcThrew, '음수 횟수는 던진다');

const rateOut = lc.run('rate', { at: '2026-08-01T00:00:00', now: '2026-08-11T00:00:00', perDay: 3, unit: '잔' });
check(rateOut.startsWith('30잔'), `run rate: ${rateOut.split(String.fromCharCode(10))[0]}`);
check(rateOut.includes('어림'), '어림이라고 반드시 적는다');

const sinceOut = lc.run('since', { at: '2026-01-15T00:00:00', now: '2026-02-15T00:00:00' });
check(sinceOut.includes('1개월'), 'run since');
check(sinceOut.includes('달력대로'), '어떻게 셌는지 밝힌다');

let badDate = false;
try {
  lc.run('since', { at: '어제' });
} catch {
  badDate = true;
}
check(badDate, '못 읽는 날짜는 던진다');

// ── ②-39 3D 파일 읽기 (이진 STL 을 글자로 판단하면 자주 틀린다) ────────────
const m3 = await load('src/core/mesh3d.ts');
eq(m3.spec.id, 'mesh3d', 'mesh3d spec.id');

/* 이진 STL 을 손으로 만든다 — 삼각형 하나. */
const makeBinStl = (count, header = 'solid something') => {
  const buf = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buf);
  const head = new TextEncoder().encode(header);
  new Uint8Array(buf).set(head.slice(0, 80), 0);
  view.setUint32(80, count, true);
  let at = 84;
  for (let t = 0; t < count; t++) {
    at += 12;
    const pts = [0, 0, 0, 10, 0, 0, 0, 20, 0];
    for (const v of pts) {
      view.setFloat32(at, v, true);
      at += 4;
    }
    at += 2;
  }
  return new Uint8Array(buf);
};

/*
 * ★ 머리 80바이트에 「solid」 가 들어 있는 이진 파일이 흔하다 — 글자로 판단하면 여기서 틀린다.
 * 그래서 길이(84 + 삼각형수 × 50)로 본다.
 */
const m3Bin = makeBinStl(1);
check(m3.isBinaryStl(m3Bin), 'solid 로 시작해도 길이가 맞으면 이진이다');
const binMesh = m3.parseMesh(m3Bin, 'a.stl');
eq(binMesh.triangles, 1, '삼각형 1개');
eq(binMesh.positions.length, 9, '꼭짓점 9개 값');
eq(binMesh.max[0], 10, 'x 최대 10');
eq(binMesh.max[1], 20, 'y 최대 20');

/* 글자 STL. */
const asciiStl = ['solid t', 'facet normal 0 0 1', 'outer loop',
  'vertex 0 0 0', 'vertex 4 0 0', 'vertex 0 6 0', 'endloop', 'endfacet', 'endsolid t'].join(String.fromCharCode(10));
check(m3.isBinaryStl(new TextEncoder().encode(asciiStl)) === false, '글자 STL 은 길이가 안 맞는다');
const asciiMesh = m3.parseMesh(new TextEncoder().encode(asciiStl), 't.stl');
eq(asciiMesh.triangles, 1, '글자 STL 도 1개');
eq(asciiMesh.max[1], 6, 'y 최대 6');

/* ★ OBJ 의 사각형 면 — 안 쪼개면 모델이 군데군데 뚫린다(블렌더 기본 내보내기가 사각형이다). */
const objQuad = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4'].join(String.fromCharCode(10));
const m3Quad = m3.parseObj(objQuad);
eq(m3Quad.triangles, 2, '사각형 하나 → 삼각형 둘');

const objSlash = ['v 0 0 0', 'v 2 0 0', 'v 0 3 0', 'f 1/1/1 2/2/2 3/3/3'].join(String.fromCharCode(10));
eq(m3.parseObj(objSlash).triangles, 1, 'f 1/2/3 꼴에서 앞 번호만 쓴다');

const objNeg = ['v 0 0 0', 'v 5 0 0', 'v 0 5 0', 'f -3 -2 -1'].join(String.fromCharCode(10));
eq(m3.parseObj(objNeg).triangles, 1, '음수 번호는 뒤에서부터 센다');

let objThrew = false;
try {
  m3.parseObj(['v 0 0 0', 'f 1 2 3'].join(String.fromCharCode(10)));
} catch {
  objThrew = true;
}
check(objThrew, '없는 꼭짓점을 가리키면 던진다 (조용히 뚫린 모델을 내지 않는다)');

/* 크기 — 인쇄 전에 보는 그 숫자. */
const m3Info = m3.describe(m3Quad);
eq(m3Info.size[0], 1, '가로 1');
eq(m3Info.longest, 1, '가장 긴 변');
eq(m3Info.center[0], 0.5, '가운데');

const m3Out = m3.run('info', { text: objQuad, format: 'obj' });
check(m3Out.includes('Triangles: 2'), `run m3Info: ${m3Out.split(String.fromCharCode(10))[0]}`);
check(m3Out.includes('Units are not written in the file'), '단위가 없다는 사실을 밝힌다');

let m3Threw = false;
try {
  m3.parseMesh(new TextEncoder().encode('hello'), 'x.txt');
} catch {
  m3Threw = true;
}
check(m3Threw, '모르는 파일은 던진다');

// ── 견주기 (TASK-KL-316) ────────────────────────────────────────────────────
const df = await load('src/core/diff.ts');

const dfEdits = df.diffLines('a\nb\nc', 'a\nx\nc');
eq(df.countEdits(dfEdits).added, 1, 'diff 늘어난 줄');
eq(df.countEdits(dfEdits).removed, 1, 'diff 줄어든 줄');
eq(df.countEdits(dfEdits).same, 2, 'diff 그대로인 줄');
eq(df.countEdits(df.diffLines('a\nb', 'a\nb')).added, 0, '같은 글은 다른 데가 없다');
eq(df.countEdits(df.diffLines('A\nb', 'a\nb', { ignoreCase: true })).added, 0, '대소문자 무시');
eq(df.countEdits(df.diffLines('a  b', 'a b', { ignoreWs: true })).added, 0, '띄어쓰기 무시');
check(df.toUnified(df.diffLines('a\nb\nc', 'a\nx\nc')).startsWith('@@'), 'unified 머리');

/* 자리만 바뀐 것은 「옮김」이지 지우고 넣은 것이 아니다 — 이 도구의 존재 이유다. */
const dfMoved = df.diffStructure({ a: 1, b: 2 }, { b: 2, a: 1 });
eq(dfMoved.length, 0, '열쇠 차례가 바뀐 것은 다름이 아니다');
const dfArr = df.diffStructure([1, 2, 3], [3, 1, 2]);
check(dfArr.every((c) => c.kind === 'move'), `배열 자리 바뀜은 옮김: ${JSON.stringify(dfArr)}`);
const dfChanged = df.diffStructure({ user: { name: 'yon', age: 3 } }, { user: { name: 'ring', age: 3 } });
eq(dfChanged.length, 1, '바뀐 값 하나');
eq(dfChanged[0].path, 'user.name', '열쇠 경로로 짚는다');
eq(df.diffStructure({ a: 1 }, { a: 1, b: 2 })[0].kind, 'add', '새 열쇠는 더함');

const dfMerge = df.merge3('a\nb\nc', 'a\nB\nc', 'a\nb\nC');
eq(dfMerge.conflicts, 0, '서로 다른 줄을 고치면 안 부딪힌다');
check(dfMerge.text.includes('B') && dfMerge.text.includes('C'), `양쪽 고침이 다 남는다: ${JSON.stringify(dfMerge.text)}`);
const dfClash = df.merge3('a\nb', 'a\nX', 'a\nY');
eq(dfClash.conflicts, 1, '같은 줄을 둘 다 고치면 부딪힌다');
check(dfClash.text.includes('<<<<<<<'), '부딪힌 자리에 표식이 선다');

// ── curl 옮기기 (TASK-KL-316) ───────────────────────────────────────────────
const ck = await load('src/core/curlkit.ts');

const ckReq = ck.parseCurl(`curl -X POST 'https://api.example.com/v1/items' -H 'Content-Type: application/json' -d '{"name":"yon"}'`);
eq(ckReq.method, 'POST', 'curl 방법');
eq(ckReq.url, 'https://api.example.com/v1/items', 'curl 주소');
eq(ckReq.headers['Content-Type'], 'application/json', 'curl 헤더');
eq(ckReq.body, '{"name":"yon"}', 'curl 몸통');
eq(ck.parseCurl('curl https://a.example.com').method, 'GET', '-X 없고 몸통 없으면 GET');
eq(ck.parseCurl(`curl https://a.example.com -d 'x=1'`).method, 'POST', '몸통이 있으면 POST');
/* 줄 끝 `\` 로 이어 붙인 여러 줄 — 사람이 복사해 오는 모양 그대로 */
const ckMulti = ck.parseCurl("curl 'https://a.example.com' \\\n  -H 'A: 1' \\\n  -H 'B: 2'");
eq(Object.keys(ckMulti.headers).length, 2, '여러 줄 curl 헤더 둘');

const ckFetch = ck.toCode(ckReq, 'fetch');
check(ckFetch.includes("method: 'POST'") && ckFetch.includes('await fetch('), `fetch 로 옮김: ${ckFetch.split('\n')[0]}`);
check(ck.toCode(ckReq, 'python').includes('requests.post('), '파이썬으로 옮김');
check(ck.toCode(ckReq, 'go').includes('http.NewRequest("POST"'), 'Go 로 옮김');
check(ck.toCode(ckReq, 'axios').includes("method: 'post'"), 'axios 로 옮김');
/* 되돌려 적은 curl 을 다시 읽으면 같은 것이 나와야 한다 (왕복) */
const ckRound = ck.parseCurl(ck.toCode(ckReq, 'curl'));
eq(ckRound.method, ckReq.method, 'curl 왕복 — 방법');
eq(ckRound.url, ckReq.url, 'curl 왕복 — 주소');
eq(ckRound.body, ckReq.body, 'curl 왕복 — 몸통');

// ── 설정 옮기기 (TASK-KL-316) ───────────────────────────────────────────────
const cfg = await load('src/core/configconv.ts');

eq(cfg.detect('{"a":1}'), 'json', '무엇인지 알아본다 — json');
eq(cfg.detect('a: 1\nb:\n  c: 2'), 'yaml', '무엇인지 알아본다 — yaml');
eq(cfg.detect('[server]\nport = 8080'), 'toml', '무엇인지 알아본다 — toml');
eq(cfg.detect('DB_HOST=localhost\nDB_PORT=5432'), 'env', '무엇인지 알아본다 — env');

const ccYaml = cfg.parse('name: yon\nage: 3\nlikes:\n  - acorn\n  - nap\nhome:\n  room: inside\n  warm: true', 'yaml');
eq(ccYaml.name, 'yon', 'yaml 값');
eq(ccYaml.age, 3, 'yaml 숫자');
eq(ccYaml.likes.length, 2, 'yaml 목록');
eq(ccYaml.likes[0], 'acorn', 'yaml 목록 첫 칸');
eq(ccYaml.home.warm, true, 'yaml 중첩·참거짓');

const ccToml = cfg.parse('title = "wm"\n\n[server]\nport = 8080\nhosts = ["a", "b"]', 'toml');
eq(ccToml.title, 'wm', 'toml 값');
eq(ccToml.server.port, 8080, 'toml 표 안 숫자');
eq(ccToml.server.hosts[1], 'b', 'toml 배열');

const ccEnv = cfg.parse('export DB_HOST=localhost\nDB_PORT=5432\n# 주석\n', 'env');
eq(ccEnv.DB_HOST, 'localhost', 'env 값 (export 도 읽는다)');
eq(ccEnv.DB_PORT, 5432, 'env 숫자');

/* 왕복 — YAML 로 찍고 다시 읽으면 같은 나무여야 한다 */
const ccTree = { name: 'yon', age: 3, home: { room: 'inside', warm: true }, likes: ['acorn', 'nap'] };
const ccBack = cfg.parse(cfg.emit(ccTree, 'yaml'), 'yaml');
eq(JSON.stringify(ccBack), JSON.stringify(ccTree), 'yaml 왕복');
const ccTomlBack = cfg.parse(cfg.emit(ccTree, 'toml'), 'toml');
eq(ccTomlBack.home.room, 'inside', 'toml 왕복 — 중첩');
eq(cfg.emit(ccTree, 'env').includes('HOME_ROOM=inside'), true, 'env 는 평평하게 편다');
eq(cfg.emit(ccTree, 'properties').includes('home.room=inside'), true, 'properties 는 점으로 편다');

// ── 깨진 글자 되살리기 (TASK-KL-316) ────────────────────────────────────────
const ed = await load('src/core/encdetective.ts');

/* 진짜로 깨뜨려 놓고 되살아나는지 본다 — 손으로 지어낸 예시는 「되는 척」을 만든다. */
const edPlain = '안녕하세요 반갑습니다';
const edBytes = new TextEncoder().encode(edPlain);
const edAsLatin1 = Array.from(edBytes).map((b) => String.fromCharCode(b)).join('');
eq(ed.bestFix(edAsLatin1).text, edPlain, 'UTF-8 을 latin1 으로 읽은 깨짐을 되살린다');
check(ed.bestFix(edAsLatin1).how.includes('latin1') || ed.bestFix(edAsLatin1).how.includes('cp1252'), '무슨 일이 있었는지 이름을 댄다');

/* 두 겹으로 씌운 경우 */
const edDouble = Array.from(new TextEncoder().encode(edAsLatin1)).map((b) => String.fromCharCode(b)).join('');
eq(ed.bestFix(edDouble).text, edPlain, '두 겹 씌운 깨짐도 되살린다');

/* 멀쩡한 글은 건드리지 않는다 — 도구가 멀쩡한 것을 망가뜨리면 못 쓴다 */
eq(ed.bestFix(edPlain).text, edPlain, '안 깨진 글은 그대로 둔다');
eq(ed.bestFix('hello world').text, 'hello world', '영문도 그대로 둔다');

/* 이미 사라진 자리는 「못 되살린다」고 말한다 */
const edLost = '안?????요';
check(ed.explain(edLost).includes('못 되살린다'), `사라진 자리는 사라졌다고 말한다: ${ed.explain(edLost).split('\n').pop()}`);
eq(ed.losses('한글�글').replacement, 1, '대체 문자를 센다');

/* 감싸인 글도 같은 창구에서 푼다 */
eq(ed.bestFix('%EC%95%88%EB%85%95').text, '안녕', '주소 인코딩을 푼다');
eq(ed.bestFix('\\uc548\\ub155').text, '안녕', '자바스크립트 escape 를 푼다');
check(ed.score('안녕하세요') > ed.score('ì•ˆë…•'), '한글이 깨진 라틴보다 점수가 높다');

// ── 안 보이는 글자·닮은 글자 (TASK-KL-316) ──────────────────────────────────
const ux = await load('src/core/unicodex.ts');

const ZWSP = String.fromCodePoint(0x200b);
const NBSP = String.fromCodePoint(0x00a0);
const RLO = String.fromCodePoint(0x202e);

eq(ux.scan('안녕하세요').length, 0, '멀쩡한 글에는 수상한 것이 없다');
eq(ux.scan('안녕' + ZWSP + '하세요').length, 1, '폭 없는 공백을 찾는다');
eq(ux.scan('안녕' + ZWSP + '하세요')[0].kind, 'invisible', '안 보이는 것으로 가른다');
eq(ux.scan('안녕' + ZWSP + '하세요')[0].code, 'U+200B', '코드값을 댄다');
eq(ux.clean('안녕' + ZWSP + '하세요'), '안녕하세요', '폭 없는 공백을 지운다');
eq(ux.clean('a' + NBSP + 'b'), 'a b', 'nbsp 는 보통 공백으로');
eq(ux.scan('a' + NBSP + 'b')[0].kind, 'space', 'nbsp 는 공백 갈래');
eq(ux.scan('보기' + RLO + '역순')[0].kind, 'bidi', '거꾸로 보이게 하는 것을 찾는다');

/* 라틴 a 자리에 키릴 а — 사칭에 쓰이는 그것 */
const fake = 'p' + String.fromCodePoint(0x0430) + 'ypal';
eq(ux.scan(fake).length, 1, '닮은 글자를 하나 찾는다');
eq(ux.scan(fake)[0].kind, 'confusable', '닮은 글자로 가른다');
eq(ux.clean(fake), 'paypal', '닮은 글자를 진짜 라틴으로 바꾼다');
eq(ux.clean(fake, { keepConfusables: true }), fake, '두라고 하면 안 건드린다');
check(ux.report(fake).includes('U+0430'), `무엇이 몇 번째인지 적는다: ${ux.report(fake).split('\n')[1]}`);
eq(ux.report('안녕하세요'), '수상한 글자가 없습니다.', '없으면 없다고 한다');

// ── 가짜 데이터 (TASK-KL-316) ───────────────────────────────────────────────
const mock = await load('src/core/mockdata.ts');

const mockSchema = 'id:id\n이름:name\n메일:email\n나이:int(20,40)\n등급:enum(a|b|c)\n가입일:date(2024-01-01,2024-12-31)';
const mockFields = mock.parseSchema(mockSchema);
eq(mockFields.length, 6, '스키마 여섯 칸');
eq(mockFields[3].type, 'int', '괄호 붙은 종류를 읽는다');
eq(mockFields[3].args[1], '40', '괄호 안 값도 읽는다');

const mockRows = mock.generate(mockSchema, { count: 20, locale: 'ko', seed: 42 });
eq(mockRows.length, 20, '스무 줄');
eq(mockRows[0].id, 1, 'id 는 1부터');
eq(mockRows[19].id, 20, 'id 는 끝까지 이어진다');
check(mockRows.every((row) => row.나이 >= 20 && row.나이 <= 40), '숫자는 정한 범위 안');
check(mockRows.every((row) => ['a', 'b', 'c'].includes(row.등급)), '고른 값 중에서만');
check(mockRows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.가입일) && row.가입일 >= '2024-01-01' && row.가입일 <= '2024-12-31'), '날짜도 범위 안');
check(mockRows.every((row) => /@/.test(row.메일)), '메일에는 골뱅이가 있다');
check(new Set(mockRows.map((row) => row.이름)).size > 5, `이름이 「홍길동1·2」로 안 반복된다: ${mockRows.slice(0, 3).map((r) => r.이름).join(',')}`);

/* 같은 씨앗이면 같은 줄 — 시험이 매번 달라지면 아무것도 못 잠근다 */
eq(JSON.stringify(mock.generate(mockSchema, { count: 5, seed: 7 })), JSON.stringify(mock.generate(mockSchema, { count: 5, seed: 7 })), '씨앗이 같으면 같다');
check(JSON.stringify(mock.generate(mockSchema, { count: 5, seed: 7 })) !== JSON.stringify(mock.generate(mockSchema, { count: 5, seed: 8 })), '씨앗이 다르면 다르다');

/* 나라마다 다른 이름 — 한국 화면을 영어 이름으로 시험하면 폭이 안 맞는다 */
check(/[가-힣]/.test(String(mock.generate('이름:name', { count: 1, seed: 3, locale: 'ko' })[0].이름)), 'ko 는 한글 이름');
check(/^[A-Za-z ]+$/.test(String(mock.generate('name:name', { count: 1, seed: 3, locale: 'en' })[0].name)), 'en 은 영문 이름');

const mockCsv = mock.emit(mock.generate('이름:name\n메모:lorem(3)', { count: 2, seed: 5 }), 'csv');
eq(mockCsv.split('\n')[0], '이름,메모', 'CSV 머리줄');
eq(mockCsv.split('\n').length, 3, 'CSV 머리 + 두 줄');
const mockSql = mock.emit(mock.generate('이름:name', { count: 1, seed: 5 }), 'sql', 'people');
check(mockSql.startsWith('INSERT INTO people ('), `SQL 로도 낸다: ${mockSql}`);
check(mockSql.trim().endsWith(');'), 'SQL 줄이 닫힌다');

// ── jq 놀이터 (TASK-KL-316) ─────────────────────────────────────────────────
const jq = await load('src/core/jqplay.ts');

const jqDoc = JSON.stringify({
  users: [
    { name: '윤', age: 24, tags: ['a', 'b'] },
    { name: '링', age: 17, tags: ['b'] },
    { name: '알리사', age: 31, tags: ['a', 'c'] }
  ],
  meta: { count: 3 }
});
const jqRun = (q) => jq.query(jqDoc, q);
const jqOne = (q) => { const got = jqRun(q); check(got.error === undefined, `${q}: ${got.error}`); return got.values; };

eq(JSON.stringify(jqOne('.meta.count')), '[3]', '경로로 꺼낸다');
eq(JSON.stringify(jqOne('.users | length')), '[3]', '이어서(|) 센다');
eq(JSON.stringify(jqOne('.users[0].name')), '["윤"]', '자리로 꺼낸다');
eq(JSON.stringify(jqOne('.users[-1].name')), '["알리사"]', '뒤에서부터도 꺼낸다');
eq(JSON.stringify(jqOne('.users[] | .name')), '["윤","링","알리사"]', '하나씩 꺼낸다');
eq(JSON.stringify(jqOne('.users[] | select(.age > 20) | .name')), '["윤","알리사"]', 'select 로 고른다');
eq(JSON.stringify(jqOne('[.users[] | .age] | add')), '[72]', '모아서 더한다');
eq(JSON.stringify(jqOne('.users | map(.name) | join("·")')), '["윤·링·알리사"]', 'map 과 join');
eq(JSON.stringify(jqOne('.users | sort_by(.age) | .[0].name')), '["링"]', 'sort_by');
eq(JSON.stringify(jqOne('.users | max_by(.age) | .name')), '["알리사"]', 'max_by');
eq(JSON.stringify(jqOne('.meta | keys')), '["count"]'.replace('"count"', '["count"]'), 'keys');
eq(JSON.stringify(jqOne('.users[1] | {name, 나이: .age}')), '[{"name":"링","나이":17}]', '물체를 새로 짓는다');
eq(JSON.stringify(jqOne('.users[0].tags[0], .users[1].tags[0]')), '["a","b"]', '쉼표로 둘 다');
eq(JSON.stringify(jqOne('.users[0] | has("name")')), '[true]', 'has');
eq(JSON.stringify(jqOne('.users | map(.tags) | flatten | unique')), '[["a","b","c"]]', 'flatten·unique');
eq(JSON.stringify(jqOne('.users[] | select(.name | test("리")) | .age')), '[31]', '정규식으로 고른다');
eq(JSON.stringify(jqOne('.users | group_by(.tags[0]) | length')), '[2]', 'group_by');
eq(JSON.stringify(jqOne('.meta | to_entries')), '[[{"key":"count","value":3}]]', 'to_entries');
eq(JSON.stringify(jqOne('.users[0] | del(.tags)')), '[{"name":"윤","age":24}]', 'del 로 지운다');
eq(JSON.stringify(jqOne('.users[0].nope')), '[null]', '없는 열쇠는 null');
eq(JSON.stringify(jqOne('.')), '[' + jqDoc + ']', '점 하나는 그대로');

/* 잘못 쓴 것은 **왜 틀렸는지** 말해야 한다 — 조용히 빈 답을 주면 사람이 자기 데이터를 의심한다 */
check(jqRun('.users[] | .name.first').error !== undefined, '글자에서 열쇠를 꺼내면 알려 준다');
check(jqRun('.users | ????').error !== undefined, '못 읽는 쿼리는 알려 준다');
check(jq.query('{못된 json', '.').error.includes('JSON'), 'JSON 이 아니면 그렇다고 한다');
eq(jq.format([1, 'a'], true), '1\n"a"', '한 줄에 하나씩 낸다');

// ── SQL 다듬기·말 바꾸기 (TASK-KL-316) ──────────────────────────────────────
const sq = await load('src/core/sqlfmt.ts');

const sqOne = 'select id, name from users where age > 20 and city = \'서울\' order by name limit 10';
const sqPretty = sq.format(sqOne, { upper: true });
const sqLines = sqPretty.split('\n');
check(sqLines[0].startsWith('SELECT'), `첫 줄은 SELECT: ${sqLines[0]}`);
check(sqLines.some((l) => l.startsWith('FROM users')), 'FROM 이 제 줄에 선다');
check(sqLines.some((l) => l.startsWith('WHERE')), 'WHERE 가 제 줄에 선다');
check(sqLines.some((l) => l.startsWith('ORDER BY') || l.startsWith('ORDER')), 'ORDER BY 가 제 줄에 선다');
check(sqPretty.includes("'서울'"), '따옴표 안 한글은 안 건드린다');
eq(sq.format('select 1').includes('select'), true, '대문자로 안 바꾸라면 그대로 둔다');

/* 함수 괄호는 줄을 안 바꾼다 — 바꾸면 오히려 안 읽힌다 */
check(sq.format('select count(*) from t').includes('count(*)'), '함수 괄호는 붙여 둔다');
/* 하위 질의는 들여쓴다 */
const sqSub = sq.format('select * from (select id from t) x', { upper: true });
check(sqSub.split('\n').length >= 3, `하위 질의는 줄을 나눈다: ${JSON.stringify(sqSub)}`);
/* 주석은 살린다 */
check(sq.format('-- 메모\nselect 1').includes('-- 메모'), '주석을 안 지운다');

const sqBack = sq.toDialect('SELECT `id` FROM `users` LIMIT 5', 'mysql', 'mssql');
check(sqBack.sql.includes('[id]') && sqBack.sql.includes('[users]'), `이름 감싸기: ${sqBack.sql}`);
check(sqBack.sql.includes('SELECT TOP 5'), `LIMIT → TOP: ${sqBack.sql}`);
check(sqBack.notes.length >= 2, '무엇을 바꿨는지 적어 준다');

const sqPg = sq.toDialect('CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY)', 'mysql', 'postgres');
check(sqPg.sql.includes('GENERATED BY DEFAULT AS IDENTITY'), `자동 번호: ${sqPg.sql}`);
const sqNow = sq.toDialect('SELECT NOW()', 'mysql', 'mssql');
check(sqNow.sql.includes('GETDATE()'), `지금 시각: ${sqNow.sql}`);
const sqNull = sq.toDialect('SELECT IFNULL(a, 0) FROM t', 'mysql', 'postgres');
check(sqNull.sql.includes('COALESCE('), `없으면 대신: ${sqNull.sql}`);
check(sq.toDialect('SELECT 1', 'mysql', 'mysql').notes[0].includes('바꿀 것이 없'), '바꿀 게 없으면 없다고 한다');
check(sq.toDialect("SELECT a || b FROM t", 'postgres', 'mysql').notes.join(' ').includes('||'), '뜻이 달라지는 자리는 경고한다');

// ── 표 사이 관계 그림 (TASK-KL-316) ─────────────────────────────────────────
const erd = await load('src/core/erd.ts');

const erdSql = `
CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  city_id INT REFERENCES cities(id)
);
CREATE TABLE cities ( id INT PRIMARY KEY, name VARCHAR(80) NOT NULL );
CREATE TABLE posts (
  id INT PRIMARY KEY,
  title VARCHAR(200),
  price DECIMAL(10,2),
  author_id INT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);`;
const erdOut = erd.parse(erdSql);
eq(erdOut.kind, 'sql', 'DDL 로 알아본다');
eq(erdOut.tables.length, 3, '표 셋');
eq(erdOut.tables[0].columns.length, 3, '첫 표의 칸 셋');
eq(erdOut.tables[0].columns[0].pk, true, '열쇠를 찾는다');
eq(erdOut.tables[0].columns[1].unique, true, '하나뿐인 칸을 찾는다');
eq(erdOut.tables[2].columns[2].type, 'DECIMAL(10,2)', '괄호 안 쉼표로 안 쪼갠다');
eq(erdOut.links.length, 2, '이어짐 둘 (칸에 붙은 것 + FOREIGN KEY 줄)');
check(erdOut.links.some((l) => l.from === 'posts' && l.to === 'users' && l.by === 'author_id'), 'FOREIGN KEY 줄도 읽는다');
const erdMer = erd.toMermaid(erdOut);
check(erdMer.startsWith('erDiagram'), 'mermaid 로 낸다');
check(erdMer.includes('posts }o--|| users : author_id'), `이어짐을 그린다: ${erdMer.split('\n')[1]}`);
check(erdMer.includes('INT id PK'), '열쇠 표시를 그림에 넣는다');
check(erd.outline(erdOut).includes('표 3개'), '글로도 요약한다');

const erdPrisma = `
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  posts Post[]
}
model Post {
  id       Int  @id
  title    String?
  author   User @relation(fields: [authorId], references: [id])
  authorId Int
}`;
const erdP = erd.parse(erdPrisma);
eq(erdP.kind, 'prisma', 'Prisma 로 알아본다');
eq(erdP.tables.length, 2, '모델 둘');
eq(erdP.tables[0].columns[0].pk, true, '@id 를 열쇠로 본다');
check(erdP.tables[1].columns.some((c) => c.name === 'title' && c.required !== true), '물음표 붙은 칸은 필수가 아니다');
check(erdP.links.some((l) => l.from === 'Post' && l.to === 'User' && l.by === 'authorId'), `관계 칸을 읽는다: ${JSON.stringify(erdP.links)}`);
check(!erdP.tables[1].columns.some((c) => c.name === 'author'), '관계 칸은 보통 칸으로 안 센다');

/* 없는 표를 가리키면 그렇다고 말한다 — 조용히 빠뜨리면 그림이 거짓말을 한다 */
const erdMiss = erd.parse('CREATE TABLE a ( id INT PRIMARY KEY, b_id INT REFERENCES b(id) );');
check(erd.outline(erdMiss).includes('여기 없는 표'), '없는 표를 가리키면 알려 준다');
check(!erd.toMermaid(erdMiss).includes('a }o--|| b'), '없는 표로는 선을 안 긋는다');
check(erd.outline(erd.parse('안녕')).includes('못 찾았습니다'), '스키마가 아니면 그렇다고 한다');

// ── 작은 mermaid (TASK-KL-316) ──────────────────────────────────────────────
const ml = await load('src/core/mermaidlite.ts');

const mlFlow = 'flowchart TD\n  A[시작] --> B{고를까}\n  B -->|응| C(간다)\n  B -->|아니| D[[멈춤]]\n  C --> E((끝))';
const mlDia = ml.parse(mlFlow);
eq(mlDia.kind, 'flowchart', '흐름도로 알아본다');
eq(mlDia.dir, 'TD', '방향을 읽는다');
eq(mlDia.nodes.length, 5, '마디 다섯');
eq(mlDia.nodes[0].label, '시작', '대괄호 안 글이 이름이 된다');
eq(mlDia.nodes[1].shape, 'diamond', '중괄호는 마름모');
eq(mlDia.nodes[4].shape, 'circle', '두 겹 괄호는 원');
eq(mlDia.edges.length, 4, '이어짐 넷');
eq(mlDia.edges[1].label, '응', '화살표에 붙은 글을 읽는다');
eq(ml.parse('graph LR\n A-->B').dir, 'LR', '옆으로도 읽는다');

/* 층 나누기 — 화살표를 따라 깊이가 매겨져야 한다 */
const mlRows = ml.levels(mlDia);
eq(mlRows[0].join(','), 'A', '시작은 첫 층');
check(mlRows.length >= 3, `층이 여러 겹: ${mlRows.length}`);

/* 고리가 있어도 멈춘다 (무한히 안 돈다) — 이게 없으면 화면이 멎는다 */
const mlLoop = ml.parse('flowchart TD\n A --> B\n B --> A');
eq(mlLoop.nodes.length, 2, '고리도 마디를 다 센다');
check(ml.levels(mlLoop).flat().length === 2, '고리에서도 모든 마디에 자리를 준다');

const mlSvg = ml.toSvg(mlDia);
check(mlSvg.startsWith('<svg'), 'SVG 로 낸다');
check(mlSvg.includes('시작'), '글이 그림에 들어간다');
check(mlSvg.includes('<polygon'), '마름모를 그린다');
check(mlSvg.includes('marker-end'), '화살표 머리를 단다');
check(/viewBox="0 0 \d+ \d+"/.test(mlSvg), '크기를 잰다');
check(ml.toSvg(ml.parse('erDiagram\n  users ||--o{ posts : writes\n  users {\n    INT id PK\n    TEXT email\n  }')).includes('email'), '표 관계도 그린다');
/* 그림에 들어간 글은 이스케이프되어야 한다 — 안 그러면 SVG 가 깨진다 */
check(ml.toSvg(ml.parse('flowchart TD\n A["<b>진한</b>"] --> B')).includes('&lt;b&gt;'), '꺾쇠를 그대로 안 넣는다');

check(ml.check(ml.parse('안녕')).includes('첫 줄이'), '무엇을 적어야 하는지 알려 준다');
/* 못 읽는 줄을 숨기지 않는다 — 예전엔 `subgraph` 이 이 자리에 있었는데 이제 읽는다(TASK-KL-326).
   그래서 여전히 못 읽는 것(`classDef`)으로 같은 것을 잰다. */
check(ml.check(ml.parse('flowchart TD\n A --> B\n classDef x fill:#f00')).includes('못 읽는 줄'), '아직 못 읽는 줄은 숨기지 않는다');

/* `subgraph` = 묶음 (TASK-KL-326). 버리면 「누가 어느 쪽인가」가 통째로 사라진다. */
const mlGroup = ml.parse('flowchart TD\n subgraph kl [브라우저]\n  A --> B\n end\n B --> C');
eq(mlGroup.groups.length, 1, 'subgraph 를 묶음으로 읽는다');
eq(mlGroup.groups[0].id, 'kl', '묶음 아이디를 읽는다');
eq(mlGroup.groups[0].label, '브라우저', '대괄호 안 보이는 이름을 읽는다');
eq(mlGroup.groups[0].members.join(','), 'A,B', '묶음 안에 적힌 것만 그 묶음이다');
eq(mlGroup.unknown.length, 0, 'subgraph·end 는 이제 못 읽은 줄이 아니다');

// ── 정규식 풀이 (TASK-KL-316) ───────────────────────────────────────────────
const rx = await load('src/core/regexplain.ts');

const rxNode = rx.parse('^\\d{3}-\\d{4}$');
eq(rxNode.kind, 'seq', '이어 붙임으로 읽는다');
const rxP = rx.merged(rx.pieces(rxNode));
eq(rxP[0].what, 'anchor.start', '처음을 알아본다');
eq(rxP[1].what, 'class.digit', '숫자 무리를 알아본다');
eq(rxP[1].quant.min, 3, '몇 번인지 읽는다');
eq(rxP[1].quant.max, 3, '{3} 은 딱 세 번');
eq(rxP[2].what, 'literal', '그냥 글자');
eq(rxP[2].text, '-', '글자를 그대로 들고 있다');
eq(rxP[rxP.length - 1].what, 'anchor.end', '끝을 알아본다');

/* 이어진 글자는 한 덩이로 — 「a」「b」「c」 세 줄은 안 읽힌다 */
const rxWord = rx.merged(rx.pieces(rx.parse('abc\\d')));
eq(rxWord.length, 2, '글자 셋은 한 덩이');
eq(rxWord[0].text, 'abc', '한 덩이로 모은다');

const rxGroup = rx.merged(rx.pieces(rx.parse('(\\w+)@(?:naver|gmail)\\.com')));
eq(rxGroup[0].what, 'group.capture', '잡아 두는 묶음');
eq(rxGroup[0].name, '1', '묶음 번호를 매긴다');
check(rxGroup.some((p) => p.what === 'group.plain'), '(?: 는 안 잡는 묶음');
check(rxGroup.some((p) => p.what === 'alt'), '갈래를 알아본다');
eq(rx.merged(rx.pieces(rx.parse('(?<year>\\d{4})')))[0].name, 'year', '이름 붙인 묶음');
eq(rx.merged(rx.pieces(rx.parse('a(?=b)')))[1].what, 'look.ahead', '앞을 엿본다');
eq(rx.merged(rx.pieces(rx.parse('a(?<!b)')))[1].what, 'look.behindNot', '뒤를 엿보며 아니라고 한다');
eq(rx.merged(rx.pieces(rx.parse('[^가-힣]')))[0].what, 'class.noneOf', '아닌 것 무리');
eq(rx.merged(rx.pieces(rx.parse('a+?')))[0].quant.lazy, true, '게으른 되풀이');
eq(rx.merged(rx.pieces(rx.parse('a{2,}')))[0].quant.max, undefined, '위가 없는 되풀이');

/* 말은 알맹이가 안 만든다 — 화면(i18n)이 만든다 */
check(!JSON.stringify(rxP).includes('숫자'), '알맹이가 한국어 문장을 들고 있지 않다');

const rxSvg = rx.toRailroad(rx.parse('^(\\d{3})-\\d{4}$'));
check(rxSvg.startsWith('<svg'), '철길 그림을 낸다');
check(rxSvg.includes('rect'), '상자를 그린다');
check(rxSvg.includes('\\d'), '무엇을 잡는지 상자에 적는다');
check(rx.toRailroad(rx.parse('a*')).includes('stroke-dasharray'), '되풀이·건너뜀을 점선으로 보인다');

let rxThrew = false;
try {
  rx.parse('(a');
} catch {
  rxThrew = true;
}
check(rxThrew, '안 닫힌 괄호는 그 자리에서 말한다');

// ── git 되돌리기 (TASK-KL-316) ──────────────────────────────────────────────
const gu = await load('src/core/gitundo.ts');

eq(gu.SCENARIOS.length, 13, '상황 열셋');
check(gu.SCENARIOS.every((s) => s.steps.length > 0), '빈 상황이 없다');
check(gu.SCENARIOS.every((s) => s.steps.every((x) => x.cmd.startsWith('git '))), '걸음은 전부 git 명령이다');

/* 안 민 판과 민 판은 **다른 답**이 나와야 한다 — 이게 이 도구의 존재 이유다 */
const guLocal = gu.stepsFor('lastMessage', { pushed: false });
const guPushed = gu.stepsFor('lastMessage', { pushed: true });
eq(guLocal.length, 1, '안 밀었으면 amend 한 걸음');
eq(guPushed.length, 2, '밀었으면 강제 push 걸음이 붙는다');
check(guPushed.some((s) => s.cmd.includes('--force-with-lease')), '그냥 --force 가 아니라 --force-with-lease');
check(guPushed.some((s) => s.undoable === false), '되돌릴 수 없는 걸음을 그렇다고 표시한다');

/* 이미 나간 커밋은 되돌리는 커밋(revert)이 먼저 온다 */
const guDrop = gu.stepsFor('dropCommit', { pushed: true });
eq(guDrop[0].cmd.startsWith('git revert'), true, `민 판에서는 revert 가 먼저: ${guDrop[0].cmd}`);
check(!gu.stepsFor('dropCommit', { pushed: false }).some((s) => s.cmd.startsWith('git revert')), '안 민 판에는 revert 를 안 권한다');

/* 위험한 상황은 위험하다고 말해야 한다 */
eq(gu.worstRisk(gu.stepsFor('discardFile')), 'destructive', '파일 버리기는 되돌릴 수 없다');
eq(gu.worstRisk(gu.stepsFor('unstage')), 'safe', '담기 취소는 안전하다');
eq(gu.worstRisk(gu.stepsFor('abortMerge')), 'rewrite', '머지 취소는 그 사이');
check(gu.stepsFor('cleanUntracked')[0].cmd.includes('-nd'), '지우기 전에 먼저 보여 준다 (-nd)');
check(gu.stepsFor('lostReset').some((s) => s.cmd === 'git reflog'), '날린 것은 reflog 로 찾는다');

/* 말은 알맹이가 안 만든다 (why 는 열쇠다) */
check(gu.SCENARIOS.every((s) => s.steps.every((x) => /^[a-zA-Z]+$/.test(x.why))), 'why 는 열쇠일 뿐 문장이 아니다');

let guThrew = false;
try {
  gu.stepsFor('없는상황');
} catch {
  guThrew = true;
}
check(guThrew, '모르는 상황은 조용히 넘어가지 않는다');

// ── 버전 범위 (TASK-KL-316) ─────────────────────────────────────────────────
const sv = await load('src/core/semver.ts');

eq(sv.show(sv.parse('v1.2.3')), '1.2.3', 'v 를 떼고 읽는다');
eq(sv.parse('1.2.3-beta.1').pre, 'beta.1', '미리보기 꼬리를 읽는다');
check(sv.compare(sv.parse('1.2.3-beta'), sv.parse('1.2.3')) < 0, '미리보기는 정식보다 낮다');
check(sv.compare(sv.parse('1.10.0'), sv.parse('1.9.0')) > 0, '10 이 9 보다 크다 (글자로 안 견준다)');

/* ^ 와 ~ 를 「이상·미만」으로 펴 준다 — 이게 이 도구의 핵심 */
eq(JSON.stringify(sv.edges('^1.2.3')[0]), JSON.stringify({ from: '1.2.3', fromInclusive: true, to: '2.0.0', toInclusive: false }), '^1.2.3 = 1.2.3 이상 2.0.0 미만');
eq(sv.edges('^0.2.3')[0].to, '0.3.0', '^0.2.3 은 0.3.0 미만 (0.x 는 다르다)');
eq(sv.edges('^0.0.3')[0].to, '0.0.4', '^0.0.3 은 0.0.4 미만');
eq(sv.edges('~1.2.3')[0].to, '1.3.0', '~1.2.3 은 1.3.0 미만');
eq(sv.edges('~1')[0].to, '2.0.0', '~1 은 2.0.0 미만');
eq(sv.edges('1.x')[0].to, '2.0.0', '1.x 는 2.0.0 미만');
eq(sv.edges('1.2.x')[0].to, '1.3.0', '1.2.x 는 1.3.0 미만');
eq(sv.edges('>=1.2 <2')[0].from, '1.2.0', '빈칸으로 이은 것은 둘 다 만족');
eq(sv.edges('>=1.2 <2')[0].to, '2.0.0', '위쪽도 좁힌다');
eq(sv.edges('^1 || ^2').length, 2, '|| 는 갈래 둘');

eq(sv.satisfies('1.5.0', '^1.2.3'), true, '들어간다');
eq(sv.satisfies('2.0.0', '^1.2.3'), false, '위로는 안 들어간다');
eq(sv.satisfies('1.2.2', '^1.2.3'), false, '아래로도 안 들어간다');
eq(sv.satisfies('0.3.0', '^0.2.3'), false, '0.x 에서 minor 가 오르면 안 들어간다');
eq(sv.satisfies('1.2.3', '1.2.3'), true, '딱 그 판');
eq(sv.satisfies('3.0.0', '*'), true, '아무거나');
/* 미리보기는 적어 준 자리에만 들어간다 — 안 그러면 ^1.0.0 이 2.0.0-beta 를 받는다 */
eq(sv.satisfies('2.0.0-beta.1', '^1.0.0'), false, '미리보기가 몰래 안 들어온다');
eq(sv.satisfies('1.2.4-beta.1', '>=1.2.4-beta.1'), true, '적어 준 미리보기는 들어간다');

/* 겹치는 판이 없으면 미리 말한다 — 같은 꾸러미가 두 벌 깔리는 그 상황 */
eq(sv.overlaps('^1.2.0', '~1.1.0'), false, '^1.2.0 과 ~1.1.0 은 겹치는 판이 없다');
eq(sv.overlaps('^1.2.0', '^1.5.0'), true, '^1.2.0 과 ^1.5.0 은 겹친다');
eq(sv.overlaps('^1.0.0', '^2.0.0'), false, '메이저가 다르면 안 겹친다');
eq(sv.overlaps('>=1 <3', '^2'), true, '넓은 것과 좁은 것');
eq(sv.overlaps('^1 || ^2', '^2.3.0'), true, '갈래 중 하나만 겹쳐도 겹친다');

eq(sv.maxSatisfying(['1.0.0', '1.4.2', '2.0.0'], '^1.0.0'), '1.4.2', '범위 안에서 가장 높은 판');
eq(sv.maxSatisfying(['2.0.0'], '^1.0.0'), undefined, '없으면 없다고 한다');

// ── 보안 헤더 (TASK-KL-316) ─────────────────────────────────────────────────
const cs = await load('src/core/csp.ts');

const csParsed = cs.parseCsp("default-src 'self'; img-src * data:; script-src 'self' 'unsafe-inline'");
eq(Object.keys(csParsed).length, 3, '갈래 셋으로 편다');
eq(csParsed['img-src'].join(' '), '* data:', '값을 그대로 들고 있다');
eq(cs.parseCsp("Content-Security-Policy: default-src 'self'")['default-src'][0], "'self'", '헤더 이름이 붙어 있어도 읽는다');

const csWeak = cs.reviewCsp("default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src *");
check(csWeak.some((f) => f.key === 'unsafeInline' && f.where === 'script-src'), '인라인 허용을 짚는다');
check(csWeak.some((f) => f.key === 'unsafeEval'), 'eval 허용을 짚는다');
check(csWeak.some((f) => f.key === 'wildcard' && f.where === 'img-src'), '별표를 짚는다');
check(csWeak.some((f) => f.key === 'noFrameAncestors'), '빠진 것도 짚는다');

/* nonce 가 같이 있으면 브라우저가 unsafe-inline 을 무시한다 — 그걸 위험이라 하면 거짓 경보다 */
const csNonce = cs.reviewCsp("default-src 'self'; script-src 'self' 'unsafe-inline' 'nonce-abc123'; frame-ancestors 'none'; base-uri 'self'");
check(!csNonce.some((f) => f.key === 'unsafeInline'), 'nonce 가 있으면 인라인을 문제 삼지 않는다');

const csHeaders = cs.reviewHeaders([
  "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'Strict-Transport-Security: max-age=600',
  'Referrer-Policy: no-referrer'
].join('\n'));
check(csHeaders.some((f) => f.key === 'shortHsts'), '짧은 HSTS 를 짚는다');
check(csHeaders.some((f) => f.key === 'noSniff'), 'nosniff 가 없으면 짚는다');
check(!csHeaders.some((f) => f.key === 'noReferrer'), '있는 것은 안 짚는다');
check(cs.reviewHeaders('X-Frame-Options: DENY').some((f) => f.key === 'noCsp'), 'CSP 자체가 없으면 그것부터 짚는다');

const csBuilt = cs.build({ images: 'https://cdn.example.com', inlineStyles: true });
check(csBuilt.includes("default-src 'self'"), '가장 좁은 데서 시작한다');
check(csBuilt.includes("img-src 'self' data: https://cdn.example.com"), '고른 것만 넓힌다');
check(csBuilt.includes("style-src 'self' 'unsafe-inline'"), '인라인 스타일은 골랐을 때만');
check(csBuilt.includes("object-src 'none'") && csBuilt.includes("frame-ancestors 'none'"), '기본으로 잠가 둔다');
check(!cs.build().includes('unsafe'), '아무것도 안 고르면 unsafe 가 없다');
/* 지어 놓고 다시 읽었을 때 지적이 안 나와야 한다 — 우리가 권한 것이 우리 기준을 통과해야 한다 */
eq(cs.reviewCsp(cs.build()).filter((f) => f.level === 'weak').length, 0, '우리가 지은 헤더에는 약한 자리가 없다');

// ── 로그 보기 (TASK-KL-316) ─────────────────────────────────────────────────
const lv = await load('src/core/logview.ts');

const lvText = [
  '2026-08-14T10:00:00.123Z INFO  서버가 떴다 port=8080',
  '2026-08-14T10:00:05Z WARN  느린 응답 1200ms',
  '2026-08-14T10:00:06Z ERROR 붙지 못했다 10.0.0.7',
  '이건 시각이 없는 줄이다',
  '{"time":"2026-08-14T10:00:07Z","level":"error","msg":"두 번째 실패"}',
  '2026-08-14T10:00:08Z ERROR 붙지 못했다 10.0.0.9'
].join('\n');
const lvRows = lv.parse(lvText);
eq(lvRows.length, 6, '빈 줄 빼고 여섯 줄');
eq(lvRows[0].level, 'info', '급을 읽는다');
eq(lvRows[2].level, 'error', 'ERROR 를 잡는다');
check(lvRows[0].at !== undefined, 'ISO 시각을 읽는다');
eq(lvRows[3].at, undefined, '시각이 없으면 없다고 둔다');
check(lvRows[3].raw.includes('시각이 없는'), '시각 없는 줄도 **버리지 않는다**');
eq(lvRows[4].level, 'error', 'JSON 한 줄 로그의 level 을 읽는다');
check(lvRows[4].at !== undefined, 'JSON 한 줄 로그의 시각도 읽는다');
check(lv.readTime('10/Oct/2000:13:55:36 +0000 GET /') !== undefined, 'nginx 형식도 읽는다');
check(lv.readTime('1723600000123 something') !== undefined, '유닉스 밀리초도 읽는다');

const lvErrors = lv.filter(lvRows, { levels: ['error'] });
eq(lvErrors.length, 3, '급으로 좁힌다');
eq(lv.filter(lvRows, { pattern: '10\\.0\\.0\\.\\d' }).length, 2, '정규식으로 좁힌다');
eq(lv.filter(lvRows, { pattern: '붙지', invert: true }).length, 4, '뒤집어 좁힌다');
/* 정규식을 치다 만 상태(`(`)에서도 화면이 죽으면 안 된다 */
eq(lv.filter(lvRows, { pattern: '(' }).length, 0, '깨진 정규식은 글자 그대로 찾는다 (안 터진다)');

const lvSum = lv.summarise(lvRows);
eq(lvSum.lines, 6, '줄 수');
eq(lvSum.timed, 5, '시각을 읽은 줄 수');
eq(lvSum.levels.error, 3, '급별로 센다');
check(lvSum.from !== undefined && lvSum.to !== undefined && lvSum.to > lvSum.from, '언제부터 언제까지');
/* 같은 모양은 묶여야 한다 — 만 줄이 열 줄로 보이는 이유 */
check(lvSum.common.some((c) => c.shape.includes('<ip>') && c.count === 2), `같은 모양을 묶는다: ${JSON.stringify(lvSum.common[0])}`);
check(!JSON.stringify(lvSum.common).includes('시각'), '자리표는 말이 아니라 기호다');

const lvBuckets = lv.timeline(lvRows, 4);
eq(lvBuckets.length, 4, '칸으로 나눈다');
eq(lvBuckets.reduce((sum, b) => sum + b.total, 0), 5, '시각 없는 줄은 안 센다 (거짓 봉우리 방지)');
eq(lv.timeline(lv.parse('시각 없는 줄만')).length, 0, '읽을 시각이 없으면 그림도 없다');

// ── OpenAPI 눌러 보기 (TASK-KL-316) ─────────────────────────────────────────
const api = await load('src/core/apitest.ts');

const apiDoc = JSON.stringify({
  openapi: '3.0.0',
  info: { title: '도토리 API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', minimum: 7 },
          email: { type: 'string', format: 'email' },
          friend: { $ref: '#/components/schemas/User' },
          tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } }
        }
      }
    }
  },
  paths: {
    '/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        summary: '한 사람 보기',
        parameters: [{ name: 'expand', in: 'query', schema: { type: 'string', enum: ['friend'] } }],
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } }
      },
      patch: {
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        responses: { 204: { description: 'no content' } }
      }
    }
  }
});

const apiParsed = api.parse(apiDoc);
eq(apiParsed.title, '도토리 API', '제목을 읽는다');
eq(apiParsed.servers[0], 'https://api.example.com/v1', '서버 주소를 읽는다');
eq(apiParsed.operations.length, 2, '연산 둘');
const apiGet = apiParsed.operations[0];
eq(apiGet.method + ' ' + apiGet.path, 'GET /users/{id}', '메서드와 경로');
eq(apiGet.summary, '한 사람 보기', '요약을 읽는다');
/* 경로에 공통으로 걸린 파라미터를 각 연산이 물려받아야 한다 — 안 그러면 필수 값이 사라진다 */
eq(apiGet.params.length, 2, '공통 파라미터를 물려받는다');
check(apiGet.params.some((p) => p.name === 'id' && p.where === 'path' && p.required), 'path 파라미터는 필수다');

/* $ref 를 따라가고, 고리(User → friend → User)에서 멈춰야 한다 */
const apiExample = apiGet.responses[0].example;
eq(apiExample.id, 7, 'minimum 을 예시로 쓴다');
eq(apiExample.email, 'someone@example.com', 'format 을 보고 예시를 고른다');
eq(apiExample.tags[0], 'a', 'enum 의 첫 값');
check(apiExample.friend !== undefined, '$ref 를 따라간다');
check(JSON.stringify(apiParsed).length < 20000, '고리에서 안 멎는다 (끝없이 안 펼친다)');

const apiFilled = api.fill(apiGet, 'https://api.example.com/v1', { id: '42' });
eq(apiFilled.url, 'https://api.example.com/v1/users/42?expand=friend', `값을 채워 진짜 주소로: ${apiFilled.url}`);
eq(apiFilled.method, 'GET', '메서드를 그대로');
const apiPatch = api.fill(apiParsed.operations[1], 'https://api.example.com/v1');
check(apiPatch.body !== undefined && apiPatch.body.includes('email'), '몸통 예시를 만든다');
eq(apiPatch.headers['Content-Type'], 'application/json', '몸통이 있으면 형식을 붙인다');
check(apiPatch.url.includes('/users/1'), `안 채운 자리는 예시로 메운다: ${apiPatch.url}`);

const apiMock = api.mockTable(apiParsed);
check(apiMock['GET /users/{id}'] !== undefined, '목 서버에 붙일 표를 만든다');
check(apiMock['PATCH /users/{id}'] === undefined, '답 예시가 없는 연산은 표에 안 넣는다');

/* YAML 로 준 문서도 읽어야 한다 (스펙은 대개 YAML 이다) */
const apiYaml = api.parse('openapi: 3.0.0\ninfo:\n  title: 작은 API\n  version: 0.1.0\npaths:\n  /ping:\n    get:\n      summary: 살아있나\n      responses:\n        200:\n          description: ok');
eq(apiYaml.title, '작은 API', 'YAML 문서도 읽는다');
eq(apiYaml.operations[0].path, '/ping', 'YAML 에서 경로를 읽는다');

// ── API 두 판 견주기 (TASK-KL-316) ──────────────────────────────────────────
const apiDif = await load('src/core/apidiff.ts');

const apiV1 = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'v1', version: '1' },
  paths: {
    '/users': {
      get: {
        parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' } } } } } },
          404: { description: 'gone' }
        }
      },
      post: { responses: { 201: { description: 'made' } } }
    },
    '/legacy': { get: { responses: { 200: { description: 'ok' } } } }
  }
});

const apiV2 = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'v2', version: '2' },
  paths: {
    '/users': {
      get: {
        parameters: [
          { name: 'page', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } } } } },
          404: { description: 'gone' },
          429: { description: 'slow down' }
        }
      },
      post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } }, responses: { 201: { description: 'made' } } }
    },
    '/teams': { get: { responses: { 200: { description: 'ok' } } } }
  }
});

const adChanges = apiDif.compareText(apiV1, apiV2);
const has = (key, where) => adChanges.some((c) => c.key === key && (where === undefined || c.where === where));

check(has('operationGone', 'GET /legacy'), '사라진 연산을 잡는다');
check(has('paramNowRequired', 'GET /users'), '선택이 필수가 된 것을 잡는다');
check(has('fieldGone', 'GET /users'), '답에서 사라진 칸을 잡는다');
check(has('bodyNew', 'POST /users'), '없던 몸통이 생긴 것을 잡는다');
check(has('newOptionalParam', 'GET /users'), '새 선택 파라미터도 적는다');
check(has('responseNew', 'GET /users'), '새 응답 코드도 적는다');
check(has('operationNew', 'GET /teams'), '새 연산도 적는다');

/* 깨짐/안 깨짐을 제대로 갈라야 이 도구가 쓸모 있다 */
eq(adChanges.find((c) => c.key === 'operationGone').breaking, true, '연산이 사라지면 깨진다');
eq(adChanges.find((c) => c.key === 'paramNowRequired').breaking, true, '필수가 되면 깨진다');
eq(adChanges.find((c) => c.key === 'fieldGone').breaking, true, '읽던 칸이 없어지면 깨진다');
eq(adChanges.find((c) => c.key === 'bodyNew').breaking, true, '더 보내야 하면 깨진다');
eq(adChanges.find((c) => c.key === 'newOptionalParam').breaking, false, '새 선택 파라미터는 안 깨진다');
eq(adChanges.find((c) => c.key === 'responseNew').breaking, false, '새 응답 코드는 안 깨진다');
eq(adChanges.find((c) => c.key === 'operationNew').breaking, false, '새 연산은 안 깨진다');
eq(adChanges[0].breaking, true, '깨지는 것부터 보여 준다');

/* 같은 문서끼리는 아무 말도 없어야 한다 (거짓 경보 0) */
eq(apiDif.compareText(apiV1, apiV1).length, 0, '안 바뀌었으면 조용하다');
/* 말은 알맹이가 안 만든다 */
check(adChanges.every((c) => /^[a-zA-Z]+$/.test(c.key)), 'key 는 열쇠일 뿐 문장이 아니다');

// ── protobuf (TASK-KL-316) ──────────────────────────────────────────────────
const pb = await load('src/core/protobuf.ts');

const pbProto = `
message Person {
  string name = 1;
  int32 age = 2;
  repeated string tags = 3;
  Home home = 4;
  bool warm = 5;
}
message Home {
  string room = 1;
}`;
const pbAll = pb.parseProto(pbProto);
eq(pbAll.length, 2, '메시지 둘을 읽는다');
eq(pbAll[0].fields.length, 5, '칸 다섯');
eq(pbAll[0].fields[2].repeated, true, 'repeated 를 읽는다');
eq(pbAll[0].fields[3].type, 'Home', '다른 메시지를 가리키는 칸');

/* 써 놓고 다시 읽어 같은지 본다 (왕복) — 이게 맞으면 둘 다 맞다 */
const pbBytes = pb.encode({ name: '윤', age: 24, tags: ['a', 'b'], home: { room: 'inside' }, warm: true }, pbAll[0], pbAll);
const pbBack = pb.decode(pbBytes, pbAll[0], pbAll);
eq(pbBack.find((p) => p.no === 1).value, '윤', '한글 문자열 왕복');
eq(pbBack.find((p) => p.no === 2).value, '24', '숫자 왕복');
eq(pbBack.filter((p) => p.no === 3).length, 2, 'repeated 는 두 번 나온다');
eq(pbBack.find((p) => p.no === 5).value, true, 'bool 을 참거짓으로 읽는다');
const pbHome = pbBack.find((p) => p.no === 4);
check(pbHome.children !== undefined && pbHome.children[0].value === 'inside', '안에 든 메시지를 펴서 읽는다');
check(pbBack.every((p) => p.name !== undefined), '스키마가 있으면 이름을 붙인다');

/* 스키마 **없이도** 여기까지는 알 수 있어야 한다 — 이게 이 도구의 진짜 쓸모다 */
const pbBlind = pb.decode(pbBytes);
eq(pbBlind[0].no, 1, '번호를 안다');
eq(pbBlind[0].kind, 'bytes', '선 형식을 안다');
eq(pbBlind[0].value, '윤', '글로 보이면 글로 읽는다');
check(pbBlind.find((p) => p.no === 2).alternatives !== undefined, '스키마가 없으면 다른 읽기도 같이 준다');
check(pbBlind.find((p) => p.no === 4).children !== undefined, '안에 메시지가 또 있으면 알아서 연다');
check(pbBlind.every((p) => p.name === undefined), '스키마가 없으면 이름을 지어내지 않는다');

/* 16진수·base64 아무거나 받는다 */
eq(pb.toHex(pb.readBytes('08 96 01')), '089601', '띄어쓴 16진수를 읽는다');
eq(pb.toHex(pb.readBytes('CJYB')), '089601', 'base64 도 읽는다');
eq(String(pb.decode(pb.readBytes('089601'))[0].value), '150', 'varint 를 제대로 푼다');

/* 음수는 sint 로 적어야 짧다 — 그 규칙(zigzag)이 왕복하는지 */
const pbSigned = pb.parseProto('message S { sint32 delta = 1; }');
eq(pb.decode(pb.encode({ delta: -3 }, pbSigned[0]), pbSigned[0])[0].value, '-3', 'zigzag 왕복');

let pbThrew = false;
try {
  pb.decode(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
} catch {
  pbThrew = true;
}
check(pbThrew, '망가진 바이트에서 조용히 안 돈다');

// ── 번들 지도 (TASK-KL-316) ─────────────────────────────────────────────────
const bm = await load('src/core/bundlemap.ts');

const bmEsbuild = JSON.stringify({
  inputs: {
    'src/app.ts': { bytes: 4000 },
    'src/widgets/big.ts': { bytes: 30000 },
    'src/widgets/small.ts': { bytes: 1000 },
    'node_modules/lodash/map.js': { bytes: 12000 },
    'node_modules/pkg/node_modules/lodash/map.js': { bytes: 12000 }
  }
});
const bmItems = bm.readStats(bmEsbuild);
eq(bmItems.length, 5, 'esbuild metafile 을 읽는다');
const bmTree = bm.tree(bmItems);
eq(bmTree.bytes, 59000, '전부 더한다');
eq(bmTree.children[0].name, 'src', '무거운 갈래가 앞에 온다 (src 35000 > node_modules 24000)');

const bmTop = bm.heaviest(bmTree, 2);
eq(bmTop[0].path, 'src', '어디가 무거운지 첫 줄');
check(bmTop.some((h) => h.path === 'src/widgets' && h.bytes === 31000), `한 겹 더 내려간다: ${JSON.stringify(bmTop.slice(0, 4))}`);

/* 같은 꾸러미가 두 자리에 들어간 것 — 번들이 갑자기 커지는 흔한 이유 */
const bmDup = bm.duplicates(bmItems);
eq(bmDup.length, 1, '겹친 꾸러미 하나');
eq(bmDup[0].name, 'lodash', '이름을 댄다');
eq(bmDup[0].places.length, 2, '두 자리에 있다');
eq(bmDup[0].bytes, 24000, '합쳐서 얼마인지');

/* webpack stats 도 같은 나무가 되어야 한다 (뒤쪽 셈은 하나면 된다) */
const bmWebpack = JSON.stringify({
  modules: [
    { name: './src/app.ts', size: 4000 },
    { name: './src/widgets/big.ts', size: 30000 },
    { name: 'ignored', size: 0 },
    { modules: [{ name: './src/widgets/small.ts', size: 1000 }] }
  ]
});
const bmW = bm.readStats(bmWebpack);
eq(bmW.length, 3, 'webpack stats 를 읽고 합쳐진 덩이의 속도 본다');
eq(bm.tree(bmW).bytes, 35000, 'webpack 쪽도 같은 나무가 된다');
eq(bm.tidy('babel-loader!./src/a.js?query'), 'src/a.js', '로더 접두사와 물음표 뒤를 자른다');

/* 넓이로 나눈 칸이 겹치거나 넘치면 그림이 거짓말이 된다 */
const bmRects = bm.layout(bmTree, 0, 0, 400, 300, 0, 1);
check(bmRects.length >= 2, '칸을 나눈다');
check(bmRects.every((r) => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= 400.01 && r.y + r.h <= 300.01), '칸이 판을 안 넘는다');
const bmArea = bmRects.reduce((sum, r) => sum + r.w * r.h, 0);
check(Math.abs(bmArea - 400 * 300) < 400 * 300 * 0.02, `넓이 합이 판과 거의 같다: ${Math.round(bmArea)}`);
/* 넓이 비율이 바이트 비율을 따라야 한다 */
const bmNm = bmRects.find((r) => r.name === 'node_modules');
check(Math.abs((bmNm.w * bmNm.h) / (400 * 300) - 24000 / 59000) < 0.03, '넓이가 크기를 따라간다');

eq(bm.human(1536), '1.5 KB', '사람이 읽는 크기');
let bmThrew = false;
try {
  bm.readStats('{"nope":1}');
} catch {
  bmThrew = true;
}
check(bmThrew, '모르는 형식은 그렇다고 말한다');

// ── 파일 사이 부름 (TASK-KL-316) ────────────────────────────────────────────
const cg = await load('src/core/codegraph.ts');

const cgFiles = {
  'src/app.ts': "import { hello } from './lib/greet';\nimport React from 'react';\nimport './style.css';\n// import './주석은-안-센다';\n",
  'src/lib/greet.ts': "export { name } from '../util/name';\nconst lazy = () => import('./deep/other');\n",
  'src/util/name.ts': "import { back } from '../lib/greet';\nexport const name = '윤';\n",
  'src/lib/deep/other.ts': "const x = require('@scope/pkg/deep');\nrequire('node:fs');\n",
  'src/style.css': "@import 'reset.css';\n",
  'src/reset.css': 'body { margin: 0 }\n',
  'src/lonely.ts': "import './lib/greet';\n",
  'README.md': '# not code\n'
};

const cgGraph = cg.build(cgFiles);
eq(cgGraph.files.length, 7, '코드 파일만 센다 (README 는 뺀다)');
check(cgGraph.edges.some((e) => e.from === 'src/app.ts' && e.to === 'src/lib/greet.ts'), '상대 경로를 잇는다 (확장자는 우리가 붙인다)');
check(cgGraph.edges.some((e) => e.from === 'src/app.ts' && e.to === 'src/style.css'), 'css 도 잇는다');
check(cgGraph.edges.some((e) => e.from === 'src/style.css' && e.to === 'src/reset.css'), '@import 도 읽는다');
check(cgGraph.edges.some((e) => e.from === 'src/lib/greet.ts' && e.to === 'src/lib/deep/other.ts'), '동적 import 도 읽는다');
check(cgGraph.edges.some((e) => e.from === 'src/util/name.ts' && e.to === 'src/lib/greet.ts'), '.. 로 올라가는 경로도 잇는다');
check(!JSON.stringify(cgGraph.edges).includes('주석'), '주석 안의 import 는 안 센다');
eq(cgGraph.externals.react, 1, '밖 꾸러미를 센다');
eq(cgGraph.externals['@scope/pkg'], 1, '@scope 꾸러미는 두 조각까지 묶는다');
check(cgGraph.externals['node:fs'] === undefined, '기본 꾸러미(node:)는 안 센다');

/* 고리 — 고칠 때 제일 아픈 것 */
const cgLoops = cg.cycles(cgGraph);
eq(cgLoops.length, 1, '고리 하나');
eq(cgLoops[0].length, 2, '두 파일이 서로 부른다');
check(cgLoops[0].includes('src/lib/greet.ts') && cgLoops[0].includes('src/util/name.ts'), `누가 도는지 댄다: ${cgLoops[0]}`);

const cgRanks = cg.ranks(cgGraph);
eq(cgRanks[0].file, 'src/lib/greet.ts', '가장 많이 불리는 파일');
eq(cgRanks[0].imported, 3, '몇 번 불리는지');
const cgOrphans = cg.unreferenced(cgGraph);
check(cgOrphans.includes('src/app.ts') && cgOrphans.includes('src/lonely.ts'), '아무도 안 부르는 파일을 짚는다');
check(!cgOrphans.includes('src/lib/greet.ts'), '불리는 파일은 안 짚는다');

/* 못 이은 자리를 숨기지 않는다 */
const cgMissing = cg.build({ 'a.ts': "import './없는파일';\n" });
eq(cgMissing.unresolved.length, 1, '못 이은 상대 경로를 남긴다');
eq(cgMissing.unresolved[0].what, './없는파일', '무엇을 못 이었는지 적는다');

/* 그림은 mermaidlite 가 읽을 수 있는 글로 (엔진을 또 안 만든다) */
const cgMer = cg.toMermaid(cgGraph);
check(cgMer.startsWith('flowchart LR'), 'mermaid 글로 낸다');
check(ml.parse(cgMer).nodes.length > 0, '우리 그리기가 그 글을 읽는다');

/* 파일이 많아도 재귀로 안 터진다 (손으로 쌓는 이유) */
const cgBig = {};
for (let i = 0; i < 3000; i++) cgBig['f' + i + '.ts'] = "import './f" + (i + 1) + "';\n";
check(cg.cycles(cg.build(cgBig)).length === 0, '3천 개 사슬에서도 안 터진다');

// ── CSS·HTML 펴고 누르기 (TASK-KL-316) ─────────────────────────────────────
const pa = await load('src/core/prettyall.ts');

eq(pa.detect('.a{color:red}'), 'css', 'CSS 를 알아본다');
eq(pa.detect('<div><p>가</p></div>'), 'html', 'HTML 을 알아본다');
eq(pa.detect('{"a":1}'), 'json', 'JSON 은 남의 도구 것이라고 이름을 댄다');
eq(pa.detect('select 1'), 'sql', 'SQL 도 이름을 댄다');
eq(pa.goTo('json'), 'jsonfmt', '어느 도구로 가면 되는지 알려 준다');
eq(pa.goTo('css'), undefined, '우리가 맡는 것은 보내지 않는다');

const paCss = pa.formatCss('.a,.b{color:red;margin:0}/* 메모 */.c{padding:1px}');
check(paCss.split('\n').length >= 6, `CSS 를 여러 줄로 편다: ${JSON.stringify(paCss)}`);
check(paCss.includes('color: red;'), '값 앞뒤를 고른다');
check(paCss.includes('/* 메모 */'), '주석을 안 지운다 (펼 때는)');
eq(pa.minifyCss('.a { color : red ; }'), '.a{color:red}', '눌러서 붙인다');
eq(pa.minifyCss('.a{color:red}/* 메모 */'), '.a{color:red}', '누를 때는 주석을 지운다');
/* 따옴표 안의 중괄호에 무너지면 안 된다 — 이런 게 진짜 파일에 늘 있다 */
check(pa.minifyCss('.a::after{content:"}"}').includes('content:"}"'), '따옴표 안은 안 건드린다');
check(pa.formatCss('@media (max-width:600px){.a{color:red}}').includes('@media'), '중첩된 갈래도 편다');

const paHtml = pa.formatHtml('<div><p>가</p><br><span>나</span></div>');
const paLines = paHtml.split('\n');
eq(paLines[0], '<div>', '첫 줄');
check(paLines.some((l) => l.startsWith('  <p>')), '한 겹 들여쓴다');
check(paLines.some((l) => l.trim() === '<br>'), '닫는 짝이 없는 것은 깊이를 안 늘린다');
eq(pa.minifyHtml('<div>  <p> 가 </p>  </div>'), '<div><p> 가 </p></div>', 'HTML 을 누른다');
eq(pa.minifyHtml('<div><!-- 메모 --><p>가</p></div>'), '<div><p>가</p></div>', '주석을 지운다');
/* pre·script 안의 빈칸은 뜻이 있다 — 건드리면 화면이 바뀐다 */
check(pa.minifyHtml('<pre>  가\n  나</pre>').includes('  가\n  나'), 'pre 속은 안 건드린다');
check(pa.formatHtml('<script>const a = 1;\n  const b = 2;</script>').includes('const b = 2;'), 'script 속도 안 건드린다');

/* 우리가 안 맡는 것은 **조용히 하는 척 하지 않는다** */
let paThrew = false;
try {
  pa.format('select 1');
} catch {
  paThrew = true;
}
check(paThrew, '못 맡는 것은 못 맡는다고 한다');

// ── PEM · ASN.1 (TASK-KL-316) ───────────────────────────────────────────────
const pem = await load('src/core/pem.ts');

/* base64 왕복부터 — 여기가 어긋나면 아래가 전부 거짓말이 된다 */
eq(pem.bytesToBase64(new Uint8Array([1, 2, 3])), 'AQID', 'base64 로 쓴다');
eq([...pem.base64ToBytes('AQID')].join(','), '1,2,3', 'base64 를 읽는다');
eq([...pem.base64ToBytes(pem.bytesToBase64(new Uint8Array([0, 255, 128, 7])))].join(','), '0,255,128,7', '왕복');

/* 손으로 만든 작은 DER: SEQUENCE { INTEGER 5, OID 1.2.840.113549.1.1.1, UTF8String "윤" } */
const pemName = new TextEncoder().encode('윤');
const pemDer = new Uint8Array([
  0x30, 0x00, // 길이는 아래에서 채운다
  0x02, 0x01, 0x05,
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x0c, pemName.length, ...pemName
]);
pemDer[1] = pemDer.length - 2;
const pemTree = pem.parseDer(pemDer);
eq(pemTree.length, 1, '바깥은 하나');
eq(pemTree[0].kind, 'SEQUENCE', 'SEQUENCE 를 알아본다');
eq(pemTree[0].children.length, 3, '속이 셋');
eq(pemTree[0].children[0].value, '5', '정수를 읽는다');
eq(pemTree[0].children[1].value, 'RSA', '아는 OID 는 이름으로');
eq(pemTree[0].children[2].value, '윤', '한글 문자열도 그대로');

/* 모르는 OID 는 **지어내지 않는다** */
eq(pem.oidName('1.2.3.4.5'), '1.2.3.4.5', '모르는 OID 는 숫자 그대로');
eq(pem.oidName('2.5.4.3'), 'CN', '아는 것만 이름을 댄다');

/* PEM 껍데기 — 여러 덩이가 이어 붙은 파일(사슬)도 다 읽어야 한다 */
const pemText = pem.toPem('CERTIFICATE', pemDer) + '\n' + pem.toPem('PRIVATE KEY', new Uint8Array([1, 2, 3]));
const pemBlocks = pem.readPem(pemText);
eq(pemBlocks.length, 2, '두 덩이를 다 읽는다');
eq(pemBlocks[0].label, 'CERTIFICATE', '이름표를 읽는다');
eq([...pemBlocks[0].der].join(','), [...pemDer].join(','), 'PEM 왕복');
check(pem.toPem('X', new Uint8Array(100)).split('\n').length > 3, '64자마다 줄을 바꾼다');

/* 두 자리 해(UTCTime) — 50 이상이면 1900년대. 틀리면 만료가 50년 어긋난다 */
const pemUtc = new Uint8Array([0x17, 0x0d, ...new TextEncoder().encode('260814090000Z')]);
eq(pem.parseDer(pemUtc)[0].value, '2026-08-14T09:00:00Z', '20xx 해');
const pemOld = new Uint8Array([0x17, 0x0d, ...new TextEncoder().encode('960814090000Z')]);
eq(pem.parseDer(pemOld)[0].value, '1996-08-14T09:00:00Z', '19xx 해');

/* 잘린 파일에 조용히 반쪽을 주면 안 된다 */
let pemThrew = false;
try {
  pem.parseDer(new Uint8Array([0x30, 0x20, 0x02, 0x01]));
} catch {
  pemThrew = true;
}
check(pemThrew, '속이 잘렸으면 그렇다고 한다');

// ── 인증서 보기 (TASK-KL-316) ───────────────────────────────────────────────
const cv = await load('src/core/certview.ts');

/* 진짜 인증서 대신 **손으로 DER 을 쌓아** 만든다 — 남의 인증서를 저장소에 넣지 않고,
   구조가 바뀌면 시험이 먼저 깨진다. */
const der = {
  len(n) {
    if (n < 0x80) return [n];
    const bytes = [];
    let v = n;
    while (v > 0) {
      bytes.unshift(v & 0xff);
      v = Math.floor(v / 256);
    }
    return [0x80 | bytes.length, ...bytes];
  },
  node(tag, body) {
    return [tag, ...der.len(body.length), ...body];
  },
  int(n) {
    return der.node(0x02, [n]);
  },
  oid(bytes) {
    return der.node(0x06, bytes);
  },
  utf8(text) {
    return der.node(0x0c, [...new TextEncoder().encode(text)]);
  },
  time(text) {
    return der.node(0x17, [...new TextEncoder().encode(text)]);
  },
  seq(...parts) {
    return der.node(0x30, parts.flat());
  },
  set(...parts) {
    return der.node(0x31, parts.flat());
  }
};
const OID_CN = [0x55, 0x04, 0x03];
const OID_RSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
const OID_SHA256RSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b];
const OID_SAN = [0x55, 0x1d, 0x11];
const OID_BASIC = [0x55, 0x1d, 0x13];

const nameOf = (cn) => der.seq(der.set(der.seq(der.oid(OID_CN), der.utf8(cn))));
const dnsName = (host) => der.node(0x82, [...new TextEncoder().encode(host)]);
const sanExt = der.seq(der.oid(OID_SAN), der.node(0x04, der.seq(dnsName('example.com'), dnsName('www.example.com'))));
const caExt = der.seq(der.oid(OID_BASIC), der.node(0x04, der.seq(der.node(0x01, [0xff]))));
const tbs = der.seq(
  der.int(7),
  der.seq(der.oid(OID_SHA256RSA)),
  nameOf('내 작은 CA'),
  der.seq(der.time('260101000000Z'), der.time('270101000000Z')),
  nameOf('example.com'),
  der.seq(der.seq(der.oid(OID_RSA)), der.node(0x03, [0x00, 0x30, 0x03, 0x02, 0x01, 0x01])),
  der.node(0xa3, der.seq(sanExt, caExt))
);
const certDer = new Uint8Array(der.seq(tbs, der.seq(der.oid(OID_SHA256RSA)), der.node(0x03, [0x00, 0x01])));

const cvCert = cv.readCert(certDer);
eq(cvCert.kind, 'certificate', '인증서로 읽는다');
eq(cvCert.subject, 'CN=example.com', '누구 것인지');
eq(cvCert.issuer, 'CN=내 작은 CA', '누가 냈는지 (한글도)');
eq(cvCert.serial, '7', '일련번호');
eq(cvCert.notBefore, '2026-01-01T00:00:00Z', '언제부터');
eq(cvCert.notAfter, '2027-01-01T00:00:00Z', '언제까지');
eq(cvCert.names.join(','), 'example.com,www.example.com', '덮는 이름들(SAN)');
eq(cvCert.keyAlgorithm, 'RSA', '열쇠 종류');
eq(cvCert.signatureAlgorithm, 'SHA256withRSA', '서명 방식');
eq(cvCert.isCa, true, 'CA 인지');
eq(cvCert.selfSigned, false, '스스로 서명한 게 아니다');

/* 스스로 서명한 것도 알아본다 — 「왜 브라우저가 빨간 자물쇠를 띄우나」의 첫 답 */
const selfTbs = der.seq(
  der.int(1),
  der.seq(der.oid(OID_SHA256RSA)),
  nameOf('localhost'),
  der.seq(der.time('260101000000Z'), der.time('260201000000Z')),
  nameOf('localhost'),
  der.seq(der.seq(der.oid(OID_RSA)), der.node(0x03, [0x00, 0x01])),
);
const selfDer = new Uint8Array(der.seq(selfTbs, der.seq(der.oid(OID_SHA256RSA)), der.node(0x03, [0x00, 0x01])));
eq(cv.readCert(selfDer).selfSigned, true, '스스로 서명한 것을 짚는다');

/* 남은 날 — 만료를 넘겼으면 음수여야 한다(0 으로 뭉개면 「아직 괜찮다」로 읽힌다) */
const cvPem = pem.toPem('CERTIFICATE', certDer);
const cvChain = cv.readChain(cvPem, Date.parse('2026-12-02T00:00:00Z'));
eq(cvChain.certs.length, 1, '덩이 하나');
eq(cvChain.daysLeft, 30, '남은 날을 센다');
check(cv.readChain(cvPem, Date.parse('2027-02-01T00:00:00Z')).daysLeft < 0, '지났으면 음수');

/* 사슬 — 앞 것의 발급자가 뒤 것의 주체여야 이어진다 */
const caTbs = der.seq(
  der.int(2),
  der.seq(der.oid(OID_SHA256RSA)),
  nameOf('내 작은 CA'),
  der.seq(der.time('250101000000Z'), der.time('300101000000Z')),
  nameOf('내 작은 CA'),
  der.seq(der.seq(der.oid(OID_RSA)), der.node(0x03, [0x00, 0x01]))
);
const caDer = new Uint8Array(der.seq(caTbs, der.seq(der.oid(OID_SHA256RSA)), der.node(0x03, [0x00, 0x01])));
eq(cv.readChain(cvPem + '\n' + pem.toPem('CERTIFICATE', caDer)).linked, true, '이어진 사슬');
eq(cv.readChain(cvPem + '\n' + pem.toPem('CERTIFICATE', selfDer)).linked, false, '안 이어진 사슬은 안 이어졌다고 한다');

// ── SSH 열쇠 (TASK-KL-316) ──────────────────────────────────────────────────
const sk = await load('src/core/sshkey.ts');
const nodeCrypto = await import('node:crypto');
const sha256 = (bytes) => new Uint8Array(nodeCrypto.createHash('sha256').update(bytes).digest());

/* 진짜 열쇠를 저장소에 넣지 않는다 — 선 형식대로 손으로 쌓는다 */
const skField = (bytes) => [bytes.length >>> 24 & 255, bytes.length >>> 16 & 255, bytes.length >>> 8 & 255, bytes.length & 255, ...bytes];
const skEd = new Uint8Array([...skField([...new TextEncoder().encode('ssh-ed25519')]), ...skField(new Array(32).fill(7))]);
const skEdB64 = pem.bytesToBase64(skEd);
const skRsaN = new Array(257).fill(0).map((_, i) => (i === 0 ? 0 : 0xab));
const skRsa = new Uint8Array([...skField([...new TextEncoder().encode('ssh-rsa')]), ...skField([1, 0, 1]), ...skField(skRsaN)]);
const skRsaB64 = pem.bytesToBase64(skRsa);

const skLines = [
  'ssh-ed25519 ' + skEdB64 + ' yon@laptop',
  'command="/bin/echo hi",no-pty ssh-rsa ' + skRsaB64 + ' 서버-배포키',
  '# 주석 줄',
  'ssh-rsa 안녕하세요아님 broken@key',
  'ssh-ed25519 ' + skRsaB64 + ' 섞인줄'
].join('\n');

const skEntries = sk.parseAuthorized(skLines);
eq(skEntries.length, 4, '주석 줄은 빼고 넷');
eq(skEntries[0].type, 'ssh-ed25519', '종류를 읽는다');
eq(skEntries[0].comment, 'yon@laptop', '주석(누구 것인지)을 읽는다');
eq(skEntries[0].bits, 256, 'ed25519 는 256');
eq(skEntries[1].options, 'command="/bin/echo hi",no-pty', '앞에 붙은 옵션을 가른다');
eq(skEntries[1].type, 'ssh-rsa', '옵션 뒤의 종류');
eq(skEntries[1].bits, 2048, 'RSA 길이를 센다 (앞의 0 은 빼고)');
eq(skEntries[1].comment, '서버-배포키', '한글 주석도');
eq(skEntries[2].problem, 'badBase64', '깨진 줄은 버리지 않고 왜인지 적는다');
eq(skEntries[3].problem, 'typeMismatch', '줄에 적힌 종류와 속이 다르면 짚는다');

/* 지문 — 서버에서 지울 줄을 고르는 데 쓰는 그 값 */
const skPrint = sk.fingerprint(skEdB64, sha256);
check(skPrint.startsWith('SHA256:'), `SHA256: 로 시작한다: ${skPrint}`);
check(!skPrint.endsWith('='), '끝의 = 는 뗀다 (ssh-keygen 과 같은 모양)');
eq(sk.fingerprint(skEdB64, sha256), skPrint, '같은 열쇠는 같은 지문');
check(sk.fingerprint(skRsaB64, sha256) !== skPrint, '다른 열쇠는 다른 지문');

/* PEM(SPKI) → OpenSSH 한 줄 — 사람이 실제로 막히는 자리 */
const skSpki = new Uint8Array(der.seq(
  der.seq(der.oid(OID_RSA), der.node(0x05, [])),
  der.node(0x03, [0x00, ...der.seq(der.node(0x02, skRsaN), der.node(0x02, [1, 0, 1]))])
));
const skLine = sk.toOpenSsh(pem.toPem('PUBLIC KEY', skSpki), 'yon@desktop');
check(skLine.startsWith('ssh-rsa '), `OpenSSH 줄로 바꾼다: ${skLine.slice(0, 20)}`);
check(skLine.endsWith(' yon@desktop'), '주석을 붙인다');
/* 바꾼 줄을 다시 읽어 같은 길이가 나와야 한다 (왕복) */
eq(sk.parseAuthorized(skLine)[0].bits, 2048, '바꾼 줄을 다시 읽으면 2048');
eq(sk.parseAuthorized(skLine)[0].problem, undefined, '바꾼 줄에는 흠이 없다');

let skThrew = false;
try {
  sk.toOpenSsh(pem.toPem('PUBLIC KEY', new Uint8Array(der.seq(der.seq(der.oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01])), der.node(0x03, [0x00, 0x01])))));
} catch {
  skThrew = true;
}
check(skThrew, '아직 못 바꾸는 종류는 못 바꾼다고 한다');

// ── 대역·포트 (TASK-KL-316) ─────────────────────────────────────────────────
const nt = await load('src/core/nettool.ts');

eq(nt.numberToIp(nt.ipToNumber('192.168.0.1')), '192.168.0.1', '주소 왕복');
eq(nt.ipToNumber('255.255.255.255'), 4294967295, '맨 끝 주소도 센다 (부호 안 뒤집힌다)');

const ntBlock = nt.parseCidr('10.0.4.7/22');
eq(ntBlock.cidr, '10.0.4.0/22', '적힌 주소가 아니라 **대역의 시작**으로 고친다');
eq(ntBlock.network, '10.0.4.0', '시작');
eq(ntBlock.broadcast, '10.0.7.255', '끝');
eq(ntBlock.firstHost, '10.0.4.1', '쓸 수 있는 첫 주소');
eq(ntBlock.lastHost, '10.0.7.254', '쓸 수 있는 마지막 주소');
eq(ntBlock.mask, '255.255.252.0', '마스크');
eq(ntBlock.wildcard, '0.0.3.255', '와일드카드 (ACL 에 쓰는 그것)');
eq(ntBlock.total, 1024, '주소 수');
eq(ntBlock.usable, 1022, '실제로 줄 수 있는 수');
eq(ntBlock.private, true, '사설 대역인지');
eq(nt.parseCidr('8.8.8.8/32').private, false, '공인 대역');

/* /31 과 /32 는 규칙이 다르다 — 그냥 -2 하면 음수가 나온다 */
eq(nt.parseCidr('10.0.0.0/31').usable, 2, '/31 은 둘 다 쓴다 (점대점)');
eq(nt.parseCidr('10.0.0.1/32').usable, 1, '/32 는 한 대');
eq(nt.parseCidr('10.0.0.1/32').firstHost, undefined, '/32 에는 「첫 주소」가 없다');
eq(nt.parseCidr('0.0.0.0/0').total, 4294967296, '/0 은 전부');

eq(nt.contains('10.0.4.0/22', '10.0.7.255'), true, '끝 주소도 안에 든다');
eq(nt.contains('10.0.4.0/22', '10.0.8.0'), false, '한 칸 넘으면 밖');
eq(nt.overlaps('10.0.0.0/8', '10.5.0.0/16'), true, '큰 것과 작은 것은 겹친다');
eq(nt.overlaps('10.0.0.0/16', '10.1.0.0/16'), false, '옆 대역은 안 겹친다');

const ntSplit = nt.split('10.0.0.0/22', 24);
eq(ntSplit.count, 4, '/22 를 /24 로 넷');
eq(ntSplit.blocks[0], '10.0.0.0/24', '첫 조각');
eq(ntSplit.blocks[3], '10.0.3.0/24', '마지막 조각');
eq(nt.split('10.0.0.0/8', 24).count, 65536, '많으면 개수는 세고');
eq(nt.split('10.0.0.0/8', 24).blocks.length, 256, '앞의 것만 준다 (화면이 안 멎게)');
let ntThrew = false;
try {
  nt.split('10.0.0.0/24', 16);
} catch {
  ntThrew = true;
}
check(ntThrew, '원래보다 큰 조각으로는 못 쪼갠다');

eq(nt.summarize(['10.0.1.5', '10.0.2.9']), '10.0.0.0/22', '여러 주소를 한 줄로 덮는다');
eq(nt.summarize(['192.168.1.1']), '192.168.1.1/32', '하나면 그 하나');

eq(nt.findPort('443')[0].name, 'HTTPS', '번호로 찾는다');
eq(nt.findPort('5432')[0].name, 'PostgreSQL', '데이터베이스 포트');
check(nt.findPort('ssh').some((p) => p.port === 22), '이름으로도 찾는다');
eq(nt.findPort('9999').length, 0, '모르는 포트는 **지어내지 않는다**');
eq(nt.isWellKnown(80), true, '1024 아래는 관리자 자리');
eq(nt.isWellKnown(8080), false, '8080 은 아니다');

let ntBad = false;
try {
  nt.parseCidr('10.0.0.300/24');
} catch {
  ntBad = true;
}
check(ntBad, '없는 주소는 없다고 한다');

// ── 배경 지우기 (TASK-KL-316) ───────────────────────────────────────────────
const bg = await load('src/core/bgremove.ts');

/** 흰 바탕 가운데에 빨간 네모, 그 네모 안에 **흰 구멍** — 안쪽 흰색이 안 뚫려야 한다. */
function makePicture(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      const inBox = x >= 10 && x < w - 10 && y >= 10 && y < h - 10;
      const inHole = x >= 20 && x < 26 && y >= 20 && y < 26;
      const red = inBox && !inHole;
      px[at] = red ? 220 : 255;
      px[at + 1] = red ? 30 : 255;
      px[at + 2] = red ? 30 : 255;
      px[at + 3] = 255;
    }
  }
  return px;
}

const bgW = 60;
const bgH = 60;
const bgPx = makePicture(bgW, bgH);
eq(bg.guessBackground(bgPx, bgW, bgH).join(','), '255,255,255', '모서리에서 배경색을 짐작한다');

const bgAlpha = bg.maskOf(bgPx, bgW, bgH, { tolerance: 30, feather: 0 });
eq(bgAlpha[0], 0, '모서리는 지워진다');
eq(bgAlpha[(30 * bgW) + 30], 255, '가운데 물체는 남는다');
/* 이어진 것만 지우는 이유 — 물체 **안쪽**의 같은 색은 남아야 한다 */
eq(bgAlpha[(22 * bgW) + 22], 255, '물체 안의 흰 구멍은 안 뚫린다 (전역 색 지우기가 아니다)');
check(bg.removedRatio(bgAlpha) > 0.3 && bg.removedRatio(bgAlpha) < 0.7, `지운 넓이가 그럴듯하다: ${bg.removedRatio(bgAlpha).toFixed(2)}`);

/* 느슨하게 잡으면 더 지우고, 빡빡하게 잡으면 덜 지운다 */
const bgLoose = bg.removedRatio(bg.maskOf(bgPx, bgW, bgH, { tolerance: 200, feather: 0 }));
const bgTight = bg.removedRatio(bg.maskOf(bgPx, bgW, bgH, { tolerance: 5, feather: 0 }));
check(bgLoose >= bg.removedRatio(bgAlpha), '느슨하면 더 지운다');
check(bgTight <= bg.removedRatio(bgAlpha), '빡빡하면 덜 지운다');

/* 페더 — 가장자리가 딱 잘리지 않고 사이 값이 생겨야 한다 */
const bgSoft = bg.maskOf(bgPx, bgW, bgH, { tolerance: 30, feather: 3 });
let bgMiddle = 0;
for (const a of bgSoft) if (a > 20 && a < 235) bgMiddle++;
check(bgMiddle > 0, '가장자리에 사이 값이 생긴다 (톱니 안 생긴다)');

const bgOut = bg.apply(bgPx, bgAlpha, { despill: true }, [255, 255, 255]);
eq(bgOut[3], 0, '모서리는 투명해진다');
eq(bgOut[((30 * bgW) + 30) * 4 + 3], 255, '물체는 그대로 보인다');
eq(bgOut.length, bgPx.length, '크기는 안 바뀐다');

/* 배경을 콕 집어 주면 그 색을 지운다 */
const bgPick = bg.maskOf(bgPx, bgW, bgH, { pick: { x: 0, y: 0 }, tolerance: 30, feather: 0 });
eq(bgPick[0], 0, '집어 준 색이 배경이 된다');

check(bg.run('describe').includes('machine-learning'), '무엇을 못 하는지 스스로 밝힌다');

// ── 증명사진 (TASK-KL-316) ──────────────────────────────────────────────────
const idp = await load('src/core/idphoto.ts');

check(idp.SPECS.length >= 10, '규격이 열 가지 넘는다');
check(idp.SPECS.every((s) => s.widthMm > 0 && s.heightMm > 0 && s.headMin < s.headMax && s.eyeMin < s.eyeMax), '규격 값이 앞뒤가 맞는다');
eq(idp.findSpec('kr-passport').widthMm, 35, '여권 사진은 35mm');
eq(idp.findSpec('us-passport').widthMm, idp.findSpec('us-passport').heightMm, '미국 여권은 정사각');
eq(idp.findSpec('없는것'), undefined, '모르는 규격은 없다고 한다');

eq(idp.mmToPx(25.4, 300), 300, '1인치는 300dpi 에서 300px');
const idpPlan = idp.plan(idp.findSpec('kr-passport'), 300);
eq(idpPlan.widthPx, 413, '35mm → 413px');
eq(idpPlan.heightPx, 531, '45mm → 531px');
check(idpPlan.headMinPx < idpPlan.headMaxPx, '머리 크기 범위');
/* 규정은 「아래에서부터」인데 그림은 위에서부터 — 뒤집기를 한 번만 해야 한다 */
check(idpPlan.eyeTopPx < idpPlan.eyeBottomPx, '눈 자리는 위에서부터 센다');
check(idpPlan.eyeTopPx > 0 && idpPlan.eyeBottomPx < idpPlan.heightPx, '눈 자리가 사진 안에 있다');
eq(idp.plan(idp.findSpec('kr-passport'), 600).widthPx, 827, 'dpi 를 올리면 픽셀도 는다');

/* 인화 배치 — 붙여 놓으면 못 자른다. 여유를 빼고 세야 한다 */
const idpSheet = idp.sheet(idp.findSpec('kr-passport'), '4x6', 300);
eq(idpSheet.cols * idpSheet.rows, idpSheet.slots.length, '칸 수가 자리 수와 같다');
check(idpSheet.slots.length >= 6, `4x6 인화지에 여섯 장 넘게 들어간다: ${idpSheet.slots.length}`);
check(idpSheet.slots.every((s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= idpSheet.widthPx && s.y + s.h <= idpSheet.heightPx), '자리가 종이를 안 넘는다');
/* 자리끼리 안 겹쳐야 한다 — 겹치면 인화가 통째로 버려진다 */
let idpOverlap = false;
for (let i = 0; i < idpSheet.slots.length; i++) {
  for (let j = i + 1; j < idpSheet.slots.length; j++) {
    const a = idpSheet.slots[i];
    const b = idpSheet.slots[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) idpOverlap = true;
  }
}
check(!idpOverlap, '자리끼리 안 겹친다');
check(idp.sheet(idp.findSpec('kr-passport'), 'a4', 300).slots.length > idpSheet.slots.length, 'A4 에는 더 많이 들어간다');

/* 규격을 지키는지 봐 준다 — 무엇이 어긋났는지까지 */
const idpOk = idp.check(idp.findSpec('kr-passport'), idpPlan, 320, 200);
eq(idpOk.ok, true, `가운데 값은 통과: ${JSON.stringify(idpOk)}`);
check(idp.check(idp.findSpec('kr-passport'), idpPlan, 100, 200).problems.includes('headTooSmall'), '머리가 작으면 짚는다');
check(idp.check(idp.findSpec('kr-passport'), idpPlan, 500, 200).problems.includes('headTooBig'), '머리가 크면 짚는다');
check(idp.check(idp.findSpec('kr-passport'), idpPlan, 320, 10).problems.includes('eyesTooHigh'), '눈이 높으면 짚는다');
check(idp.check(idp.findSpec('kr-passport'), idpPlan, 320, 500).problems.includes('eyesTooLow'), '눈이 낮으면 짚는다');
/* 말은 알맹이가 안 만든다 */
check(idp.check(idp.findSpec('kr-passport'), idpPlan, 100, 200).problems.every((p) => /^[a-zA-Z]+$/.test(p)), '흠의 이름은 열쇠다');

// ── 서류 스캔 (TASK-KL-316) ─────────────────────────────────────────────────
const ds = await load('src/core/docscan.ts');

/* 반듯한 네 점이면 셈이 그대로여야 한다 (안 그러면 멀쩡한 사진이 뒤틀린다) */
const dsSquare = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 }
];
const dsH = ds.homography(dsSquare, 100, 50);
eq(dsH.length, 9, '셈은 아홉 칸');
check(Math.abs(dsH[0] - 1) < 1e-6 && Math.abs(dsH[4] - 1) < 1e-6, '반듯하면 그대로 (배율 1)');
check(Math.abs(dsH[1]) < 1e-6 && Math.abs(dsH[3]) < 1e-6, '반듯하면 안 기운다');

eq(JSON.stringify(ds.guessSize(dsSquare)), JSON.stringify({ width: 100, height: 50 }), '네 점에서 크기를 잰다');
/* 사다리꼴이면 **긴 쪽**을 크기로 잡아야 한다 (짧은 쪽을 잡으면 글씨가 눌린다) */
const dsTrap = [
  { x: 10, y: 0 },
  { x: 90, y: 0 },
  { x: 100, y: 60 },
  { x: 0, y: 60 }
];
eq(ds.guessSize(dsTrap).width, 100, '넓은 쪽으로 잡는다');

/* 한 줄에 가까운 네 점은 못 푼다 — 조용히 이상한 그림을 내지 않는다 */
let dsThrew = false;
try {
  ds.homography([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }], 100, 50);
} catch {
  dsThrew = true;
}
check(dsThrew, '한 줄에 가까우면 그렇다고 말한다');

/* 되돌리기 — 사다리꼴로 찍은 것을 펴면 네 귀퉁이 색이 제자리로 온다 */
const dsW = 80;
const dsH2 = 60;
const dsPx = new Uint8ClampedArray(dsW * dsH2 * 4);
for (let y = 0; y < dsH2; y++) {
  for (let x = 0; x < dsW; x++) {
    const at = (y * dsW + x) * 4;
    const left = x < dsW / 2;
    const top = y < dsH2 / 2;
    dsPx[at] = left ? 240 : 20;
    dsPx[at + 1] = top ? 240 : 20;
    dsPx[at + 2] = 128;
    dsPx[at + 3] = 255;
  }
}
const dsOut = ds.warp(dsPx, dsW, dsH2, [{ x: 0, y: 0 }, { x: dsW - 1, y: 0 }, { x: dsW - 1, y: dsH2 - 1 }, { x: 0, y: dsH2 - 1 }], 40, 30);
eq(dsOut.length, 40 * 30 * 4, '결과 크기');
check(dsOut[0] > 200 && dsOut[1] > 200, '왼위는 밝다 (제자리)');
const dsRight = ((0 * 40) + 39) * 4;
check(dsOut[dsRight] < 60, '오른위는 어둡다 (제자리)');
/* 밖으로 나간 자리는 흰색으로 (검은 테두리가 남으면 인쇄가 지저분해진다) */
const dsOutside = ds.warp(dsPx, dsW, dsH2, [{ x: -50, y: -50 }, { x: -20, y: -50 }, { x: -20, y: -20 }, { x: -50, y: -20 }], 10, 10);
eq(dsOutside[0], 255, '사진 밖은 흰색으로 채운다');

/* 스캔처럼 — 그림자가 있어도 반쪽이 통째로 까매지면 안 된다 */
const shW = 60;
const shH = 60;
const shPx = new Uint8ClampedArray(shW * shH * 4);
for (let y = 0; y < shH; y++) {
  for (let x = 0; x < shW; x++) {
    const at = (y * shW + x) * 4;
    /* 왼쪽은 밝은 종이, 오른쪽은 그림자 진 종이. 둘 다 가운데 줄에 글씨가 있다. */
    const paper = x < shW / 2 ? 235 : 120;
    const ink = y > 28 && y < 32;
    const v = ink ? paper - 70 : paper;
    shPx[at] = v;
    shPx[at + 1] = v;
    shPx[at + 2] = v;
    shPx[at + 3] = 255;
  }
}
const dsScan = ds.enhance(shPx, shW, shH, 'scan');
const black = (x, y) => dsScan[((y * shW) + x) * 4] === 0;
check(black(10, 30) && black(50, 30), '밝은 쪽·그림자 쪽 글씨가 **둘 다** 남는다');
check(!black(10, 5) && !black(50, 5), '종이는 둘 다 하얗게 (그림자 쪽이 통째로 안 까매진다)');
const dsGray = ds.enhance(shPx, shW, shH, 'gray');
check(dsGray[0] === dsGray[1] && dsGray[1] === dsGray[2], '회색은 세 칸이 같다');
eq(ds.enhance(shPx, shW, shH, 'color')[0], shPx[0], '컬러는 안 건드린다');

const dsFit = ds.fitA4(2000, 3000);
check(dsFit.heightMm <= 277 && dsFit.widthMm <= 190, 'A4 여백 안에 들어간다');
eq(dsFit.landscape, false, '세로 사진은 세로 A4');
eq(ds.fitA4(3000, 2000).landscape, true, '가로 사진은 가로 A4');
check(Math.abs(dsFit.widthMm / dsFit.heightMm - 2000 / 3000) < 0.02, '비율을 지킨다');

// ── 그림 속 글자 (TASK-KL-316) ──────────────────────────────────────────────
const ocr = await load('src/core/ocr.ts');

/* 갈래를 가르는 게 이 알맹이의 일 — 글자 든 PDF 를 읽기 모형에 보내면 느리고 더 틀린다 */
eq(ocr.route('application/pdf', true).route, 'extract', '글자 든 PDF 는 뽑는다');
eq(ocr.route('application/pdf', true).tool, 'pdf2text', '이미 있는 도구로 보낸다 (다시 안 만든다)');
eq(ocr.route('application/pdf', false).route, 'recognise', '스캔 PDF 는 읽어야 한다');
eq(ocr.route('image/jpeg').route, 'recognise', '사진은 읽어야 한다');
eq(ocr.route('image/jpeg').preprocess, true, '읽기 전에 다듬는다');
eq(ocr.route('text/plain').route, 'unsupported', '모르는 것은 모른다고 한다');

/* 한국어·일본어는 아직 못 읽는다 — **되는 척하지 않는다** */
eq(ocr.modelFor('ko'), undefined, '한국어는 아직 없다고 한다');
eq(ocr.modelFor('ja'), undefined, '일본어도 없다고 한다');
check(ocr.modelFor('en').id.includes('trocr'), '영어는 모형을 댄다');
check(ocr.modelFor('en').sizeMb > 0, '얼마나 받는지도 말한다');

/* 다듬기 — 스캔에서 늘 오는 세 가지 */
eq(ocr.tidy('hyphen-\nated word'), 'hyphenated word', '줄 끝에서 잘린 낱말을 잇는다');
eq(ocr.tidy('첫 줄\n둘째 줄'), '첫 줄 둘째 줄', '문장이 안 끝났으면 잇는다');
eq(ocr.tidy('끝났다.\n새 문장'), '끝났다.\n새 문장', '문장이 끝났으면 안 잇는다');
eq(ocr.tidy('한글이\n이어진다'), '한글이 이어진다', '한국어는 낱말을 띄우니 빈칸을 넣어 잇는다');
eq(ocr.tidy('日本語が\n続く'), '日本語が続く', '일본어는 붙여 잇는다 (없던 틈을 안 만든다)');
eq(ocr.tidy('본문 한 줄.\n- 12 -\n다음 쪽 첫 줄'), '본문 한 줄.\n다음 쪽 첫 줄', '쪽 번호만 있는 줄은 버린다');
eq(ocr.tidy('띄어쓰기    많은   줄.'), '띄어쓰기 많은 줄.', '늘어난 빈칸을 줄인다');
eq(ocr.tidy('가.\n\n\n\n나.'), '가.\n\n나.', '빈 줄이 넷이어도 하나만 남긴다');

/* 빈 답을 조용히 주지 않으려는 자리 */
eq(ocr.looksEmpty('   \n 12 . , '), true, '글자가 없으면 비었다고 본다');
eq(ocr.looksEmpty('안녕하세요'), false, '글이 있으면 안 비었다');
eq(ocr.looksEmpty('ab'), true, '두 글자는 읽었다고 보기 어렵다');

// ── 닮은 사진 (TASK-KL-316) ─────────────────────────────────────────────────
const dup = await load('src/core/dupphoto.ts');

/** 9×8 회색 값을 만든다 — `shift` 만큼 밝기를 통째로 올려도 지문은 안 변해야 한다 */
function grayOf(seed, shift = 0) {
  const out = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) out.push(Math.min(255, ((x * 7 + y * 13 + seed * 31) % 200) + shift));
  }
  return out;
}

const dupA = dup.dHash(grayOf(1));
const dupBrighter = dup.dHash(grayOf(1, 40));
/* 아주 다른 사진 — 밝기가 반대로 흐르게 만든다 */
const dupOther = dup.dHash(grayOf(1).map((v, i) => (Math.floor(i / 9) % 2 === 0 ? 255 - v : v)));
eq(dupA, dupBrighter, '사진 전체가 밝아져도 지문은 그대로 (이웃과의 차이만 본다)');
check(dup.distance(dupA, dupOther) > 6, `다른 사진은 멀다: ${dup.distance(dupA, dupOther)}`);
eq(dup.distance(dupA, dupA), 0, '자기 자신과는 0');

let dupThrew = false;
try {
  dup.dHash([1, 2, 3]);
} catch {
  dupThrew = true;
}
check(dupThrew, '9×8 이 아니면 그렇다고 한다');

/* 묶기 — 크기만 줄인 사본이 같은 묶음에 와야 한다 */
const photos = [
  { name: 'IMG_1.jpg', size: 3_000_000, pixels: 12_000_000, hash: dupA },
  { name: 'IMG_1 (사본).jpg', size: 400_000, pixels: 2_000_000, hash: dupA },
  { name: 'IMG_1_kakao.jpg', size: 120_000, pixels: 1_000_000, hash: dupA ^ 3n },
  { name: '다른날.jpg', size: 2_500_000, pixels: 12_000_000, hash: dupOther }
];
const groups = dup.group(photos, 6);
eq(groups.length, 1, '묶음 하나 (다른 사진은 안 들어온다)');
eq(groups[0].keep.name, 'IMG_1.jpg', '가장 크고 덜 상한 것을 남긴다');
eq(groups[0].others.length, 2, '나머지 둘은 지워도 되는 쪽');
eq(groups[0].saved, 520_000, '지우면 얼마나 줄어드는지');
eq(dup.totalSaved(groups), 520_000, '전체 절약');

/* 이어짐으로 묶는다 — A~B, B~C 면 셋이 한 묶음(연사 사진이 그렇다) */
const chain = dup.group([
  { name: 'a', size: 10, hash: 0n },
  { name: 'b', size: 10, hash: 0b111n },
  { name: 'c', size: 10, hash: 0b111111n }
], 3);
eq(chain.length, 1, '사슬로 이어지면 한 묶음');
eq(chain[0].others.length + 1, 3, '셋이 다 들어온다');
check(chain[0].spread > 3, '묶음이 얼마나 벌어졌는지도 말한다');

/* 바이트가 똑같으면 지문과 무관하게 묶는다 */
const exact = dup.group([
  { name: 'x', size: 10, hash: 0n, exact: 'abc' },
  { name: 'y', size: 10, hash: 0xffffffffffffffffn, exact: 'abc' }
], 0);
eq(exact.length, 1, '완전히 같은 파일은 무조건 한 묶음');
eq(dup.group([{ name: 'only', size: 1, hash: 0n }]).length, 0, '혼자면 묶음이 아니다');
check(dup.run('describe').includes('never deletes'), '지우지 않는다고 스스로 밝힌다');

// ── 사진 정보·자리 (TASK-KL-316) ────────────────────────────────────────────
const exif = await load('src/core/exif.ts');
const pmap = await load('src/core/photomap.ts');

/* 진짜 사진 대신 **손으로 JPEG 를 쌓는다** — 저장소에 남의 사진을 안 넣고, 구조가 바뀌면 시험이 먼저 깨진다 */
function makeJpeg({ lat, lon, date }) {
  const be = (n, size) => {
    const out = [];
    for (let i = size - 1; i >= 0; i--) out.push((n >> (i * 8)) & 255);
    return out;
  };
  const entries = [];
  const extra = [];
  const tiffStart = 8; // TIFF 머리 뒤
  const addEntry = (tag, type, count, valueBytes) => {
    if (valueBytes.length <= 4) {
      entries.push([...be(tag, 2), ...be(type, 2), ...be(count, 4), ...valueBytes, ...new Array(4 - valueBytes.length).fill(0)]);
    } else {
      entries.push([...be(tag, 2), ...be(type, 2), ...be(count, 4), ...be(0, 4)]);
      extra.push({ index: entries.length - 1, bytes: valueBytes });
    }
  };
  const ascii = (s) => [...new TextEncoder().encode(s), 0];
  addEntry(0x010f, 2, ascii('도토리카메라').length, ascii('도토리카메라'));
  addEntry(0x0132, 2, ascii(date).length, ascii(date));
  addEntry(0x8825, 4, 1, be(0, 4)); // GPS IFD 자리 — 아래에서 채운다
  const gpsEntryIndex = entries.length - 1;

  const rational = (value) => {
    const deg = Math.floor(Math.abs(value));
    const minFloat = (Math.abs(value) - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = Math.round((minFloat - min) * 60 * 100);
    return [...be(deg, 4), ...be(1, 4), ...be(min, 4), ...be(1, 4), ...be(sec, 4), ...be(100, 4)];
  };
  const gpsEntries = [
    [...be(0x0001, 2), ...be(2, 2), ...be(2, 4), ...ascii(lat >= 0 ? 'N' : 'S'), 0, 0],
    [...be(0x0002, 2), ...be(5, 2), ...be(3, 4), ...be(0, 4)],
    [...be(0x0003, 2), ...be(2, 2), ...be(2, 4), ...ascii(lon >= 0 ? 'E' : 'W'), 0, 0],
    [...be(0x0004, 2), ...be(5, 2), ...be(3, 4), ...be(0, 4)]
  ];

  /* 자리를 실제로 계산해 넣는다 (길이가 4 를 넘는 값은 뒤쪽에 두고 그 자리를 가리킨다) */
  const ifd0Size = 2 + entries.length * 12 + 4;
  let cursor = tiffStart + ifd0Size;
  const tail = [];
  for (const e of extra) {
    entries[e.index].splice(8, 4, ...be(cursor, 4));
    tail.push(...e.bytes);
    cursor += e.bytes.length;
  }
  const gpsOffset = cursor;
  entries[gpsEntryIndex].splice(8, 4, ...be(gpsOffset, 4));
  const gpsIfdSize = 2 + gpsEntries.length * 12 + 4;
  let gpsCursor = gpsOffset + gpsIfdSize;
  const gpsTail = [];
  for (const [i, value] of [[1, rational(lat)], [3, rational(lon)]]) {
    gpsEntries[i].splice(8, 4, ...be(gpsCursor, 4));
    gpsTail.push(...value);
    gpsCursor += value.length;
  }

  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, ...be(tiffStart, 4),
    ...be(entries.length, 2), ...entries.flat(), ...be(0, 4),
    ...tail,
    ...be(gpsEntries.length, 2), ...gpsEntries.flat(), ...be(0, 4),
    ...gpsTail
  ];
  const app1 = [...new TextEncoder().encode('Exif'), 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...be(app1.length + 2, 2), ...app1, 0xff, 0xd9]);
}

const shotJpeg = makeJpeg({ lat: 37.5665, lon: 126.978, date: '2026:08:14 09:30:00' });
const shotInfo = exif.read(shotJpeg);
eq(shotInfo.camera, '도토리카메라', '카메라 이름을 읽는다 (한글도)');
eq(shotInfo.date, '2026:08:14 09:30:00', '찍은 때를 읽는다');
check(shotInfo.gps !== undefined, 'GPS 를 읽는다');
check(Math.abs(shotInfo.gps.lat - 37.5665) < 0.001, `위도: ${shotInfo.gps.lat}`);
check(Math.abs(shotInfo.gps.lon - 126.978) < 0.001, `경도: ${shotInfo.gps.lon}`);
eq(JSON.stringify(exif.read(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))), '{}', 'EXIF 가 없으면 빈 것 (없는 건 잘못이 아니다)');
eq(exif.dateToMs('2026:08:14 09:30:00'), Date.parse('2026-08-14T09:30:00'), '때를 밀리초로');
eq(exif.dateToMs('언제인지 모름'), undefined, '못 읽으면 지어내지 않는다');

/* 자리 묶기 — 한 골목 스무 장이 점 스무 개가 되면 안 된다 */
const shots = [
  { name: 'a', lat: 37.5665, lon: 126.978, at: 1 },
  { name: 'b', lat: 37.5666, lon: 126.9781, at: 2 },
  { name: 'c', lat: 37.5701, lon: 126.982, at: 3 },
  { name: 'd', lat: 35.1796, lon: 129.0756, at: 4 }
];
const grouped = pmap.places(shots, 300);
eq(grouped.length, 3, '가까운 둘은 한 자리, 나머지는 따로');
eq(grouped[0].shots.length, 2, '가장 많은 자리가 먼저');
check(Math.abs(pmap.metersBetween(37.5665, 126.978, 37.5666, 126.9781) - 14) < 5, '거리를 미터로 잰다');
check(pmap.metersBetween(37.5665, 126.978, 35.1796, 129.0756) > 300000, '서울–부산은 멀다');

const dayed = pmap.days([
  { name: 'a', lat: 0, lon: 0, at: Date.parse('2026-08-14T09:00:00') },
  { name: 'b', lat: 0, lon: 0, at: Date.parse('2026-08-14T20:00:00') },
  { name: 'c', lat: 0, lon: 0, at: Date.parse('2026-08-15T01:00:00') },
  { name: 'd', lat: 0, lon: 0 }
]);
eq(dayed.days.length, 2, '이틀로 갈린다');
eq(dayed.days[0].shots.length, 2, '같은 날은 함께');
eq(dayed.undated.length, 1, '때를 모르는 사진도 **안 버린다**');

const frame = pmap.frameOf(shots);
check(frame.minLat < 35.18 && frame.maxLat > 37.57, '모든 점이 틀 안에 든다');
const one = pmap.frameOf([{ name: 'x', lat: 37.5, lon: 127 }]);
check(one.maxLat > one.minLat && one.maxLon > one.minLon, '한 점뿐이어도 넓이가 0 이 아니다 (그릴 수 있게)');

const dot = pmap.project({ lat: 37.5665, lon: 126.978 }, frame, 400, 300);
check(dot.x >= 0 && dot.x <= 400 && dot.y >= 0 && dot.y <= 300, '그림 안에 찍힌다');
const north = pmap.project({ lat: frame.maxLat, lon: 127 }, frame, 400, 300);
const south = pmap.project({ lat: frame.minLat, lon: 127 }, frame, 400, 300);
check(north.y < south.y, '북쪽이 위에 온다');

check(pmap.mapLink(37.5665, 126.978).includes('37.566500'), '지도 링크에 자리가 들어간다');
check(pmap.run('describe').includes('No map tiles'), '타일을 안 받는다고 스스로 밝힌다');

// ── 읽어 주기 (TASK-KL-316) ─────────────────────────────────────────────────
const tts = await load('src/core/tts.ts');

eq(tts.split('첫 문장이다. 둘째 문장이다.').length, 2, '문장 둘로 자른다');
/* 숫자 한가운데서 끊기면 「삼 점」 「일사」로 읽힌다 — 여기가 이 알맹이의 핵심 */
eq(tts.split('원주율은 3.14 이다.').length, 1, '소수점에서는 안 자른다');
check(tts.split('원주율은 3.14 이다.')[0].includes('3.14'), '점을 되돌려 놓는다 (314 가 되면 안 된다)');
eq(tts.split('Mr. Kim went home. He slept.').length, 2, '줄임말 뒤에서는 안 자른다');
eq(tts.split('가나다\n\n라마바').length, 2, '빈 줄은 문단 경계');
eq(tts.split('한 줄뿐').length, 1, '점이 없어도 한 문장');
eq(tts.split('').length, 0, '빈 글은 빈 목록');

/* 너무 긴 문장은 한 번 더 자른다 — 길수록 중간에 멎는다 */
const longOne = '가'.repeat(500);
const pieces = tts.split(longOne, 180);
check(pieces.length >= 3, `긴 문장을 나눈다: ${pieces.length}조각`);
check(pieces.every((p) => p.length <= 180), '조각이 한도를 안 넘는다');
eq(pieces.join(''), longOne, '자르면서 글자를 잃지 않는다');
const commas = tts.split('앞부분입니다, 가운데입니다, 뒷부분입니다'.repeat(6), 100);
check(commas.every((p) => p.length <= 100), '쉼표에서 끊어도 한도를 지킨다');

eq(tts.guessLanguage('안녕하세요 여러분'), 'ko', '한국어를 알아본다');
eq(tts.guessLanguage('こんにちは皆さん'), 'ja', '일본어를 알아본다');
eq(tts.guessLanguage('hello everyone'), 'en', '영어를 알아본다');
eq(tts.guessLanguage('123 456'), 'en', '글자가 없으면 영어로 둔다');

/* 시간 어림 — 글자 수가 아니라 소리 수로 (말이 빠르면 짧아진다) */
const oneMinute = tts.seconds('가'.repeat(390));
check(oneMinute > 50 && oneMinute < 70, `한국어 390자는 1분쯤: ${oneMinute}초`);
check(tts.seconds('가'.repeat(390), 2) < oneMinute, '빠르게 읽으면 짧아진다');
eq(tts.seconds(''), 0, '빈 글은 0초');
eq(JSON.stringify(tts.asClock(75)), JSON.stringify({ minutes: 1, seconds: 15 }), '분·초로 나눈다');

// ── 나눠 내기 (TASK-KL-316) ─────────────────────────────────────────────────
const dp = await load('src/core/dutchpay.ts');

/* 남는 1원을 버리면 총합이 안 맞는다 — 그 1원이 계산을 다시 하게 만든다 */
eq(dp.splitAmount(10000, 3).join(','), '3334,3333,3333', '1원까지 나눠 붙인다');
eq(dp.splitAmount(10000, 3).reduce((a, b) => a + b, 0), 10000, '합이 딱 맞는다');
eq(dp.splitAmount(9, 4).join(','), '3,2,2,2', '작은 돈도 딱 맞는다');
eq(dp.splitAmount(100, 0).length, 0, '사람이 없으면 나눌 것도 없다');

const lines = dp.parseExpenses([
  '윤 : 30,000원 : : 저녁',
  '링:12000',
  '알리사:9000:윤,링',
  '# 주석은 건너뛴다',
  '잘못된 줄'
].join('\n'));
eq(lines.length, 3, '주석과 이상한 줄은 뺀다');
eq(lines[0].amount, 30000, '쉼표와 「원」을 떼고 읽는다');
eq(lines[0].what, '저녁', '무엇에 썼는지도 읽는다');
eq(lines[2].forWhom.join(','), '윤,링', '누구 몫인지 읽는다');

const people = ['윤', '링', '알리사'];
const shares = dp.balances(people, lines);
eq(shares.length, 3, '세 사람');
const yun = shares.find((s) => s.name === '윤');
eq(yun.paid, 30000, '낸 돈');
/* 30000 을 셋이(10000씩) + 12000 을 셋이(4000씩) + 9000 을 둘이(4500씩) */
eq(yun.owed, 10000 + 4000 + 4500, '내야 할 몫');
eq(shares.reduce((sum, s) => sum + s.balance, 0), 0, '모두의 셈을 더하면 0 (돈이 안 새고 안 생긴다)');

const transfers = dp.settle(shares);
check(transfers.length <= people.length - 1, `송금 횟수가 사람 수보다 적다: ${transfers.length}`);
eq(transfers.reduce((sum, x) => sum + x.amount, 0), shares.filter((s) => s.balance > 0).reduce((sum, s) => sum + s.balance, 0), '주고받는 총액이 받을 총액과 같다');
check(transfers.every((x) => x.amount > 0), '0원 송금은 안 만든다');
check(transfers.every((x) => x.from !== x.to), '자기 자신에게 보내지 않는다');

/* 갚고 나면 모두 0 이 되어야 한다 — 이게 최종 검산 */
const after = new Map(shares.map((s) => [s.name, s.balance]));
for (const x of transfers) {
  after.set(x.from, (after.get(x.from) ?? 0) + x.amount);
  after.set(x.to, (after.get(x.to) ?? 0) - x.amount);
}
check([...after.values()].every((v) => v === 0), `갚고 나면 모두 0: ${JSON.stringify([...after])}`);

/* 송금 줄이기 — A→B, B→C 가 A→C 하나가 되는지 */
const relay = dp.settle([
  { name: 'A', paid: 0, owed: 0, balance: -10000 },
  { name: 'B', paid: 0, owed: 0, balance: 0 },
  { name: 'C', paid: 0, owed: 0, balance: 10000 }
]);
eq(relay.length, 1, '가운데 사람을 안 거친다');
eq(relay[0].from + '→' + relay[0].to, 'A→C', '한 번에 보낸다');

/* 주소로 나눠 갖기 — 서버에 안 맡긴다 */
const packed = dp.encode(people, lines);
check(!packed.includes('+') && !packed.includes('/') && !packed.includes('='), '주소에 그대로 쓸 수 있는 글자만');
const restored = dp.decode(packed);
eq(restored.people.join(','), people.join(','), '사람이 그대로 돌아온다');
eq(restored.expenses.length, lines.length, '쓴 돈도 그대로');
eq(restored.expenses[0].what, '저녁', '한글도 안 깨진다');
eq(JSON.stringify(dp.balances(restored.people, restored.expenses)), JSON.stringify(shares), '왕복해도 셈이 같다');

// ── 실수령액 (TASK-KL-316) ──────────────────────────────────────────────────
const slip = await load('src/core/payslip.ts');

const s300 = slip.monthly({ monthly: 3000000, taxFree: 200000, family: 1 });
eq(s300.gross, 3000000, '세전은 그대로');
eq(s300.taxable, 2800000, '비과세를 빼고 매긴다');
eq(s300.pension, 126000, '국민연금 4.5%');
check(Math.abs(s300.health - 99260) < 200, `건강보험 3.545%: ${s300.health}`);
/* 장기요양은 **건강보험료의** 비율 — 월급의 비율로 잡으면 열 배쯤 틀린다 */
check(Math.abs(s300.care - Math.floor((s300.health * 0.1295) / 10) * 10) < 20, `장기요양은 건보료 기준: ${s300.care}`);
check(s300.care < s300.health / 5, '장기요양이 건보료보다 훨씬 작다');
eq(s300.employment, 25200, '고용보험 0.9%');
eq(s300.localTax, Math.floor((s300.incomeTax * 0.1) / 10) * 10, '지방소득세는 소득세의 10%');
eq(s300.net, s300.gross - s300.deductions, '통장에 들어오는 돈 = 세전 - 뗀 것');
check(s300.net > 2600000 && s300.net < 2800000, `300만 원이면 260~280만 원쯤: ${s300.net}`);
eq(s300.year, 2025, '어느 해 표인지 같이 준다');

/* 국민연금 상한 — 월급이 아무리 커도 더 안 뗀다 (여기서 계산이 자주 어긋난다) */
const rich = slip.monthly({ monthly: 20000000 });
eq(rich.pension, Math.floor((6170000 * 0.045) / 10) * 10, '상한을 넘으면 상한으로');
eq(slip.monthly({ monthly: 300000 }).pension, Math.floor((390000 * 0.045) / 10) * 10, '하한 아래면 하한으로');
check(rich.incomeTax > s300.incomeTax * 5, '많이 벌면 세금이 가파르게 는다 (누진)');

/* 비과세를 늘리면 실수령이 는다 — 그게 식대가 있는 이유다 */
const noFree = slip.monthly({ monthly: 3000000, taxFree: 0 });
check(noFree.net < s300.net, '비과세가 없으면 덜 받는다');
/* 부양가족·자녀가 늘면 세금이 준다 */
check(slip.monthly({ monthly: 3000000, taxFree: 200000, family: 3 }).incomeTax < s300.incomeTax, '부양가족이 늘면 세금이 준다');
check(slip.monthly({ monthly: 3000000, taxFree: 200000, family: 3, children: 2 }).incomeTax <= slip.monthly({ monthly: 3000000, taxFree: 200000, family: 3 }).incomeTax, '자녀공제가 더 깎는다');

/* 세율 구간이 이어져야 한다 — 구간 경계에서 세금이 갑자기 뛰면 안 된다 */
const justUnder = slip.incomeTax(14000000);
const justOver = slip.incomeTax(14000001);
check(justOver - justUnder < 100, `구간 경계가 이어진다: ${justUnder} → ${justOver}`);
eq(slip.incomeTax(0), 0, '과세표준이 0 이면 세금도 0');
eq(slip.incomeTax(-100), 0, '음수도 0');
check(slip.earnedIncomeDeduction(100000000) < slip.earnedIncomeDeduction(200000000), '근로소득공제는 늘되');
check(slip.earnedIncomeDeduction(200000000) <= 20000000, '2천만 원에서 멈춘다');

const fromYear = slip.fromYearly({ yearly: 36000000, taxFree: 200000, monthly: 0 });
eq(fromYear.gross, 3000000, '연봉을 열둘로 나눈다');

// ── 인쇄 종이 (TASK-KL-316) ─────────────────────────────────────────────────
const pk = await load('src/core/printkit.ts');

const pkGrid = pk.grid('a4', 5);
eq(pkGrid.widthMm, 210, 'A4 가로');
eq(pkGrid.heightMm, 297, 'A4 세로');
check(pk.fits(pkGrid), '선이 종이를 안 넘는다 (넘으면 인쇄에서 잘린다)');
check(pkGrid.lines.some((l) => l.faint !== true), '5칸마다 진한 선이 있다');
check(pkGrid.lines.every((l) => l.x1 >= 8 - 0.001 && l.y1 >= 8 - 0.001), '프린터가 못 찍는 가장자리를 피한다');
check(pk.grid('a4', 10).lines.length < pkGrid.lines.length, '칸이 크면 선이 적다');
eq(pk.grid('a4', 5, true).widthMm, 297, '눕히면 가로가 길어진다');

const pkDots = pk.dots('a5', 5);
check(pkDots.lines.length > 100, '점이 촘촘히 찍힌다');
check(pk.fits(pkDots), '점도 종이 안에');

/* 원고지 칸은 **정사각**이어야 글자가 안 눌린다 */
const pkMs = pk.manuscript('a4', 20, 10);
eq(pkMs.boxes.length, 200, '20×10 = 200칸');
check(Math.abs(pkMs.boxes[0].w - pkMs.boxes[0].h) < 0.001, '칸이 정사각');
check(pk.fits(pkMs), '원고지도 종이 안에');
/* 가운데 정렬 — 한쪽으로 몰리면 접거나 자를 때 어긋난다 */
const left = pkMs.boxes[0].x;
const right = pkMs.widthMm - (pkMs.boxes[19].x + pkMs.boxes[19].w);
check(Math.abs(left - right) < 0.01, '좌우 여백이 같다');

const pkStaff = pk.staff('a4', 10, 7);
eq(pkStaff.lines.length, 50, '오선 10묶음 = 50줄');
check(pk.fits(pkStaff), '오선지도 종이 안에');
/* 묶음 사이가 오선 자체보다 넉넉해야 가사·화음을 적는다 */
const firstStaffBottom = pkStaff.lines[4].y1;
const secondStaffTop = pkStaff.lines[5].y1;
check(secondStaffTop - firstStaffBottom > 7, `묶음 사이가 넉넉하다: ${(secondStaffTop - firstStaffBottom).toFixed(1)}mm`);

/* 달력 — 요일과 날짜 수가 맞아야 한다 */
eq(pk.daysInMonth(2026, 2), 28, '2026년 2월은 28일');
eq(pk.daysInMonth(2028, 2), 29, '2028년 2월은 29일 (윤년)');
eq(pk.firstWeekday(2026, 8), 6, '2026-08-01 은 토요일');
const pkCal = pk.calendar(2026, 8, 'a4');
eq(pkCal.widthMm, 297, '달력은 눕힌다');
const dayLabels = pkCal.labels.filter((l) => /^\d+$/.test(l.text));
eq(dayLabels.length, 31, '8월은 31칸');
eq(dayLabels[0].text, '1', '1일부터');
eq(dayLabels[30].text, '31', '31일까지');
check(pkCal.labels.some((l) => l.text === '2026-08'), '몇 년 몇 월인지 적는다');
check(pk.fits(pkCal), '달력도 종이 안에');
/* 첫날이 토요일이면 첫 줄에 칸이 하나만 찬다 — 그 자리가 비어야 맞다 */
const firstRowDays = dayLabels.filter((l) => l.y < pkCal.labels.find((x) => x.text === '8')?.y ?? 0);
check(firstRowDays.length <= 2, '첫 주는 며칠뿐이다');

const pkLabel = pk.labels('24');
eq(pkLabel.boxes.length, 24, '24칸 라벨');
check(pk.fits(pkLabel), '라벨이 A4 안에');
eq(pk.labels('65').boxes.length, 65, '65칸도 있다');
let pkThrew = false;
try {
  pk.labels('없는규격');
} catch {
  pkThrew = true;
}
check(pkThrew, '모르는 규격은 그렇다고 한다');

// ── 마무리 ──────────────────────────────────────────────────────────────────
fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-core] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[test-core] 알맹이 ${coreFiles.length}개 · 검사 전부 통과`);
