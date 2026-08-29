import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbors } from '../src/viewer.mjs';

test('앞뒤는 화면에 보이는 차례를 따른다', () => {
    const list = ['a.png', 'b.png', 'c.png'];
    assert.deepEqual(neighbors(list, 'b.png'), { prev: 'a.png', next: 'c.png', at: 1, total: 3 });
    /* 양 끝은 한쪽이 없음. 단추가 안 눌려야 함 */
    assert.equal(neighbors(list, 'a.png').prev, null);
    assert.equal(neighbors(list, 'c.png').next, null);
});

test('목록에 없는 파일이면 양쪽 다 없다', () => {
    /* 파일 주소로 바로 들어와 형제를 아직 못 읽은 순간. 죽지 않고 조용히 비어야 함 */
    const out = neighbors([], 'x.png');
    assert.deepEqual(out, { prev: null, next: null, at: -1, total: 0 });
});
