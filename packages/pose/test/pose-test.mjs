/**
 * KarmoPose 의 **순수 셈**을 카메라 없이 잰다.
 *
 * 재는 것: 손 → 판 셈, 문턱 둘(히스테리시스), 떨림 누르개, 소스 합치기.
 * **심는 대조군**도 같이 둔다. 일부러 어긋내면 빨개져야 한다(안 빨개지면 이 시험이 헛돈다).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handToFrame, INDEX_TIP, THUMB_TIP, INDEX_MCP, PINKY_MCP } from '../src/hand.mjs';
import { createGestures, makeSmoother, lowpass } from '../src/gesture.mjs';
import { mergeSources, emptyFrame } from '../src/source.mjs';

/** 손 21점을 짓는다. 엄지, 검지 사이만 바꿔 가며 쥠을 흉내 낸다. */
function hand({ pinch = 0.9, tip = [0.5, 0.5], span = 0.2 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  pts[INDEX_TIP] = { x: tip[0], y: tip[1], z: 0 };
  pts[THUMB_TIP] = { x: tip[0] + pinch * span, y: tip[1], z: 0 };
  pts[INDEX_MCP] = { x: 0.4, y: 0.7, z: 0 };
  pts[PINKY_MCP] = { x: 0.4 + span, y: 0.7, z: 0 };
  return pts;
}

test('손 → 판: 벌리면 쥠 0, 붙이면 쥠 1', () => {
  const open = handToFrame(hand({ pinch: 1.2 }));
  const shut = handToFrame(hand({ pinch: 0.05 }));
  assert.equal(open.ok, true);
  assert.equal(open.grip, 0, '활짝 벌렸는데 쥐었다고 한다');
  assert.equal(shut.grip, 1, '붙였는데 안 쥐었다고 한다');
});

test('손 → 판: 손이 멀어져도 같은 쥠으로 읽는다 (손 크기로 나눈다)', () => {
  const near = handToFrame(hand({ pinch: 0.5, span: 0.3 }));
  const far = handToFrame(hand({ pinch: 0.5, span: 0.1 }));
  assert.ok(Math.abs(near.grip - far.grip) < 1e-9, '거리에 따라 쥠이 달라진다');
});

test('손 → 판: 거울로 뒤집는다 (안 뒤집으면 손과 점이 반대로 간다)', () => {
  const f = handToFrame(hand({ tip: [0.8, 0.3] }));
  assert.ok(Math.abs(f.point[0] - 0.2) < 1e-9);
  assert.ok(Math.abs(f.point[1] - 0.3) < 1e-9, 'y 는 안 뒤집는다');
  const noMirror = handToFrame(hand({ tip: [0.8, 0.3] }), { mirror: false });
  assert.ok(Math.abs(noMirror.point[0] - 0.8) < 1e-9);
});

test('손 → 판: 점이 모자라면 못 봤다고 한다', () => {
  assert.equal(handToFrame(null).ok, false);
  assert.equal(handToFrame([{ x: 0, y: 0 }]).ok, false);
});

test('문턱 둘. 그 사이에서 흔들려도 쥠이 안 떨린다', () => {
  const g = createGestures({ grabOn: 0.7, grabOff: 0.45, smooth: false, size: () => [100, 100] });
  let grabs = 0; let releases = 0;
  g.on('grab', () => { grabs += 1; });
  g.on('release', () => { releases += 1; });
  const push = (grip) => g.push({ t: 0, ok: true, kind: 'hand', point: [0.5, 0.5], depth: 0.5, grip, buttons: 0 });
  push(0.2);
  push(0.75);                       // 쥠
  for (const v of [0.6, 0.55, 0.5, 0.6, 0.65]) push(v);   // 문턱 사이에서 흔들림
  assert.equal(grabs, 1, `쥠이 ${grabs}번 났다. 한 번이어야 한다`);
  assert.equal(releases, 0, '문턱 사이인데 놓았다고 한다');
  push(0.3);
  assert.equal(releases, 1);
});

test('문턱 하나로 재면 떨린다. 심는 대조군(이 시험이 진짜 무는지)', () => {
  const g = createGestures({ grabOn: 0.5, grabOff: 0.5, smooth: false, size: () => [100, 100] });
  let n = 0;
  g.on('grab', () => { n += 1; });
  const push = (grip) => g.push({ t: 0, ok: true, kind: 'hand', point: [0.5, 0.5], depth: 0.5, grip, buttons: 0 });
  for (const v of [0.2, 0.6, 0.4, 0.6, 0.4, 0.6]) push(v);
  assert.ok(n >= 3, `문턱이 하나면 쥠이 여러 번 나야 하는데 ${n} 번이다. 시험이 헛돈다`);
});

test('끌기. 쥔 동안에만, 화소로 낸다', () => {
  const g = createGestures({ smooth: false, size: () => [200, 100] });
  const moves = [];
  g.on('drag', (dx, dy) => moves.push([dx, dy]));
  const push = (x, y, grip) => g.push({ t: 0, ok: true, kind: 'pointer', point: [x, y], depth: 0.5, grip, buttons: 0 });
  push(0.5, 0.5, 0);
  push(0.6, 0.5, 0);              // 안 쥔 채 움직임. 안 센다
  assert.equal(moves.length, 0);
  push(0.6, 0.5, 1);              // 쥠
  push(0.7, 0.6, 1);              // 끌기
  assert.equal(moves.length, 1);
  assert.ok(Math.abs(moves[0][0] - 20) < 1e-6, `가로 ${moves[0][0]}. 화면 200 의 0.1 이면 20 이어야 한다`);
  assert.ok(Math.abs(moves[0][1] - 10) < 1e-6);
});

test('손을 놓치면 쥠도 풀린다 (안 풀면 화면이 붙잡힌 채 남는다)', () => {
  const g = createGestures({ smooth: false, size: () => [100, 100] });
  let released = 0;
  g.on('release', () => { released += 1; });
  g.push({ t: 0, ok: true, kind: 'hand', point: [0.5, 0.5], depth: 0.5, grip: 1, buttons: 0 });
  g.push({ t: 1, ok: false, kind: 'hand', point: null, depth: 0.5, grip: 0, buttons: 0 });
  assert.equal(released, 1);
});

test('떨림 누르개. 잔떨림은 누르고, 큰 움직임은 안 붙잡는다', () => {
  /* ★ 이 누르개의 계약은 무조건 느리게가 아니라 **속도에 따라 다르게** 다:
     느리게 움직일 땐 세게 눌러 조용하게, 빠르게 움직일 땐 풀어서 따라간다.
     한 계수로 고정하면 조용하지만 굼뜬 조작이 된다(1€ 필터가 푼 문제). */
  const jitter = makeSmoother({ minCut: 0.3, beta: 6, dt: 1 / 60 });
  jitter(0.500);
  const small = jitter(0.510);          // 한 판에 0.01 = 손 떨림 폭
  assert.ok(Math.abs(small - 0.5) < 0.005,
    `잔떨림이 ${(small - 0.5).toFixed(4)} 만큼 그대로 샜다. 눌러 주는 게 없다`);

  const fast = makeSmoother({ minCut: 0.3, beta: 6, dt: 1 / 60 });
  fast(0);
  const big = fast(1);                  // 한 판에 1.0 = 크게 휘두름
  assert.ok(big > 0.9, `큰 움직임을 ${big} 로 붙잡았다. 조작이 굼떠진다`);

  let v = 0;
  for (let i = 0; i < 200; i += 1) v = jitter(1);
  assert.ok(Math.abs(v - 1) < 0.02, `오래 두면 목표에 닿아야 하는데 ${v} 다`);
});

test('lowpass. 처음 값은 그대로 받는다', () => {
  assert.equal(lowpass(null, 5, 0.1), 5);
  assert.equal(lowpass(0, 10, 0.5), 5);
});

test('소스 합치기. 먼저 말한 쪽이 주인, 조용하면 넘어간다', () => {
  const mk = (kind) => {
    const set = new Set();
    return { kind, onFrame: (fn) => (set.add(fn), () => set.delete(fn)), emit: (f) => set.forEach((fn) => fn(f)), start() {}, stop() {} };
  };
  const a = mk('hand'); const b = mk('pointer');
  const m = mergeSources([a, b], { idleMs: 500 }).start();
  const seen = [];
  m.onFrame((f) => seen.push(f.kind));
  a.emit({ ...emptyFrame('hand', 0), ok: true, point: [0, 0] });
  b.emit({ ...emptyFrame('pointer', 10), ok: true, point: [0, 0] });   // 주인이 아직 손이라 흘린다
  assert.deepEqual(seen, ['hand']);
  b.emit({ ...emptyFrame('pointer', 1000), ok: true, point: [0, 0] }); // 손이 조용한 지 오래 → 넘어간다
  assert.deepEqual(seen, ['hand', 'pointer']);
});

test('소스를 나중에 더할 수 있다. 손은 켤 때 붙는다', () => {
  const mk = (kind) => {
    const set = new Set();
    let started = false;
    return {
      kind,
      get started() { return started; },
      onFrame: (fn) => (set.add(fn), () => set.delete(fn)),
      emit: (f) => set.forEach((fn) => fn(f)),
      start() { started = true; },
      stop() { started = false; },
    };
  };
  const mouse = mk('pointer');
  const m = mergeSources([mouse]).start();
  const seen = [];
  m.onFrame((f) => seen.push(f.kind));
  const hand = mk('hand');
  m.add(hand);
  assert.equal(hand.started, true, '더한 소스를 안 켰다');
  assert.equal(m.sources.length, 2);
  hand.emit({ ...emptyFrame('hand', 5000), ok: true, point: [0, 0] });
  assert.deepEqual(seen, ['hand'], '더한 소스의 말이 안 들어온다');
  m.stop();
  assert.equal(hand.started, false, '멈출 때 더한 소스를 안 껐다');
});
