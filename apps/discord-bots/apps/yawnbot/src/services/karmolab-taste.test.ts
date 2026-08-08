/**
 * TASK-KL-190 ④ — 취향 지문 시험.
 *
 * 이런 「닮은 사람 찾기」의 사고는 늘 같다: 겹치는 게 두 개뿐인데 100% 일치라고 말하거나,
 * 사람이 셋뿐일 때 같은 사람이 「가장 비슷하고 동시에 가장 다른 사람」이 되거나,
 * 다른 표(포켓몬 vs 스팀)를 한 줄에 놓고 견주거나.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TasteStore, agreement, favorites, rateOf, MIN_OVERLAP } from './karmolab-taste';

let file: string;
let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl190-taste-'));
  file = path.join(tmp, 'taste.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A 가 B 를 이겼다 를 n 번. */
const beat = (win: string, lose: string, n = 1) => Array.from({ length: n }, () => ({ win, lose }));

describe('한 판을 지문에 더하기', () => {
  it('이긴 쪽은 이긴 수와 마주친 수가, 진 쪽은 마주친 수만 는다', () => {
    const store = new TasteStore(file);
    const row = store.record('나', 'well:steam-hot', beat('A', 'B'));
    expect(row.A).toEqual([1, 1]);
    expect(row.B).toEqual([0, 1]);
    expect(rateOf(row, 'A')).toBe(1);
    expect(rateOf(row, 'B')).toBe(0);
  });

  it('말이 안 되는 줄은 버린다 — 자기 자신과의 대결, 빈 이름', () => {
    const store = new TasteStore(file);
    const row = store.record('나', 'v', [{ win: 'A', lose: 'A' }, { win: '', lose: 'B' }, { win: 'C', lose: '  ' }]);
    expect(Object.keys(row)).toEqual([]);
  });

  it('다시 켜도 남아 있다', () => {
    new TasteStore(file).record('나', 'v', beat('A', 'B'));
    expect(new TasteStore(file).fingerprint('나', 'v').A).toEqual([1, 1]);
  });

  it('깨진 파일이어도 놀이가 안 멈춘다', () => {
    fs.writeFileSync(file, '{{{망가짐');
    const store = new TasteStore(file);
    expect(store.record('나', 'v', beat('A', 'B')).A).toEqual([1, 1]);
  });
});

describe('얼마나 같은 쪽을 보나', () => {
  const many = (names: string[], rate: number) =>
    Object.fromEntries(names.map((n) => [n, [Math.round(rate * 10), 10] as [number, number]]));

  it('똑같이 고르면 100%', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(agreement(many(names, 0.8), many(names, 0.8))!.agreePct).toBe(100);
  });

  it('한쪽은 늘 고르고 한쪽은 늘 버리면 0%', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(agreement(many(names, 1), many(names, 0))!.agreePct).toBe(0);
  });

  it('겹치는 게 적으면 아무 말도 안 한다 — 우연이 사람 얼굴을 하고 나온다', () => {
    const few = ['a', 'b'];
    expect(agreement(many(few, 1), many(few, 1))).toBeNull();
    expect(MIN_OVERLAP).toBeGreaterThan(2);
  });

  it('안 마주친 항목은 안 센다 — 내가 100개 봤어도 겹친 것만 견준다', () => {
    const mine = { ...many(['a', 'b', 'c', 'd', 'e', 'f'], 1), z: [0, 0] as [number, number] };
    const got = agreement(mine, many(['a', 'b', 'c', 'd', 'e', 'f'], 1))!;
    expect(got.overlap).toBe(6);
  });
});

describe('가까운 사람 · 정반대인 사람', () => {
  function seed(): TasteStore {
    const store = new TasteStore(file);
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    // 나 = 앞쪽 셋을 늘 고른다
    for (const n of ['a', 'b', 'c']) store.record('나', 'v', beat(n, 'z', 5));
    for (const n of ['d', 'e', 'f']) store.record('나', 'v', beat('z', n, 5));
    // 쌍둥이 = 나와 같다 · 반대 = 정반대
    for (const n of ['a', 'b', 'c']) store.record('쌍둥이', 'v', beat(n, 'z', 5));
    for (const n of ['d', 'e', 'f']) store.record('쌍둥이', 'v', beat('z', n, 5));
    for (const n of ['a', 'b', 'c']) store.record('반대', 'v', beat('z', n, 5));
    for (const n of ['d', 'e', 'f']) store.record('반대', 'v', beat(n, 'z', 5));
    return store;
  }

  it('나와 같은 사람이 위, 정반대가 아래', () => {
    const got = seed().neighbours('나', 'v');
    expect(got.closest[0].handle).toBe('쌍둥이');
    expect(got.closest[0].agreePct).toBe(100);
    expect(got.opposite[0].handle).toBe('반대');
  });

  it('같은 사람이 양쪽에 서지 않는다 — 「가장 비슷하고 동시에 가장 다른 사람」은 없다', () => {
    const got = seed().neighbours('나', 'v');
    const both = got.closest.filter((c) => got.opposite.some((o) => o.handle === c.handle));
    expect(both).toEqual([]);
  });

  it('나 자신은 목록에 안 선다', () => {
    const got = seed().neighbours('나', 'v');
    expect([...got.closest, ...got.opposite].map((r) => r.handle)).not.toContain('나');
  });

  it('다른 표를 논 사람은 안 견준다 — 포켓몬 취향과 스팀 취향은 한 줄이 아니다', () => {
    const store = seed();
    store.record('딴표사람', 'well:anime-top', beat('x', 'y', 9));
    const got = store.neighbours('나', 'v');
    expect([...got.closest, ...got.opposite].map((r) => r.handle)).not.toContain('딴표사람');
  });

  it('아무도 없으면 빈 목록 — 던지지 않는다', () => {
    expect(new TasteStore(file).neighbours('아무도아님', 'v')).toEqual({ closest: [], opposite: [] });
  });
});

describe('내가 좋아한 것', () => {
  it('많이 마주치고 많이 이긴 순', () => {
    const store = new TasteStore(file);
    store.record('나', 'v', [...beat('A', 'B', 5), ...beat('C', 'B', 2)]);
    const top = favorites(store.fingerprint('나', 'v'));
    expect(top[0].name).toBe('A');
    expect(top[0].rate).toBe(100);
  });

  it('한 번만 마주친 것은 안 담는다 — 한 판 이긴 걸로 「최애」라고 하지 않는다', () => {
    const store = new TasteStore(file);
    store.record('나', 'v', beat('A', 'B'));
    expect(favorites(store.fingerprint('나', 'v'))).toEqual([]);
  });
});

describe('지우기', () => {
  it('계정을 지우면 취향도 지운다 — 그 사람 것이다', () => {
    const store = new TasteStore(file);
    store.record('나', 'v', beat('A', 'B'));
    store.forget('나');
    expect(store.variants('나')).toEqual([]);
  });
});
