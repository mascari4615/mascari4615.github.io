/**
 * TASK-KL-153 — 바깥에서 길어 온 표 시험.
 *
 * 바깥은 **우리 것이 아니다.** 그래서 「잘 오면 되나」보다 「이상하게 오면 어떻게 되나」를
 * 먼저 묻는다: 빈 이름 · 겹치는 이름 · 표본 세 개짜리 평점 · 죽은 응답 · 동시에 열 명.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SteamPackStore,
  toPack,
  ownersFloor,
  likeRatio,
  priceUsd,
  headerImage,
  isSteamSourceId,
} from './karmolab-steam';

const row = (over: Record<string, unknown> = {}) => ({
  appid: 570,
  name: 'Dota 2',
  developer: 'Valve',
  positive: 2_000_000,
  negative: 400_000,
  owners: '100,000,000 .. 200,000,000',
  price: '0',
  ccu: 500_000,
  ...over,
});

/** 항목 넷은 넘어야 놀이가 된다 — 캐시 규칙을 건드리지 않는 최소 표. */
const enough = () => ({
  a: row({ appid: 1, name: 'A' }),
  b: row({ appid: 2, name: 'B' }),
  c: row({ appid: 3, name: 'C' }),
  d: row({ appid: 4, name: 'D' }),
});

describe('숫자 읽기', () => {
  it('보유자는 구간의 하한을 쓴다 — 가운데 값은 우리가 만들어 낸 숫자다', () => {
    expect(ownersFloor('100,000,000 .. 200,000,000')).toBe(100_000_000);
    expect(ownersFloor('0 .. 20,000')).toBe(0);
    expect(ownersFloor(undefined)).toBeNull();
    expect(ownersFloor('알 수 없음')).toBeNull();
  });

  it('표본이 적으면 평점을 아예 안 적는다 — 3개 만점이 1등이 되면 안 된다', () => {
    expect(likeRatio(3, 0)).toBeNull();
    expect(likeRatio(90, 10)).toBe(90);
    expect(likeRatio(2_000_000, 400_000)).toBe(83.3);
  });

  it('가격은 미국 센트를 담은 글자다', () => {
    expect(priceUsd('1999')).toBe(19.99);
    expect(priceUsd('0')).toBe(0);
    expect(priceUsd('')).toBeNull();
    expect(priceUsd(undefined)).toBeNull();
  });

  it('우물 id 는 아는 것만 통과한다', () => {
    expect(isSteamSourceId('hot')).toBe(true);
    expect(isSteamSourceId('constructor')).toBe(false); // 물려받은 칸으로 뚫리면 안 된다
    expect(isSteamSourceId(7)).toBe(false);
  });
});

describe('표 만들기', () => {
  it('그림은 appid 로 만든다 — 표에 그림이 있고 없고가 재미를 가른다', () => {
    const pack = toPack('hot', { '570': row() });
    expect(pack.items[0].img).toBe(headerImage(570));
    expect(pack.items[0].name).toBe('Dota 2');
    expect(pack.items[0].ccu).toBe(500_000);
    expect(pack.items[0].owners).toBe(100_000_000);
  });

  it('이름이 없거나 겹치면 뺀다 — 놀이가 두 항목을 못 가른다', () => {
    const pack = toPack('hot', {
      '1': row({ appid: 1, name: 'Dota 2' }),
      '2': row({ appid: 2, name: 'Dota 2' }),
      '3': row({ appid: 3, name: '  ' }),
      '4': row({ appid: 0, name: 'appid 없음' }),
    });
    expect(pack.items.map((i) => i.name)).toEqual(['Dota 2']);
  });

  it('모르는 값은 칸을 비운다 — 0 으로 채우면 「제일 싼 게임」이 거짓이 된다', () => {
    const pack = toPack('hot', { '1': { appid: 1, name: 'X' } });
    const item = pack.items[0];
    expect(item.price).toBeUndefined();
    expect(item.rating).toBeUndefined();
    expect(item.owners).toBeUndefined();
    expect(item.ccu).toBeUndefined();
  });

  it('응답이 표가 아니면 빈 표다 — 던지지 않는다', () => {
    expect(toPack('hot', null).items).toEqual([]);
    expect(toPack('hot', [1, 2, 3]).items).toEqual([]);
    expect(toPack('hot', '<html>죽음</html>').items).toEqual([]);
  });

  it('칸 모양이 브라우저 쪽 표와 같다', () => {
    const pack = toPack('owned', { '1': row() });
    expect(pack.fields.map((f) => f.key)).toEqual(['ccu', 'rating', 'owners', 'price', 'dev']);
    expect(pack.fields.filter((f) => f.kind === 'number')).toHaveLength(4);
    expect(pack.title).toContain('스팀');
  });
});

describe('길어 오기 · 캐시', () => {
  it('여섯 시간 안에는 바깥으로 안 나간다', async () => {
    const fetcher = vi.fn().mockResolvedValue(enough());
    let now = 1_000_000;
    const store = new SteamPackStore(fetcher, () => now, 6 * 3600e3);

    await store.get('hot');
    await store.get('hot');
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 6 * 3600e3 + 1;
    await store.get('hot');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('동시에 열 명이 열어도 바깥으로는 한 번만 나간다', async () => {
    let release: (v: unknown) => void = () => {};
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const store = new SteamPackStore(fetcher, () => 0);
    const all = Promise.all(Array.from({ length: 10 }, () => store.get('hot')));
    release(enough());
    const packs = await all;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(packs.every((p) => p.items.length === 4)).toBe(true);
  });

  it('바깥이 죽으면 지난 표를 준다 — 어제 숫자로 노는 건 문제가 아니다', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(enough()).mockRejectedValue(new Error('steamspy 503'));
    let now = 0;
    const store = new SteamPackStore(fetcher, () => now, 1000);

    const fresh = await store.get('hot');
    expect(fresh.stale).toBe(false);

    now += 5000;
    const stale = await store.get('hot');
    expect(stale.stale).toBe(true);
    expect(stale.items).toHaveLength(4);
  });

  it('한 번도 성공한 적이 없으면 숨기지 않고 던진다', async () => {
    const store = new SteamPackStore(vi.fn().mockRejectedValue(new Error('steamspy 503')), () => 0);
    await expect(store.get('hot')).rejects.toThrow('503');
  });

  it('놀이가 안 되는 표는 캐시에 안 넣는다 — 넣으면 여섯 시간 동안 못 논다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ '1': row({ appid: 1, name: 'A' }) }) // 항목 1개
      .mockResolvedValue(enough());
    const store = new SteamPackStore(fetcher, () => 0);

    await expect(store.get('hot')).rejects.toThrow();
    const second = await store.get('hot');
    expect(second.items).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('우물이 다르면 표도 따로 쥔다', async () => {
    const fetcher = vi.fn().mockResolvedValue(enough());
    const store = new SteamPackStore(fetcher, () => 0);
    await store.get('hot');
    await store.get('owned');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.peek('hot')?.title).not.toBe(store.peek('owned')?.title);
    expect(store.peek('forever')).toBeNull();
  });
});
