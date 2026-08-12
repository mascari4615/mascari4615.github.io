import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/heung/export.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${compiled}\n})(module.exports,module);`, { module, console, Math, Float32Array });
const { analysePeak, normalizeGain, applyGain, clampBuffer, exportRange, toDbfs, stemFileName, uniqueNames } = module.exports;

const pcm = (channels) => ({
  numberOfChannels: channels.length,
  length: channels[0].length,
  sampleRate: 44100,
  getChannelData: (index) => channels[index]
});

// peak / clipping
const loud = pcm([Float32Array.from([0.2, -1.4, 0.9]), Float32Array.from([0.1, 0.3, 1.2])]);
const report = analysePeak(loud);
assert.equal(Number(report.peak.toFixed(4)), 1.4, '양쪽 채널 중 최대 절댓값');
assert.equal(report.clipped, 2, '1 을 넘은 표본을 양쪽 채널에서 센다');
assert.ok(report.dbfs > 0, '1 을 넘으면 dBFS 는 양수');

const silent = pcm([Float32Array.from([0, 0, 0])]);
assert.equal(analysePeak(silent).peak, 0);
assert.equal(analysePeak(silent).dbfs, -120, '무음은 바닥값 — -Infinity 로 새지 않는다');
assert.equal(toDbfs(1), 0, '풀 스케일 = 0 dBFS');

// normalize — 무음을 0 으로 나누지 않는다
assert.equal(normalizeGain(0), 1, '무음은 그대로 둔다');
assert.ok(Math.abs(normalizeGain(1, 0) - 1) < 1e-9);
const halfGain = normalizeGain(0.5, 0);
assert.ok(Math.abs(halfGain - 2) < 1e-9, '피크 0.5 를 0dBFS 로 = 2배');
// 목표보다 큰 소리는 내려간다
assert.ok(normalizeGain(2, -1) < 1, '너무 큰 소리는 줄인다');

const scaled = pcm([Float32Array.from([0.25, -0.5])]);
applyGain(scaled, 2);
assert.deepEqual([...scaled.getChannelData(0)], [0.5, -1]);
applyGain(scaled, 1);
assert.deepEqual([...scaled.getChannelData(0)], [0.5, -1], '1배는 아무것도 안 건드린다');

// 정규화하면 피크가 정확히 목표에 온다
const wild = pcm([Float32Array.from([0.3, -1.7, 0.8])]);
applyGain(wild, normalizeGain(analysePeak(wild).peak, -1));
assert.ok(Math.abs(analysePeak(wild).dbfs - -1) < 1e-6, '정규화 뒤 피크 = -1 dBFS');

// clamp — 정규화를 껐을 때의 마지막 방어
const overs = pcm([Float32Array.from([1.5, -2, 0.5])]);
assert.equal(clampBuffer(overs), 2);
assert.deepEqual([...overs.getChannelData(0)], [1, -1, 0.5]);
assert.equal(clampBuffer(overs), 0, '두 번째엔 깎을 게 없다');

// 범위 고르기
const song = { from: 0, to: 32 };
const loop = { from: 4, to: 8 };
const clips = [{ start: 12, duration: 4 }, { start: 6, duration: 2 }];
assert.deepEqual({ ...exportRange('song', song, loop, clips) }, { from: 0, to: 32 });
assert.deepEqual({ ...exportRange('loop', song, loop, clips) }, { from: 4, to: 8 });
assert.deepEqual({ ...exportRange('selection', song, loop, clips) }, { from: 6, to: 16 }, '고른 클립 전체를 덮는다');
assert.deepEqual({ ...exportRange('selection', song, loop, []) }, { from: 0, to: 32 }, '고른 게 없으면 곡 전체');
// 뒤집힌 구간·0 길이 방어
assert.deepEqual({ ...exportRange('loop', song, { from: 9, to: 3 }, []) }, { from: 3, to: 9 }, '뒤집혀 들어와도 바로 세운다');
assert.deepEqual({ ...exportRange('loop', song, { from: 5, to: 5 }, []) }, { from: 5, to: 6 }, '길이 0 짜리 파일은 안 만든다');

// 트랙별 파일 이름
assert.equal(stemFileName('Drums', 0), '01-Drums.wav');
assert.equal(stemFileName('Lead', 9), '10-Lead.wav', '두 자리로 맞춘다');
assert.equal(stemFileName('a/b:c*d?e"f<g>h|i', 0), '01-abcdefghi.wav', '못 쓰는 글자를 뺀다');
assert.equal(stemFileName('   ', 2), '03-track.wav', '이름이 비면 대신 쓴다');
assert.equal(stemFileName(null, 0), '01-track.wav');
assert.ok(stemFileName('x'.repeat(200), 0).length < 70, '너무 긴 이름은 자른다');

// 같은 이름이 겹치면 번호를 붙인다 — 안 그러면 ZIP 안에서 덮어써진다
assert.deepEqual(uniqueNames(['a.wav', 'b.wav']), ['a.wav', 'b.wav']);
assert.deepEqual(uniqueNames(['a.wav', 'a.wav', 'a.wav']), ['a.wav', 'a (2).wav', 'a (3).wav']);
assert.deepEqual(uniqueNames(['noext', 'noext']), ['noext', 'noext (2)']);
assert.deepEqual(uniqueNames([]), []);

console.log('[test-heung-export] ✓ 피크·클리핑 · 정규화 · clamp · 구간 · 트랙별 파일 이름');
