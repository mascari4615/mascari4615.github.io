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
eq(ep.parseTimestamp('1750000000').unit.label, '초 (10자리)', '무엇으로 읽었는지 말한다');
eq(ep.parseTimestamp('1750000000000000000').unit.label, '나노초 (19자리)', '나노초라고 말한다');
check(new Date(ep.parseTimestamp('1750000000000000000').ms).getUTCFullYear() < 3000, '나노초를 밀리초로 읽어 5만 년이 나오면 안 된다');

eq(ep.parseTimestamp(''), null, '빈 값은 null');
eq(ep.parseTimestamp('abc'), null, '숫자가 없으면 null');
eq(ep.parseTimestamp('1,750,000,000').ms, SEC * 1000, '쉼표 섞여 와도 읽는다');

// 「지금」을 인자로 받으므로 답이 흔들리지 않는다.
const NOW = 1_750_000_000_000;
eq(ep.humanDelta(NOW, NOW), '방금', '같은 순간');
eq(ep.humanDelta(NOW - 3 * 86400000, NOW), '3일 전', '과거');
eq(ep.humanDelta(NOW + 2 * 3600000, NOW), '2시간 후', '미래');

const epRows = ep.stampRows(NOW, NOW);
eq(epRows.length, 9, '보여 줄 줄 수');
eq(epRows.find(([k]) => k === '초 (10자리)')[1], String(SEC), '초 값');
eq(epRows.find(([k]) => k === 'ISO 8601')[1], new Date(NOW).toISOString(), 'ISO 값');
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
eq(bz.kindOf('01'), '개인 과세사업자', '가운데 두 자리 = 사업자 구분 (01)');
eq(bz.kindOf('80'), '법인이 아닌 종교단체', '80');
eq(bz.kindOf('81'), '영리법인 본점', '81');
eq(bz.kindOf('89'), '비영리법인 본점·지점', '89');
eq(bz.kindOf('90'), '개인 면세사업자·비영리', '90');
const corpExpect = bz.checkCorp('123456789012' + '0').expect;
check(bz.checkCorp('123456789012' + String(corpExpect)).ok === true, '법인번호도 규칙대로면 통과');
check(bz.run('check', { number: '123-45-6789' + String(bizExpect) }).includes('형식상 올바름'), 'run 이 사람 말로 답한다');
check(bz.run('check', { number: '1234567890' }).includes('국세청'), '「형식만 본다」를 반드시 말한다');

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

eq(info.zodiac, '말', '1990년생 = 말띠');
eq(bi.signOf(1, 19), '염소자리', '1/19 = 염소자리 (경계)');
eq(bi.signOf(1, 20), '물병자리', '1/20 = 물병자리 (경계)');
eq(bi.signOf(12, 21), '사수자리', '12/21 = 사수자리 (경계)');
eq(bi.signOf(12, 22), '염소자리', '12/22 = 염소자리 (경계)');
eq(bi.birthInfo('2000-02-29', TODAY).weekday, '화', '윤년 2/29 는 화요일');

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
eq(vt.won(1234567), '1,234,567원', '금액 표기');

check(vt.run('extract', { amount: 110000 }).includes('공급가액: 100,000원'), 'run extract');
check(vt.run('extract', { amount: 110000 }).includes('÷ 1.10'), '어떻게 계산했는지 말한다');
check(vt.run('add', { amount: 1000000 }).includes('합계금액: 1,100,000원'), 'run add');
check(vt.run('add', { amount: 12345 }).includes('확인: 공급가 + 세액'), '세 줄이 맞는지 스스로 보여 준다');
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
check(pay > 566000 && pay < 567000, `월 상환액이 566,xxx 여야 한다: ${Math.round(pay)}`);
check(pay * 60 > 30000000, '총 상환액은 원금보다 크다');
eq(it.annuityPayment(1200000, 0, 12), 100000, '무이자면 그냥 나눈다');

check(it.run('saving', { monthly: 500000, rate: 4, months: 12 }).includes('130,000원'), 'run saving 세전 이자');
check(it.run('saving', { monthly: 500000, rate: 4, months: 12 }).includes('그건 틀립니다'), '흔한 오답을 짚어 준다');
check(it.run('deposit', { amount: 10000000, rate: 4, months: 12 }).includes('이자소득세'), 'run deposit 세금 표기');
check(it.run('loan', { amount: 30000000, rate: 5, months: 60 }).includes('월 상환액'), 'run loan');
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
check(ln.run('compare', { amount: P, rate: 5, months: 60 }).includes('원금균등'), 'run compare 가 셋을 나란히');
check(ln.run('schedule', { amount: P, rate: 5, months: 60, extra: 200000 }).includes('개월 단축'), 'run schedule 이 절약을 말한다');
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
check(gr.run('gpa', { courses: '3 A+\n1 F' }).includes('평점은 위쪽입니다'), '단순 평균과 헷갈리지 않게 말해 준다');
check(gr.run('needed', { courses: '3 A+', target: 4.0, future: 3 }).includes('평균 3.50 필요'), 'run needed');
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

