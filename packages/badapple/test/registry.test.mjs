/**
 * 신고 창구 — 도구가 재생기를 모른 채 자기를 등록하는 자리.
 *
 * 여기서 틀리면 증상이 조용하다: 도구가 신고했는데 안 그려지거나, 도구를 닫았는데 계속
 * 그려지거나(그리고 그 도구가 이미 없앤 화면에 그리다 터진다). 둘 다 오류 없이 이상하기만 하다.
 * 그래서 붙는 순서를 전부 시험으로 박는다 — 도구가 먼저인 경우, 재생이 먼저인 경우, 껐다 켜는 경우.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../dist/registry.js';
import { Stage } from '../dist/stage.js';

function fake() {
	const painted = [];
	return { painted, surface: { measure: () => ({ cols: 4, rows: 4 }), paint: (p) => painted.push(p.lit) } };
}

function frame() {
	const cells = new Uint8Array(16).fill(1);
	return { width: 4, height: 4, cells };
}

test('도구가 먼저 신고하고 재생이 나중에 시작돼도 그려진다', () => {
	const registry = new Registry();
	const tool = fake();
	registry.add(tool.surface);

	const stage = new Stage();
	registry.bindTo(stage);
	stage.present(frame());

	assert.equal(tool.painted.length, 1);
});

test('재생 중에 도구가 열려도 바로 낀다', () => {
	const registry = new Registry();
	const stage = new Stage();
	registry.bindTo(stage);

	const tool = fake();
	registry.add(tool.surface);
	stage.present(frame());

	assert.equal(tool.painted.length, 1);
});

test('도구를 닫으면 더 이상 안 그려진다', () => {
	const registry = new Registry();
	const stage = new Stage();
	registry.bindTo(stage);

	const tool = fake();
	const close = registry.add(tool.surface);
	stage.present(frame());
	close();
	stage.present(frame());

	assert.equal(tool.painted.length, 1, '닫은 뒤에도 그려졌다');
	assert.equal(registry.size, 0);
	assert.equal(stage.size, 0);
});

test('재생을 껐다 켜면 신고해 둔 것들이 그대로 다시 그려진다', () => {
	const registry = new Registry();
	const tool = fake();
	registry.add(tool.surface);

	const first = new Stage();
	registry.bindTo(first);
	first.present(frame());

	registry.unbind(); // 재생 끔
	first.present(frame()); // 이제 이 무대엔 아무도 없다
	assert.equal(first.size, 0);

	const second = new Stage(); // 다시 켬 (새 재생기)
	registry.bindTo(second);
	second.present(frame());

	assert.equal(tool.painted.length, 2, '다시 켰을 때 도구가 재신고 없이 그려져야 한다');
	assert.equal(registry.size, 1, '신고 자체는 남아 있어야 한다');
});

test('재생을 끈 사이에 도구를 닫아도 새 재생에 안 딸려 온다', () => {
	const registry = new Registry();
	const tool = fake();
	const close = registry.add(tool.surface);

	const first = new Stage();
	registry.bindTo(first);
	registry.unbind();
	close();

	const second = new Stage();
	registry.bindTo(second);
	second.present(frame());

	assert.equal(tool.painted.length, 0);
	assert.equal(second.size, 0);
});

test('같은 무대에 두 번 붙여도 두 번 그려지지 않는다', () => {
	const registry = new Registry();
	const tool = fake();
	registry.add(tool.surface);

	const stage = new Stage();
	registry.bindTo(stage);
	registry.bindTo(stage);
	stage.present(frame());

	assert.equal(tool.painted.length, 1);
	assert.equal(stage.size, 1);
});

test('아무도 신고 안 했어도 붙이고 떼는 게 터지지 않는다', () => {
	const registry = new Registry();
	const stage = new Stage();
	assert.doesNotThrow(() => {
		registry.bindTo(stage);
		registry.unbind();
	});
	assert.equal(registry.size, 0);
});
