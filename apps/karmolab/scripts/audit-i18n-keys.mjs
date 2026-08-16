/**
 * Verify that every literal translation key used without an explicit fallback
 * exists in the source catalog. Runtime loading can fail independently of this
 * check, so this is deliberately a source/catalog contract rather than a smoke test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const sourceLocale = 'ko';
const catalogs = new Map();
const failures = [];
let dynamic = 0;
let calls = 0;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(file, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(file);
    }
  }
}

function catalogFor(namespace) {
  if (!catalogs.has(namespace)) {
    const file = path.join(root, 'i18n', sourceLocale, `${namespace}.json`);
    catalogs.set(namespace, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return catalogs.get(namespace);
}

const files = [];
walk(src, files);
for (const file of files) {
  if (file.endsWith(`${path.sep}lib${path.sep}i18n.ts`)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      calls++;
      const first = node.arguments[0];
      if (!ts.isStringLiteral(first)) {
        dynamic++;
      } else if (node.arguments.length < 3) {
        const key = first.text;
        const dot = key.indexOf('.');
        const namespace = dot > 0 ? key.slice(0, dot) : 'common';
        const catalog = catalogFor(namespace);
        const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
        if (!catalog || typeof catalog[key] !== 'string') {
          failures.push(`${path.relative(root, file).split(path.sep).join('/')}:${line + 1}:${character + 1} ${key}`);
        }
      }
    }
    /* 별 **말 열쇠는 t() 로만 오지 않는다** (2026-08-17 실측, 진짜 사고). 오락실 놀이는
       「누가 밟았다」 같은 알림을 `note: { key: 'arcade.mine.boom', ... }` 로 **자료에 담아** 보낸다.
       그 자리는 t() 호출이 아니라 이 감사의 눈 밖이었고, 그래서 `arcade.mine.boom` 이
       **세 판 모두에 아예 없는 채로** 몇 달을 지났다. 지뢰를 밟는 순간(=이 놀이의 핵심 사건)
       i18n 이 던지고 판이 거기서 멎는다 — 대회 검사가 「5판이 안 끝났다」로 빨갰던 진짜 이유다.
       열쇠는 어디에 적혀 있든 열쇠다. `key:` 라는 이름의 글자 값도 같이 본다. */
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'key'
        && ts.isStringLiteral(node.initializer) && node.initializer.text.includes('.')) {
      calls++;
      const key = node.initializer.text;
      const namespace = key.slice(0, key.indexOf('.'));
      const catalog = catalogFor(namespace);
      if (catalog && typeof catalog[key] !== 'string') {
        const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
        failures.push(`${path.relative(root, file).split(path.sep).join('/')}:${line + 1}:${character + 1} ${key} (note 열쇠)`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

if (failures.length) {
  console.error(`[audit-i18n-keys] missing source catalog keys: ${failures.length}`);
  for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}

console.log(`[audit-i18n-keys] literal keys valid (${calls} calls, ${dynamic} dynamic calls)\n`);
