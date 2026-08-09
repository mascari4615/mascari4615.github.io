/**
 * 병음 표 찍어 내기 — 한자 → 보통화 발음 (흡수 ⓒ)
 *
 * 간체·번체 표와 같은 원본(유니코드 Unihan)에서 찍는다. 다만 **크기가 다섯 배**라(2만 자)
 * 도구 묶음에 박지 않고 **따로 받아 오는 파일**로 낸다 — 전각·반각만 쓰러 온 사람에게
 * 170KB 를 물리지 않기 위해서다. 「병음」을 고른 사람만 받는다.
 *
 * ★ 한계를 표 안에서 정직하게: 한 글자가 여러 소리인 것(多音字)이 흔하다 — 行 은 xíng 과
 *   háng 이 다르다. Unihan 이 적어 둔 **첫 소리**를 쓰고, 여러 소리인 글자는 따로 표시해
 *   화면이 「여기는 뜻을 봐야 한다」고 말하게 한다. 조용히 하나 고르면 틀린 발음이 나간다.
 *
 * 쓰는 법:
 *   curl -L -o Unihan.zip https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
 *   node scripts/gen-pinyin-table.mjs <푼 폴더>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = process.argv[2];

if (src === undefined || fs.existsSync(path.join(src, 'Unihan_Readings.txt')) === false) {
  console.error('[gen-pinyin-table] CANNOT-RUN — Unihan_Readings.txt 가 있는 폴더를 인자로 줘라.');
  console.error('  curl -L -o Unihan.zip https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip');
  process.exit(1);
}

/* 간체·번체 표와 같은 범위로 맞춘다 — 두 갈래가 서로 다른 글자를 알면 화면이 들쭉날쭉해진다. */
const inRange = (cp) => cp >= 0x4e00 && cp <= 0x9fff;

const chars = [];
const readings = [];
const many = [];

for (const line of fs.readFileSync(path.join(src, 'Unihan_Readings.txt'), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('#') || line.includes('kMandarin') === false) continue;
  const [code, key, rest] = line.split('\t');
  if (key !== 'kMandarin') continue;
  const cp = parseInt(code.slice(2), 16);
  if (inRange(cp) === false) continue;
  const all = rest.trim().split(' ').filter((x) => x !== '');
  if (all.length === 0) continue;
  chars.push(String.fromCodePoint(cp));
  readings.push(all[0]);
  if (all.length > 1) many.push(String.fromCodePoint(cp) + ':' + all.join(','));
}

/*
 * 생김새: 글자를 한 줄로 이어 붙이고, 소리는 공백으로 끊어 같은 차례로 둔다.
 * `{"汉":"hàn", …}` 로 하면 따옴표·쉼표가 글자마다 붙어 표가 1.5배가 된다.
 */
const table = {
  note: 'Unihan kMandarin. chars 와 readings 는 같은 차례. many = 소리가 여럿인 글자.',
  chars: chars.join(''),
  readings: readings.join(' '),
  many: many.join(' ')
};

const out = path.join(root, 'data/han-pinyin.json');
fs.writeFileSync(out, JSON.stringify(table));
const kb = Math.round(fs.statSync(out).size / 1024);
console.log(`[gen-pinyin-table] 글자 ${chars.length}자 (소리 여럿 ${many.length}자) · ${kb}KB → data/han-pinyin.json`);
