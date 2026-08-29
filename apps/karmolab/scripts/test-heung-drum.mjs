/** 흥 타악기. 음높이 하나가 어떤 소리를 만드는지 가짜 오디오 장치로 잰다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const load = (relative) => {
  const source = fs.readFileSync(path.resolve(relative), 'utf8');
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
};
const model = { exports: {} };
vm.runInNewContext(`(function(exports,module){${load('src/widgets/heung/model.ts')}\n})(module.exports,module);`, { module: model, console, Math, Date, JSON, crypto });
const engine = { exports: {} };
const exportModule = { exports: {} };
vm.runInNewContext(`(function(exports,module){${load('src/widgets/heung/export.ts')}
})(module.exports,module);`, { module: exportModule, console, Math, Date, JSON, crypto });
const require_ = (name) => { if (name === './model') return model.exports; if (name === './export') return exportModule.exports; throw new Error(`모르는 모듈 ${name}`); };
vm.runInNewContext(`(function(exports,module,require){${load('src/widgets/heung/audio-engine.ts')}\n})(module.exports,module,require);`,
  { module: engine, console, Math, Date, JSON, crypto, require: require_, window: {}, WeakMap });
const { scheduleDrum, makeImpulse, scheduleMidi } = engine.exports;

/** 가짜 오디오 장치. 무엇을 몇 개 만들었는지만 기록 */
function fakeContext() {
  const made = { oscillators: [], buffers: [], filters: [], gains: [], started: [] };
  const param = () => ({ value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; } });
  const node = (extra) => ({ connect(target) { return target; }, disconnect() {}, ...extra });
  return {
    sampleRate: 44100,
    createBuffer: (channels, length) => ({ length, getChannelData: () => new Float32Array(length) }),
    createOscillator() { const item = node({ type: 'sine', frequency: param(), detune: param(), start(at) { made.started.push(at); }, stop() {} }); made.oscillators.push(item); return item; },
    createBufferSource() { const item = node({ buffer: null, start(at) { made.started.push(at); }, stop() {} }); made.buffers.push(item); return item; },
    createBiquadFilter() { const item = node({ type: '', frequency: param(), Q: param() }); made.filters.push(item); return item; },
    createGain() { const item = node({ gain: param() }); made.gains.push(item); return item; },
    made
  };
}

const input = { connect() { return input; } };

// 킥. 떨어지는 사인과 짧은 잡음
const kick = fakeContext();
scheduleDrum(kick, input, 36, 0.9, 0, []);
assert.equal(kick.made.oscillators.length, 1, '킥은 몸통 하나');
assert.equal(kick.made.buffers.length, 1, '킥에도 짧은 잡음 한 겹');

// 닫은 하이햇. 몸통 없이 잡음만
const hat = fakeContext();
scheduleDrum(hat, input, 42, 0.8, 0, []);
assert.equal(hat.made.oscillators.length, 0, '하이햇은 음이 아니라 잡음이다');
assert.equal(hat.made.buffers.length, 1);
assert.ok(hat.made.filters.some((filter) => filter.type === 'highpass'), '높은 쪽만 남긴다');

// 클랩. 짧은 잡음 세 번으로 손뼉
const clap = fakeContext();
scheduleDrum(clap, input, 39, 0.8, 0, []);
assert.equal(clap.made.buffers.length, 3, '클랩은 세 번');
assert.ok(clap.made.filters.every((filter) => filter.type === 'bandpass'));

// 스네어. 몸통과 잡음 한 겹씩
const snare = fakeContext();
scheduleDrum(snare, input, 38, 0.8, 0, []);
assert.equal(snare.made.oscillators.length, 1);
assert.equal(snare.made.buffers.length, 1);

// 소리마다 다른 재료. 다 같으면 한 벌이 아님
const shapes = new Set();
for (const pitch of [36, 38, 39, 42, 45, 46, 48, 49]) {
  const context = fakeContext();
  scheduleDrum(context, input, pitch, 0.8, 0, []);
  shapes.add(`${context.made.oscillators.length}:${context.made.buffers.length}:${context.made.filters.map((filter) => filter.type).join(',')}`);
}
assert.ok(shapes.size >= 4, `한 벌이 서로 다른 소리를 낸다 (${shapes.size}가지)`);

// 소리 낸 시각은 받은 그대로. 밀리면 박자 어긋남
const timed = fakeContext();
scheduleDrum(timed, input, 36, 0.8, 12.5, []);
assert.ok(timed.made.started.every((at) => at >= 12.5), '시작 시각은 받은 값 뒤');

// sources 에 적재. 정지 때 끊을 수단
const collected = [];
scheduleDrum(fakeContext(), input, 49, 0.8, 0, collected);
assert.ok(collected.length >= 1, '정지용으로 모아 둔다');

// 잔향은 매번 같은 표본. 난수로 구우면 같은 곡도 매번 다른 파일
const impulseContext = () => ({ sampleRate: 8000, createBuffer: (channels, length) => { const data = [new Float32Array(length), new Float32Array(length)]; return { length, numberOfChannels: channels, getChannelData: (channel) => data[channel] }; } });
const firstImpulse = makeImpulse(impulseContext(), 0.05);
const secondImpulse = makeImpulse(impulseContext(), 0.05);
assert.deepEqual(Array.from(firstImpulse.getChannelData(0).slice(0, 24)), Array.from(secondImpulse.getChannelData(0).slice(0, 24)), '같은 잔향이 나온다');
assert.notDeepEqual(Array.from(firstImpulse.getChannelData(0).slice(0, 24)), Array.from(firstImpulse.getChannelData(1).slice(0, 24)), '두 귀는 서로 다르다');
assert.ok(firstImpulse.getChannelData(0).some((value) => value !== 0), '무음이 아니다');

// 흔들기. 세기가 0 이 아니면 목소리마다 흔드는 오실레이터가 하나씩
const { newTrack } = model.exports;
const midiClip = { id: 'c', trackId: 't', kind: 'midi', name: '', start: 0, duration: 1, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, mute: false, locked: false, notes: [{ id: 'n', beat: 0, duration: 0.5, pitch: 60, velocity: 0.8 }] };
const plainTrack = newTrack('midi', 1);
const plainContext = fakeContext();
scheduleMidi(plainContext, input, plainTrack, midiClip, 0, 4, 0, 0.5, []);
const wobbleTrack = { ...newTrack('midi', 1), fm: { ratio: 2, amount: 0.5 } };
const wobbleContext = fakeContext();
scheduleMidi(wobbleContext, input, wobbleTrack, midiClip, 0, 4, 0, 0.5, []);
assert.equal(wobbleContext.made.oscillators.length, plainContext.made.oscillators.length * 2, '목소리마다 흔드는 짝이 하나씩 붙는다');
assert.ok(wobbleContext.made.gains.length > plainContext.made.gains.length, '흔드는 세기를 정하는 게인도 더 생긴다');

// 정지 목록에도 적재. 안 담으면 멈춰도 계속 흔들림
const wobbleSources = [];
scheduleMidi(fakeContext(), input, wobbleTrack, midiClip, 0, 4, 0, 0.5, wobbleSources);
const plainSources = [];
scheduleMidi(fakeContext(), input, plainTrack, midiClip, 0, 4, 0, 0.5, plainSources);
assert.ok(wobbleSources.length > plainSources.length, '흔드는 것도 정지 목록에');

console.log('[test-heung-drum] ✓ 타악기 8종의 재료, 시각, 정지 목록, 잔향 재현, 흔들기');
