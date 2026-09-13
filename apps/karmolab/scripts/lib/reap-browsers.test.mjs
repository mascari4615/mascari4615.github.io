import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownedHeadless } from './reap-browsers.mjs';
const node = (pid, parent, created) => ({ pid, parent, created, name: 'node.exe' });
const browser = (pid, parent, created) => ({ pid, parent, created, name: 'chrome-headless-shell.exe' });
test('only the current runner descendants', () => {
  const rows = [node(1, 0, 1), node(2, 0, 1), node(3, 1, 11), browser(4, 3, 12), browser(5, 4, 13), browser(6, 2, 14)];
  assert.deepEqual(ownedHeadless(rows, 1, 10).map((p) => p.pid), [4, 5]);
});
test('unproven orphan, reused PID, old process and visible browser stay alive', () => {
  const rows = [node(1, 0, 1), node(7, 1, 30), browser(4, 7, 20), browser(5, 999, 15),
    browser(6, 1, 8), { ...browser(8, 1, 11), name: 'chrome.exe' }];
  assert.deepEqual(ownedHeadless(rows, 1, 10), []);
});
test('broken ancestor cycles fail closed', () => {
  assert.deepEqual(ownedHeadless([browser(1, 2, 10), node(2, 1, 10)], 99, 1), []);
});
