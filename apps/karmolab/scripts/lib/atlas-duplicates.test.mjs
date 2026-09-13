import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, compareFingerprints, findDuplicates, normalizeDuplicateBody } from './atlas-duplicates.mjs';

const passage = (prefix, n = 120) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
const matches = (a, b) => compareFingerprints(fingerprint(a), fingerprint(b)).match;
const alpha = passage('alpha');
const beta = passage('beta');

test('body deletion control excludes frontmatter before flattening whitespace', () => {
  const document = '---\ntitle: ' + passage('metadata', 80) + '\n---\n' + alpha;
  const body = normalizeDuplicateBody(document);
  assert.equal(body, alpha);
  const words = body.split(/\s+/);
  const copy = words.filter((_, i) => i < 48 || i >= 60).join(' ');
  assert.ok(matches(document, copy));
  const broken = document.split(/\s+/).filter((_, i) => i < 80 || i >= 100).join(' ');
  assert.equal(matches(document, broken), false);
});
test('identical body and whitespace or frontmatter edits', () => {
  assert.ok(matches(alpha, alpha));
  assert.ok(matches(alpha, '---\r\ntitle: changed\r\n---\r\n' + alpha.replaceAll(' ', '\r\n  ')));
});
test('small edits, deletions, insertions and reordered paragraphs', () => {
  assert.ok(matches(alpha, alpha.split(' ').filter((_, i) => i < 40 || i >= 46).join(' ')));
  assert.ok(matches(alpha, alpha.replace('alpha42', 'revised description')));
  assert.ok(matches(alpha, alpha + ' newly added closing sentence'));
  const paragraphs = [alpha, beta, passage('gamma')];
  assert.ok(matches(paragraphs.join('\n'), paragraphs.reverse().join('\n')));
});
test('same heading or topic, shared template and different long tails', () => {
  assert.equal(matches('shared heading ' + alpha, 'shared heading ' + beta), false);
  const boilerplate = passage('common', 30);
  assert.equal(matches(boilerplate + alpha, boilerplate + beta), false);
  const prefix = passage('introduction', 200);
  assert.ok(prefix.length > 1800);
  assert.equal(matches(prefix + alpha, prefix + beta), false);
});
test('short bodies, punctuation, repeated text and empty input', () => {
  const link = 'A useful page at https://example.test/reference/first';
  assert.ok(matches(link, link));
  assert.equal(matches(link, link.replace('first', 'second')), false);
  assert.equal(matches('Language notes about C++ for a class', 'Language notes about C# for a class'), false);
  assert.equal(matches('', ''), false);
  assert.equal(matches('again '.repeat(150), 'again '.repeat(150)), false);
});
test('no transitive chains and deterministic representative across input order', () => {
  const words = passage('section', 100).split(' ');
  const docs = [
    { id: 'a', text: words.slice(0, 90).join(' ') },
    { id: 'b', text: words.join(' ') },
    { id: 'c', text: words.slice(10).join(' ') + ' appended tail' },
  ];
  assert.ok(matches(docs[0].text, docs[1].text));
  assert.ok(matches(docs[1].text, docs[2].text));
  assert.equal(matches(docs[0].text, docs[2].text), false);
  const result = findDuplicates(docs);
  assert.equal(result.stat.marked, 1);
  assert.deepEqual(findDuplicates(docs.toReversed()).groups, result.groups);
  for (const ids of result.groups) for (const a of ids) for (const b of ids) {
    assert.ok(matches(docs.find((d) => d.id === a).text, docs.find((d) => d.id === b).text));
  }
});
test('collection compares the full body and supports replacement data', () => {
  const shared = 'same embedding summary';
  const docs = [{ id: 'first', text: shared, duplicateText: alpha },
    { id: 'second', text: shared, duplicateText: beta },
    { id: 'copy', text: 'renamed summary', duplicateText: alpha }];
  const result = findDuplicates(docs);
  assert.equal(result.stat.marked, 1);
  assert.deepEqual(result.groups, [['copy', 'first']]);
  assert.equal(findDuplicates([]).stat.marked, 0);
});
