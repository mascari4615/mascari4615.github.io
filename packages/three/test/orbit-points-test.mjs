/**
 * 궤도 카메라·점 구름의 **순수 셈**을 화면 없이 잰다.
 *
 * 그리는 부분(WebGL)은 headless 에서 못 돌린다 — 그래서 **셈과 그리기를 갈라 놨다**.
 * 여기서 재는 것: 자리 셈이 맞나 · 한계가 지켜지나 · 관성이 목표로 가나 · 묶은 배열이 맞나.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbitPosition, createOrbit, clamp, HALF_PI } from '../src/orbit.mjs';
import { packPoints, rgb255 } from '../src/points.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b} 이어야 한다`);

test('궤도 자리 — 방위 0·높이 0 이면 +z 쪽에 선다', () => {
  const [x, y, z] = orbitPosition([0, 0, 0], 5, 0, 0);
  near(x, 0); near(y, 0); near(z, 5);
});

test('궤도 자리 — 가운데에서 늘 같은 거리다', () => {
  for (const [yaw, pitch] of [[0.3, 0.2], [2.1, -1.0], [-4, 1.2]]) {
    const p = orbitPosition([1, 2, 3], 7, yaw, pitch);
    const d = Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3);
    near(d, 7, 1e-9);
  }
});

test('높이는 한계를 안 넘는다 — 꼭짓점에서 방위가 뒤집히면 손맛이 무너진다', () => {
  const o = createOrbit({ damping: 0 });
  o.rotate(0, 100000);
  assert.ok(o.state.want.pitch <= HALF_PI, '위 한계를 넘었다');
  o.rotate(0, -200000);
  assert.ok(o.state.want.pitch >= -HALF_PI, '아래 한계를 넘었다');
});

test('당기기는 한계 안에 머문다', () => {
  const o = createOrbit({ distance: 3, minDistance: 1, maxDistance: 10 });
  for (let i = 0; i < 200; i += 1) o.zoom(1000);
  assert.ok(o.state.want.distance <= 10);
  for (let i = 0; i < 400; i += 1) o.zoom(-1000);
  assert.ok(o.state.want.distance >= 1);
});

test('관성은 목표로 다가간다 — 그리고 넘어가지 않는다', () => {
  const o = createOrbit({ yaw: 0, damping: 0.1 });
  o.rotate(-100, 0);                       // yaw 를 + 쪽으로
  const goal = o.state.want.yaw;
  let prev = o.state.yaw;
  for (let i = 0; i < 60; i += 1) {
    o.update(1 / 60);
    const cur = o.state.yaw;
    assert.ok(cur >= prev - 1e-12, '되돌아가면 안 된다');
    assert.ok(cur <= goal + 1e-12, '목표를 넘어가면 안 된다');
    prev = cur;
  }
  assert.ok(Math.abs(goal - prev) < Math.abs(goal) * 0.05, '1초 뒤엔 목표에 거의 닿아야 한다');
});

test('관성 0 이면 set 은 즉시 박힌다', () => {
  const o = createOrbit({ damping: 0 });
  o.set({ yaw: 1.25, distance: 2 });
  near(o.state.yaw, 1.25);
  near(o.state.distance, 2);
});

test('clamp — 한계 밖 값을 안으로', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('점 묶기 — 자리·색·크기가 순서대로 들어간다', () => {
  const p = packPoints([
    { xyz: [1, 2, 3], rgb: [1, 0, 0], size: 4 },
    { xyz: [-1, 0, 0.5], rgb: [0, 1, 0] },
  ], { size: 2 });
  assert.equal(p.count, 2);
  assert.deepEqual([...p.positions], [1, 2, 3, -1, 0, 0.5]);
  assert.deepEqual([...p.colors], [1, 0, 0, 0, 1, 0]);
  assert.deepEqual([...p.sizes], [4, 2]);   // 안 적은 것은 기본 크기
});

test('점 묶기 — 빈 목록도 죽지 않는다', () => {
  const p = packPoints([]);
  assert.equal(p.count, 0);
  assert.equal(p.positions.length, 0);
});

test('rgb255 — 0~255 를 0~1 로', () => {
  assert.deepEqual(rgb255(255, 0, 51), [1, 0, 0.2]);
});
