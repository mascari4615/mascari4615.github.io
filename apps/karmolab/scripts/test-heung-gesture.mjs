import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.resolve('src/widgets/heung/gesture.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${compiled}\n})(module.exports,module);`, { module, console });
const { GestureHost } = module.exports;

/** 리스너 등록/해제를 세는 가짜 대상. */
const makeTarget = (options = {}) => {
  const listeners = new Map();
  return {
    isConnected: options.connected ?? true,
    captured: [],
    setPointerCapture(id) { if (options.captureThrows) throw new Error('detached'); this.captured.push(id); },
    addEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).concat(fn)); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((item) => item !== fn)); },
    count(type) { return (listeners.get(type) || []).length; },
    total() { return [...listeners.values()].reduce((sum, list) => sum + list.length, 0); },
    fire(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); }
  };
};

const log = [];
const win = makeTarget();
const host = new GestureHost(win);

// capture 요소가 있으면 거기에 달고 pointer 를 잡는다
const element = makeTarget();
assert.equal(host.begin({ capture: element, pointerId: 7, move: () => log.push('move-a'), commit: () => log.push('commit-a'), cancel: () => log.push('cancel-a') }), true);
assert.deepEqual(element.captured, [7], 'pointer 를 잡는다');
assert.equal(element.total(), 4, 'move/up/cancel/lost 네 개');
assert.equal(win.total(), 0, 'capture 가 있으면 창에는 안 단다');
assert.equal(host.active, true);

element.fire('pointermove');
assert.deepEqual(log, ['move-a']);
element.fire('pointerup');
assert.deepEqual(log, ['move-a', 'commit-a'], '손을 떼면 commit');
assert.equal(element.total(), 0, '끝나면 리스너가 남지 않는다');
assert.equal(host.active, false);

// 끝난 뒤 늦게 온 이벤트는 아무것도 안 부른다
element.fire('pointermove');
element.fire('pointerup');
assert.deepEqual(log, ['move-a', 'commit-a'], '끝난 끌기는 되살아나지 않는다');

// capture 가 없으면 창에 단다 (요소가 다시 그려져도 안 끊긴다)
log.length = 0;
assert.equal(host.begin({ move: () => log.push('move-b'), cancel: () => log.push('cancel-b') }), true);
assert.equal(win.total(), 4);
win.fire('pointercancel');
assert.deepEqual(log, ['cancel-b'], 'pointercancel 은 취소로 간다');
assert.equal(win.total(), 0);

// 포인터를 뺏겨도 취소
log.length = 0;
host.begin({ capture: element, pointerId: 1, move: () => {}, cancel: () => log.push('lost') });
element.fire('lostpointercapture');
assert.deepEqual(log, ['lost']);

// 새 끌기가 시작되면 앞 끌기는 취소된다 — 예전엔 조용히 잊혔다
log.length = 0;
host.begin({ capture: element, pointerId: 2, move: () => {}, cancel: () => log.push('cancel-first') });
host.begin({ capture: element, pointerId: 3, move: () => {}, cancel: () => log.push('cancel-second') });
assert.deepEqual(log, ['cancel-first'], '앞 끌기가 취소된다');
assert.equal(element.total(), 4, '리스너가 겹쳐 쌓이지 않는다');

// Escape 로 밖에서 취소
assert.equal(host.cancel(), true);
assert.deepEqual(log, ['cancel-first', 'cancel-second']);
assert.equal(host.cancel(), false, '취소할 게 없으면 false');
assert.equal(element.total(), 0);

// 취소는 한 번만 — 취소 뒤 늦게 온 pointerup 은 commit 을 안 부른다
log.length = 0;
host.begin({ capture: element, pointerId: 4, move: () => {}, commit: () => log.push('commit'), cancel: () => log.push('cancel') });
host.cancel();
element.fire('pointerup');
assert.deepEqual(log, ['cancel'], '취소한 끌기는 commit 되지 않는다');

// 화면에서 빠진 요소로는 시작하지 않는다
const detached = makeTarget({ connected: false });
assert.equal(host.begin({ capture: detached, pointerId: 5, move: () => {} }), false);
assert.equal(detached.total(), 0);
assert.equal(host.active, false);

// capture 가 실패해도 리스너를 남기지 않는다
const hostile = makeTarget({ captureThrows: true });
assert.equal(host.begin({ capture: hostile, pointerId: 6, move: () => {} }), false);
assert.equal(hostile.total(), 0);
assert.equal(host.active, false);

// 실패한 시작이 앞 끌기를 되살리지 않는다
log.length = 0;
host.begin({ capture: element, pointerId: 8, move: () => {}, cancel: () => log.push('cancel-live') });
assert.equal(host.begin({ capture: detached, pointerId: 9, move: () => {} }), false);
assert.deepEqual(log, ['cancel-live'], '새 시작이 실패해도 앞 끌기는 이미 정리됐다');
assert.equal(host.active, false);

console.log('[test-heung-gesture] ✓ 한 번에 하나 · 끝맺음 1회 · 취소 경로 4종 · 시작 실패 정리');
