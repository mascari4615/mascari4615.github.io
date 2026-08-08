/**
 * TASK-KL-190 ② — 시간여행 표 시험.
 *
 * 여기서 제일 중요한 것은 **거짓 사건을 만들지 않는 것**이다: 0 에서 출발한 값은 무한%라
 * 목록을 통째로 차지하고, 하루에 여러 번 찍으면 「그날의 값」이 마지막 열람 값이 되고,
 * 바깥이 죽어 지난 표를 주는 중에 찍으면 어제 숫자가 오늘로 적힌다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WellSnapshotStore, compact, movers, kstDay, dayBefore, KEEP_DAYS } from './karmolab-well-snapshots';
import type { WellPack } from './karmolab-wells';

let file: string;
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl190-snap-'));
  file = path.join(tmp, 'snap.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const pack = (items: Array<{ name: string; ccu?: number; rating?: number }>, over: Partial<WellPack> = {}): WellPack => ({
  title: '표',
  emoji: '🔥',
  fields: [
    { key: 'ccu', label: '접속자', kind: 'number' },
    { key: 'rating', label: '평점', kind: 'number' },
  ],
  items: items.map((i) => ({ ...i, img: 'https://img.test/x.jpg' })),
  fetchedAt: new Date().toISOString(),
  stale: false,
  well: 'steam-hot',
  ...over,
});

describe('하루치로 줄이기', () => {
  it('그림·글자는 안 남기고 숫자만 남긴다', () => {
    const out = compact([{ name: 'A', img: 'https://img', ccu: 10, dev: '만든곳' }]);
    expect(out).toEqual({ A: { ccu: 10 } });
  });

  it('숫자가 하나도 없는 항목은 안 담는다 — 빈 칸만 90일 쌓이면 원장만 는다', () => {
    expect(compact([{ name: 'A', img: 'x', area: 'Korean' }])).toEqual({});
  });
});

describe('많이 움직인 것', () => {
  const now = { day: '2026-08-08', items: { A: { ccu: 200 }, B: { ccu: 100 }, C: { ccu: 5 } } };
  const before = { day: '2026-08-07', items: { A: { ccu: 100 }, B: { ccu: 100 }, C: { ccu: 0 } } };

  it('배가 된 것이 위로 온다', () => {
    const rows = movers(now, before, 'ccu');
    expect(rows[0].name).toBe('A');
    expect(rows[0].changePct).toBe(100);
  });

  it('안 변한 것은 안 담는다', () => {
    expect(movers(now, before, 'ccu').map((r) => r.name)).not.toContain('B');
  });

  it('0 에서 출발한 것은 안 담는다 — 무한%가 목록을 통째로 차지한다', () => {
    expect(movers(now, before, 'ccu').map((r) => r.name)).not.toContain('C');
  });

  it('순위가 몇 칸 올랐는지도 말한다', () => {
    const rows = movers(now, before, 'ccu');
    expect(rows[0].rankDelta).toBeLessThanOrEqual(0); // 위로 갔다
  });

  it('없는 칸으로 물으면 빈 목록 — 던지지 않는다', () => {
    expect(movers(now, before, '없는칸')).toEqual([]);
  });
});

describe('쌓기', () => {
  it('하루에 한 장만 — 여러 번 열어도 처음 값이 그날의 값이다', () => {
    const store = new WellSnapshotStore(file);
    expect(store.record(pack([{ name: 'A', ccu: 10 }]), '2026-08-08')).toBe(true);
    expect(store.record(pack([{ name: 'A', ccu: 999 }]), '2026-08-08')).toBe(false);
    expect(store.snapshot('steam-hot', '2026-08-08')?.items.A.ccu).toBe(10);
  });

  it('바깥이 죽어 지난 표를 주는 중이면 안 찍는다 — 어제 숫자가 오늘로 적힌다', () => {
    const store = new WellSnapshotStore(file);
    expect(store.record(pack([{ name: 'A', ccu: 10 }], { stale: true }), '2026-08-08')).toBe(false);
    expect(store.days('steam-hot')).toEqual([]);
  });

  it('90일까지만 들고 있는다', () => {
    const store = new WellSnapshotStore(file);
    for (let i = 0; i < KEEP_DAYS + 10; i += 1) {
      store.record(pack([{ name: 'A', ccu: i + 1 }]), dayBefore('2026-08-08', KEEP_DAYS + 10 - i));
    }
    expect(store.days('steam-hot')).toHaveLength(KEEP_DAYS);
  });

  it('다시 켜도 남아 있다 — 파일로 적힌다', () => {
    new WellSnapshotStore(file).record(pack([{ name: 'A', ccu: 10 }]), '2026-08-08');
    expect(new WellSnapshotStore(file).snapshot('steam-hot', '2026-08-08')?.items.A.ccu).toBe(10);
  });

  it('깨진 파일이어도 우물이 안 멈춘다 — 오늘부터 다시 쌓는다', () => {
    fs.writeFileSync(file, '{{{망가짐');
    const store = new WellSnapshotStore(file);
    expect(store.days('steam-hot')).toEqual([]);
    expect(store.record(pack([{ name: 'A', ccu: 10 }]), '2026-08-08')).toBe(true);
  });
});

describe('며칠 전과 견주기', () => {
  it('하루치뿐이면 아직 말할 게 없다', () => {
    const store = new WellSnapshotStore(file);
    store.record(pack([{ name: 'A', ccu: 10 }]), '2026-08-08');
    expect(store.movers('steam-hot', 'ccu')).toBeNull();
  });

  it('어제와 견준다', () => {
    const store = new WellSnapshotStore(file);
    store.record(pack([{ name: 'A', ccu: 100 }]), '2026-08-07');
    store.record(pack([{ name: 'A', ccu: 150 }]), '2026-08-08');
    const got = store.movers('steam-hot', 'ccu')!;
    expect(got.since).toBe('2026-08-07');
    expect(got.rows[0].changePct).toBe(50);
  });

  it('그날이 비어 있으면 **가장 가까운 이전 날**과 견준다 — 노트북이 잔 날이 있어도 말은 한다', () => {
    const store = new WellSnapshotStore(file);
    store.record(pack([{ name: 'A', ccu: 100 }]), '2026-08-01');
    store.record(pack([{ name: 'A', ccu: 200 }]), '2026-08-08');
    const got = store.movers('steam-hot', 'ccu', 3)!; // 8-05 를 찾지만 없다
    expect(got.since).toBe('2026-08-01');
    expect(got.rows[0].changePct).toBe(100);
  });
});

describe('하루 세기', () => {
  it('한국 시각으로 센다 — 아침 아홉 시 전에 날이 바뀌면 안 된다', () => {
    expect(kstDay(new Date('2026-08-07T15:30:00Z'))).toBe('2026-08-08');
    expect(kstDay(new Date('2026-08-07T14:30:00Z'))).toBe('2026-08-07');
  });

  it('며칠 전 날짜', () => {
    expect(dayBefore('2026-08-01', 1)).toBe('2026-07-31');
    expect(dayBefore('2026-03-01', 1)).toBe('2026-02-28');
  });
});
