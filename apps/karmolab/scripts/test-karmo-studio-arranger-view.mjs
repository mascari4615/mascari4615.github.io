import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/karmo-studio/arranger-view.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
/* model 은 값 범위 상수만 쓴다 — 뷰가 모델 전체를 안 끌어오는지도 여기서 드러난다. */
const modelStub = { AUTOMATION_RANGE: { volume: { min: 0, max: 1.2 }, pan: { min: -1, max: 1 }, reverb: { min: 0, max: 1 } } };
vm.runInNewContext(`(function(exports,module,require){${compiled}
})(module.exports,module,()=>modelStub);`, { module, console, Math, modelStub });
const { automationY, automationValue, AUTOMATION_GEOMETRY, waveformPath, waveformSvg, waveMissing, clipHtml, automationHtml, visibleClips, previewNotes, laneHint } = module.exports;

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const track = { id: 't1', kind: 'midi', name: 'Inst', color: '#8b7cf6', volume: 0.8, pan: 0, mute: false, solo: false, eqLow: 0, eqMid: 0, eqHigh: 0, compressor: 0, reverb: 0, instrument: 'saw', clips: [], automation: { volume: [], pan: [] }, folded: false };
const clip = (notes = [], extra = {}) => ({ id: 'c1', trackId: 't1', kind: 'midi', name: 'A', start: 2, duration: 4, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, notes, ...extra });

// 자동화 y 좌표 — 항목마다 범위가 다르다
assert.equal(automationY(1.2, 'volume'), 0, '볼륨 최대는 맨 위');
assert.equal(automationY(0, 'volume'), AUTOMATION_GEOMETRY.height, '볼륨 0 은 맨 아래');
assert.equal(automationY(99, 'volume'), 0, '범위를 넘어도 화면 밖으로 안 나간다');
assert.equal(automationY(-99, 'volume'), AUTOMATION_GEOMETRY.height);
assert.equal(automationY(0, 'pan'), AUTOMATION_GEOMETRY.height / 2, '팬 가운데는 줄 한가운데');
assert.equal(automationY(1, 'pan'), 0, '팬 오른쪽 끝은 맨 위');
assert.equal(automationY(-1, 'pan'), AUTOMATION_GEOMETRY.height, '팬 왼쪽 끝은 맨 아래');
// 화면 y → 값은 정확히 되돌아온다
for (const [param, value] of [['volume', 0.6], ['pan', -0.4]]) {
  const back = automationValue(automationY(value, param) / AUTOMATION_GEOMETRY.height, param);
  assert.ok(Math.abs(back - value) < 1e-9, `${param} 왕복`);
}

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
const flat = automationHtml({ trackId: 't1', param: 'volume', points: [], fallback: 0.6, pxPerBeat: 72, width: 900, projectBeats: 16, beatLabel: (beat) => `b${beat}` });
assert.ok(flat.includes('점 없음'), '점이 없으면 그렇게 말한다');
assert.equal((flat.match(/data-auto-point/g) || []).length, 0);
assert.ok(flat.includes(`M0,${automationY(0.6, 'volume')} L900,${automationY(0.6, 'volume')}`), '트랙 볼륨 높이로 평평하게');

// 점이 있으면 시간순으로 잇고 양 끝까지 연장한다
const ramped = automationHtml({ trackId: 't1', param: 'volume', points: [{ id: 'p2', beat: 4, value: 0.2 }, { id: 'p1', beat: 1, value: 1 }], fallback: 0.6, pxPerBeat: 72, width: 900, projectBeats: 16, beatLabel: (beat) => `b${beat}` });
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

// 팬 줄은 이름과 값 표기가 다르다
const panLane = automationHtml({ trackId: 't1', param: 'pan', points: [{ id: 'p1', beat: 2, value: -0.5 }, { id: 'p2', beat: 6, value: 0 }], fallback: 0, pxPerBeat: 72, width: 900, projectBeats: 16, beatLabel: (beat) => `b${beat}` });
assert.ok(panLane.includes('>PAN'), '이름이 PAN');
assert.ok(panLane.includes('L50'), '왼쪽 값은 L 로 읽는다');
assert.ok(panLane.includes('가운데'), '0 은 가운데');
assert.ok(panLane.includes('data-auto-kind="pan"'), '어느 항목인지 DOM 에 남긴다');
assert.ok(panLane.includes('data-auto-param="volume"') && panLane.includes('data-auto-param="pan"'), '항목 고르는 단추가 둘');

// 리버브 줄 — 0~1 이라 볼륨과 눈금이 다르다
assert.equal(automationY(1, 'reverb'), 0, '리버브 최대는 맨 위');
assert.equal(automationY(0, 'reverb'), AUTOMATION_GEOMETRY.height);
assert.ok(automationY(0.5, 'reverb') !== automationY(0.5, 'volume'), '볼륨과 눈금이 다르다');
const reverbLane = automationHtml({ trackId: 't1', param: 'reverb', points: [{ id: 'r1', beat: 2, value: 0.5 }], fallback: 0.08, pxPerBeat: 72, width: 900, projectBeats: 16, beatLabel: (beat) => `b${beat}` });
assert.ok(reverbLane.includes('>REVERB'), '이름이 REVERB');
assert.ok(reverbLane.includes('data-auto-kind="reverb"'));
assert.ok(reverbLane.includes('data-auto-param="reverb"') && reverbLane.includes('data-auto-param="vol'.concat('ume"')), '항목 단추가 셋');
assert.ok(reverbLane.includes('50%'), '값은 퍼센트로 읽는다');

// 빈 줄 안내는 지금 든 도구를 따라간다
assert.ok(laneHint('draw', 'midi').includes('MIDI'), '그리기 + MIDI');
assert.ok(laneHint('draw', 'audio').includes('음원'), '그리기 + 오디오는 음원 넣기');
assert.ok(laneHint('select', 'midi').includes('고르기'), '고르기 도구');
assert.ok(laneHint('slice', 'audio').includes('자르기'), '자르기 도구');
for (const tool of ['draw', 'select', 'slice']) {
  for (const kind of ['midi', 'audio']) {
    assert.ok(laneHint(tool, kind).trim().length > 4, `${tool}/${kind} 안내가 비었다`);
  }
}

console.log('[test-karmo-studio-arranger-view] ✓ 자동화 좌표 · 파형 96칸 · 클립 본문 분기 · 이스케이프 · 자동화 선 · 화면 밖 걸러내기 · 빈 줄 안내');
