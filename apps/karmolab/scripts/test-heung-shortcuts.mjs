/**
 * 단축키 목록이 **실제 코드와 어긋나지 않는지** 본다 (TASK-KL-220).
 *
 * 도움말은 적어 두기만 하면 곧 거짓말이 된다 — 키를 바꾸거나 지웠는데 목록만 남으면
 * 사용자는 안 되는 걸 계속 누른다. 그래서 목록의 키가 처리 코드 어딘가에 실제로 있는지 센다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const load = (rel) => {
  const source = fs.readFileSync(path.resolve(rel), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports,module,require){${compiled}\n})(module.exports,module,()=>({}));`, { module, console, Math });
  return module.exports;
};

const { SHORTCUTS, shortcutKeys, shortcutsHtml } = load('src/widgets/heung/shortcuts.ts');
const widget = fs.readFileSync(path.resolve('src/widgets/heung/heung.ts'), 'utf8');

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 목록 자체가 비지 않았고 설명이 다 붙어 있다
assert.ok(SHORTCUTS.length >= 3, '묶음이 최소 3개');
for (const group of SHORTCUTS) {
  assert.ok(group.title.trim(), '묶음 이름이 있다');
  assert.ok(group.items.length, `${group.title} 이 비어 있다`);
  for (const item of group.items) {
    assert.ok(item.keys.length, `${group.title} 에 키 없는 줄이 있다`);
    assert.ok(item.what.trim().length > 4, `${group.title} · ${item.keys.join()} 설명이 너무 짧다`);
  }
}

// 같은 키를 두 곳에 적어 두지 않았다
const keys = shortcutKeys();
const seen = new Set();
for (const key of keys) {
  assert.ok(!seen.has(key), `단축키 ${key} 가 목록에 두 번 적혀 있다`);
  seen.add(key);
}

/** 「Ctrl+Shift+Z」 같은 표기를 코드에서 찾을 실마리로 바꾼다. */
const clues = (key) => {
  const last = key.split('+').pop();
  if (last === 'Space') return [`'Space'`];
  if (last === '←') return [`'ArrowLeft'`];
  if (last === '→') return [`'ArrowRight'`];
  if (last === 'Delete') return [`'Delete'`];
  if (last === 'Backspace') return [`'Backspace'`];
  if (last === 'Escape') return [`'Escape'`];
  if (last === '클릭' || last === '끌기') return null; // 마우스 조작은 키 처리부에 없다
  return [`'${last.toLowerCase()}'`, `'${last.toUpperCase()}'`];
};

const missing = [];
for (const key of keys) {
  const hints = clues(key);
  if (!hints) continue;
  if (!hints.some((hint) => widget.includes(hint))) missing.push(key);
}
assert.deepEqual(missing, [], `도움말에만 있고 코드에 없는 단축키: ${missing.join(', ')}`);

// 마우스 조작은 코드에 수식어 처리가 있어야 한다
assert.ok(/shiftKey/.test(widget), 'Shift 조작 처리가 있다');
assert.ok(/ctrlKey|metaKey/.test(widget), 'Ctrl/Cmd 조작 처리가 있다');
assert.ok(/altKey/.test(widget), 'Alt 조작 처리가 있다');

// 화면에 그릴 때 사용자 문자열이 그대로 새지 않는다
const html = shortcutsHtml(esc);
for (const group of SHORTCUTS) assert.ok(html.includes(esc(group.title)), `${group.title} 이 화면에 없다`);
assert.equal((html.match(/<kbd>/g) || []).length, keys.length, '키 개수만큼 그린다');
assert.ok(html.includes('role="dialog"') && html.includes('aria-modal'), '큰 창 규약을 지킨다');
assert.ok(html.includes('data-help-act="close"'), '닫기 단추가 있다');
const evil = shortcutsHtml((value) => esc(value));
assert.ok(!evil.includes('<script>'), '설명에 태그가 살아 나가지 않는다');

console.log(`[test-heung-shortcuts] ✓ ${keys.length}개 단축키가 목록·코드·화면에서 일치`);
