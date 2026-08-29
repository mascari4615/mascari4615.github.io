/** 흥 타악기 격자 뷰. 줄과 칸과 켜짐 표시를 브라우저 없이 잰다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const load = (relative) => ts.transpileModule(fs.readFileSync(path.resolve(relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = { exports: {} };
vm.runInNewContext(`(function(exports,module){${load('src/widgets/heung/model.ts')}\n})(module.exports,module);`, { module: model, console, Math, Date, JSON, crypto });
const view = { exports: {} };
vm.runInNewContext(`(function(exports,module,require){${load('src/widgets/heung/grid-view.ts')}\n})(module.exports,module,require);`,
  { module: view, console, Math, Date, JSON, crypto, require: (name) => { if (name === './model') return model.exports; throw new Error(name); }, Object, Array });
const { buildGridView, gridRows, gridSteps } = view.exports;
const { toggleStepNote, stepNoteAt, DRUM_PIECES } = model.exports;

const esc = (value) => String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
const clip = (notes) => ({ id: 'c', trackId: 't', kind: 'midi', name: '드럼', start: 0, duration: 4, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, mute: false, locked: false, notes });

// 줄은 한 벌 그대로, 낮은 소리가 아래
const rows = gridRows();
assert.equal(rows.length, Object.keys(DRUM_PIECES).length, '한 벌이 다 보인다');
assert.ok(rows[0].pitch > rows[rows.length - 1].pitch, '위가 높은 소리');

// 칸 개수는 클립 길이를 격자 간격으로 나눈 것
assert.equal(gridSteps(clip([]), 0.25), 16, '4박에 1/4 격자면 16칸');
assert.equal(gridSteps(clip([]), 0.5), 8);
assert.equal(gridSteps({ ...clip([]), duration: 0 }, 0.25), 1, '길이가 0 이어도 한 칸은 있다');

// 켜진 칸만 켜짐 표시
const html = buildGridView({ clip: clip([{ id: 'n', beat: 1, duration: 0.2, pitch: 36, velocity: 0.8 }]), step: 0.25, beatsPerBar: 4, esc });
assert.equal((html.match(/data-grid-pitch/g) || []).length, rows.length * 16, '줄마다 16칸');
assert.equal((html.match(/is-on/g) || []).length, 1, '켜진 칸은 하나');
assert.ok(html.includes('data-grid-pitch="36" data-grid-beat="1"'), '켠 자리가 킥 1박');
assert.ok(html.includes('aria-pressed="true"'), '켜짐을 읽어 주는 표시');
assert.ok(html.includes('킥'), '줄 이름이 악기 이름');

// 세기는 칸 밝기로. 약한 칸과 센 칸이 눈에 달라야 함
const loud = buildGridView({ clip: clip([{ id: 'n', beat: 0, duration: 0.2, pitch: 36, velocity: 1 }]), step: 0.25, beatsPerBar: 4, esc });
const soft = buildGridView({ clip: clip([{ id: 'n', beat: 0, duration: 0.2, pitch: 36, velocity: 0.2 }]), step: 0.25, beatsPerBar: 4, esc });
assert.ok(loud.includes('--hu-grid-level:1.00'), '센 칸은 가득');
assert.ok(soft.includes('--hu-grid-level:0.20'), '약한 칸은 옅게');
assert.ok(loud.includes('세기 127'), '읽어 주는 표시에 세기');
assert.ok(soft.includes('세기 25'));
const empty = buildGridView({ clip: clip([]), step: 0.25, beatsPerBar: 4, esc });
assert.ok(!empty.includes('--hu-grid-level'), '꺼진 칸에는 밝기가 없다');

// 켜고 끄기. 같은 칸 두 번이면 삭제
const notes = [];
assert.equal(toggleStepNote(notes, 42, 0.5, 0.25), 'added');
assert.equal(notes.length, 1);
assert.ok(stepNoteAt(notes, 42, 0.5, 0.25), '켜진 것으로 읽힌다');
assert.equal(toggleStepNote(notes, 42, 0.5, 0.25), 'removed');
assert.equal(notes.length, 0);
assert.equal(stepNoteAt(notes, 42, 0.5, 0.25), undefined);
// 다른 줄, 다른 칸은 서로 무관
toggleStepNote(notes, 36, 0, 0.25);
toggleStepNote(notes, 42, 0, 0.25);
assert.equal(notes.length, 2, '같은 자리라도 줄이 다르면 따로');
toggleStepNote(notes, 36, 0.25, 0.25);
assert.equal(notes.length, 3, '같은 줄이라도 칸이 다르면 따로');
// 길이는 격자보다 짧게. 넘치면 다음 칸과 겹침
assert.ok(notes.every((note) => note.duration <= 0.25), '음 길이가 한 칸을 안 넘는다');

console.log('[test-heung-grid-view] ✓ 격자 줄, 칸 수, 켜짐 표시, 세기 밝기, 켜고 끄기');
