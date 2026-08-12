import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/karmo-studio/arranger-view.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module,require){${compiled}\n})(module.exports,module,()=>({}));`, { module, console, Math });
const { automationY, AUTOMATION_GEOMETRY, waveformPath, waveformSvg, waveMissing, clipHtml, automationHtml, visibleClips, previewNotes } = module.exports;

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const track = { id: 't1', kind: 'midi', name: 'Inst', color: '#8b7cf6', volume: 0.8, pan: 0, mute: false, solo: false, eqLow: 0, eqMid: 0, eqHigh: 0, compressor: 0, reverb: 0, instrument: 'saw', clips: [], volumeAutomation: [] };
const clip = (notes = [], extra = {}) => ({ id: 'c1', trackId: 't1', kind: 'midi', name: 'A', start: 2, duration: 4, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes, ...extra });

// 자동화 y 좌표 — 위가 최대, 아래가 0
assert.equal(automationY(AUTOMATION_GEOMETRY.max), 0, '최대값은 맨 위');
assert.equal(automationY(0), AUTOMATION_GEOMETRY.height, '0 은 맨 아래');
assert.equal(automationY(99), 0, '범위를 넘어도 화면 밖으로 안 나간다');
assert.equal(automationY(-99), AUTOMATION_GEOMETRY.height);

// 파형 — 표본이 없으면 빈 문자열, 있으면 96칸
assert.equal(waveformPath({ data: [], start: 0, end: 0 }), '', '빈 구간은 빈 path');
assert.equal(waveformPath({ data: [1, -1], start: 5, end: 2 }), '', '거꾸로 된 구간도 빈 path');
const wave = new Float32Array(480);
for (let index = 0; index < wave.length; index++) wave[index] = Math.sin(index / 6);
const drawn = waveformPath({ data: wave, start: 0, end: wave.length });
assert.equal((drawn.match(/M/g) || []).length, 96, '96칸을 그린다');
assert.ok(!/NaN|Infinity/.test(drawn), '좌표에 NaN 이 안 섞인다');
// 구간이 칸 수보다 짧아도 죽지 않는다
const tiny = waveformPath({ data: new Float32Array([0.5, -0.5, 0.2]), start: 0, end: 3 });
assert.equal((tiny.match(/M/g) || []).length, 96);
assert.ok(!/NaN/.test(tiny));

assert.ok(waveformSvg('M0 0', 'name', 'ks-wave-large').includes('ks-wave-large'), '클래스가 붙는다');
assert.ok(waveMissing(true).includes('DECODING'), '아직 읽는 중');
assert.ok(waveMissing(false).includes('MISSING'), '원본이 없다');

// 클립 — MIDI 는 음을 깔고, 오디오는 주입받은 속 그림을 쓴다
const midi = clipHtml({ track, clip: clip([{ id: 'n1', beat: 0, duration: 1, pitch: 60, velocity: 0.8 }, { id: 'n2', beat: 1, duration: 1, pitch: 67, velocity: 0.8 }]), pxPerBeat: 72, selected: false, audioBody: () => 'AUDIO', esc });
assert.equal((midi.match(/class="ks-midi-note"/g) || []).length, 2);
assert.ok(!midi.includes('AUDIO'), 'MIDI 클립은 오디오 속 그림을 안 부른다');
assert.ok(midi.includes('left:144px') && midi.includes('width:288px'), '박 → 픽셀 변환');
assert.ok(!midi.includes('is-selected'));

let audioBodyCalls = 0;
const audio = clipHtml({ track, clip: clip([], { kind: 'audio' }), pxPerBeat: 72, selected: true, audioBody: () => { audioBodyCalls++; return 'AUDIO'; }, esc });
assert.equal(audioBodyCalls, 1, '음이 없을 때만 오디오 속 그림을 부른다');
assert.ok(audio.includes('AUDIO') && audio.includes('is-selected'));

// 한 음만 있는 클립도 0 으로 나누지 않는다
const single = clipHtml({ track, clip: clip([{ id: 'n1', beat: 0, duration: 1, pitch: 60, velocity: 0.8 }]), pxPerBeat: 72, selected: false, audioBody: () => '', esc });
assert.ok(!/NaN/.test(single), '음이 하나여도 좌표가 NaN 이 안 된다');

// 이름 이스케이프
const evil = clipHtml({ track, clip: clip([], { name: '<script>x</script>' }), pxPerBeat: 72, selected: false, audioBody: () => '', esc });
assert.ok(!evil.includes('<script>'), '클립 이름의 태그가 살아 나가지 않는다');

// 자동화 줄 — 점이 없으면 평평한 선 하나
const flat = automationHtml({ trackId: 't1', points: [], fallback: 0.6, pxPerBeat: 72, width: 900, projectBeats: 16, beatLabel: (beat) => `b${beat}` });
assert.ok(flat.includes('점 없음'), '점이 없으면 그렇게 말한다');
assert.equal((flat.match(/data-auto-point/g) || []).length, 0);
assert.ok(flat.includes(`M0,${automationY(0.6)} L900,${automationY(0.6)}`), '트랙 볼륨 높이로 평평하게');

// 점이 있으면 시간순으로 잇고 양 끝까지 연장한다
const ramped = automationHtml({ trackId: 't1', points: [{ id: 'p2', beat: 4, value: 0.2 }, { id: 'p1', beat: 1, value: 1 }], fallback: 0.6, pxPerBeat: 72, width: 900, projectBeats: 16, beatLabel: (beat) => `b${beat}` });
assert.equal((ramped.match(/data-auto-point/g) || []).length, 2);
assert.ok(ramped.indexOf('L72,') < ramped.indexOf('L288,'), '점을 시간순으로 잇는다');
assert.ok(ramped.includes('L900,'), '마지막 점 뒤로 끝까지 연장');
assert.ok(ramped.includes('· 2점'));
assert.ok(ramped.includes('b1') && ramped.includes('b4'), '점 설명에 위치를 쓴다');

// 화면에 걸리는 클립만 고른다 — 큰 곡에서 편집 한 번이 통째로 멈추던 원인
const many = Array.from({ length: 40 }, (_, index) => ({ start: index * 4, duration: 4 }));
assert.equal(visibleClips(many, 0, 20).length, 5, '0~20박이면 5개');
assert.equal(visibleClips(many, 0, 20, 20).length, 10, '여유 20박이면 양옆까지 10개');
assert.equal(visibleClips(many, -100, -50).length, 0, '화면 밖이면 0개');
assert.equal(visibleClips(many, 20, 0).length, 5, '거꾸로 들어와도 같은 구간');
// 경계에 걸친 클립은 포함된다 (반만 보이는 것도 그려야 한다)
assert.equal(visibleClips([{ start: 8, duration: 4 }], 10, 20).length, 1, '왼쪽으로 반쯤 걸친 클립');
assert.equal(visibleClips([{ start: 18, duration: 4 }], 10, 20).length, 1, '오른쪽으로 반쯤 걸친 클립');
assert.equal(visibleClips([{ start: 20, duration: 4 }], 10, 20).length, 0, '딱 붙어 시작하면 밖');
assert.equal(visibleClips([{ start: 6, duration: 4 }], 10, 20).length, 0, '딱 끝나면 밖');
assert.equal(visibleClips(many, 0, Number.POSITIVE_INFINITY).length, 40, '한계가 없으면 전부');

// 미리보기 음 솎기 — 폭에 맞춰 고르게
assert.equal(previewNotes([1, 2, 3], 288).length, 3, '적으면 그대로');
assert.equal(previewNotes(Array.from({ length: 400 }, (_, i) => i), 288).length, 64, '넓어도 상한 64');
assert.equal(previewNotes(Array.from({ length: 400 }, (_, i) => i), 8).length, 8, '아주 좁아도 하한 8');
const thinned = previewNotes(Array.from({ length: 100 }, (_, i) => i), 40);
assert.equal(thinned.length, 10);
assert.equal(thinned[0], 0, '첫 음은 남는다');
assert.ok(thinned.every((value, index) => index === 0 || value > thinned[index - 1]), '순서를 지킨 채 솎는다');
assert.equal(previewNotes([], 288).length, 0, '빈 클립도 죽지 않는다');

console.log('[test-karmo-studio-arranger-view] ✓ 자동화 좌표 · 파형 96칸 · 클립 본문 분기 · 이스케이프 · 자동화 선 · 화면 밖 걸러내기');
