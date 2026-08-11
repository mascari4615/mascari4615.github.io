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
