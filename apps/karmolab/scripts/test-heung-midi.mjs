import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/widgets/heung/midi.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${compiled}\n})(module.exports,module);`, { module, console, String });
const { parseMidiMessage, describeInputs } = module.exports;

// note-on / note-off
const on = parseMidiMessage([0x90, 60, 100]);
assert.equal(on.kind, 'on');
assert.equal(on.pitch, 60);
assert.ok(Math.abs(on.velocity - 100 / 127) < 1e-9);
assert.equal(on.channel, 0);
assert.equal(parseMidiMessage([0x80, 60, 64]).kind, 'off');

// 세기 0 인 note-on 은 note-off — 안 걸러 내면 음이 안 끊긴다
const zero = parseMidiMessage([0x90, 60, 0]);
assert.equal(zero.kind, 'off', '세기 0 은 떼는 것');
assert.equal(zero.velocity, 0);

// 채널이 달라도 읽는다
assert.equal(parseMidiMessage([0x95, 62, 90]).channel, 5);
assert.equal(parseMidiMessage([0x8f, 62, 0]).channel, 15);

// 그 밖의 메시지는 흘린다
assert.equal(parseMidiMessage([0xb0, 7, 100]).kind, 'other', '컨트롤 체인지는 아직 안 쓴다');
assert.equal(parseMidiMessage([0xe0, 0, 64]).kind, 'other', '피치 벤드도 아직');

// 망가진 입력에도 안 죽는다
for (const bad of [null, undefined, [], [0x90], [0x90, 60]]) {
  const event = parseMidiMessage(bad);
  assert.equal(event.kind, 'other', `짧은 메시지 ${JSON.stringify(bad)}`);
  assert.equal(event.pitch, -1);
}
// 범위를 넘는 바이트는 접는다 (7비트)
assert.equal(parseMidiMessage([0x90, 200, 200]).pitch, 200 & 0x7f);
assert.ok(parseMidiMessage([0x90, 200, 200]).velocity <= 1);

// 장치 목록 요약
assert.equal(describeInputs([]), '연결된 건반 없음');
assert.equal(describeInputs(['Keystation']), 'Keystation');
assert.equal(describeInputs(['A', 'B', 'C']), 'A 외 2대');
assert.equal(describeInputs([null]), '건반 1', '이름 없는 기기도 자리를 잃지 않는다');
assert.equal(describeInputs(['   ', 'B']), '건반 1 외 1대');

console.log('[test-heung-midi] ✓ note on/off · 세기 0 · 채널 · 잘못된 입력 · 장치 요약');
