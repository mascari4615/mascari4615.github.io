import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/karmo-studio/selection.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${compiled}\n})(module.exports,module);`, { module, console, Math });
const { clipMarks, noteMarks, markMode, dragRect, rectOverlaps, isBoxDrag } = module.exports;

// 수식어 → 모드
assert.equal(markMode({}), 'replace');
assert.equal(markMode({ shiftKey: true }), 'add');
assert.equal(markMode({ ctrlKey: true }), 'toggle');
assert.equal(markMode({ metaKey: true }), 'toggle', 'mac Cmd 도 toggle');
assert.equal(markMode({ shiftKey: true, ctrlKey: true }), 'toggle', 'ctrl 이 shift 를 이긴다');

// clip 묶음 — replace / add / toggle
const clips = clipMarks();
const a = { trackId: 't1', clipId: 'c1' };
const b = { trackId: 't1', clipId: 'c2' };
const c = { trackId: 't2', clipId: 'c3' };
clips.apply(a, 'replace');
assert.equal(clips.size, 1);
clips.apply(b, 'add');
clips.apply(c, 'add');
assert.equal(clips.size, 3, 'shift 로 3개 누적');
clips.apply(b, 'toggle');
assert.equal(clips.size, 2, 'ctrl 로 하나 빼기');
assert.equal(clips.has(b), false);
clips.apply(b, 'toggle');
assert.equal(clips.size, 3, 'ctrl 로 다시 넣기');

// 묶음 안의 대상을 그냥 클릭해도 묶음이 깨지지 않는다 (묶음 drag 진입점)
clips.apply(a, 'replace');
assert.equal(clips.size, 3, '표시된 clip 재클릭은 묶음 유지');
// 묶음 밖을 클릭하면 묶음이 그 하나로 접힌다
clips.apply({ trackId: 't9', clipId: 'c9' }, 'replace');
assert.equal(clips.size, 1);

// 같은 clipId 라도 track 이 다르면 다른 참조다
const twin = clipMarks();
twin.replace([{ trackId: 't1', clipId: 'same' }, { trackId: 't2', clipId: 'same' }]);
assert.equal(twin.size, 2, 'trackId 가 key 에 포함된다');

// prune — 삭제·undo 후 사라진 참조가 남지 않는다
const alive = new Set(['t1 c1']);
twin.replace([a, b, c]);
twin.prune((ref) => alive.has(`${ref.trackId} ${ref.clipId}`));
assert.equal(twin.size, 1);
assert.equal(twin.list().map((ref) => `${ref.trackId} ${ref.clipId}`).join('|'), 't1 c1');

// note 묶음은 clip 안에서 식별된다
const notes = noteMarks();
notes.replace([{ clipId: 'c1', noteId: 'n1' }, { clipId: 'c1', noteId: 'n2' }]);
assert.equal(notes.size, 2);
notes.apply({ clipId: 'c1', noteId: 'n1' }, 'toggle');
assert.equal(notes.size, 1);
notes.clear();
assert.equal(notes.size, 0);

// box selection 기하 — 역방향 drag 도 같은 사각형
const forward = dragRect(10, 10, 60, 40);
const backward = dragRect(60, 40, 10, 10);
assert.equal(JSON.stringify(forward), JSON.stringify(backward), '역방향 drag 도 정규화된다');
assert.equal(JSON.stringify(forward), JSON.stringify({ left: 10, top: 10, right: 60, bottom: 40 }));

const inside = { left: 20, top: 15, right: 30, bottom: 25 };
const outside = { left: 200, top: 15, right: 260, bottom: 25 };
const touching = { left: 60, top: 10, right: 90, bottom: 40 };
assert.equal(rectOverlaps(forward, inside), true);
assert.equal(rectOverlaps(forward, outside), false);
assert.equal(rectOverlaps(forward, touching), false, '변이 맞닿기만 하면 선택 아님');

// 손떨림 클릭은 box drag 가 아니다
assert.equal(isBoxDrag(dragRect(10, 10, 12, 11)), false);
assert.equal(isBoxDrag(dragRect(10, 10, 40, 11)), true, '가로로만 끌어도 box');
assert.equal(isBoxDrag(dragRect(10, 10, 11, 40)), true, '세로로만 끌어도 box');

console.log('[test-karmo-studio-selection] ✓ mark mode · 묶음 유지 · prune · box 기하');
