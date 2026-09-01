const assert = require('node:assert/strict');
const test = require('node:test');
const {
  flattenOutcome,
  normalizeOutcome,
  outcomeFromScores,
  outcomeKey
} = require('../src');
const common = require('../src');

test('common exports only the shared outcome contract', () => {
  assert.deepEqual(Object.keys(common).sort(), ['flattenOutcome', 'normalizeOutcome', 'outcomeFromScores', 'outcomeKey']);
});

test('scores become shared placements without seat-order tie breaks', () => {
  assert.deepEqual(outcomeFromScores(['a', 'b', 'c', 'd'], [90, 90, 40, 10]), {
    placements: [['a', 'b'], ['c'], ['d']]
  });
});

test('normalization rejects missing, duplicate, and unknown players', () => {
  const roster = ['a', 'b', 'c'];
  assert.deepEqual(normalizeOutcome({ placements: [['b'], ['a', 'c']] }, roster), {
    placements: [['b'], ['a', 'c']]
  });
  assert.equal(normalizeOutcome({ placements: [['a'], ['a'], ['c']] }, roster), null);
  assert.equal(normalizeOutcome({ placements: [['a'], ['b']] }, roster), null);
  assert.equal(normalizeOutcome({ placements: [['a'], ['b'], ['x']] }, roster), null);
});

test('keys ignore player order inside one shared placement', () => {
  assert.equal(outcomeKey({ placements: [['a', 'b'], ['c']] }), outcomeKey({ placements: [['b', 'a'], ['c']] }));
  assert.deepEqual(flattenOutcome({ placements: [['a', 'b'], ['c']] }), ['a', 'b', 'c']);
});
