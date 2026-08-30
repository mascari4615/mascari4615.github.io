import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbors, bindDirKeys } from '../src/viewer.mjs';

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

test('폴더 화면 키보드. Ctrl+A 와 Esc', () => {
    const hit = [];
    /* node 에는 DOM 이 없다. 이벤트 자리를 넣어 준다 */
    const bus = new EventTarget();
    const off = bindDirKeys({ onAll: () => hit.push('all'), onEscape: () => hit.push('esc') }, bus);
    const key = (init) => {
        const e = new Event('keydown', { cancelable: true });
        Object.assign(e, init, { preventDefault() {} });
        bus.dispatchEvent(e);
    };
    key({ key: 'a', ctrlKey: true });
    key({ key: 'A', metaKey: true });
    key({ key: 'Escape' });
    key({ key: 'a' });
    assert.deepEqual(hit, ['all', 'all', 'esc']);
    off();
    key({ key: 'Escape' });
    assert.deepEqual(hit, ['all', 'all', 'esc'], '뗀 뒤에는 안 듣는다');
});
