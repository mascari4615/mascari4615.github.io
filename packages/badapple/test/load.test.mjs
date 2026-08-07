/**
 * 기계 부하로 그리는 부분.
 *
 * 진짜로 태우면서 시험할 수는 없다 — 검사 기계가 느려지면 결과가 흔들리고, 무엇보다 이게
 * 맞게 도는지는 「얼마나 태웠나」가 아니라 「어떤 값을 내려 했나」로 판단해야 한다.
 * 그래서 태우는 일을 밖에서 넣게 만들어 두고, 여기서는 가짜를 넣어 값만 본다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LoadSurface, LoadDriver, bandFor } from '../dist/surfaces/load.js';

/** 격자 하나를 표면에 먹인다. `on(x, y)` 이 true 면 켜진 칸. */
function feed(surface, cols, rows, on) {
	let lit = 0;
	for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (on(x, y)) lit += 1;
	surface.paint({ cols, rows, lit, at: (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && on(x, y) });
}

test('줄마다 실루엣이 얼마나 높은지를 뽑는다', () => {
	const surface = new LoadSurface({ cols: 4, rows: 4 });
	// 왼쪽에서 오른쪽으로 갈수록 높아지는 계단.
	feed(surface, 4, 4, (x, y) => y >= 4 - (x + 1));
	assert.deepEqual(surface.snapshot(), [0.25, 0.5, 0.75, 1]);
});

test('아무것도 안 켜진 줄은 0 이다', () => {
	const surface = new LoadSurface({ cols: 3, rows: 4 });
	feed(surface, 3, 4, () => false);
	assert.deepEqual(surface.snapshot(), [0, 0, 0]);
});

test('줄을 하나씩 내주고 끝에서 처음으로 돌아온다', () => {
	const surface = new LoadSurface({ cols: 3, rows: 2 });
	feed(surface, 3, 2, (x, y) => x === 1 && y === 0);
	const got = [surface.nextColumn(), surface.nextColumn(), surface.nextColumn(), surface.nextColumn()];
	assert.deepEqual(got, [0, 1, 0, 0], '네 번째는 다시 첫 줄이어야 한다');
});

test('부하는 바닥과 천장 사이로 눌린다', async () => {
	const surface = new LoadSurface({ cols: 2, rows: 4 });
	// 한 줄은 텅 비고(0), 한 줄은 꽉 참(1).
	feed(surface, 2, 4, (x) => x === 1);

	const asked = [];
	const driver = new LoadDriver(surface, {
		sliceMs: 0,
		floor: 0.1,
		ceiling: 0.8,
		burn: (fraction) => {
			asked.push(fraction);
		}
	});
	await driver.run(2);

	assert.deepEqual(asked, [0.1, 0.8], '빈 줄은 바닥, 꽉 찬 줄은 천장이어야 한다');
});

test('기계를 아예 멈춰 세우지는 않는다 — 천장이 1 미만이다', async () => {
	const surface = new LoadSurface({ cols: 1, rows: 1 });
	feed(surface, 1, 1, () => true);
	const asked = [];
	const driver = new LoadDriver(surface, { sliceMs: 0, burn: (f) => asked.push(f) });
	await driver.run(1);
	assert.ok(asked[0] < 1, `천장이 1 이면 다른 일이 못 끼어든다 (${asked[0]})`);
	assert.ok(asked[0] > 0.5, `너무 낮으면 그래프에서 안 보인다 (${asked[0]})`);
});

test('바탕이 깔려 있으면 그 위에 그린다 — 태우는 양은 차이만큼만', async () => {
	const surface = new LoadSurface({ cols: 2, rows: 4 });
	feed(surface, 2, 4, (x) => x === 1); // 한 줄은 비고, 한 줄은 꽉

	const asked = [];
	const driver = new LoadDriver(surface, {
		sliceMs: 0,
		baseline: 0.4,
		ceiling: 0.9,
		burn: (fraction) => asked.push(Number(fraction.toFixed(3)))
	});
	await driver.run(2);

	// 빈 줄은 바탕 그대로(태울 것 없음), 꽉 찬 줄은 천장까지 = 0.9 - 0.4.
	assert.deepEqual(asked, [0, 0.5]);
});

test('바탕이 천장에 가까우면 한 줄도 안 태우고 물러난다', async () => {
	const surface = new LoadSurface({ cols: 4, rows: 4 });
	feed(surface, 4, 4, () => true);

	let burned = 0;
	const driver = new LoadDriver(surface, {
		sliceMs: 0,
		baseline: 0.95,
		ceiling: 0.75,
		burn: () => (burned += 1)
	});
	const drawn = await driver.run(4);

	assert.equal(drawn, 0, '자리가 없으면 0 줄이어야 한다');
	assert.equal(burned, 0, '자리가 없는데 태우면 안 된다');
});

test('그릴 자리가 있는지 따로 물어볼 수 있다', () => {
	assert.deepEqual(bandFor(0.1, 0.75), { low: 0.1, high: 0.75 });
	assert.equal(bandFor(0.7, 0.75), null, '5% 밖에 안 남으면 모양이 안 남는다');
	assert.equal(bandFor(0.99, 0.75), null, '바탕이 천장보다 높으면 그릴 수 없다');
});

test('멈추라면 멈춘다', async () => {
	const surface = new LoadSurface({ cols: 8, rows: 4 });
	feed(surface, 8, 4, () => true);
	let count = 0;
	const driver = new LoadDriver(surface, {
		sliceMs: 0,
		burn: () => {
			count += 1;
			if (count === 3) driver.stop();
		}
	});
	const drawn = await driver.run();
	assert.equal(drawn, 3);
	assert.equal(driver.isRunning, false);
});

test('그림이 바뀌면 다음 줄부터 새 그림이 나간다', async () => {
	const surface = new LoadSurface({ cols: 2, rows: 4 });
	feed(surface, 2, 4, () => false);
	assert.deepEqual(surface.snapshot(), [0, 0]);
	feed(surface, 2, 4, () => true);
	assert.deepEqual(surface.snapshot(), [1, 1]);
});
