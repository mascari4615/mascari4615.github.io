import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/heung/piano-view.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
const modelCompiled = ts.transpileModule(fs.readFileSync(path.resolve('src/widgets/heung/model.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modelModule = { exports: {} };
vm.runInNewContext(`(function(exports,module){${modelCompiled}
})(module.exports,module);`, { module: modelModule, console, Math, Date, JSON, crypto });
vm.runInNewContext(`(function(exports,module,require){${compiled}
})(module.exports,module,()=>modelExports);`, { module, console, Math, Object, modelExports: modelModule.exports });
const { buildPianoView, pianoScale, initialScrollTop, noteName, PIANO_GEOMETRY } = module.exports;

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (notes, duration = 4) => ({ id: 'c1', trackId: 't1', kind: 'midi', name: 'Idea', start: 0, duration, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes });
const note = (id, beat, pitch, velocity = 0.8, duration = 0.5) => ({ id, beat, pitch, velocity, duration });

// 음이름
assert.equal(noteName(60), 'C4');
assert.equal(noteName(61), 'C♯4');
assert.equal(noteName(72), 'C5');

// 배율. 접히면 타임라인 그대로, 크게 열면 짧은 클립을 넓힌다
assert.equal(pianoScale(clip([], 4), 72, false, 1500), 72, '접힌 상태는 타임라인 배율 그대로');
assert.ok(pianoScale(clip([], 4), 72, true, 1500) > 72, '크게 열면 짧은 클립이 넓어진다');
assert.ok(pianoScale(clip([], 4), 72, true, 1500) <= 160, '아무리 넓혀도 상한이 있다');
assert.equal(pianoScale(clip([], 200), 72, true, 1500), 72, '긴 클립은 타임라인 배율 아래로 안 내려간다');
assert.ok(pianoScale(clip([], 4), 72, true, 300) >= 72, '좁은 화면에서도 배율이 음수로 안 간다');

// 첫 스크롤. 가장 높은 음이 위쪽에 걸린다
assert.equal(initialScrollTop(clip([])), Math.max(0, (PIANO_GEOMETRY.high - 72) * PIANO_GEOMETRY.row - 64), '음이 없으면 C5 기준');
assert.equal(initialScrollTop(clip([note('n1', 0, PIANO_GEOMETRY.high)])), 0, '천장 음이면 맨 위');
assert.ok(PIANO_GEOMETRY.low <= 28 && PIANO_GEOMETRY.high >= 90, '베이스와 높은 음을 마우스로 찍을 수 있는 음역');
// 타악기 트랙은 한 벌이 있는 자리로. 넓힌 음역에서 36-49 는 한참 아래
const highNote = clip([note('n1', 0, PIANO_GEOMETRY.high)]);
assert.equal(initialScrollTop(highNote, false), 0, '보통 트랙은 가장 높은 음 기준');
const drumTop = initialScrollTop(highNote, true);
assert.ok(drumTop > 400, `타악기는 한 벌 가운데로 내려간다 (${drumTop})`);
assert.equal(initialScrollTop(clip([]), true), drumTop, '음이 없어도 같은 자리');
const pieceRow = (PIANO_GEOMETRY.high - 42) * PIANO_GEOMETRY.row;
assert.ok(Math.abs(pieceRow - drumTop) < 260, '하이햇 줄이 화면 안에 들어오는 거리');
assert.ok(initialScrollTop(clip([note('n1', 0, 40)])) > 0, '낮은 음은 아래로 내려가 있다');

// 뷰. 고른 음만 표시가 붙는다
const view = buildPianoView({
  clip: clip([note('n1', 0, 60), note('n2', 1, 64, 1)]),
  beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1500,
  isSelected: (id) => id === 'n2',
  esc
});
assert.equal(view.pianoPxPerBeat, 72);
const selectedNotes = view.html.match(/class="hu-note is-selected"/g) || [];
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
assert.ok(evil.html.includes('작게'), '크게 열린 상태면 단추가 작게');

// 빈 클립도 죽지 않는다
const empty = buildPianoView({ clip: clip([]), beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1500, isSelected: () => false, esc });
assert.ok(empty.html.includes('hu-piano'), '음이 없어도 건반은 그린다');
assert.equal((empty.html.match(/class="hu-note/g) || []).length, 0);

// 마디 눈금은 박자 설정을 따른다
const three = buildPianoView({ clip: clip([], 12), beatsPerBar: 3, expanded: false, pxPerBeat: 72, viewportWidth: 1500, isSelected: () => false, esc });
assert.equal((three.html.match(/class="hu-piano-bar"/g) || []).length, 5, '12박, 3/4 = 눈금 5개(0,3,6,9,12)');

// 음계 표시. 밖의 줄에 어두운 띠
const scaleView = buildPianoView({ clip: clip([]), beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1200, isSelected: () => false, esc, scale: { root: 0, id: 'major' } });
const offRows = (scaleView.html.match(/hu-off-scale/g) || []).length;
const octaves = (PIANO_GEOMETRY.high - PIANO_GEOMETRY.low + 1) / 12;
assert.ok(offRows > 0, '음계 밖 줄이 표시된다');
assert.ok(Math.abs(offRows - octaves * 5) < 6, `한 옥타브에 다섯 줄이 밖 (${offRows})`);
const noScale = buildPianoView({ clip: clip([]), beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1200, isSelected: () => false, esc, scale: { root: 0, id: 'off' } });
assert.equal((noScale.html.match(/hu-off-scale/g) || []).length, 0, '표시 안 함이면 하나도 안 깐다');

// 고스트 노트. 다른 클립 음이 흐리게, 만질 수 없게
const ghostView = buildPianoView({ clip: clip([]), beatsPerBar: 4, expanded: false, pxPerBeat: 72, viewportWidth: 1200, isSelected: () => false, esc, ghosts: [{ id: 'g1', beat: 0, duration: 1, pitch: 60, velocity: 0.8 }, { id: 'g2', beat: 2, duration: 1, pitch: 64, velocity: 0.8 }] });
assert.equal((ghostView.html.match(/hu-ghost-note/g) || []).length, 2, '고스트 두 개');
assert.ok(ghostView.html.includes('aria-hidden="true"'), '읽어 주지 않는다');
assert.ok(!ghostView.html.includes('data-note="g1"'), '만질 수 있는 음으로 안 나간다');

console.log('[test-heung-piano-view] ✓ 음이름, 배율, 첫 스크롤, 선택 표시, 이스케이프, 마디 눈금, 음계 표시, 고스트');
