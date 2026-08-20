/**
 * **쓰는 말 묶음을 실제로 받아 오나** (2026-08-13)
 *
 * `t('crypto.t03')` 처럼 **되받을 글 없이** 부르면, 묶음이 아직 없을 때 `t()` 는 **던진다**.
 * 그 자리가 위젯 만들기 단계면 화면이 통째로 안 지어지고 — 오류도 안 뜬다. 실제로 암호화
 * 도구가 그렇게 살아 있었다: 누르면 아무 일도 안 일어나고, 라이브 점검만 `MissingTranslationError`
 * 로 잡고 있었다. 까닭은 한 줄이었다 — `loadNamespace` 를 **들여오기만 하고 안 불렀다**.
 *
 * 그래서 여기서 본다: 어떤 위젯이 `<묶음>.<열쇠>` 를 되받을 글 없이 쓰면서 그 묶음을
 * `loadNamespace('<묶음>')` 로 받지 않으면 빨강.
 *
 * 사용: node scripts/audit-i18n-namespace-load.mjs   (npm run audit:i18n-load)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const widgets = path.join(root, 'src/widgets');

/** `t('ns.key')` — 뒤에 되받을 글이 없는 부름만 (인자가 더 있으면 그 자리는 안전하다) */
const NO_FALLBACK = /\bt\(\s*'([a-z0-9-]+)\.[^']*'\s*\)/gi;
const LOADS = /loadNamespace\(\s*'([a-z0-9-]+)'/g;

/** i18n 열쇠가 아닌 것들 — 다른 뜻의 한 글자 앞머리를 걸러 낸다 */
const NOT_NS = new Set(['widgets', 'widgets-desc', 'core', 'common', 'ui', 'shell']);

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.ts')) files.push(full);
  }
})(widgets);

/* **묶음 단위로 본다** — 한 위젯이 여러 파일로 나뉘어 있으면, 묶음을 받는 자리는 대개
   들머리 하나다(패널 파일들은 그 뒤에 불린다). 파일마다 따지면 멀쩡한 자리가 무더기로 빨개진다. */
function groupOf(file) {
  const rel = path.relative(widgets, file).split(path.sep);
  return rel.length > 1 ? rel[0] : rel[0].replace(/\.ts$/, '');
}

/* ★ **없는 묶음을 부르는 자리** — 되받을 글이 있어도 안 봐준다 (2026-08-19 실측).
 *
 * 이 파일은 여태 「되받을 글이 있으면 그 자리는 안전하다」로 봤다. 그런데 되받을 글은
 * **묶음이 있고 열쇠만 없을 때**를 구해 줄 뿐이다. 묶음 파일이 아예 없으면 받아오는
 * 단계에서 죽는다 — 화면에는 「도구 로드 실패 · CatalogLoadError: Failed to load
 * catalog: ko/install」로 뜬다. 설치 위젯이 그렇게 죽었다: t() 열세 자리에 전부 되받을
 * 글을 줬는데도 `i18n/ko/install.json` 이 없어서 도구가 통째로 안 떴다.
 *
 * 아래 「받아 오나」 검사는 이 자리를 **일부러 건너뛰며** 「다른 검사 몫」이라고 적어
 * 뒀는데, 그 다른 검사가 없었다. 여기서 막는다. 기준선은 두지 않는다 — 없는 묶음은
 * 언제나 진짜 고장이라 「지금 것은 봐준다」가 성립하지 않는다. */
/* 소문자 `t(` 만, 그리고 **글자 그대로 적힌 열쇠**만 본다.
   - `i` 플래그를 주면 위젯이 제 이름으로 감싼 `T(` 까지 물어 온다 (meok 의 `T('blend.'+mode)`).
     그건 다른 함수고, 묶음도 제 것을 이미 받아 온다 — 오탐 둘이 거기서 나왔다.
   - 이어 붙인 열쇠(`'x.' + v`)는 앞자락이 묶음 이름이 아닐 수 있으니 안 본다. 글자 그대로
     적힌 것만으로도 오늘 같은 사고(`install`)는 잡힌다. */
const ANY_T = /\bt\(\s*'([a-z0-9-]+)\.[^']*'\s*[,)]/g;
const missingNs = [];