eq(tc.fmt(465), '7시간 45분', '보기 좋은 표기');
eq(tc.fmt(-90), '-1시간 30분', '음수도 부호를 붙여 그대로');
eq(tc.fmt(0), '0시간 0분', '0');

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
check(tc.run('shift', { start: '23:30', duration: '1:00' }).includes('1일 뒤'), '자정을 넘으면 말해 준다');
check(tc.run('shift', { start: '09:40', duration: '1:25', minus: true }).includes('08:15'), 'run shift 빼기');
check(tc.run('sum', { times: '7:45\n8:20' }).includes('7.45 가 아니라'), '급여 계산 함정을 짚어 준다');
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
eq(tv.parse('a\tb\n1\t2').kind, '엑셀 붙여넣기', '탭이 있으면 엑셀에서 복사한 것');
eq(tv.parse('a,b\n1,2').kind, 'CSV', '쉼표면 CSV');
eq(tv.parse('| a | b |\n| --- | --- |\n| 1 | 2 |').kind, '마크다운 표', '두 번째 줄이 구분선이면 마크다운');
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

check(tv.run('convert', { table: 'a\tb\n1\t2' }).includes('엑셀 붙여넣기'), 'run 이 읽은 꼴을 말한다');
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
check(plain.skipped.some((s) => s.why === '토요일') && plain.skipped.some((s) => s.why === '일요일'), '주말을 건너뛴다');

// 토요일 근무를 켜면 답이 달라져야 한다 (안 달라지면 그 설정이 죽은 것).
const satOff = wd.addWorkdays(new Date(2026, 2, 2), 5, 'KR', false);
const satOn = wd.addWorkdays(new Date(2026, 2, 2), 5, 'KR', true);
check(satOn.end.getTime() < satOff.end.getTime(), '토요일도 일하면 더 빨리 끝난다');

/* 이 도구의 진짜 값 — 추석이 낀 구간은 그만큼 밀린다.
   2026 추석 = 9/24~26. 9/21(월)부터 영업일 5일이면 추석을 넘어간다. */
const chuseok = wd.addWorkdays(new Date(2026, 8, 21), 5);
check(chuseok.skipped.some((s) => s.why.includes('추석')), `추석을 건너뛰어야 한다: ${JSON.stringify(chuseok.skipped)}`);
check(chuseok.end.getTime() > new Date(2026, 8, 26).getTime(), '추석 뒤로 밀린다');

// 공휴일 이름을 열쇠가 아니라 사람 말로 낸다.
const names = [...wd.holidaysOf('KR', 2026).values()];
check(names.includes('신정'), `1/1 이 「신정」이어야 한다: ${names.slice(0, 4)}`);
check(names.some((v) => /^h\d\d$/.test(v)) === false, `열쇠가 그대로 새어 나왔다: ${names.filter((v) => /^h\d\d$/.test(v))}`);

// 쉬는 이유를 말한다 (결과 날짜만 주면 맞는지 확인할 방법이 없다).
eq(wd.restReason(new Date(2026, 0, 1), 'KR', false), '신정', '신정');
eq(wd.restReason(new Date(2026, 2, 1), 'KR', false), '일요일', '2026-03-01 은 일요일이 먼저');
eq(wd.restReason(new Date(2026, 2, 3), 'KR', false), '', '평일은 빈 문자열');

const btw = wd.countWorkdays(new Date(2026, 2, 2), new Date(2026, 2, 8));
eq(btw.total, 7, '전체 7일');
/* 5일이 아니라 **4일**이다 — 2026-03-01(삼일절)이 일요일이라 3/2 월요일이 대체공휴일이다.
   이 한 칸이 이 도구가 있는 이유고, 사람도 LLM 도 여기서 틀린다. */
eq(btw.workdays, 4, '3/2 가 삼일절 대체공휴일이라 영업일은 4일');
check(btw.skipped.some((s) => s.why === '대체공휴일'), `대체공휴일이라고 말해야 한다: ${JSON.stringify(btw.skipped)}`);
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
check(uc.run('convert', { value: 1, from: 'don', to: 'g' }).includes('3.75g'), 'run 돈');
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
check(wf.run('count', { text: sample }).includes('형태소 분석 아님'), '어림이라는 한계를 적어 둔다');
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
const why = (pw) => pg.analyze(pw).chunks.map((c) => c.why);
check(why('qwertyui').includes('자판 줄'), '자판 줄을 잡는다');
check(why('abcdefgh').includes('연속된 글자'), '연속을 잡는다');
check(why('abababab').includes('반복'), '반복을 잡는다');
check(why('hello1998').includes('연도'), '연도를 잡는다');
check(why('letmein').includes('흔한 단어'), '흔한 단어를 잡는다');
check(why('x9#Lq2!v').includes('무작위'), '무작위는 무작위로 둔다');

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
  await eng.loadEngine(async () => ({ 뭔가: 1 }), HAS_GPU);
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

// ── 마무리 ──────────────────────────────────────────────────────────────────
fs.rmSync(outDir, { recursive: true, force: true });
process.stdout.write('\n');
if (failures.length > 0) {
  console.error(`\n[test-core] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[test-core] 알맹이 ${coreFiles.length}개 · 검사 전부 통과`);
