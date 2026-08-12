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
const { quantizeNotes, transposeNotes, setNoteVelocity, legatoNotes, splitClip, snapBeat, automationValueAt, putAutomationPoint, sortAutomation, normalizeProject, newProject, moveTrack, sortMarkers, putMarker, stepMarker, clampTrackHeight, TRACK_HEIGHT, nextClipColor, CLIP_COLORS, tapTempo, selectionRange } = module.exports;

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
project.tracks[0].automation.volume = putAutomationPoint([], 2, 0.4, 'volume');
project.tracks[0].automation.pan = putAutomationPoint([], 1, -0.7, 'pan');
const round = normalizeProject(JSON.parse(JSON.stringify(project)));
assert.equal(round.tracks[0].automation.volume.length, 1, '자동화가 저장 왕복에서 안 사라진다');
assert.equal(round.tracks[0].automation.volume[0].value, 0.4);
assert.equal(round.tracks[0].automation.pan[0].value, -0.7, '팬은 음수도 산다');
assert.equal(putAutomationPoint([], 0, 5, 'reverb')[0].value, 1, '리버브 상한 1');
assert.equal(putAutomationPoint([], 0, -1, 'reverb')[0].value, 0, '리버브는 음수로 안 간다');
assert.equal(normalizeProject(JSON.parse(JSON.stringify(project))).tracks[0].automation.reverb.length, 0, '리버브 자동화 자리가 늘 있다');
// 팬은 -1~1, 볼륨은 0~1.2 로 접힌다
assert.equal(putAutomationPoint([], 0, 5, 'pan')[0].value, 1, '팬 상한');
assert.equal(putAutomationPoint([], 0, -5, 'pan')[0].value, -1, '팬 하한');
assert.equal(putAutomationPoint([], 0, -5, 'volume')[0].value, 0, '볼륨은 음수로 안 간다');
// 옛 저장본의 volumeAutomation 한 줄이 새 자리로 옮겨진다
const legacy = JSON.parse(JSON.stringify(project));
delete legacy.tracks[0].automation;
legacy.tracks[0].volumeAutomation = [{ id: 'p1', beat: 3, value: 0.9 }];
const migrated = normalizeProject(legacy).tracks[0].automation;
assert.equal(migrated.volume.length, 1, '옛 volumeAutomation 이 새 자리로 옮겨진다');
assert.equal(migrated.volume[0].value, 0.9);
assert.equal(migrated.pan.length, 0, '옛 저장본에 팬은 없다');
// 자동화가 아예 없던 저장본
const older = JSON.parse(JSON.stringify(project));
delete older.tracks[0].automation;
assert.equal(normalizeProject(older).tracks[0].automation.volume.length, 0, '자동화가 없던 저장본은 빈 채로');
// 깨진 점은 버린다
const broken = JSON.parse(JSON.stringify(project));
broken.tracks[0].automation = { volume: [{ beat: 'x', value: 0.5 }, { beat: 1, value: 0.5 }], pan: 'nope' };
const fixedAuto = normalizeProject(broken).tracks[0].automation;
assert.equal(fixedAuto.volume.length, 1, '숫자가 아닌 점은 버린다');
assert.equal(fixedAuto.pan.length, 0, '배열이 아니면 빈 배열');

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

// 구간 이름표
let marks = [];
marks = putMarker(marks, 8, 'Chorus');
marks = putMarker(marks, 4, 'Verse');
assert.equal(marks.map((m) => m.name).join(','), 'Verse,Chorus', '시간순으로 선다');
marks = putMarker(marks, 4.02, 'Verse 1');
assert.equal(marks.length, 2, '가까운 자리는 새로 안 만든다');
assert.equal(marks[0].name, 'Verse 1', '이름만 바뀐다');
marks = putMarker(marks, -3, 'Intro');
assert.equal(marks[0].beat, 0, '음수 위치는 0');

// 앞뒤로 건너뛰기 — 없으면 null (곡 끝으로 튕기지 않는다)
assert.equal(stepMarker(marks, 0, 1).name, 'Verse 1');
assert.equal(stepMarker(marks, 4, 1).name, 'Chorus');
assert.equal(stepMarker(marks, 8, 1), null, '뒤에 없으면 null');
assert.equal(stepMarker(marks, 8, -1).name, 'Verse 1', '바로 그 자리 이름표는 건너뛴다');
assert.equal(stepMarker(marks, 0, -1), null, '앞에 없으면 null');
assert.equal(stepMarker([], 4, 1), null, '이름표가 없으면 null');

// 저장 왕복 · 옛 저장본 · 깨진 값
const withMarks = newProject();
withMarks.markers = putMarker([], 6, 'Bridge');
const rounded = normalizeProject(JSON.parse(JSON.stringify(withMarks)));
assert.equal(rounded.markers.length, 1);
assert.equal(rounded.markers[0].name, 'Bridge');
const legacyMarks = JSON.parse(JSON.stringify(withMarks));
delete legacyMarks.markers;
assert.equal(normalizeProject(legacyMarks).markers.length, 0, '옛 저장본은 이름표 0개');
const brokenMarks = JSON.parse(JSON.stringify(withMarks));
brokenMarks.markers = [{ beat: 'x', name: 'bad' }, { beat: 2 }, { beat: 1, name: '  ' }];
const fixed = normalizeProject(brokenMarks).markers;
assert.equal(fixed.length, 2, '숫자가 아닌 위치는 버린다');
assert.ok(fixed.every((m) => m.name.trim()), '이름이 비면 기본값을 준다');
assert.equal(sortMarkers(fixed).map((m) => m.beat).join(','), '1,2');

