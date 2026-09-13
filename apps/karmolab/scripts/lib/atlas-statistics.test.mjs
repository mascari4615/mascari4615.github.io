import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinateMedian as median, convergenceOf } from './atlas-statistics.mjs';
test('even and odd coordinate samples', () => {
  assert.equal(median([8, 2]), 5); assert.equal(median([8, 2, 5]), 5);
  assert.equal(median([1, 2, 3, 8]), 2.5); assert.throws(() => median([]));
});
test('reflection and translation preserve coordinate median', () => {
  const x = [-10, 1, 4, 9];
  assert.equal(median(x.map((v) => -v)), -median(x));
  assert.equal(median(x.map((v) => v + 17)), median(x) + 17);
});
test('valid nonconvergence remains a negative finding', () => {
  const curve = (gaps) => gaps.map((gap, i) => ({ m: i + 1, gap }));
  assert.equal(convergenceOf(curve([1, 0.7, 0.4])).ok, true);
  assert.equal(convergenceOf(curve([1, 0.7, 0.6])).ok, false);
  const uneven = convergenceOf(curve([1, 0.6, 0.7, 0.4]));
  assert.equal(uneven.valid, true); assert.equal(uneven.ok, false); assert.equal(uneven.monotone, false);
  assert.equal(convergenceOf(curve([0, 0])).valid, false);
});
