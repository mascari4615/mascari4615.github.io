/**
 * team-thread 행동 테스트 (KAR-018-A slice-6).
 * tracer-bullet: public 인터페이스 행동 검증(구현 X), spy 로 위임 확인.
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnRoom, inviteCore, dissolveRoom } from './team-thread';
import type { CharacterService } from '../services/character-service';

describe('spawnRoom — 스레드 생성 + 코어 바인딩', () => {
  it('스레드를 만들고 그 id 에 코어를 바인딩한 뒤 방 정보를 반환한다', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 't1',
      name: '작업방-x',
      url: 'https://discord.com/channels/g/t1',
    });
    const parent = { threads: { create } } as never;
    const setChannelCore = vi.fn();
    const cs = { setChannelCore } as unknown as CharacterService;

    const room = await spawnRoom(parent, '작업방-x', 'atlas', cs);

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.name).toBe('작업방-x');
    expect(arg.autoArchiveDuration).toBe(1440);
    expect(setChannelCore).toHaveBeenCalledWith('t1', 'atlas');
    expect(room).toEqual({
      threadId: 't1',
      name: '작업방-x',
      url: 'https://discord.com/channels/g/t1',
    });
  });
});

describe('inviteCore — 방에 코어 배치', () => {
  it('스레드 id 에 코어를 setChannelCore 위임 (스킨 보존 시맨틱)', () => {
    const setChannelCore = vi.fn();
    const cs = { setChannelCore } as unknown as CharacterService;
    inviteCore('t2', 'kafu', cs);
    expect(setChannelCore).toHaveBeenCalledWith('t2', 'kafu');
  });
});

describe('dissolveRoom — 해체 = 바인딩 제거 + 아카이브', () => {
  it('resetChannel 로 .active.json 엔트리 제거 후 스레드를 아카이브한다', async () => {
    const resetChannel = vi.fn();
    const cs = { resetChannel } as unknown as CharacterService;
    const setArchived = vi.fn().mockResolvedValue(undefined);
    const thread = { id: 't3', setArchived } as never;

    await dissolveRoom(thread, cs);

    expect(resetChannel).toHaveBeenCalledWith('t3');
    expect(setArchived).toHaveBeenCalledWith(true, expect.any(String));
  });

  it('아카이브 전에 바인딩을 먼저 제거한다 (순서 = 팀방 즉시 해제)', async () => {
    const order: string[] = [];
    const cs = {
      resetChannel: vi.fn(() => order.push('reset')),
    } as unknown as CharacterService;
    const thread = {
      id: 't4',
      setArchived: vi.fn(async () => {
        order.push('archive');
      }),
    } as never;

    await dissolveRoom(thread, cs);
    expect(order).toEqual(['reset', 'archive']);
  });
});
