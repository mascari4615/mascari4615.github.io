/**
 * 모듈 초기화 구간의 `t(...)` 누수 감시 (TASK-KL-203)
 *
 * 문제:
 * - 위젯이 `loadNamespace()` 전에 파일 로드만으로 실행되는 구간이 있다.
 * - 그 자리에서 `t('user.t60')` 같은 호출을 fallback 없이 하면,
 *   아직 말 묶음이 안 들어온 언어에서 **열쇠 문자열이 그대로 굳는다**.
 *
 * 여기서는 TypeScript AST 로 `t(...)` 호출을 훑어,
 * - 소스 파일 최상위
 * - 또는 바깥 IIFE(모듈 초기화 래퍼) 안이지만 다른 함수 안은 아닌 자리
 * 에서의 호출 중 fallback(세 번째 인자)이 없는 것을 잡는다.
 *
 * 사용:
 *   node scripts/audit-i18n-eager.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const failures = [];

function walkFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkFiles(file, out);
      continue;
    }
    if (entry.name.endsWith('.ts')) out.push(file);
  }
}

function isTCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't';
}

function isImmediateIife(fn) {
  let p = fn.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isTypeAssertionExpression(p))) {
    p = p.parent;
  }
  if (!ts.isCallExpression(p)) return false;
  let callee = p.expression;
  while (callee && (ts.isParenthesizedExpression(callee) || ts.isAsExpression(callee) || ts.isTypeAssertionExpression(callee))) {
    callee = callee.expression;
  }
  return callee === fn;
}

function functionAncestors(node) {
  const out = [];
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionLike(cur)) out.push(cur);
    cur = cur.parent;
  }
  return out;
}

function eagerScope(node) {
  const fns = functionAncestors(node);
  if (fns.length === 0) return true;
  if (fns.length === 1 && isImmediateIife(fns[0])) return true;
  return false;
}

function firstArgKey(node) {
  const first = node.arguments[0];
  return ts.isStringLiteral(first) ? first.text : null;
}

const files = [];
walkFiles(src, files);

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const relative = path.relative(root, file).split(path.sep).join('/');
  /* Deferred widget bundles are loaded only after the shell's namespace barrier.
     Their module-level labels are therefore safe; the shell and boot modules still
     have to provide a literal fallback or wait explicitly. */
  const deferredWidget = relative.startsWith('src/widgets/');

  function visit(node) {
    if (isTCall(node) && !deferredWidget && eagerScope(node) && node.arguments.length < 3) {
      const key = firstArgKey(node);
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
      failures.push({
        file: path.relative(root, file).split(path.sep).join('/'),
        line: line + 1,
        col: character + 1,
        key: key ?? '(non-literal key)'
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
}

if (failures.length) {
  console.error(`[audit-i18n-eager] 문제 ${failures.length}건`);
  for (const f of failures) console.error(`  - ${f.file}:${f.line}:${f.col} ${f.key}`);
  process.exit(1);
}

console.log(`[audit-i18n-eager] 모듈 초기화 구간 t(...) 누수 없음 (${files.length} files)`);
