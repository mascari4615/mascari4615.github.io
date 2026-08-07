/**
 * 재생기가 시계를 제대로 읽는지.
 *
 * 시계를 밖에서 넣는 구조라 **기다리지 않고** 시험할 수 있다. 3분짜리 되감기를 3분 기다려서
 * 확인하는 방식이었으면 이 시험들은 아무도 안 돌렸을 것이다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../dist/format.js';
import { Player } from '../dist/player.js';

/** 프레임마다 켜진 칸 수가 다른 클립 — 몇 번째 프레임이 나왔는지 세어서 알 수 있게. */
function clipOf(count) {
	const frames = [];
	for (let i = 0; i < count; i++) {
		const cells = new Uint8Array(16);
		for (let c = 0; c <= i % 16; c++) cells[c] = 1;
		frames.push(cells);
	}
	return decode(encode(frames, { width: 4, height: 4, fps: 10 }, { keyframeInterval: 5 }));
}

function counter() {
	const seen = [];
	return {
		seen,
		surface: { measure: () => ({ cols: 4, rows: 4 }), paint: (p) => seen.push(p.lit) }
	};
}

test('멈춰 있으면 아무것도 안 그린다', () => {
	const player = new Player(clipOf(20));
	const sink = counter();
	player.stage.add(sink.surface);

	assert.equal(player.tick(0), false);
	assert.equal(sink.seen.length, 0);
});

test('같은 프레임에 머무는 동안은 다시 안 그린다', () => {
	const player = new Player(clipOf(20));
	const sink = counter();
	player.stage.add(sink.surface);

	player.play(0);
	assert.equal(player.tick(0), true); // 0번
	assert.equal(player.tick(30), false); // 아직 0번 (10fps → 100ms 마다 바뀜)
	assert.equal(player.tick(120), true); // 1번
	assert.equal(sink.seen.length, 2);
});

test('끝나면 처음으로 돌아온다', () => {
	const clip = clipOf(10); // 10fps × 10장 = 1초
	const player = new Player(clip, { loop: true });
	const sink = counter();
	player.stage.add(sink.surface);

	player.play(0);
	player.tick(0);
	const first = sink.seen[0];
	player.tick(1000); // 정확히 한 바퀴
	assert.equal(sink.seen[sink.seen.length - 1], first, '한 바퀴 뒤엔 첫 장이어야 한다');
	assert.ok(player.isPlaying);
});

test('안 돌리기로 하면 끝에서 멈춘다', () => {
	const player = new Player(clipOf(10), { loop: false });
	player.stage.add(counter().surface);

	player.play(0);
	player.tick(2000);
	assert.equal(player.isPlaying, false);
	assert.equal(player.positionSec, player.durationSec);
});

test('멈췄다 다시 틀면 그 자리에서 이어진다', () => {
	const player = new Player(clipOf(100));

	player.play(0);
	player.tick(500);
	player.pause(500);
	const held = player.positionSec;
	assert.ok(Math.abs(held - 0.5) < 0.01);

	// 한참 지난 뒤 다시 틀어도 자리는 그대로여야 한다.
	player.play(9000);
	assert.ok(Math.abs(player.positionSec - held) < 0.01);
});

test('그 자리로 옮기면 거기서 이어진다', () => {
	const player = new Player(clipOf(100));
	player.play(0);
	player.seek(3, 0);
	assert.ok(Math.abs(player.positionSec - 3) < 0.01);
	player.tick(0);
	assert.ok(Math.abs(player.positionSec - 3) < 0.01);
});

test('접으면 붙어 있던 것들을 되돌린다', () => {
	const player = new Player(clipOf(10));
	let restored = 0;
	player.stage.add({ measure: () => ({ cols: 4, rows: 4 }), paint: () => {}, restore: () => (restored += 1) });

	player.play(0);
	player.dispose();

	assert.equal(restored, 1);
	assert.equal(player.isPlaying, false);
	assert.equal(player.stage.size, 0);
});
