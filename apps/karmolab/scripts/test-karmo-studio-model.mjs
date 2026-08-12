import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/karmo-studio/model.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${compiled}\n})(module.exports,module);`, { module, console, Math, Date, JSON, crypto });
const { quantizeNotes, transposeNotes, setNoteVelocity, legatoNotes, splitClip, snapBeat, automationValueAt, putAutomationPoint, sortAutomation, normalizeProject, newProject, moveTrack } = module.exports;

const note = (beat, pitch = 60, duration = 0.5, velocity = 0.8) => ({ id: `n${beat}-${pitch}`, beat, duration, pitch, velocity });

// quantize — 완전히 붙이기
const loose = [note(0.07), note(0.98), note(2.26)];
assert.equal(quantizeNotes(loose, 0.25), 3, '어긋난 3음 전부 움직인다');
assert.deepEqual(loose.map((item) => Number(item.beat.toFixed(4))), [0, 1, 2.25]);
// 이미 격자에 있으면 아무것도 안 움직인다
assert.equal(quantizeNotes(loose, 0.25), 0, '격자에 붙은 음은 다시 안 움직인다');
// 강도 절반 = 절반만 당긴다 (사람 느낌 보존)
const half = [note(0.1)];
quantizeNotes(half, 0.25, 0.5);
assert.equal(Number(half[0].beat.toFixed(4)), 0.05, '강도 0.5 는 격자까지 절반만');
// 강도 0 = 그대로
const none = [note(0.1)];
quantizeNotes(none, 0.25, 0);
assert.equal(Number(none[0].beat.toFixed(4)), 0.1);
// snap 이 0 이어도 죽지 않는다 (1/4 기본)
const guarded = [note(0.3)];
quantizeNotes(guarded, 0);
assert.equal(Number(guarded[0].beat.toFixed(4)), 0.25);

// transpose — 묶음 모양을 지킨 채 옮긴다
const chord = [note(0, 60), note(0, 64), note(0, 67)];
assert.equal(transposeNotes(chord, 12), 12);
assert.deepEqual(chord.map((item) => item.pitch), [72, 76, 79]);
assert.equal(transposeNotes(chord, -12), -12);
assert.deepEqual(chord.map((item) => item.pitch), [60, 64, 67]);
// 천장에 닿으면 닿는 만큼만 — 화음 간격이 뭉개지지 않는다
const high = [note(0, 80), note(0, 84)];
assert.equal(transposeNotes(high, 12, 36, 84), 0, '이미 천장이면 아무도 안 움직인다');
assert.deepEqual(high.map((item) => item.pitch), [80, 84]);
const nearTop = [note(0, 78), note(0, 82)];
assert.equal(transposeNotes(nearTop, 12, 36, 84), 2, '천장까지 남은 만큼만 올린다');
assert.deepEqual(nearTop.map((item) => item.pitch), [80, 84]);
const nearBottom = [note(0, 38), note(0, 42)];
assert.equal(transposeNotes(nearBottom, -12, 36, 84), -2);
assert.deepEqual(nearBottom.map((item) => item.pitch), [36, 40]);
assert.equal(transposeNotes([], 12), 0, '빈 묶음은 무시');
assert.equal(transposeNotes([note(0, 60)], 0), 0, '0 반음은 무시');

// velocity — 범위를 벗어난 값도 안전하게 접는다
const soft = [note(0), note(1)];
setNoteVelocity(soft, 1.8);
assert.deepEqual(soft.map((item) => item.velocity), [1, 1]);
setNoteVelocity(soft, -3);
assert.deepEqual(soft.map((item) => item.velocity), [0.05, 0.05], '0 으로 죽여 버리지 않는다');

// legato — 앞 음의 끝이 다음 음 시작에 닿는다
const line = [note(0, 60, 0.2), note(1, 62, 0.2), note(2, 64, 0.2)];
assert.equal(legatoNotes(line, 4), 3);
assert.deepEqual(line.map((item) => item.duration), [1, 1, 2], '마지막 음은 클립 끝까지');
// 순서가 뒤섞여 들어와도 시간순으로 잇는다
const shuffled = [note(2, 64, 0.1), note(0, 60, 0.1), note(1, 62, 0.1)];
legatoNotes(shuffled, 3);
assert.deepEqual(shuffled.map((item) => [item.beat, item.duration]), [[2, 1], [0, 1], [1, 1]]);

// splitClip — 자른 뒤 양쪽 음이 각자 클립 안에 남는다
const clip = { id: 'c1', trackId: 't1', kind: 'midi', name: 'A', start: 0, duration: 4, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes: [note(0), note(1), note(3)] };
const right = splitClip(clip, 2);
assert.equal(clip.duration, 2);
assert.equal(right.duration, 2);
assert.equal(clip.notes.length, 2);
assert.equal(right.notes.length, 1);
assert.equal(right.notes[0].beat, 1, '오른쪽 음은 새 클립 기준으로 다시 잰다');
assert.equal(splitClip(clip, 0), null, '클립 끝에서는 안 잘린다');

assert.equal(snapBeat(-5, 0.25), 0, '음수 위치는 0 으로 접힌다');

// 자동화 — 점 사이는 직선, 양 끝은 유지
const flat = [];
assert.equal(automationValueAt(flat, 3, 0.82), 0.82, '점이 없으면 트랙 볼륨 그대로');
const ramp = [{ id: 'a', beat: 4, value: 0.2 }, { id: 'b', beat: 0, value: 1 }];
assert.equal(automationValueAt(ramp, -2, 0.5), 1, '첫 점 앞은 첫 점 값');
assert.equal(automationValueAt(ramp, 99, 0.5), 0.2, '마지막 점 뒤는 마지막 점 값');
assert.equal(Number(automationValueAt(ramp, 2, 0.5).toFixed(4)), 0.6, '가운데는 직선 보간');
assert.equal(sortAutomation(ramp).map((p) => p.beat).join(','), '0,4', '읽기 전에 시간순으로 선다');
// 같은 박에 두 점이 겹쳐도 죽지 않는다
const doubled = [{ id: 'a', beat: 2, value: 0.3 }, { id: 'b', beat: 2, value: 0.9 }];
assert.ok(automationValueAt(doubled, 2, 0.5) >= 0.3, '겹친 점에서 0 으로 나누지 않는다');

// 점 놓기 — 가까우면 값만 바꾼다
let points = [];
points = putAutomationPoint(points, 1, 0.5);
points = putAutomationPoint(points, 1.02, 0.9);
assert.equal(points.length, 1, '가까운 자리는 새 점을 안 만든다');
assert.equal(points[0].value, 0.9);
points = putAutomationPoint(points, 3, 2);
assert.equal(points[1].value, 1.2, '범위를 넘는 값은 접힌다');
points = putAutomationPoint(points, -5, -1);
assert.equal(points[0].beat, 0, '음수 위치는 0');
assert.equal(points[0].value, 0);

// 저장 왕복 — 자동화가 살아남는다
const project = newProject();
project.tracks[0].volumeAutomation = putAutomationPoint([], 2, 0.4);
const round = normalizeProject(JSON.parse(JSON.stringify(project)));
assert.equal(round.tracks[0].volumeAutomation.length, 1, '자동화가 저장 왕복에서 안 사라진다');
assert.equal(round.tracks[0].volumeAutomation[0].value, 0.4);
// 낡은 프로젝트(자동화 없음)도 열린다
const legacy = JSON.parse(JSON.stringify(project));
delete legacy.tracks[0].volumeAutomation;
assert.equal(normalizeProject(legacy).tracks[0].volumeAutomation.length, 0, '옛 저장본은 빈 자동화로 열린다');
// 깨진 점은 버린다
const broken = JSON.parse(JSON.stringify(project));
broken.tracks[0].volumeAutomation = [{ beat: 'x', value: 0.5 }, { beat: 1, value: 0.5 }];
assert.equal(normalizeProject(broken).tracks[0].volumeAutomation.length, 1, '숫자가 아닌 점은 버린다');

// 트랙 순서 바꾸기
const order = (list) => list.map((item) => item.id).join('');
const four = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
assert.equal(order(moveTrack(four, 0, 2)), 'bcad', '위에서 아래로');
assert.equal(order(moveTrack(four, 3, 1)), 'adbc', '아래에서 위로');
assert.equal(order(moveTrack(four, 1, 1)), 'abcd', '제자리면 그대로');
assert.equal(moveTrack(four, 1, 1), four, '제자리면 새 배열도 안 만든다');
assert.equal(order(moveTrack(four, 0, 99)), 'bcda', '범위를 넘으면 맨 끝');
assert.equal(order(moveTrack(four, 3, -5)), 'dabc', '음수면 맨 앞');
assert.equal(moveTrack(four, 9, 0), four, '없는 자리는 무시');
assert.equal(order(four), 'abcd', '원본은 안 바뀐다');

// 접힘도 저장 왕복에서 산다
const folded = newProject();
folded.tracks[0].folded = true;
assert.equal(normalizeProject(JSON.parse(JSON.stringify(folded))).tracks[0].folded, true);
const legacyFold = JSON.parse(JSON.stringify(folded));
delete legacyFold.tracks[0].folded;
assert.equal(normalizeProject(legacyFold).tracks[0].folded, false, '옛 저장본은 펼친 상태');

console.log('[test-karmo-studio-model] ✓ quantize · transpose 천장 · velocity · legato · split · 자동화 보간/저장 · 트랙 순서·접힘');
