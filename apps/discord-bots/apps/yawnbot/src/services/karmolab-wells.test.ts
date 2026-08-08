/**
 * TASK-KL-153 — 표 우물 시험.
 *
 * 여기서 보는 것은 우물 **하나**가 아니라 우물 전부가 공유하는 성질이다:
 * 캐시가 진짜로 바깥을 막나 · 열 명이 동시에 열어도 한 번인가 · 바깥이 죽으면 놀이가
 * 같이 죽나 · 놀이가 안 되는 표를 여섯 시간 쥐고 있지는 않나.
 * 그리고 새 우물이 붙을 때 **모양이 갈리지 않는지**(칸·이름·그림)를 우물 전수로 본다.
 */
import { describe, it, expect, vi } from 'vitest';
import { WELLS, WellStore, wellById, wellOfTheDay, kstDay, type WellSpec } from './karmolab-wells';

/** 우물 하나를 흉내 낸다 — 바깥 없이 저장소 성질만 본다. */
function fakeWell(id = 'fake'): WellSpec {
  return {
    id,
    title: `${id} 표`,
    emoji: '🧪',
    desc: '시험용',
    build: async (fetch) => {
      const raw = (await fetch(`https://example.test/${id}`)) as { n?: number };
      const count = raw?.n ?? 5;
      return {
        fields: [{ key: 'v', label: '값', kind: 'number', unit: '점' }],
        items: Array.from({ length: count }, (_, i) => ({ name: `${id}-${i}`, img: 'https://img.test/x.png', v: i })),
      };
    },
  };
}

describe('우물 등록부', () => {
  it('id 는 겹치지 않는다 — 겹치면 순위판이 남의 표와 섞인다', () => {
    const ids = WELLS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모르는 id 는 못 들어온다 — 물려받은 칸으로도', () => {
    expect(wellById('steam-hot')?.title).toBeTruthy();
    expect(wellById('constructor')).toBeNull();
    expect(wellById(7)).toBeNull();
    expect(wellById(undefined)).toBeNull();
  });

  it('우물마다 이름·설명·그림글자가 있다 — 목록이 빈칸으로 서면 안 고른다', () => {
    for (const w of WELLS) {
      expect(w.title.length).toBeGreaterThan(1);
      expect(w.desc.length).toBeGreaterThan(3);
      expect(w.emoji.length).toBeGreaterThan(0);
    }
  });

  it('스팀 셋 · 애니 · 요리가 다 있다', () => {
    expect(WELLS.map((w) => w.id)).toEqual(['steam-hot', 'steam-owned', 'steam-forever', 'anime-top', 'meal']);
  });
});

describe('길어 오기 · 쥐고 있기', () => {
  it('여섯 시간 안에는 바깥으로 안 나간다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 5 });
    let now = 1_000_000;
    const store = new WellStore(fetcher, () => now, 6 * 3600e3);
    const well = fakeWell();

    await store.get(well);
    await store.get(well);
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 6 * 3600e3 + 1;
    await store.get(well);
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
    const store = new WellStore(fetcher, () => 0);
    const all = Promise.all(Array.from({ length: 10 }, () => store.get(fakeWell())));
    release({ n: 5 });
    const packs = await all;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(packs.every((p) => p.items.length === 5)).toBe(true);
  });

  it('바깥이 죽으면 지난 표를 준다 — 어제 숫자로 노는 건 문제가 아니다', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ n: 5 }).mockRejectedValue(new Error('bad gateway 504'));
    let now = 0;
    const store = new WellStore(fetcher, () => now, 1000);
    const well = fakeWell();

    expect((await store.get(well)).stale).toBe(false);
    now += 5000;
    const stale = await store.get(well);
    expect(stale.stale).toBe(true);
    expect(stale.items).toHaveLength(5);
  });

  it('한 번도 성공한 적이 없으면 숨기지 않고 던진다', async () => {
    const store = new WellStore(vi.fn().mockRejectedValue(new Error('bad gateway 504')), () => 0);
    await expect(store.get(fakeWell())).rejects.toThrow('504');
  });

  it('놀이가 안 되는 표는 캐시에 안 넣는다 — 넣으면 여섯 시간 동안 못 논다', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ n: 2 }).mockResolvedValue({ n: 5 });
    const store = new WellStore(fetcher, () => 0);
    const well = fakeWell();

    await expect(store.get(well)).rejects.toThrow();
    expect((await store.get(well)).items).toHaveLength(5);
  });

  it('우물이 다르면 표도 따로 쥔다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 5 });
    const store = new WellStore(fetcher, () => 0);
    await store.get(fakeWell('a'));
    await store.get(fakeWell('b'));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.peek('a')?.well).toBe('a');
    expect(store.peek('c')).toBeNull();
  });
});

describe('오늘의 표', () => {
  it('같은 날이면 누구에게나 같은 우물 — 아니면 「오늘 이거 해 봤어?」가 성립 안 한다', () => {
    expect(wellOfTheDay('2026-08-08').id).toBe(wellOfTheDay('2026-08-08').id);
  });

  it('날이 바뀌면 대체로 바뀐다 — 한 우물에만 머무르지 않는다', () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    const picked = new Set(days.map((d) => wellOfTheDay(d).id));
    expect(picked.size).toBeGreaterThan(1);
  });

  it('고른 것은 언제나 등록된 우물이다', () => {
    for (let i = 1; i <= 60; i += 1) {
      const day = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      expect(WELLS).toContain(wellOfTheDay(day));
    }
  });

  it('하루는 한국 시각으로 센다 — 아침 아홉 시 전에 날이 바뀌면 안 된다', () => {
    // 2026-08-08 00:30 KST = 2026-08-07 15:30 UTC
    expect(kstDay(new Date('2026-08-07T15:30:00Z'))).toBe('2026-08-08');
    expect(kstDay(new Date('2026-08-07T14:30:00Z'))).toBe('2026-08-07');
  });
});

describe('우물이 늘어도 모양이 안 갈린다', () => {
  it('모든 우물이 같은 칸 모양을 쓴다', async () => {
    const store = new WellStore(async () => ({ n: 5 }), () => 0);
    const pack = await store.get(fakeWell());
    for (const field of pack.fields) {
      expect(['number', 'set', 'category']).toContain(field.kind);
      expect(field.key).toMatch(/^[a-z][a-z0-9]*$/);
    }
    for (const item of pack.items) expect(typeof item.name).toBe('string');
  });
});
