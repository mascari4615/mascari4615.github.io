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
