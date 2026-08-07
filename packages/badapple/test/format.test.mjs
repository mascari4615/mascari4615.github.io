/**
 * 굽고 다시 푸는 게 원본과 같은지. 그리고 아무 데나 집어도 순서대로 푼 것과 같은지.
 *
 * 되감기를 따로 시험하는 이유: 델타(앞 프레임과의 차이)만 담긴 프레임은 혼자서는 못 푼다.
 * 앞의 열쇠 프레임부터 따라와야 하는데, 그 「따라오는」 코드가 틀리면 이어볼 땐 멀쩡하고
 * 건너뛸 때만 깨진다 — 눈으로 보면 「가끔 이상함」으로 보여서 제일 늦게 잡히는 종류다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../dist/format.js';

const WIDTH = 24;
const HEIGHT = 16;

/** 움직이는 원 하나 — 프레임마다 조금씩만 바뀐다 (델타가 실제로 골라지는 상황). */
function makeFrames(count) {
	const frames = [];
	for (let i = 0; i < count; i++) {
		const cells = new Uint8Array(WIDTH * HEIGHT);
		const cx = 4 + (i % 12);
		const cy = 8;
		for (let y = 0; y < HEIGHT; y++) {
			for (let x = 0; x < WIDTH; x++) {
				const dx = x - cx;
				const dy = y - cy;
				cells[y * WIDTH + x] = dx * dx + dy * dy <= 9 ? 1 : 0;
			}
		}
		frames.push(cells);
	}
	return frames;
}

test('구운 것을 다시 풀면 전 프레임이 원본과 같다', () => {
	const frames = makeFrames(50);
	const bytes = encode(frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 10 });
	const clip = decode(bytes);

	assert.equal(clip.width, WIDTH);
	assert.equal(clip.height, HEIGHT);
	assert.equal(clip.fps, 15);
	assert.equal(clip.frameCount, frames.length);

	for (let i = 0; i < frames.length; i++) {
		assert.deepEqual(Array.from(clip.frame(i)), Array.from(frames[i]), `${i} 번째 프레임이 다르다`);
	}
});

test('아무 프레임이나 바로 집어도 순서대로 푼 것과 같다', () => {
	const frames = makeFrames(40);
	const bytes = encode(frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 7 });
	const clip = decode(bytes);

	// 일부러 뒤죽박죽 순서로 — 되감기·건너뛰기·같은 것 두 번.
	for (const i of [39, 3, 22, 22, 8, 38, 0, 15, 14]) {
		assert.deepEqual(Array.from(clip.frame(i)), Array.from(frames[i]), `${i} 번째를 건너뛰어 집었을 때 다르다`);
	}
});

/** 큰 실루엣이 아주 조금씩 움직인다 — 실제 실루엣 영상에 가까운 모양. */
function makeSilhouette(count) {
	const frames = [];
	for (let i = 0; i < count; i++) {
		const cells = new Uint8Array(WIDTH * HEIGHT);
		const cx = WIDTH / 2 + Math.round(Math.sin(i / 20) * 1);
		const cy = HEIGHT / 2;
		for (let y = 0; y < HEIGHT; y++) {
			for (let x = 0; x < WIDTH; x++) {
				const dx = (x - cx) / (WIDTH / 3);
				const dy = (y - cy) / (HEIGHT / 2.5);
				cells[y * WIDTH + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
			}
		}
		frames.push(cells);
	}
	return frames;
}

test('실루엣 영상에서는 델타가 크게 이득이다', () => {
	// 실제로 재 보면 절감 88% 쯤 나온다. 절반만 넘겨도 통과로 둔다 — 모양이 조금 달라도 안 흔들리게.
	const frames = makeSilhouette(120);
	const withDelta = encode(frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 60 });
	const keysOnly = encode(frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 1 });
	assert.ok(withDelta.length < keysOnly.length * 0.5, `절감이 너무 적다 (${withDelta.length} vs ${keysOnly.length})`);
});

test('델타가 손해인 영상에서도 더 커지지는 않는다', () => {
	// 작고 빠르게 움직이는 것은 「달라진 칸」이 오히려 더 복잡하다. 그때는 인코더가 프레임마다
	// 통째 쪽을 골라야 한다 — 안 그러면 어떤 영상에서는 파일이 되레 커진다.
	const frames = makeFrames(120);
	const withDelta = encode(frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 60 });
	const keysOnly = encode(frames, { width: WIDTH, height: HEIGHT, fps: 15 }, { keyframeInterval: 1 });
	assert.ok(withDelta.length <= keysOnly.length, `델타를 켰더니 더 커졌다 (${withDelta.length} vs ${keysOnly.length})`);
});

test('bab 이 아닌 파일은 거부한다', () => {
	assert.throws(() => decode(new Uint8Array(32)), /bab 형식이 아니다/);
	assert.throws(() => decode(new Uint8Array(4)), /너무 짧다/);
});
