/**
 * **부르는 말 묶음이 실제로 있나** (2026-08-28)
 *
 * 위젯은 `loadNamespace('board')` 로 자기 말 묶음을 받아 온다. 그 이름에 해당하는 것이 없으면
 * 받기가 실패하고, 그 뒤의 `build()` 가 통째로 안 돌아 **화면이 빈 채로 뜬다.** 오류도 안 뜬다.
 *
 * 이게 왜 필요한가. 여기 i18n 검사가 다섯 개나 있는데 **전부 소스만 본다**:
 *   `i18n-keys`      열쇠가 원본 목록에 있나        (소스 대 소스)
 *   `i18n-namespace-load`  열쇠를 쓰면서 안 받아 왔나  (소스 대 소스)
 *   `i18n-stub`      자리표가 남았나                 (소스)
 *   `i18n-source`    코드에 박힌 한국어가 늘었나      (소스)
 * 그래서 **묶음 파일 자체가 없는 경우**를 아무도 안 잡았다. 새 위젯을 만들 때마다 같은 자리에서
 * 걸렸고, 매번 빌드는 초록인데 위젯만 안 뜬다로 시간을 썼다 (2026-08-28 보드 위젯이 마지막).
 *
 * 두 가지를 본다:
 *   ① `loadNamespace('<이름>')` → `i18n/ko/<이름>.json` 이 있나          (늘 본다)
 *   ② 구워 둔 것이 있으면 → `js/i18n/<언어>/<이름>.js` 도 있나            (안 구웠으면 건너뛴다)
 *
 * ② 는 이제 `build.mjs` 가 늘 구우므로 보통 초록이다. 그래도 남겨 둔다. 굽는 자리가 언젠가
 * 빠져도 여기서 걸린다. 없는 것은 검사할 대상이 없어서 조용히 지나가는 종류의 사고다.
 *
 * 사용: node scripts/audit-i18n-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_LOCALES, SOURCE_LOCALE } from './lib/locales.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, 'src');
const I18N = path.join(root, 'i18n');
const OUT = path.join(root, 'js/i18n');

/** 소스에서 `loadNamespace('x')`, `loadNamespace("x")` 를 긁는다. 변수로 부르는 자리는 못 본다. */
const CALL = /loadNamespace\(\s*['"]([\w.-]+)['"]\s*\)/g;

function walk(dir, out = []) {
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, it.name);
    if (it.isDirectory()) walk(child, out);
    else if (/\.ts$/.test(it.name)) out.push(child);
  }
  return out;
}

const asked = new Map();   // 묶음 이름 → 부른 파일들
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(CALL)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (!asked.has(m[1])) asked.set(m[1], []);
    asked.get(m[1]).push(rel);
  }
}

const fail = [];

/* ① 원본 묶음 파일이 있나 */
for (const [ns, callers] of asked) {
  const p = path.join(I18N, SOURCE_LOCALE, ns + '.json');
  if (!fs.existsSync(p)) {
    fail.push(`i18n/${SOURCE_LOCALE}/${ns}.json 이 없다. 부르는 곳: ${callers.slice(0, 3).join(', ')}`);
  }
}

/* ② 구운 것이 있나 (안 구운 판에서는 건너뛴다. 못 잰 것은 빨강이 아니다) */
let bakedChecked = 0;
if (!fs.existsSync(OUT)) {
  console.log('[i18n-catalog] js/i18n 이 없다. 구운 것 검사는 건너뛴다 (`node build.mjs` 후에 본다)');
} else {
  for (const [ns] of asked) {
    if (!fs.existsSync(path.join(I18N, SOURCE_LOCALE, ns + '.json'))) continue;   // ① 이 이미 잡았다
    for (const l of ALL_LOCALES) {
      /* 번역이 아직 없는 언어는 폴더 자체가 없다. 그건 빠진 번역이지 이 검사의 대상이 아니다. */
      if (!fs.existsSync(path.join(I18N, l.code, ns + '.json'))) continue;
      bakedChecked += 1;
      const js = path.join(OUT, l.code, ns + '.js');
      if (!fs.existsSync(js)) {
        fail.push(`js/i18n/${l.code}/${ns}.js 를 안 구웠다. 화면이 404 를 받아 위젯이 안 그려진다`);
      }
    }
  }
}

if (fail.length) {
  console.error('[i18n-catalog] 빨강 ' + fail.length + '건\n  - ' + fail.join('\n  - '));
  console.error('  고치는 법: 묶음 파일을 만들고(`i18n/<언어>/<이름>.json`) `node build.mjs`');
  process.exit(1);
}
console.log(`[i18n-catalog] OK. 부르는 묶음 ${asked.size}개, 원본 전부 있음, 구운 것 ${bakedChecked}자리 확인`);
