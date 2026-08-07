/**
 * 액정으로 쓸 것을 스스로 찾는 부분.
 *
 * 여기가 이 시스템에서 제일 자주 틀릴 자리다 — 화면이 개편되면 곧바로 영향을 받는데,
 * 틀려도 오류가 안 나고 그냥 아무것도 안 그린다. 그래서 눈으로 안 보고도 확인되게 순수 함수로
 * 떼어 놨다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTileGroup } from '../dist/surfaces/discover.js';

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

test('도구가 늘면 더 많은 칸을 쓴다 (개편에 저절로 따라온다)', () => {
	const few = pickTileGroup(grid('tools', 6), { viewportArea: VIEW }).length;
	const many = pickTileGroup(grid('tools', 40), { viewportArea: VIEW }).length;
	assert.equal(few, 6);
	assert.equal(many, 40);
});
