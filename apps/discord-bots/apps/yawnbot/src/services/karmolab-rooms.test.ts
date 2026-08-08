/**
 * 같이 쓰기 — 방 (TASK-KL-180).
 *
 * 여기가 틀리면 **유령 커서가 남거나 남의 커서가 안 사라진다** — 화면에는 아무 오류도 안 뜨고
 * 「누가 계속 있는 것처럼」 보인다. 그래서 나감·조용함·좌표 자르기를 눈으로 박는다.
 */
import { describe, it, expect } from 'vitest';
import { KarmolabRoomStore, IDLE_MS, MAX_TABS_PER_VISITOR, colorFor } from './karmolab-rooms';

const who = (id: string, name = id) => ({ id, name, handle: null });

describe('방 (KL-180)', () => {
  it('들어오면 남들에게 알리고, 나가면 사라진다', () => {
    const rooms = new KarmolabRoomStore();
    const seen: string[] = [];
    rooms.subscribe('pet', (event) => seen.push(`${event.type}`));

    rooms.join('pet', who('a'));
    rooms.join('pet', who('b'));
    expect(rooms.members('pet').map((m) => m.id).sort()).toEqual(['a', 'b']);

    rooms.leave('pet', 'a');
    expect(rooms.members('pet').map((m) => m.id)).toEqual(['b']);
    expect(seen).toEqual(['join', 'join', 'leave']);
  });

  it('같은 창이 다시 들어와도 커서가 둘이 되지 않는다 (새로고침)', () => {
    const rooms = new KarmolabRoomStore();
    rooms.join('pet', who('a', '카르모'));
    rooms.join('pet', who('a', '카르모2'));
    const members = rooms.members('pet');
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe('카르모2');
  });

  it('조용하면 나간 것으로 본다 — 창을 닫을 때 인사 안 하는 브라우저가 있다', () => {
    const rooms = new KarmolabRoomStore();
    const t0 = Date.now();
    rooms.join('pet', who('a'), t0);
    rooms.join('pet', who('b'), t0);
    rooms.move('pet', 'b', 0.5, 0.5, true, t0 + IDLE_MS);

    const later = t0 + IDLE_MS + 1;
    expect(rooms.members('pet', later).map((m) => m.id)).toEqual(['b']);
  });

  it('좌표는 0~1 로 자른다 — 이상한 값이 남의 화면에서 커서를 날려 버리지 않게', () => {
    const rooms = new KarmolabRoomStore();
    rooms.join('pet', who('a'));
    rooms.move('pet', 'a', 5, -3, true);
    const me = rooms.members('pet')[0];
    expect(me.x).toBe(1);
    expect(me.y).toBe(0);
  });

  it('안 들어온 창의 좌표는 버린다', () => {
    const rooms = new KarmolabRoomStore();
    expect(rooms.move('pet', 'ghost', 0.1, 0.1, true)).toBe(false);
  });

  it('방 인원엔 상한이 없다 (사용자 요구) — 한 사람의 창 수만 막는다', () => {
    const rooms = new KarmolabRoomStore();
    for (let i = 0; i < 50; i += 1) rooms.join('pet', { id: `v${i}:tab`, name: `n${i}`, handle: null, visitorKey: `v${i}` });
    expect(rooms.members('pet')).toHaveLength(50);

    for (let i = 0; i < MAX_TABS_PER_VISITOR; i += 1) {
      expect(rooms.join('pet', { id: `spam:t${i}`, name: 's', handle: null, visitorKey: 'spam' })).not.toBeNull();
    }
    expect(rooms.join('pet', { id: 'spam:over', name: 's', handle: null, visitorKey: 'spam' })).toBeNull();
  });

  it('색은 이름에서 나온다 — 같은 사람은 어느 방에서든 같은 색', () => {
    expect(colorFor('karmo')).toBe(colorFor('karmo'));
    expect(colorFor('karmo')).not.toBe(colorFor('ring'));
  });

  it('아무도 없고 아무도 안 보면 방 자체가 사라진다 (메모리에만 산다)', () => {
    const rooms = new KarmolabRoomStore();
    rooms.join('pet', who('a'));
    rooms.leave('pet', 'a');
    expect(rooms.snapshot()).toEqual([]);
  });
});
