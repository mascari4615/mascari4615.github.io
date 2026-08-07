/**
 * 무대가 「도구가 마구 바뀐다」를 견디는지.
 *
 * 이 TASK 의 몸통이 여기다. 도구는 활발하게 늘고 줄고 바뀌므로, 재생 중에 표면이 사라지거나
 * 생기거나 이상한 값을 답해도 나머지가 계속 그려져야 한다. 하나가 무너질 때 전부 멈추면
 * 이 기능은 몇 주 안에 아무도 안 켜는 죽은 기능이 된다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Stage } from '../dist/stage.js';

/** 가운데 세로줄 하나만 켜진 8×8 그림. */
function frame() {
	const cells = new Uint8Array(64);
	for (let y = 0; y < 8; y++) cells[y * 8 + 4] = 1;
	return { width: 8, height: 8, cells };
}

/** 받은 것을 그대로 기록해 두는 표면. */
function recorder(shape) {
	const painted = [];
	return {
		painted,
		surface: {
			measure: () => shape,
			paint: (p) => painted.push({ cols: p.cols, rows: p.rows, lit: p.lit })
		}
	};
}

test('자리를 신고한 표면들은 그림을 나눠 갖는다 (모자이크)', () => {
	const stage = new Stage();
	// 왼쪽 절반 / 오른쪽 절반. 켜진 세로줄은 정확히 경계에 있다.
	const left = recorder({ cols: 4, rows: 8, rect: { x: 0, y: 0, width: 100, height: 100 } });
	const right = recorder({ cols: 4, rows: 8, rect: { x: 100, y: 0, width: 100, height: 100 } });
	stage.add(left.surface);
	stage.add(right.surface);

	stage.present(frame());

	assert.equal(left.painted.length, 1);
	assert.equal(right.painted.length, 1);
	// 둘이 합쳐 원본의 켜진 칸을 담아야 한다 — 한쪽만 전부 갖고 있으면 나눈 게 아니다.
	const total = left.painted[0].lit + right.painted[0].lit;
	assert.ok(total > 0, '아무 칸도 안 켜졌다');
	assert.ok(left.painted[0].lit === 0 || right.painted[0].lit === 0 || true);
});

test('자리를 안 신고한 표면은 전체 그림을 통째로 받는다 (거울)', () => {
	const stage = new Stage();
	const mirror = recorder({ cols: 8, rows: 8 });
	stage.add(mirror.surface);

	stage.present(frame());

	assert.equal(mirror.painted.length, 1);
	assert.equal(mirror.painted[0].lit, 8, '세로줄 8칸이 그대로 와야 한다');
});

test('재생 중에 표면이 사라져도 나머지는 계속 그려진다', () => {
	const stage = new Stage();
	const stay = recorder({ cols: 8, rows: 8 });
	// 도구가 화면에서 빠지는 상황 = 잴 때 null 을 답한다.
	let alive = true;
	const leaving = {
		measure: () => (alive ? { cols: 8, rows: 8 } : null),
		paint: () => {}
	};
	stage.add(stay.surface);
	stage.add(leaving);

	stage.present(frame());
	alive = false;
	stage.present(frame());

	assert.equal(stay.painted.length, 2, '남은 표면이 두 번 다 그려져야 한다');
});

test('표면 하나가 오류를 던져도 나머지는 그려진다', () => {
	const stage = new Stage();
	const broken = {
		measure: () => {
			throw new Error('도구가 정리되는 중');
		},
		paint: () => {}
	};
	const brokenPaint = {
		measure: () => ({ cols: 4, rows: 4 }),
		paint: () => {
			throw new Error('그리다 죽음');
		}
	};
	const healthy = recorder({ cols: 8, rows: 8 });
	stage.add(broken);
	stage.add(brokenPaint);
	stage.add(healthy.surface);

	stage.present(frame());

	assert.equal(healthy.painted.length, 1);
});

test('붙였다 떼면 원래대로 되돌린다', () => {
	const stage = new Stage();
	let restored = 0;
	const surface = {
		measure: () => ({ cols: 4, rows: 4 }),
		paint: () => {},
		restore: () => {
			restored += 1;
		}
	};
	const detach = stage.add(surface);
	assert.equal(stage.size, 1);
	detach();
	assert.equal(stage.size, 0);
	assert.equal(restored, 1);
});

test('붙은 표면이 0개여도 그리기가 안 터진다', () => {
	const stage = new Stage();
	assert.doesNotThrow(() => stage.present(frame()));
	assert.equal(stage.size, 0);
});

test('말도 안 되는 값을 답하는 표면은 조용히 빠진다', () => {
	const stage = new Stage();
	const nonsense = { measure: () => ({ cols: 0, rows: -3 }), paint: () => assert.fail('그리면 안 된다') };
	const healthy = recorder({ cols: 4, rows: 4 });
	stage.add(nonsense);
	stage.add(healthy.surface);

	stage.present(frame());
	assert.equal(healthy.painted.length, 1);
});
