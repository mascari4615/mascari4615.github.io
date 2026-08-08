/**
 * TASK-KL-153 C — 내 스팀 서재 시험.
 *
 * 여기서 제일 중요한 것은 **말이 맞나**다: 비공개 프로필은 빈 성공으로 오는데, 그걸
 * 「게임이 없다」로 말하면 사람은 자기 계정을 의심한다. 열쇠가 없을 때도 마찬가지 —
 * 「고장」이 아니라 「아직 안 켰다」여야 한다.
 */
import { describe, it, expect, vi } from 'vitest';
import { SteamLibrary, LibraryError, parseSteamInput, hours, toLibraryItems } from './karmolab-steam-library';

const game = (i: number) => ({ appid: i, name: `게임 ${i}`, playtime_forever: 60 * i, playtime_2weeks: i });

describe('사람이 붙여넣는 모든 모양', () => {
  it('숫자 id · 별명 · 주소 전부 받는다', () => {
    expect(parseSteamInput('76561197960287930')).toEqual({ kind: 'id64', value: '76561197960287930' });
    expect(parseSteamInput('https://steamcommunity.com/id/mascari/')).toEqual({ kind: 'vanity', value: 'mascari' });
    expect(parseSteamInput('steamcommunity.com/profiles/76561197960287930')).toEqual({
      kind: 'id64',
      value: '76561197960287930',
    });
    expect(parseSteamInput('  mascari  ')).toEqual({ kind: 'vanity', value: 'mascari' });
  });

  it('주소에 못 싣는 글자는 거른다', () => {
    expect(parseSteamInput('')).toBeNull();
    expect(parseSteamInput('   ')).toBeNull();
    expect(parseSteamInput('내 계정!!')).toBeNull();
  });
});

describe('숫자 옮기기', () => {
  it('분을 시간으로 — 사람은 1200분이 아니라 20시간으로 읽는다', () => {
    expect(hours(1200)).toBe(20);
    expect(hours(90)).toBe(1.5);
    expect(hours(0)).toBeNull();
    expect(hours(undefined)).toBeNull();
  });

  it('안 한 게임은 시간 칸을 비운다 — 0 으로 채우면 「제일 안 한 게임」이 거짓이 된다', () => {
    const items = toLibraryItems([{ appid: 1, name: '산 적 있음', playtime_forever: 0 }]);
    expect(items[0].played).toBeUndefined();
    expect(items[0].img).toContain('/steam/apps/1/header.jpg');
  });

  it('이름 없음·겹침은 뺀다', () => {
    const items = toLibraryItems([game(1), { appid: 2, name: '게임 1' }, { appid: 3, name: '  ' }, game(4)]);
    expect(items.map((i) => i.name)).toEqual(['게임 1', '게임 4']);
  });
});

describe('서재 길어 오기', () => {
  it('열쇠가 없으면 「고장」이 아니라 「아직 안 켰다」', async () => {
    const lib = new SteamLibrary(undefined, vi.fn());
    expect(lib.enabled).toBe(false);
    await expect(lib.pack('mascari')).rejects.toThrow(LibraryError);
    await expect(lib.pack('mascari')).rejects.toMatchObject({ code: 'no_key' });
  });

  it('별명을 숫자 id 로 바꿔서 부른다', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('ResolveVanityURL')) return { response: { success: 1, steamid: '765611979' } };
      expect(url).toContain('steamid=765611979');
      return { response: { games: [game(1), game(2), game(3), game(4)] } };
    });
    const lib = new SteamLibrary('열쇠', fetcher);
    const pack = await lib.pack('https://steamcommunity.com/id/mascari');
    expect(pack.steamId).toBe('765611979');
    expect(pack.items).toHaveLength(4);
    expect(pack.fields.map((f) => f.key)).toEqual(['played', 'recent']);
  });

  it('숫자 id 면 별명 풀이를 건너뛴다 — 안 해도 되는 바깥 호출은 안 한다', async () => {
    const fetcher = vi.fn(async () => ({ response: { games: [game(1), game(2), game(3), game(4)] } }));
    await new SteamLibrary('열쇠', fetcher).pack('76561197960287930');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('없는 별명은 「못 찾았다」', async () => {
    const fetcher = vi.fn(async () => ({ response: { success: 42 } }));
    await expect(new SteamLibrary('열쇠', fetcher).pack('없는사람')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('비공개 프로필은 빈 성공으로 온다 — 「게임이 없다」로 말하지 않는다', async () => {
    const fetcher = vi.fn(async () => ({ response: {} }));
    await expect(new SteamLibrary('열쇠', fetcher).pack('76561197960287930')).rejects.toMatchObject({ code: 'private' });
  });

  it('게임이 넷도 안 되면 놀이가 안 된다고 말한다', async () => {
    const fetcher = vi.fn(async () => ({ response: { games: [game(1), game(2)] } }));
    await expect(new SteamLibrary('열쇠', fetcher).pack('76561197960287930')).rejects.toMatchObject({ code: 'too_few' });
  });
});