const loadedBy = new Map(); // 묶음 이름 -> 그 자리가 받는 i18n 묶음들
const usedBy = new Map(); // 묶음 이름 -> [ [i18n 묶음, 파일] … ]
const nsExists = (ns) => fs.existsSync(path.join(root, `i18n/ko/${ns}.json`));
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const g = groupOf(file);
  if (!loadedBy.has(g)) loadedBy.set(g, new Set());
  for (const m of src.matchAll(LOADS)) loadedBy.get(g).add(m[1]);

  // ① 없는 묶음을 부르나 — 되받을 글이 있든 없든 본다
  const seen2 = new Set();
  for (const m of src.matchAll(ANY_T)) {
    const ns = m[1];
    if (NOT_NS.has(ns) || seen2.has(ns) || nsExists(ns)) continue;
    seen2.add(ns);
    missingNs.push(`${path.relative(root, file).split(path.sep).join('/')} — '${ns}' 를 쓰는데 i18n/ko/${ns}.json 이 없다`);
  }

  // ② 되받을 글 없이 쓰면서 안 받아 오나 (여태 보던 것)
  if (!src.includes('loadNamespace') && !src.includes("t('")) continue;
  for (const m of src.matchAll(NO_FALLBACK)) {
    const ns = m[1];
    if (NOT_NS.has(ns)) continue;
    if (!usedBy.has(g)) usedBy.set(g, []);
    usedBy.get(g).push([ns, file]);
  }
}

if (missingNs.length) {
  console.error(`[i18n-load] **없는 말 묶음**을 부르는 자리 ${missingNs.length}곳:`);
  for (const b of missingNs) console.error(`  - ${b}`);
  console.error('  되받을 글이 있어도 안 구해진다 — 묶음을 받아오는 단계에서 죽고, 화면에는 「도구 로드 실패」로만 뜬다.');
  console.error('  고치는 법: i18n/ko|en|ja/<묶음>.json 세 판을 만들고 그 안에 쓰는 열쇠를 적어라.');
  process.exit(1);
}

const bad = [];
for (const [g, uses] of usedBy) {
  const loaded = loadedBy.get(g) || new Set();
  const seen = new Set();
  for (const [ns, file] of uses) {
    if (loaded.has(ns) || seen.has(ns)) continue;
    /* 그 묶음 파일이 아예 없으면 다른 검사 몫이다 — 여기서는 「받아 오나」만 본다 */
    if (!fs.existsSync(path.join(root, `i18n/ko/${ns}.json`))) continue;
    seen.add(ns);
    bad.push(`${path.relative(root, file).split(path.sep).join('/')} — '${ns}' 를 되받을 글 없이 쓰는데 이 위젯 어디에도 loadNamespace('${ns}') 가 없다`);
  }
}

/* **톱니(ratchet)** — 지금 걸린 자리들은 기준선에 적어 두고 통과시킨다. 이 검사는 「그 자리가
   실제로 깨졌다」까지는 못 본다(다른 길로 묶음이 들어와 있을 수 있다). 확실한 것은 **새로 생기는
   것을 막는 일**이다 — 암호화 도구가 그렇게 조용히 죽어 있었다. 기준선 줄이기 = `-- --update`. */
const BASELINE = path.join(root, 'data/i18n-namespace-load.json');
const keyOf = (line) => line.split(' — ')[0] + ' :: ' + (line.match(/'([a-z0-9-]+)'/i) || [])[1];
const found = bad.map(keyOf);
if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE, JSON.stringify({ 설명: '아직 안 고친 자리 — 새로 생기는 것만 막는다', 목록: found.sort() }, null, 2) + String.fromCharCode(10));
  console.log(`[i18n-load] 기준선 갱신 — ${found.length}개`);
  process.exit(0);
}
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).목록 : [];
const added = bad.filter((b) => !base.includes(keyOf(b)));
const fixed = base.filter((k) => !found.includes(k));
if (fixed.length && !added.length) {
  console.log(`[i18n-load] 고쳐진 자리 ${fixed.length}개 — 기준선을 줄여라: npm run audit:i18n-load -- --update`);
}
bad.length = 0;
bad.push(...added);

if (bad.length) {
  console.error(`[i18n-load] 묶음을 안 받고 쓰는 자리 ${bad.length}곳:`);
  for (const b of bad) console.error(`  - ${b}`);
  console.error('  묶음이 없으면 t() 는 던진다 — 만들기 단계에서 던지면 화면이 통째로 안 지어지고 오류도 안 뜬다.');
  console.error('  고치는 법: 짓기 전에 `void loadNamespace(\'<묶음>\').then(...)` 로 감싸라 (base64 도구가 본보기).');
  process.exit(1);
}
console.log(`[i18n-load] OK — 새로 생긴 자리 없음 (파일 ${files.length}개 · 기준선 ${base.length}개)`);
