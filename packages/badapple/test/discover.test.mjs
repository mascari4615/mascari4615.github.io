/**
 * 액정으로 쓸 것을 스스로 찾는 부분.
 *
 * 여기가 이 시스템에서 제일 자주 틀릴 자리다 — 화면이 개편되면 곧바로 영향을 받는데,
 * 틀려도 오류가 안 나고 그냥 아무것도 안 그린다. 그래서 눈으로 안 보고도 확인되게 순수 함수로
 * 떼어 놨다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTileGroup, pickTileGroups, subdivisionFor } from '../dist/surfaces/discover.js';

const VIEW = 1280 * 800;

/** 한 부모 밑에 고만고만한 칸 여럿. */
function grid(group, count, width = 168, height = 120) {
	const out = [];
	for (let i = 0; i < count; i++) {
		out.push({ group, rect: { x: (i % 6) * width, y: Math.floor(i / 6) * height, width, height } });
	}
	return out;
}

test('한 부모 밑의 고른 칸 무리를 고른다', () => {
	const picked = pickTileGroup([...grid('tools', 12), ...grid('sidebar', 5, 200, 40)], { viewportArea: VIEW });
	assert.equal(picked.length, 12);
	assert.equal(picked[0].group, 'tools');
});

test('화면을 통째로 덮는 껍데기는 안 고른다', () => {
	const shell = [{ group: 'body', rect: { x: 0, y: 0, width: 1280, height: 800 } }];
	const picked = pickTileGroup([...shell, ...grid('tools', 8)], { viewportArea: VIEW });
	assert.equal(picked.length, 8);
	assert.equal(picked[0].group, 'tools');
});

test('글자 쪼가리처럼 작은 것은 안 고른다', () => {
	const crumbs = [];
	for (let i = 0; i < 200; i++) crumbs.push({ group: 'text', rect: { x: i, y: 0, width: 8, height: 12 } });
	const picked = pickTileGroup([...crumbs, ...grid('tools', 6)], { viewportArea: VIEW });
	assert.equal(picked[0].group, 'tools');
});

test('크기가 들쭉날쭉한 무리보다 고른 무리를 고른다', () => {
	const ragged = [
		{ group: 'ragged', rect: { x: 0, y: 0, width: 300, height: 300 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 40, height: 40 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 250, height: 60 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 60, height: 250 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 30, height: 200 } }
	];
	const picked = pickTileGroup([...ragged, ...grid('tools', 5)], { viewportArea: VIEW });
	assert.equal(picked[0].group, 'tools');
});

test('몇 개 안 되면 격자로 안 친다', () => {
	assert.equal(pickTileGroup(grid('tools', 3), { viewportArea: VIEW }).length, 0);
});

test('아무것도 없으면 빈 손으로 돌아온다 — 터지지 않는다', () => {
	assert.deepEqual(pickTileGroup([], { viewportArea: VIEW }), []);
});

test('칸이 적으면 잘게, 많으면 성글게 쪼갠다 — 해상도가 비슷하게 남는다', () => {
	// 첫 화면처럼 큰 버튼 몇 개뿐일 때와 도구 목록처럼 빽빽할 때.
	const sparse = subdivisionFor(3, 2);
	const dense = subdivisionFor(24, 16);

	assert.ok(sparse.cols > dense.cols, `적을수록 잘게 쪼개야 한다 (${sparse.cols} vs ${dense.cols})`);

	// 둘 다 전체 해상도가 비슷한 자리에 떨어져야 한다 — 한쪽만 뭉개지면 실패다.
	const sparseTotal = 3 * sparse.cols;
	const denseTotal = 24 * dense.cols;
	assert.ok(sparseTotal >= 40 && sparseTotal <= 80, `적은 쪽 해상도가 벗어났다 (${sparseTotal})`);
	assert.ok(denseTotal >= 40 && denseTotal <= 80, `많은 쪽 해상도가 벗어났다 (${denseTotal})`);
});

test('칸이 아주 많아도 쪼갬이 1 밑으로 안 내려간다', () => {
	const huge = subdivisionFor(500, 400);
	assert.ok(huge.cols >= 1 && huge.rows >= 1);
});

test('칸이 하나뿐이어도 터지지 않는다', () => {
	const single = subdivisionFor(0, 0);
	assert.ok(single.cols >= 1 && single.rows >= 1);
	assert.ok(single.cols <= 24, '쓸데없이 잘게 쪼개지 않는다');
});

test('도구가 늘면 더 많은 칸을 쓴다 (개편에 저절로 따라온다)', () => {
	const few = pickTileGroup(grid('tools', 6), { viewportArea: VIEW }).length;
	const many = pickTileGroup(grid('tools', 40), { viewportArea: VIEW }).length;
	assert.equal(few, 6);
	assert.equal(many, 40);
});

test('여러 무리를 합쳐 화면을 넓게 쓴다', () => {
	// 첫 화면 큰 버튼 5개 + 머리줄 항목 8개. 하나만 고르면 화면 구석만 켜진다.
	const cards = grid('cards', 5, 200, 120);
	const nav = grid('nav', 8, 90, 40);
	const merged = pickTileGroups([...cards, ...nav], { viewportArea: VIEW });

	const owners = new Set(merged.map((item) => item.group));
	assert.ok(owners.has('cards') && owners.has('nav'), '두 무리가 다 들어와야 한다');
	assert.equal(merged.length, 13);
});

test('합칠 때도 껍데기와 글자 쪼가리는 안 들어온다', () => {
	const shell = [{ group: 'body', rect: { x: 0, y: 0, width: 1280, height: 800 } }];
	const crumbs = [];
	for (let i = 0; i < 40; i++) crumbs.push({ group: 'text', rect: { x: i, y: 0, width: 8, height: 12 } });
	const merged = pickTileGroups([...shell, ...crumbs, ...grid('cards', 6)], { viewportArea: VIEW });

	const owners = new Set(merged.map((item) => item.group));
	assert.deepEqual([...owners], ['cards']);
});

test('점수가 크게 낮은 뭉치는 안 받는다', () => {
	// 크기가 제각각인 뭉치 — 끼면 그림이 지저분해진다.
	const ragged = [
		{ group: 'ragged', rect: { x: 0, y: 0, width: 400, height: 300 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 30, height: 30 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 300, height: 40 } },
		{ group: 'ragged', rect: { x: 0, y: 0, width: 35, height: 260 } }
	];
	const merged = pickTileGroups([...ragged, ...grid('cards', 10)], { viewportArea: VIEW, keepRatio: 0.6 });
	assert.deepEqual([...new Set(merged.map((i) => i.group))], ['cards']);
});

test('쓸 만한 무리가 하나도 없으면 빈 손', () => {
	assert.deepEqual(pickTileGroups([], { viewportArea: VIEW }), []);
});
