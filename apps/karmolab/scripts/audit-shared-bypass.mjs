/**
 * 공용을 안 거치고 직접 부르는 곳을 잡는다 (SSOT 래칫).
 *
 * 왜: 같은 일을 여러 곳에서 따로 하면 **여러 가지로 어긋난다.** 실제로 다친 것들 . 
 *  , JPG 로 내보낼 때 흰 바탕을 안 깔아 **투명이 검게** 나왔다(도구 하나만 잊었다)
 *  , 소리틀을 도구마다 만들어 몇 번 오가면 **소리가 조용히 안 났다**
 *  , 주소를 안 거두거나 너무 일찍 거둬 미리보기가 깨졌다(셋이 각각 다르게 틀렸다)
 * 한 자리로 모으면 규칙을 한 곳에만 적으면 되고, **차이가 눈에 보인다**.
 *
 * 래칫이다: 지금 있는 빚은 기준선으로 통과, **새로 늘면 빨강**.
 * 첫 판부터 빨간 게이트는 지켜지는 게 아니라 꺼진다.
 *
 * 기준선은 **이 감사기 자신이 쓴다**(`--write-baseline`). 손으로 짜면 판정과 목록이 어긋나
 * 기준선에 있는데도 빨강이 난다.
 *
 * 사용:
 *   node scripts/audit-shared-bypass.mjs                 # 검사
 *   node scripts/audit-shared-bypass.mjs --write-baseline # 빚 갚은 뒤 갱신
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(appRoot, 'src/widgets');
const BASELINE = join(appRoot, 'scripts/shared-bypass-baseline.tsv');
const write = process.argv.includes('--write-baseline');

/** 잡을 것 = 공용이 이미 하는 일을 도구가 직접 하는 자리. */
const RULES = [
  { id: 'PDF-OPEN', re: /PDFDocument\.load\(/g, fix: 'shared/pdf 의 openForEdit(). 암호 걸린 것도 열어 준다' },
  { id: 'PDF-LOAD', re: /ensureScript\(\s*['"]vendor\/pdf-lib/g, fix: 'shared/pdf 의 loadPdfLib(). 일꾼 주소를 한 곳에서 박는다' },
  { id: 'IMG-ENCODE', re: /\.toBlob\(/g, fix: 'shared/image 의 encode(). JPG 흰 바탕 규칙이 거기 있다' },
  { id: 'IMG-LOAD', re: /new Image\(\)/g, fix: 'shared/image 의 loadImage(). 주소 거두는 시점이 거기 맞춰져 있다' },
  { id: 'AUDIO-CTX', re: /new (?:window\.)?(?:webkit)?AudioContext\(/g, fix: 'shared/media 의 audioCtx(). 창에 하나만 둔다' },
  { id: 'AUDIO-DECODE', re: /\.decodeAudioData\(/g, fix: 'shared/media 의 loadAudio()' },
  { id: 'OBJECT-URL', re: /URL\.createObjectURL\(/g, fix: '각 shared 의 download()/downloadUrl(). 거두는 시점까지 같이 온다' },
];

/** 주석은 코드가 아니다. 주석 처리된 줄을 잡으면 게이트가 늑대소년이 되고, 그러면 꺼진다. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'shared') continue; // 공용 자신은 대상이 아니다
      walk(p, out);
      continue;
    }
    if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// 0건 = 통과를 막는 바닥. 경로는 이 파일 자리에서 잡으므로 어디서 실행해도 같은 폴더를
// 본다(그래서 cwd 로는 이 길을 못 밟는다). 폴더가 옮겨지거나 지워졌을 때를 위한 것이다.
if (!existsSync(SCAN_ROOT)) {
  console.error(`[shared-bypass] CANNOT-RUN: 훑을 폴더가 없다. ${SCAN_ROOT}`);
  console.error('[shared-bypass]   이건 위반 없음이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}

const files = walk(SCAN_ROOT);
if (files.length < 100) {
  console.error(`[shared-bypass] CANNOT-RUN: 도구 파일이 ${files.length}개뿐이다. 경로가 옮겨졌는지 확인할 것.`);
  process.exit(2);
}

const found = [];
for (const abs of files) {
  const rel = relative(appRoot, abs).replace(/\\/g, '/');
  const code = stripComments(readFileSync(abs, 'utf8'));
  for (const rule of RULES) {
    const n = (code.match(rule.re) ?? []).length;
    if (n > 0) found.push({ key: `${rule.id}\t${rel}`, id: rule.id, rel, n, fix: rule.fix });
  }
}

if (write) {
  const head = [
    '# shared-bypass 기준선. 이미 진 빚. 여기 없는 새 우회만 막는다.',
    '# 갚으면 그 줄을 지운다. 지운 줄이 다시 나타나면 그때부터 빨강이다.',
    '# 갱신: node scripts/audit-shared-bypass.mjs --write-baseline',
  ];
  // 이미 적어 둔 사유는 **지우지 않는다**. 갱신할 때마다 판단이 날아가면 아무도 안 적는다.
  const prev = new Map();
  if (existsSync(BASELINE)) {
    for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
      const t2 = line.trimEnd();
      if (!t2 || t2.startsWith('#')) continue;
      const parts = t2.split('\t');
      if (parts[2]) prev.set(`${parts[0]}\t${parts[1]}`, parts[2]);
    }
  }
  const lines = [...new Set(found.map((f) => f.key))].sort()
    .map((k) => (prev.has(k) ? `${k}\t${prev.get(k)}` : k));
  writeFileSync(BASELINE, `${[...head, ...lines].join('\n')}\n`, 'utf8');
  console.log(`[shared-bypass] 기준선을 새로 썼다: ${lines.length}줄 (도구 ${files.length}개 훑음)`);
  process.exit(0);
}

/* 기준선 줄은 두 가지다 (2026-08-14):
     `ID<TAB>경로`          = **갚을 빚**. 언젠가 공용으로 옮긴다
     `ID<TAB>경로<TAB>사유` = **판단 끝난 예외**. 옮기면 안 되는 이유가 적혀 있다
   예외를 안 만들면 기준선이 영영 0 이 안 되고, 그러면 목록이 썩는다(아무도 안 본다).
   판단은 지우는 게 아니라 **적는다**. 다음 사람이 같은 조사를 다시 안 하게. */
const baselineLines = existsSync(BASELINE)
  ? readFileSync(BASELINE, 'utf8').split('\n').map((s) => s.trimEnd()).filter((s) => s && !s.startsWith('#'))
  : [];
const reasons = new Map();
const baseline = new Set();
for (const line of baselineLines) {
  const parts = line.split('\t');
  const key = `${parts[0]}\t${parts[1]}`;
  baseline.add(key);
  if (parts[2]) reasons.set(key, parts[2]);
}

const fresh = found.filter((f) => !baseline.has(f.key));
const stale = [...baseline].filter((k) => !found.some((f) => f.key === k));

const debt = baseline.size - reasons.size;
console.log(
  `[shared-bypass] 도구 ${files.length}개 검사, 갚을 빚 ${debt}줄, 판단 끝난 예외 ${reasons.size}줄, 새 우회 ${fresh.length}건`,
);

if (stale.length > 0) {
  console.log(`[shared-bypass] 갚은 것 ${stale.length}줄. 기준선에서 지워라 (--write-baseline)`);
  for (const k of stale.slice(0, 10)) console.log(`    ✓ ${k.replace('\t', '  ')}`);
}

if (fresh.length === 0) {
  console.log('[shared-bypass] OK. 새로 흩어진 곳 없음');
  process.exit(0);
}

console.error('[shared-bypass] ❌ 공용을 안 거치는 새 자리:');
for (const f of fresh) {
  console.error(`    ${f.id}  ${f.rel} (${f.n}곳)`);
  console.error(`        → ${f.fix}`);
}
process.exit(1);
