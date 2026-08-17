/**
 * audit-shell-t.mjs — 셸(`src/toolbox.ts`)에서 **말을 `t()` 로 바로 부르는 자리**를 잡는다.
 *
 * ★ 왜 (2026-08-17, 하루에 두 번 같은 사고): 이 파일은 `t` 를 **들여오지 않는다** — 전역이 있을
 *   때만 쓴다. 그래서 없으면 `ReferenceError: t is not defined` 로 첫 화면이 죽고,
 *   말 바꾸기 검사가 그걸 콘솔 오류로 세어 **배포가 통째로 선다**(5c9333e6 · 오늘 또).
 *   그래서 같은 파일 안에 `typeof t === 'function'` 으로 감싼 `말()` 헬퍼가 있다.
 *   규율은 「말은 `말()` 로만」인데, 규율은 사람이 잊는다. 기계가 지킨다.
 *
 * 무엇을 잡나: `t('열쇠.모양')` 처럼 **열쇠를 그대로 넘기는 부름**만.
 * (이 파일에는 `const t = tools.find(...)` 같은 지역 변수 `t` 가 흔하다 — 그건 말과 상관없다.)
 *
 * 사용: node scripts/audit-shell-t.mjs
 * 나가는 값: 0 통과 · 1 바로 부르는 자리 있음 · 2 못 봤다(셸 파일이 없다 — 통과 아님)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const 볼것 = path.join(root, 'src', 'toolbox.ts');

if (!fs.existsSync(볼것)) {
  console.error(`[셸의 말] 못 봤다 — 셸 파일이 없다: ${볼것} (통과로 안 센다)`);
  process.exit(2);
}

const 줄들 = fs.readFileSync(볼것, 'utf8').split(String.fromCharCode(10));
/* 「앞이 글자·점이 아닌 t(' 열쇠꼴 」 — `말(`·`fmt(`·`.t(` 같은 것과 갈린다. */
const 바로부름 = /[^A-Za-z0-9_.$]t\(['"][a-z][a-z0-9]*\./;
const 걸린것 = [];
줄들.forEach((line, i) => {
  if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;   // 주석은 안 센다
  if (바로부름.test(line)) 걸린것.push(`${i + 1}: ${line.trim().slice(0, 100)}`);
});

if (걸린것.length) {
  console.error(`[셸의 말] FAIL — 말을 t() 로 바로 부르는 자리 ${걸린것.length}곳:`);
  for (const one of 걸린것.slice(0, 10)) console.error(`  - ${one}`);
  console.error('  이 파일은 t 를 안 들여온다 — 없으면 첫 화면이 죽고 배포가 선다.');
  console.error("  같은 파일의 말('열쇠', '기본값') 을 써라 (typeof 로 감싸 둔 자리다).");
  process.exit(1);
}
console.log(`[셸의 말] 셸이 말을 부르는 자리 전부 말() 을 거친다 — ${줄들.length}줄 확인`);