// 줄 높이 — 쓸 수 있는 범위로 접는다
assert.equal(clampTrackHeight(120), 120);
assert.equal(clampTrackHeight(5), TRACK_HEIGHT.min, '너무 낮으면 하한');
assert.equal(clampTrackHeight(9999), TRACK_HEIGHT.max, '너무 높으면 상한');
assert.equal(clampTrackHeight('abc'), TRACK_HEIGHT.default, '숫자가 아니면 기본값');
assert.equal(clampTrackHeight(undefined), TRACK_HEIGHT.default);
assert.equal(clampTrackHeight(NaN), TRACK_HEIGHT.default);
assert.equal(clampTrackHeight(101.6), 102, '소수는 반올림');
const tall = newProject();
tall.tracks[0].height = 150;
assert.equal(normalizeProject(JSON.parse(JSON.stringify(tall))).tracks[0].height, 150, '높이가 저장 왕복에서 산다');
const legacyHeight = JSON.parse(JSON.stringify(tall));
delete legacyHeight.tracks[0].height;
assert.equal(normalizeProject(legacyHeight).tracks[0].height, TRACK_HEIGHT.default, '옛 저장본은 기본 높이');

// 클립 색 — 한 칸씩 돌다가 트랙 색으로 되돌아온다
assert.equal(nextClipColor(undefined), CLIP_COLORS[0], '트랙 색을 따르던 것은 첫 색부터');
assert.equal(nextClipColor(CLIP_COLORS[0]), CLIP_COLORS[1]);
assert.equal(nextClipColor(CLIP_COLORS[CLIP_COLORS.length - 1]), undefined, '한 바퀴 돌면 트랙 색으로');
assert.equal(nextClipColor('#nope'), CLIP_COLORS[0], '모르는 색은 첫 색부터');

// 잠금·색이 저장 왕복에서 산다
const locked = newProject();
locked.tracks[0].clips[0].locked = true;
locked.tracks[0].clips[0].color = CLIP_COLORS[2];
const back = normalizeProject(JSON.parse(JSON.stringify(locked))).tracks[0].clips[0];
assert.equal(back.locked, true);
assert.equal(back.color, CLIP_COLORS[2]);
const legacyClip = JSON.parse(JSON.stringify(locked));
delete legacyClip.tracks[0].clips[0].locked;
delete legacyClip.tracks[0].clips[0].color;
delete legacyClip.tracks[0].clips[0].mute;
const old = normalizeProject(legacyClip).tracks[0].clips[0];
assert.equal(old.locked, false, '옛 저장본은 안 잠김');
assert.equal(old.mute, false, '옛 저장본은 소리 켜짐');
assert.equal(old.color, undefined, '옛 저장본은 트랙 색');

// 두드려서 BPM — 한 번은 셀 수 없다
assert.equal(tapTempo([]), null);
assert.equal(tapTempo([1000]), null, '한 번은 못 센다');
assert.equal(tapTempo([0, 500, 1000, 1500]), 120, '0.5초 간격 = 120');
assert.equal(tapTempo([0, 1000, 2000]), 60);
// 한 번 크게 어긋난 두드림이 전체를 끌고 가지 않는다
assert.equal(tapTempo([0, 500, 1000, 2400, 2900, 3400]), 120, '튀는 간격은 뺀다');
// 너무 오래 쉰 것은 아예 안 센다
assert.equal(tapTempo([0, 9000]), null, '3초 넘게 쉬면 새로 시작');
// 범위를 벗어난 속도는 접는다
assert.ok(tapTempo([0, 10]) <= 300, '너무 빠르면 상한');
assert.ok(tapTempo([0, 2400]) >= 30, '너무 느리면 하한');
// 순서가 뒤섞여 들어와도 같은 답
assert.equal(tapTempo([1000, 0, 500]), 120);

// 고른 구간
assert.equal(selectionRange([]), null, '고른 게 없으면 null');
assert.deepEqual({ ...selectionRange([{ start: 8, duration: 4 }, { start: 2, duration: 2 }]) }, { from: 2, to: 12 });
assert.deepEqual({ ...selectionRange([{ start: 5, duration: 0 }]) }, { from: 5, to: 5.0625 }, '길이 0 이어도 구간이 생긴다');
const negative = selectionRange([{ start: -3, duration: 2 }]);
assert.equal(negative.from, 0, '음수 시작은 0 으로');
assert.ok(negative.to > negative.from, '끝이 시작보다 앞설 수 없다');

console.log('[test-karmo-studio-model] ✓ quantize · transpose 천장 · velocity · legato · split · 자동화 보간/저장 · 트랙 순서·접힘 · 구간 이름표 · 줄 높이 · 클립 잠금·색 · TAP·선택구간');
