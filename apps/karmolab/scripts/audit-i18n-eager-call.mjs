#!/usr/bin/env node
/**
 * **말을 너무 일찍 읽는 자리** — 파일이 읽히는 순간 `t()` 를 부르는 곳 (2026-08-14)
 *
 * 왜 있나: 하루에 실서비스 화면 **아홉 개**가 이 병으로 죽어 있었다. 꼴은 늘 같다 —
 * 표를 파일 맨 위에서 만든다:
 *
 *     const SCALES = [{ id: 'major', label: t('orbita.t02') }, …];   // ← 여기
 *
 * 그 자리는 **위젯 파일이 읽히는 순간**이라 아직 `loadNamespace('orbita')` 전이다.
 * 되받을 글 없는 `t()` 는 그때 **던지고**, 그러면 그 묶음에 실린 화면이 **통째로** 안 올라간다.
 * 화면에는 오류도 안 뜬다 — 「꺼내는 중이에요…」에서 영영 멎을 뿐이다.
 *
 * 이미 있는 검사들이 왜 못 잡았나:
 *   · `audit:i18n-load` 는 「그 파일이 `loadNamespace` 를 부르나」만 본다 — 부르긴 **부른다**.
 *     이르고 늦음은 글자로 안 보인다.
 *   · `test:i18n:runtime` 은 도구 장이 있는 것만 연다. 죽은 아홉은 전부 장이 없는 화면이었다.
 *   · `test:play-i18n`(화면을 실제로 여는 검사)은 잡는다 — 다만 **배포된 뒤**에야 잡는다.
 * 그래서 같은 것을 **미는 자리에서** 잡는다. 여기서 빨간 것은 CI 를 기다릴 필요가 없다.
 *
 * 어디까지를 「일찍」으로 보나: 위젯 파일은 통째로 IIFE 로 감싸여 있다. 그 IIFE 몸통은
 * 파일이 읽힐 때 그대로 돈다 — 그러니 **모듈 자리**로 친다. 반대로 `build:`·`onclick` 처럼
 * 나중에 불리는 함수 안이면 안전하다(그때는 묶음이 왔다).
 * 되받을 글이 있는 `t('x.y', undefined, '…')` 도 안전하다 — 던지지 않는다.
 *
 * [빨강-확인] 2026-08-14 — 고치기 전 판(`git show`)으로 돌려 orbita·laptop·community·
 *   settings·user·higher·twenty·postgraph 여덟 파일이 이름과 줄로 잡히는 것을 봤다.
 *
 * 사용: node scripts/audit-i18n-eager-call.mjs [파일…]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const widgetsDir = path.join(root, 'src/widgets');

const 파일들 = process.argv.slice(2).filter((a) => !a.startsWith('--')).length
  ? process.argv.slice(2).filter((a) => !a.startsWith('--')).map((p) => path.resolve(p))
  : (function walk(dir, acc = []) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, acc);
        else if (name.endsWith('.ts')) acc.push(p);
      }
      return acc;
    })(widgetsDir);

/** 이 함수가 「만들자마자 도는 것」(IIFE)인가 — 그렇다면 그 몸통도 파일 읽는 순간이다. */
function 즉시도는함수(node) {
  let p = node.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) p = p.parent;
  return !!p && ts.isCallExpression(p) && p.expression === (node.parent === p ? node : p.expression);
}

/** 이 자리가 파일 읽는 순간에 도는가 (나중에 불리는 함수 안이 아닌가). */
function 읽는순간인가(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isGetAccessor(p) ||
      ts.isSetAccessor(p)
    ) {
      /* IIFE 몸통은 「나중」이 아니다 — 계속 위로 본다. */
      if (즉시도는함수(p)) continue;
      return false;
    }
  }
  return true;
}

/* ★ **빚 목록** — 오늘 이전부터 있던 자리들. 여기 적힌 것은 **안전하다고 증명된 게 아니라**
   「오늘 새로 생긴 것이 아니다」는 뜻이다. 이 중 실제로 죽어 있는 화면은 `test:play-i18n`
   (화면을 실제로 여는 검사)이 이름으로 잡는다 — 잡히면 그때 고치고 이 목록에서 지운다.
   막는 것은 **새로 생기는 자리**다. 오늘 고친 여덟 파일은 목록에 없다(고쳤으니까). */
const BASELINE = path.join(root, 'data/i18n-eager-baseline.json');
const 빚 = fs.existsSync(BASELINE) ? new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).목록) : new Set();
const UPDATE = process.argv.includes('--update');

const 문제 = [];
for (const file of 파일들) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  (function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length < 3 && /* 되받을 글이 있으면 안 던진다 */
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      /^[a-z0-9-]+\.[^.]/.test(node.arguments[0].text) &&
      읽는순간인가(node)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      문제.push({
        file: path.relative(root, file).split(path.sep).join(String.fromCharCode(47)),
        line: line + 1,
        key: node.arguments[0].text
      });
    }
    ts.forEachChild(node, visit);
  })(sf);
}

const 표 = (x) => `${x.file} ${x.key}`;
if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify({ 목록: 문제.map(표).sort() }, null, 2) + String.fromCharCode(10), 'utf8');
  console.log(`[i18n-eager] 빚 목록을 ${문제.length}건으로 다시 적었다`);
  process.exit(0);
}
const 새것 = 문제.filter((x) => !빚.has(표(x)));
console.log(`[i18n-eager] 위젯 ${파일들.length}개 · 읽는 순간 말을 읽는 자리 ${문제.length}건 (빚 ${빚.size}건은 봐준다)`);

if (새것.length) {
  console.error(`[i18n-eager] **새로 생긴** 자리 ${새것.length}건 — 그 화면은 통째로 안 올라간다`);
  for (const x of 새것.slice(0, 20)) console.error(`  - ${x.file}:${x.line}  t('${x.key}')`);
  if (새것.length > 20) console.error(`  … 그리고 ${새것.length - 20}건 더`);
  console.error("  고치는 법: 표는 **부를 때 만드는 함수**로 (`const list = () => [...]`),");
  console.error("             등록 줄처럼 늦출 수 없는 자리는 되받을 글을 준다 — t('x.y', undefined, '그래프').");
  process.exit(1);
}
console.log('[i18n-eager] 새로 생긴 자리 0');
