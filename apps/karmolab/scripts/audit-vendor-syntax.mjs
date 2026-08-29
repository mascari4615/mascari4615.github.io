#!/usr/bin/env node
/**
 * 남의 꾸러미(`js/vendor/`)가 **아직 실행되는 코드인가** (2026-08-29)
 *
 * 왜 생겼나: 저장소 전체에서 AI 티 나는 문자를 걷어내는 스윕(`06b45a62b8`)이 `pdf-lib.min.js`
 * 안까지 들어가 문자를 바꿨다. 13바이트가 줄면서 js 문법이 깨졌고, 브라우저가 그 파일을
 * 실행하지 못해 `window.PDFLib` 이 안 생겼다. PDF 쪽 빼기, 돌리기, 순서 바꾸기가 통째로
 * 죽은 채 나갔고, 화면에 뜬 것은 이 문서는 못 고칩니다 한 줄뿐 (까닭을 아무도 모름).
 * `smoke:pdfshell` 은 그동안 빨갰지만 남의 빨강처럼 보였을 뿐
 *
 * 판정: `js/vendor/**.js` 를 하나씩 파싱, 하나라도 안 되면 빨강.
 * 파싱은 실행이 아니라 부작용 없음
 *
 * [빨강-확인] 2026-08-29. 깨진 판(`06b45a62b8`)의 pdf-lib 로 빨강, 되돌린 판에서 초록
 *
 * 사용: node scripts/audit-vendor-syntax.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'js', 'vendor');

if (!fs.existsSync(dir)) {
  console.error('[vendor-syntax] CANNOT-RUN. js/vendor 가 없다 (빌드 전이면 정상)');
  process.exit(2);
}

const files = [];
(function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(dir);

if (!files.length) {
  console.error('[vendor-syntax] CANNOT-RUN. 볼 파일이 없다. 0개는 통과가 아니다');
  process.exit(2);
}

const bad = [];
for (const p of files) {
  const code = fs.readFileSync(p, 'utf8');
  try {
    new vm.Script(code, { filename: p });
  } catch (e) {
    /* ESM 인 꾸러미는 스크립트로는 못 읽는다. 그건 문법 문제가 아니다 */
    if (/Cannot use import statement|Unexpected token 'export'|await is only valid/.test(String(e.message))) continue;
    bad.push([path.relative(root, p).split(path.sep).join('/'), String(e.message).split('\n')[0].slice(0, 80)]);
  }
}

if (bad.length) {
  console.error(`[vendor-syntax] 남의 꾸러미 ${bad.length}개가 안 읽힌다. 그 파일을 쓰는 화면은 통째로 죽는다:`);
  for (const [f, why] of bad) console.error(`  - ${f}  ${why}`);
  console.error('  손으로 고치지 마라. 받아 온 그대로가 정답이다: git checkout <손대기 전 커밋> -- <파일>');
  process.exit(1);
}

console.log(`[vendor-syntax] 남의 꾸러미 ${files.length}개 전부 읽힌다`);
