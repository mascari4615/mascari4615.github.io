import { describe, it, expect, vi } from 'vitest';
import {
  evaluateFreshness,
  decideAlert,
  runFreshnessTick,
  type AlertMemory,
} from './deploy-freshness';

const HEAD = 'b88bb08d87b67419fa879e73657908fda68187f9';
const OLD = 'a373a0330b2ab4ec898362b979e0dc19234856a9';
const NOW = new Date('2026-08-09T12:00:00Z');

function at(minAgo: number): string {
  return new Date(NOW.getTime() - minAgo * 60_000).toISOString();
}

describe('evaluateFreshness — 사이트 파일이 진실', () => {
  it('사이트 = master 끝이면 아무리 오래돼도 신선하다 (아무도 안 민 것뿐)', () => {
    const v = evaluateFreshness({
      site: { commit: HEAD, builtAt: at(3 * 24 * 60) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
    expect(v.reason).toContain('3일');
  });

  it('방금 민 것은 아직 안 올라간 게 정상 — 유예 안이면 신선', () => {
    const v = evaluateFreshness({
      site: { commit: OLD, builtAt: at(8) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
    expect(v.reason).toContain('올라가는 중');
  });

  it('밀 것이 있는데 유예를 넘겼으면 낡음 — 이것만이 사고다', () => {
    const v = evaluateFreshness({
      site: { commit: OLD, builtAt: at(21 * 60) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('stale');
    expect(v.ageMin).toBe(21 * 60);
    expect(v.reason).toContain('21시간');
  });

  it('사이트가 자기 판을 못 밝히면 「낡음」이 아니라 「못 받음」 — 손이 엉뚱한 데 가면 안 된다', () => {
    const v = evaluateFreshness({
      site: null,
      unreachableReason: 'HTTP 503',
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('unreachable');
    expect(v.reason).toContain('503');
  });

  it('master 끝을 못 물어봤으면 판단을 미룬다 — GitHub 흔들림으로 우릴 깨우지 않는다', () => {
    const v = evaluateFreshness({
      site: { commit: OLD, builtAt: at(21 * 60) },
      headSha: null,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
    expect(v.reason).toContain('판단을 미룬다');
  });

  it('짧은 sha 와 긴 sha 를 같은 것으로 본다', () => {
    const v = evaluateFreshness({
      site: { commit: HEAD.slice(0, 8), builtAt: at(10) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
  });
});

describe('decideAlert — 조용해지는 것이 이 사고의 본체', () => {
  const stale = { state: 'stale' as const, reason: '낡음', ageMin: 200 };
  const fresh = { state: 'fresh' as const, reason: '신선', ageMin: 3 };

  it('첫 tick 이 건강하면 아무 말도 안 한다', () => {
    const m: AlertMemory = { last: null, lastAlertAt: null };
    expect(decideAlert(fresh, m, NOW, 360).send).toBe(false);
  });

  it('건강 → 낡음 전이에서 한 번 알린다', () => {
    const m: AlertMemory = { last: 'fresh', lastAlertAt: null };
    const d = decideAlert(stale, m, NOW, 360);
    expect(d.send).toBe(true);
    expect(d.healthy).toBe(false);
  });

  it('낡음이 이어지는 동안은 조용, 되새김 간격이 지나면 다시 찌른다', () => {
    const m: AlertMemory = { last: 'stale', lastAlertAt: new Date(NOW.getTime() - 60 * 60_000) };
    expect(decideAlert(stale, m, NOW, 360).send).toBe(false);
    const old: AlertMemory = { last: 'stale', lastAlertAt: new Date(NOW.getTime() - 400 * 60_000) };
    const d = decideAlert(stale, old, NOW, 360);
    expect(d.send).toBe(true);
    expect(d.reason).toContain('(계속)');
  });

  it('복구는 한 번만 알린다', () => {
    const m: AlertMemory = { last: 'stale', lastAlertAt: NOW };
    expect(decideAlert(fresh, m, NOW, 360)).toMatchObject({ send: true, healthy: true });
    const after: AlertMemory = { last: 'fresh', lastAlertAt: NOW };
    expect(decideAlert(fresh, after, NOW, 360).send).toBe(false);
  });
});

describe('runFreshnessTick — 실제 물어보기', () => {
  function fakeFetch(siteBody: unknown, headSha: string | null) {
    return vi.fn(async (url: string) => {
      if (String(url).includes('build.json')) {
        return { ok: true, json: async () => siteBody } as unknown as Response;
      }
      if (headSha === null) return { ok: false, status: 500 } as unknown as Response;
      return { ok: true, json: async () => ({ sha: headSha }) } as unknown as Response;
    });
  }

  const base = {
    buildUrl: 'https://example.test/build.json',
    repo: 'o/r',
    staleAfterMin: 45,
    remindMin: 360,
    now: () => NOW,
    timeoutMs: 1000,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };

  it('21시간 낡은 사이트를 잡아 알린다', async () => {
    const alert = vi.fn();
    const memory: AlertMemory = { last: 'fresh', lastAlertAt: null };
    const v = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ commit: OLD, builtAt: at(21 * 60) }, HEAD) as never, alert },
      memory,
    );
    expect(v.state).toBe('stale');
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ healthy: false }));
  });

  it('캐시에 안 속게 주소에 시각을 붙인다 — 파수꾼이 옛 판을 보면 파수꾼이 아니다', async () => {
    const fetchImpl = fakeFetch({ commit: HEAD, builtAt: at(5) }, HEAD);
    await runFreshnessTick({ ...base, fetchImpl: fetchImpl as never }, { last: null, lastAlertAt: null });
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/build\.json\?t=\d+/);
  });

  it('build.json 모양이 다르면 「못 받음」으로 센다', async () => {
    const v = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ hello: 'world' }, HEAD) as never },
      { last: null, lastAlertAt: null },
    );
    expect(v.state).toBe('unreachable');
  });
});
