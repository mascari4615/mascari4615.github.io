import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSummary, arrange, arrangeFolders, between } from '../src/browse.mjs';
import { previewKind } from '../src/vault.mjs';

const kindOf = previewKind;
const files = [
    { path: 'a/p10.png', size: 30 },
    { path: 'a/p2.png', size: 10 },
    { path: 'a/clip.mp4', size: 500 },
    { path: 'a/note.txt', size: 5 },
    { path: 'a/pack.zip', size: 900 }
];

test('이름 정렬은 자연 순서', () => {
    /* p2 가 p10 앞. 탐색기와 Finder 가 그렇게 한다 */
    const out = arrange(files, { sort: 'name', kindOf }).map((f) => f.path);
    assert.deepEqual(out.slice(0, 2), ['a/clip.mp4', 'a/note.txt']);
    assert.ok(out.indexOf('a/p2.png') < out.indexOf('a/p10.png'));
});

test('갈래로 거르기', () => {
    const out = arrange(files, { kind: 'video', kindOf });
    assert.deepEqual(out.map((f) => f.path), ['a/clip.mp4']);
});

test('이름으로 찾기는 파일 이름만 본다', () => {
    /* 경로까지 보면 폴더 이름이 걸려 엉뚱한 것이 남는다 */
    const out = arrange(files, { query: 'p1', kindOf });
    assert.deepEqual(out.map((f) => f.path), ['a/p10.png']);
});

test('크기 정렬과 뒤집기', () => {
    const asc = arrange(files, { sort: 'size', kindOf }).map((f) => f.size);
    assert.deepEqual(asc, [5, 10, 30, 500, 900]);
    const desc = arrange(files, { sort: 'size', desc: true, kindOf }).map((f) => f.size);
    assert.deepEqual(desc, [900, 500, 30, 10, 5]);
});

test('폴더도 같은 규칙으로 세운다', () => {
    assert.deepEqual(arrangeFolders(['b10', 'b2', 'a'], {}), ['a', 'b2', 'b10']);
    assert.deepEqual(arrangeFolders(['zip', 'abc'], { query: 'a' }), ['abc']);
});

test('좁힌 상태를 한 줄로 알린다', () => {
    assert.equal(activeSummary({ kind: '', query: '' }, 5, 5), '');
    assert.equal(activeSummary({ kind: 'video', query: '' }, 5, 1), '영상 1 / 5');
    assert.equal(activeSummary({ kind: '', query: ' p1 ' }, 5, 1), '"p1" 1 / 5');
});

test('Shift 로 두 자리 사이를 다 고른다', () => {
    /* 탐색기와 Finder 가 그 방식. 어느 쪽을 먼저 찍었든 같은 묶음 */
    const list = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(between(list, 'b', 'd'), ['b', 'c', 'd']);
    assert.deepEqual(between(list, 'd', 'b'), ['b', 'c', 'd']);
    assert.deepEqual(between(list, 'c', 'c'), ['c']);
    /* 목록에 없는 것이 오면 아무것도 안 고른다. 정렬이 바뀐 뒤 옛 자리가 남을 수 있다 */
    assert.deepEqual(between(list, 'b', '없음'), []);
});
