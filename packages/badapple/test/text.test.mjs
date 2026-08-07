/**
 * 글자 표면 — 특히 **높이가 없는 자리**(탭 제목처럼 한 줄뿐인 곳).
 *
 * 여기서 한 번 당했다: 한 줄에 그림을 눌러 담으면서 「하나라도 켜지면 켬」으로 했더니,
 * 아래쪽이 꽉 찬 영상에서 모든 칸이 항상 켜져 제목이 통째로 안 움직였다. 화면은 멀쩡해 보이고
 * 오류도 없다 — 그냥 아무 일도 안 일어난다. 그래서 그 경우를 시험으로 박는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TextSurface } from '../dist/surfaces/text.js';

/** `on(x, y)` 이 true 면 켜진 칸인 격자를 표면에 먹인다. */
function feed(surface, cols, rows, on) {
	let lit = 0;
	for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (on(x, y)) lit += 1;
	surface.paint({ cols, rows, lit, at: (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && on(x, y) });
}

test('격자를 그대로 글자로 찍는다', () => {
	let out = '';
	const surface = new TextSurface({ cols: 3, rows: 2, on: '#', off: '.', write: (t) => (out = t) });
	feed(surface, 3, 2, (x, y) => y === 0 && x === 1);
	assert.equal(out, '.#.\n...');
});

test('굵기 방식은 한 줄만 낸다', () => {
	let out = '';
	const surface = new TextSurface({ cols: 4, rows: 8, ramp: ' ▁▂▃▄▅▆▇█', write: (t) => (out = t) });
	feed(surface, 4, 8, () => true);
	assert.equal(out.includes('\n'), false);
	assert.equal(out.length, 4);
});

test('칸이 얼마나 찼는지가 글자 굵기로 나온다', () => {
	let out = '';
	const surface = new TextSurface({ cols: 3, rows: 8, ramp: ' ▁▂▃▄▅▆▇█', write: (t) => (out = t) });
	// 왼쪽은 비고, 가운데는 절반, 오른쪽은 꽉.
	feed(surface, 3, 8, (x, y) => (x === 1 ? y >= 4 : x === 2));
	assert.equal(out[0], ' ');
	assert.equal(out[2], '█');
	assert.ok(out[1] !== ' ' && out[1] !== '█', `가운데는 중간 굵기여야 한다 (${out[1]})`);
});

test('아래가 꽉 찬 영상에서도 위쪽 모양이 살아 남는다', () => {
	// 예전에 여기서 당했다 — 한 줄로 누르면 전부 켜져 아무것도 안 움직였다.
	const seen = new Set();
	const surface = new TextSurface({ cols: 8, rows: 8, ramp: ' ▁▂▃▄▅▆▇█', write: (t) => seen.add(t) });

	// 바닥 두 줄은 항상 차 있고, 그 위로 봉우리가 지나간다.
	for (const peak of [1, 3, 5]) {
		feed(surface, 8, 8, (x, y) => y >= 6 || (x === peak && y >= 2));
	}
	assert.equal(seen.size, 3, '봉우리가 움직였는데 제목이 안 바뀌었다');
});

test('한 칸도 안 켜지면 가장 옅은 글자', () => {
	let out = '';
	const surface = new TextSurface({ cols: 3, rows: 4, ramp: ' ▁▂▃█', write: (t) => (out = t) });
	feed(surface, 3, 4, () => false);
	assert.equal(out, '   ');
});
