/**
 * 밝기·색 평면이 붙은 파일이 원본과 같이 풀리는지 (TASK-KL-244).
 *
 * 따로 시험하는 이유가 실루엣 때와 같다: 평면도 델타로 담기므로 **이어볼 땐 멀쩡하고
 * 건너뛸 때만** 어긋나는 종류의 고장이 난다. 게다가 실루엣과 평면이 한 프레임 안에 이어
 * 붙어 있어서, 한쪽이 몇 바이트 더 읽으면 다음 평면이 통째로 밀린다 — 그 경우 색만
 * 이상해지고 그림은 멀쩡해서 눈으로는 「가끔 색이 튄다」로 보인다.
 *
 * 옛 재생기 호환도 여기서 지킨다: 깃발을 모르는 디코더가 새 파일을 열어도 실루엣은
 * 그대로 나와야 한다. 그래야 파일 하나로 색 쓰는 쪽과 안 쓰는 쪽이 같이 산다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../dist/format.js';

const WIDTH = 17;
const HEIGHT = 11;
const COUNT = 40;
const CELLS = WIDTH * HEIGHT;

function build() {
	const frames = [];
	const levels = [];
	const colors = [];
	for (let i = 0; i < COUNT; i++) {
		const frame = new Uint8Array(CELLS);
		const level = new Uint8Array(CELLS);
		const color = new Uint8Array(CELLS * 3);
		for (let y = 0; y < HEIGHT; y++) {
			for (let x = 0; x < WIDTH; x++) {
				const at = y * WIDTH + x;
				const wave = Math.sin((x + i * 0.7) * 0.5) + Math.cos((y - i * 0.3) * 0.4);
				const lum = Math.max(0, Math.min(255, Math.round(((wave + 2) / 4) * 255)));
				level[at] = lum;
				frame[at] = lum >= 128 ? 1 : 0;
				color[at * 3] = lum;
				color[at * 3 + 1] = (x * 13 + i * 7) % 256;
				color[at * 3 + 2] = (y * 23 + i * 11) % 256;
			}
		}
		frames.push(frame);
		levels.push(level);
		colors.push(color);
	}
	return { frames, levels, colors };
}

const source = build();
const bytes = encode(source.frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 9, levels: source.levels, colors: source.colors });

test('평면이 붙었다고 스스로 말한다', () => {
	const clip = decode(bytes);
	assert.equal(clip.hasLevels, true);
	assert.equal(clip.hasColors, true);
});

test('순서대로 풀면 원본과 같다', () => {
	const clip = decode(bytes);
	for (let i = 0; i < COUNT; i++) {
		assert.deepEqual(clip.frame(i), source.frames[i], `${i} 번째 실루엣`);
		assert.deepEqual(clip.levels(i), source.levels[i], `${i} 번째 밝기`);
		assert.deepEqual(clip.colors(i), source.colors[i], `${i} 번째 색`);
	}
});

test('아무 데나 건너뛰어도 같다', () => {
	const clip = decode(bytes);
	for (const i of [37, 3, 20, 21, 5, 39, 0, 18, 38]) {
		assert.deepEqual(clip.frame(i), source.frames[i], `${i} 번째 실루엣`);
		assert.deepEqual(clip.levels(i), source.levels[i], `${i} 번째 밝기`);
		assert.deepEqual(clip.colors(i), source.colors[i], `${i} 번째 색`);
	}
});

test('평면을 모르는 재생기가 열어도 실루엣은 그대로다', () => {
	// 깃발을 지운다 = 색 평면이 있는 줄 모르는 옛 디코더와 같은 상태
	const legacy = bytes.slice();
	new DataView(legacy.buffer).setUint16(14, 0, true);
	const clip = decode(legacy);
	assert.equal(clip.hasLevels, false);
	for (let i = 0; i < COUNT; i++) assert.deepEqual(clip.frame(i), source.frames[i], `${i} 번째`);
});

test('평면 없이 구우면 파일에 평면이 안 붙는다', () => {
	const plain = decode(encode(source.frames, { width: WIDTH, height: HEIGHT, fps: 15 }));
	assert.equal(plain.hasLevels, false);
	assert.equal(plain.hasColors, false);
	assert.equal(plain.levels(0), null);
	assert.equal(plain.colors(0), null);
});

test('프레임 수가 안 맞는 평면은 조용히 버린다', () => {
	// 반쯤 담긴 평면은 재생 중에 한 장씩 밀려 「가끔 색이 튄다」가 된다. 아예 안 담는 게 낫다.
	const clip = decode(encode(source.frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { levels: source.levels.slice(0, 3) }));
	assert.equal(clip.hasLevels, false);
});
