import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/karmo-studio/piano-view.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module,require){${compiled}\n})(module.exports,module,()=>({}));`, { module, console, Math });
const { buildPianoView, pianoScale, initialScrollTop, noteName, PIANO_GEOMETRY } = module.exports;

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (notes, duration = 4) => ({ id: 'c1', trackId: 't1', kind: 'midi', name: 'Idea', start: 0, duration, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes });
const note = (id, beat, pitch, velocity = 0.8, duration = 0.5) => ({ id, beat, pitch, velocity, duration });

// 음이름
assert.equal(noteName(60), 'C4');
assert.equal(noteName(61), 'C♯4');
assert.equal(noteName(72), 'C5');

// 배율 — 접히면 타임라인 그대로, 크게 열면 짧은 클립을 넓힌다
assert.equal(pianoScale(clip([], 4), 72, false, 1500), 72, '접힌 상태는 타임라인 배율 그대로');
assert.ok(pianoScale(clip([], 4), 72, true, 1500) > 72, '크게 열면 짧은 클립이 넓어진다');
assert.ok(pianoScale(clip([], 4), 72, true, 1500) <= 160, '아무리 넓혀도 상한이 있다');
assert.equal(pianoScale(clip([], 200), 72, true, 1500), 72, '긴 클립은 타임라인 배율 아래로 안 내려간다');
assert.ok(pianoScale(clip([], 4), 72, true, 300) >= 72, '좁은 화면에서도 배율이 음수로 안 간다');

// 첫 스크롤 — 가장 높은 음이 위쪽에 걸린다
assert.equal(initialScrollTop(clip([])), Math.max(0, (PIANO_GEOMETRY.high - 72) * PIANO_GEOMETRY.row - 64), '음이 없으면 C5 기준');
assert.equal(initialScrollTop(clip([note('n1', 0, 84)])), 0, '천장 음이면 맨 위');
assert.ok(initialScrollTop(clip([note('n1', 0, 40)])) > 0, '낮은 음은 아래로 내려가 있다');

// 뷰 — 고른 음만 표시가 붙는다
const view = buildPianoView({
  clip: clip([note('n1', 0, 60), note('n2', 1, 64, 1)]),
  beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1500,
  isSelected: (id) => id === 'n2',
  esc
});
assert.equal(view.pianoPxPerBeat, 72);
const selectedNotes = view.html.match(/class="ks-note is-selected"/g) || [];
assert.equal(selectedNotes.length, 1, '고른 음 하나에만 표시');
assert.ok(view.html.includes('data-note="n1"') && view.html.includes('data-note="n2"'), '음이 전부 그려진다');
assert.equal((view.html.match(/data-vel="/g) || []).length, 2, '세기 막대는 음 수만큼');
assert.ok(view.html.includes('data-note-velocity'), '세기 슬라이더가 있다');
assert.ok(view.html.includes('data-piano="1"') && view.html.includes('data-velocity'), '제스처가 잡는 자리들이 그대로 있다');

// 세기 슬라이더 초기값 = 고른 음의 세기
assert.ok(/data-note-velocity/.test(view.html));
assert.ok(view.html.includes('value="1"'), '고른 음의 velocity 가 슬라이더 초기값');

// 이름은 반드시 이스케이프된다 (프로젝트 이름은 사용자 입력이다)
const evil = buildPianoView({
  clip: { ...clip([]), name: '<img src=x onerror=alert(1)>' },
  beatsPerBar: 4, expanded: true, pxPerBeat: 72, viewportWidth: 1500,
  isSelected: () => false, esc
});
assert.ok(!evil.html.includes('<img'), '클립 이름의 태그가 살아서 나가지 않는다');
assert.ok(evil.html.includes('&lt;img'), '이스케이프된 형태로 보인다');
assert.ok(evil.html.includes('작게'), '크게 열린 상태면 단추가 「작게」');

// 빈 클립도 죽지 않는다
const empty = buildPianoView({ clip: clip([]), beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1500, isSelected: () => false, esc });
assert.ok(empty.html.includes('ks-piano'), '음이 없어도 건반은 그린다');
assert.equal((empty.html.match(/class="ks-note/g) || []).length, 0);

// 마디 눈금은 박자 설정을 따른다
const three = buildPianoView({ clip: clip([], 12), beatsPerBar: 3, expanded: false, pxPerBeat: 72, viewportWidth: 1500, isSelected: () => false, esc });
assert.equal((three.html.match(/class="ks-piano-bar"/g) || []).length, 5, '12박 · 3/4 = 눈금 5개(0,3,6,9,12)');

console.log('[test-karmo-studio-piano-view] ✓ 음이름 · 배율 · 첫 스크롤 · 선택 표시 · 이스케이프 · 마디 눈금');
