/**
 * 한자 변환표 찍어 내기 — 간체 ⟷ 번체 (흡수 ⓒ)
 *
 * 손으로 적을 수 있는 표가 아니다(3,000쌍이 넘는다). **유니코드 컨소시엄의 Unihan** 을
 * 원본으로 삼아 찍어 낸다 — 어느 블로그에서 긁어 온 표가 아니라 규격 문서다.
 *
 * ★ 왜 찍어 내서 커밋하나: 사용자 기기에서 표를 받아 오게 하면 「인터넷 없이 돈다」가 깨진다.
 *   그래서 표를 코드로 박아 함께 배포한다. 대신 **손으로 고치지 않는다** — 여기서 다시 찍는다.
 *
 * ★ 왜 한 글자씩만인가: 「간체→번체」는 한 글자가 여럿으로 갈리는 일이 있다(发 → 發/髮).
 *   그건 뜻을 봐야 정해진다. 낱말 사전 없이 아무거나 고르면 조용히 틀린 글이 나오므로,
 *   갈리는 글자는 **갈린다고 표시**해서 화면이 사람에게 알리게 한다.
 *
 * 쓰는 법 (원본 받기 → 찍기, 우리 기계에서만 가끔):
 *   curl -L -o Unihan.zip https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
 *   (압축을 아무 폴더에 푼 뒤)
 *   node scripts/gen-han-table.mjs <푼 폴더>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = process.argv[2];

if (src === undefined || fs.existsSync(path.join(src, 'Unihan_Variants.txt')) === false) {
  console.error('[gen-han-table] CANNOT-RUN — Unihan_Variants.txt 가 있는 폴더를 인자로 줘라.');
  console.error('  curl -L -o Unihan.zip https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip');
  console.error('  압축을 푼 뒤: node scripts/gen-han-table.mjs <푼 폴더>');
  process.exit(1);
}

/* 자주 쓰는 한자 블록만 (U+4E00–U+9FFF). 그 밖은 표만 키우고 화면에서 거의 안 쓰인다. */
const inRange = (cp) => cp >= 0x4e00 && cp <= 0x9fff;
const cpOf = (token) => parseInt(token.split('<')[0].slice(2), 16);

const simpOf = new Map(); // 번체 → 간체 후보들
const tradOf = new Map(); // 간체 → 번체 후보들

for (const line of fs.readFileSync(path.join(src, 'Unihan_Variants.txt'), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('#') || line.trim() === '') continue;
  const [code, key, rest] = line.split('\t');
  if (key !== 'kSimplifiedVariant' && key !== 'kTraditionalVariant') continue;
  const from = cpOf(code);
  if (inRange(from) === false) continue;
  const to = rest.split(' ').map(cpOf).filter(inRange);
  if (to.length === 0) continue;
  /* 자기 자신을 가리키는 줄이 있다(변하지 않는 글자). 표에 넣으면 헛일만 는다. */
  const targets = to.filter((cp) => cp !== from);
  if (targets.length === 0) continue;
  (key === 'kSimplifiedVariant' ? simpOf : tradOf).set(from, targets);
}

/**
 * 「글자 짝」을 한 줄짜리 글로 굳힌다 — `원본글자 바뀐글자` 를 붙여 쓴 것.
 * JSON 으로 하면 따옴표·쉼표가 글자 수만큼 붙어 표가 두 배가 된다.
 */
const pairString = (map) => {
  let out = '';
  for (const [from, to] of [...map].sort((a, b) => a[0] - b[0])) {
    out += String.fromCodePoint(from) + String.fromCodePoint(to[0]);
  }
  return out;
};

/** 여럿으로 갈리는 글자 — 화면이 「이건 뜻을 봐야 한다」고 말해야 하는 자리. */
const ambiguous = (map) =>
  [...map]
    .filter(([, to]) => to.length > 1)
    .sort((a, b) => a[0] - b[0])
    .map(([from, to]) => String.fromCodePoint(from) + to.map((cp) => String.fromCodePoint(cp)).join(''))
    .join(' ');

const t2s = pairString(simpOf);
const s2t = pairString(tradOf);
const s2tAmb = ambiguous(tradOf);
const t2sAmb = ambiguous(simpOf);

const banner = [
  '/**',
  ' * 간체 ⟷ 번체 표 — **찍어 낸 파일이다. 손으로 고치지 마라.**',
  ' *',
  ' * 원본: 유니코드 Unihan (`Unihan_Variants.txt` 의 kSimplifiedVariant / kTraditionalVariant).',
  ' * 다시 찍기: `node scripts/gen-han-table.mjs <Unihan 푼 폴더>`',
  ' *',
  ' * 짝 글: 두 글자씩 끊어 읽는다 — 앞이 원본, 뒤가 바뀐 글자.',
  ' * 갈림 글: 공백으로 끊고, 첫 글자가 원본·나머지가 후보들이다(뜻을 봐야 정해진다).',
  ' */',
  ''
].join(NL);

const body = [
  `export const TRAD_TO_SIMP = ${JSON.stringify(t2s)};`,
  `export const SIMP_TO_TRAD = ${JSON.stringify(s2t)};`,
  `export const SIMP_TO_TRAD_AMBIGUOUS = ${JSON.stringify(s2tAmb)};`,
  `export const TRAD_TO_SIMP_AMBIGUOUS = ${JSON.stringify(t2sAmb)};`,
  ''
].join(NL);

const out = path.join(root, 'src/core/han-table.generated.ts');
fs.writeFileSync(out, banner + body);

const kb = (s) => Math.round((Buffer.byteLength(s, 'utf8') / 1024) * 10) / 10;
console.log(
  `[gen-han-table] 번→간 ${t2s.length / 2}쌍 · 간→번 ${s2t.length / 2}쌍 ` +
    `(갈리는 글자 간→번 ${s2tAmb === '' ? 0 : s2tAmb.split(' ').length}자 · 번→간 ${t2sAmb === '' ? 0 : t2sAmb.split(' ').length}자) ` +
    `· ${kb(t2s) + kb(s2t)}KB → src/core/han-table.generated.ts`
);
