/**
 * 아스키 표면 — 밝기가 글자 농도로, 색이 칸 색으로 나오는지 (TASK-KL-244).
 *
 * 램프 방향을 시험에 박아 두는 이유: 뒤집힌 그림도 그럴듯해 보여서 눈으로는 안 잡힌다.
 * 「어두운 것부터」가 규약이고, 그게 깨지면 여기서 빨개져야 한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsciiSurface } from '../dist/surfaces/ascii.js';
import { Stage } from '../dist/stage.js';

const RAMP = ' .:-=+*#%@';

function paintOnce(frame, options) {
	const stage = new Stage();
	let got = null;
	stage.add(new AsciiSurface({ ...options, ramp: RAMP, write: (f) => (got = f) }));
	stage.present(frame);
	return got;
}

test('어두운 칸은 램프 앞쪽, 밝은 칸은 뒤쪽', () => {
	const got = paintOnce(
		{ width: 2, height: 1, cells: Uint8Array.from([0, 1]), levels: Uint8Array.from([0, 255]) },
		{ cols: 2, rows: 1 }
	);
	assert.equal(got.text, ' @');
});

test('중간 밝기는 램프 가운데로 간다', () => {
	const got = paintOnce(
		{ width: 3, height: 1, cells: Uint8Array.from([0, 0, 1]), levels: Uint8Array.from([0, 128, 255]) },
		{ cols: 3, rows: 1 }
	);
	assert.equal(got.text[0], ' ');
	assert.equal(got.text[2], '@');
	const middle = RAMP.indexOf(got.text[1]);
	assert.ok(middle > 0 && middle < RAMP.length - 1, `가운데가 ${got.text[1]} 로 나왔다`);
});

test('밝기 평면이 없는 1비트 클립도 그냥 그려진다', () => {
	// 계조가 없으면 켜짐/꺼짐이 램프 양 끝으로 간다 — 색을 모르는 옛 파일도 이 표면에 꽂힌다.
	const got = paintOnce({ width: 2, height: 1, cells: Uint8Array.from([0, 1]) }, { cols: 2, rows: 1 });
	assert.equal(got.text, ' @');
	assert.equal(got.colors, null);
});

test('색을 켜면 칸마다 색이 같이 나온다', () => {
	const got = paintOnce(
		{
			width: 2,
			height: 1,
			cells: Uint8Array.from([1, 1]),
			levels: Uint8Array.from([255, 255]),
			colors: Uint8Array.from([255, 0, 0, 0, 128, 255])
		},
		{ cols: 2, rows: 1, color: true }
	);
	assert.equal(got.colors[0], 0xff0000);
	assert.equal(got.colors[1], 0x0080ff);
});

test('색 없는 클립에 색을 켜도 조용히 흑백으로 간다', () => {
	const got = paintOnce(
		{ width: 1, height: 1, cells: Uint8Array.from([1]), levels: Uint8Array.from([200]) },
		{ cols: 1, rows: 1, color: true }
	);
	assert.equal(got.colors, null);
});

test('줄 수만큼 줄바꿈이 들어간다', () => {
	const got = paintOnce(
		{ width: 2, height: 2, cells: new Uint8Array(4), levels: Uint8Array.from([0, 255, 255, 0]) },
		{ cols: 2, rows: 2 }
	);
	assert.equal(got.text, ' @\n@ ');
	assert.equal(got.rows, 2);
});
