import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mleId, naiveId } from './atlas-idim.mjs';
test('finite estimate survives JSON', () => {
  const rows = [[1, 2, 3], [1, 1.5, 4]];
  const r = JSON.parse(JSON.stringify(naiveId(rows, 3)));
  assert.equal(r.naiveState, 'finite'); assert.ok(r.naive > 0);
  assert.ok(r.naive >= mleId(rows, 3)); assert.equal(r.naiveSingular, 0);
});
test('one equidistant neighborhood diverges only the uncorrected mean', () => {
  const rows = [[1, 1, 1], [1, 2, 3]];
  assert.ok(Number.isFinite(mleId(rows, 3)));
  assert.equal(mleId(rows, 3, false), Infinity);
  assert.deepEqual(JSON.parse(JSON.stringify(naiveId(rows, 3))),
    { naive: null, naiveState: 'infinite', naiveSamples: 2, naiveSingular: 1 });
});
test('unavailable input cannot masquerade as infinity', () => {
  assert.equal(naiveId([], 3).naiveState, 'unavailable');
  assert.equal(naiveId([[0, 0, 0]], 3).naiveState, 'unavailable');
});
