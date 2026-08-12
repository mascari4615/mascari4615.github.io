/**
 * 우주 데이터 중계 — 셈법과 「바깥이 죽었을 때」 (TASK-KL-241 follow-up).
 *
 * 여기서 지키는 것은 두 가지다: TLE 두 줄을 **자리로 잘라** 제대로 읽는가(공백으로 나누면
 * 값이 붙어 나오는 줄에서 조용히 어긋난다), 그리고 바깥이 403·429 로 막혔을 때
 * **낡은 값이라도 나오는가**(그게 이 파일이 생긴 이유다).
 */
import { describe, expect, it } from 'vitest';
import { SharedCache, epochFromTle, firstOf, ommFromTle } from './karmolab-space-api';

/* 2026-08-12 실제로 받은 줄 */
const L1 = '1 25544U 98067A   26224.11681231  .00003399  00000+0  68868-4 0  9992';
const L2 = '2 25544  51.6322  23.2919 0007501  38.2000 321.9519 15.49416382580425';

describe('TLE 읽기', () => {
  it('두 줄을 궤도 요소로 바꾼다', () => {
    const o = ommFromTle('ISS (ZARYA)', L1, L2)!;
    expect(o.INCLINATION).toBeCloseTo(51.6322, 4);
    expect(o.RA_OF_ASC_NODE).toBeCloseTo(23.2919, 4);
    expect(o.ARG_OF_PERICENTER).toBeCloseTo(38.2, 4);
    expect(o.MEAN_ANOMALY).toBeCloseTo(321.9519, 4);
    expect(o.MEAN_MOTION).toBeCloseTo(15.49416382, 6);
  });

  it('이심률은 앞의 0. 을 적지 않는 형식이다', () => {
    expect(ommFromTle('ISS', L1, L2)!.ECCENTRICITY).toBeCloseTo(0.0007501, 8);
  });

  it('시각은 연도 두 자리 + 그 해 몇째 날', () => {
    expect(epochFromTle('26224.11681231').slice(0, 10)).toBe('2026-08-12');
    // 57 보다 작으면 2000 년대 — 위성 시대가 1957 년에 시작해서 정해진 규칙이다
    expect(epochFromTle('98067.5').slice(0, 4)).toBe('1998');
  });

  it('망가진 줄은 null — 반쯤 읽은 값으로 궤도를 그리면 위성이 엉뚱한 데 뜬다', () => {
    expect(ommFromTle('ISS', '너무 짧다', L2)).toBeNull();
    expect(ommFromTle('ISS', L1, '2 25544  없음')).toBeNull();
  });
});

describe('원천 다중화', () => {
  it('앞이 죽으면 다음으로 간다', async () => {
    const got = await firstOf<string>([async () => null, async () => 'B', async () => 'C']);
    expect(got).toBe('B');
  });

  it('전부 죽으면 null', async () => {
    expect(await firstOf<string>([async () => null, async () => null])).toBeNull();
  });
});

describe('나눠 쓰는 곳간', () => {
  it('때가 안 됐으면 바깥에 다시 묻지 않는다', async () => {
    let calls = 0;
    let now = 1000;
    const c = new SharedCache<number>(100, 1000, async () => ++calls, () => now);
    expect((await c.get()).value).toBe(1);
    now = 1050;
    expect((await c.get()).value).toBe(1);
    expect(calls).toBe(1);
    now = 1200; // 때가 지났다
    expect((await c.get()).value).toBe(2);
  });

  it('같은 순간에 여럿이 물어도 바깥에는 한 번만 묻는다', async () => {
    let calls = 0;
    const c = new SharedCache<number>(100, 1000, async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    });
    const [a, b, d] = await Promise.all([c.get(), c.get(), c.get()]);
    expect(calls).toBe(1);
    expect([a.value, b.value, d.value]).toEqual([1, 1, 1]);
  });

  it('바깥이 막히면 낡은 값이라도 준다 — 403·429 가 곧 빈 화면이 되면 안 된다', async () => {
    let alive = true;
    let now = 0;
    const c = new SharedCache<string>(100, 5000, async () => (alive ? 'fresh' : null), () => now);
    expect((await c.get()).value).toBe('fresh');
    alive = false;
    now = 500; // 때는 지났고 바깥은 죽었다
    const got = await c.get();
    expect(got.value).toBe('fresh');
    expect(got.fresh).toBe(false);
  });

  it('너무 낡으면 그것도 안 준다', async () => {
    let alive = true;
    let now = 0;
    const c = new SharedCache<string>(100, 1000, async () => (alive ? 'fresh' : null), () => now);
    await c.get();
    alive = false;
    now = 5000;
    expect((await c.get()).value).toBeNull();
  });
});
