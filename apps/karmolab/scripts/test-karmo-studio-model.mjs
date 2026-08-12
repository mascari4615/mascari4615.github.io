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
const { quantizeNotes, transposeNotes, setNoteVelocity, legatoNotes, splitClip, snapBeat } = module.exports;

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

console.log('[test-karmo-studio-model] ✓ quantize · transpose 천장 · velocity · legato · split');
