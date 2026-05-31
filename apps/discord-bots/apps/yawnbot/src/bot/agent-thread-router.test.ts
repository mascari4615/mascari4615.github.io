// agent-thread-router 순수 코어 전수검증 (Discord IO 무관). KAR-018-Y.
// + TASK-KAR-018-THR: 재기동-중복 root fix (이름검색 dedup) ·
//   proposal-id(pXXX) thread key · findThreadByName 분기.
import { describe, it, expect } from 'vitest';
import { ChannelType, type Client } from 'discord.js';
import {
  extractTaskId,
  chunkForDiscord,
  findThreadByName,
  makeThreadRouter,
} from './agent-thread-router';

describe('extractTaskId (순수)', () => {
  it('워커 메시지에서 TASK id 추출', () => {
    expect(
      extractTaskId('🤖 KlWorker ▶ TASK-KL-071 수행 — 브랜치 feature/...'),
    ).toBe('TASK-KL-071');
  });
  it('서브 접미(-A/-B/-X) 포함', () => {
    expect(extractTaskId('⚠ TASK-KAR-018-X error')).toBe('TASK-KAR-018-X');
    expect(extractTaskId('TASK-KL-055-B 점유')).toBe('TASK-KL-055-B');
  });
  it('첫 매치만 (그 틱 대상)', () => {
    expect(extractTaskId('TASK-WM-084 vs TASK-WM-116')).toBe('TASK-WM-084');
  });
  it('TASK 없으면 null (팀-공통=하트비트)', () => {
    expect(extractTaskId('🛰 팀 한 바퀴: 동료 echo 한마디')).toBeNull();
    expect(extractTaskId('')).toBeNull();
  });

  // ── TASK-KAR-018-THR (A): proposal-id(pXXX)도 thread key ──
  it('proposal-id (p+8hex) 를 thread key 로 인정', () => {
    expect(
      extractTaskId("⑦' 발굴 → task-new (task) [p42c94051] — 승인 시 처리"),
    ).toBe('p42c94051');
    expect(
      extractTaskId('{"objId":"p0a1b2c3d","status":"approved"}'),
    ).toBe('p0a1b2c3d');
  });
  it('TASK id 가 proposal-id 보다 우선 (기존 틱 대상 불변·회귀0)', () => {
    expect(
      extractTaskId('TASK-KAR-018-THR 관련 제안 p42c94051 검토'),
    ).toBe('TASK-KAR-018-THR');
  });
  it('일반어/부분일치 오매칭 0 (8 hex + 단어경계 강제)', () => {
    // "prod" "plan" "p123" "p1234567"(7) "p123456789"(9) 전부 X
    expect(extractTaskId('prod 배포 5회, plan 수립')).toBeNull();
    expect(extractTaskId('포트 p1234567 (7자리) 무시')).toBeNull();
    expect(extractTaskId('app1234567 처럼 앞에 글자면 X')).toBeNull();
    // 8 hex 지만 g 는 hex 아님 → X
    expect(extractTaskId('pdeadbeeg 는 hex 아님')).toBeNull();
  });
});

// ── TASK-KAR-018-THR: findThreadByName 분기 전수 (가짜 채널) ──
function fakeChannel(opts: {
  active?: { id: string; name: string }[];
  archived?: { id: string; name: string }[];
  failActive?: boolean;
  failArchived?: boolean;
}) {
  const wrap = (arr: { id: string; name: string }[]) => ({
    threads: { values: () => arr[Symbol.iterator]() },
  });
  return {
    threads: {
      fetchActive: () =>
        opts.failActive
          ? Promise.reject(new Error('rate-limit'))
          : Promise.resolve(wrap(opts.active ?? [])),
      fetchArchived: () =>
        opts.failArchived
          ? Promise.reject(new Error('rate-limit'))
          : Promise.resolve(wrap(opts.archived ?? [])),
    },
  };
}

describe('findThreadByName (TASK-KAR-018-THR root fix)', () => {
  it('active 에 이름 일치 → 그 id', async () => {
    const ch = fakeChannel({
      active: [
        { id: 'T1', name: 'TASK-KAR-018-THR' },
        { id: 'T2', name: 'TASK-KL-099' },
      ],
    });
    expect(await findThreadByName(ch, 'TASK-KAR-018-THR')).toBe('T1');
  });
  it('active miss → archived(public) 조회 hit', async () => {
    const ch = fakeChannel({
      active: [{ id: 'T2', name: 'TASK-KL-099' }],
      archived: [{ id: 'A1', name: 'TASK-KAR-018-THR' }],
    });
    expect(await findThreadByName(ch, 'TASK-KAR-018-THR')).toBe('A1');
  });
  it('어디에도 없음 → null (호출부는 생성 폴백)', async () => {
    const ch = fakeChannel({ active: [], archived: [] });
    expect(await findThreadByName(ch, 'TASK-KAR-018-THR')).toBeNull();
  });
  it('fetch 실패는 swallow → null (가용성 우선, throw X)', async () => {
    const ch = fakeChannel({ failActive: true, failArchived: true });
    await expect(
      findThreadByName(ch, 'TASK-KAR-018-THR'),
    ).resolves.toBeNull();
  });
  it('active 실패해도 archived 로 복구', async () => {
    const ch = fakeChannel({
      failActive: true,
      archived: [{ id: 'A9', name: 'TASK-KAR-018-THR' }],
    });
    expect(await findThreadByName(ch, 'TASK-KAR-018-THR')).toBe('A9');
  });
});

// ── 재기동-중복 시뮬: in-memory 맵 소실 후 같은 TASK = 중복 0 ──
describe('makeThreadRouter 재기동-중복 root fix (TASK-KAR-018-THR)', () => {
  // prod nssm restart = 새 makeThreadRouter 인스턴스(맵 빈 상태).
  // 같은 TASK 다음 메시지가 *이름검색* 으로 기존 스레드 재사용 →
  // ch.threads.create 0회 + 메인채널 포인터 0회 (중복·고아 0).
  function makeFakeClient() {
    const created: { name: string; id: string }[] = [];
    const liveThreads: { id: string; name: string }[] = [];
    const sends: string[] = [];
    const threadSends: Record<string, string[]> = {};
    let seq = 0;
    const channel = {
      type: ChannelType.GuildText,
      threads: {
        create: async ({ name }: { name: string }) => {
          const id = `thread-${++seq}`;
          created.push({ name, id });
          liveThreads.push({ id, name });
          return { id };
        },
        fetchActive: async () => ({
          threads: { values: () => [...liveThreads][Symbol.iterator]() },
        }),
        fetchArchived: async () => ({
          threads: { values: () => [][Symbol.iterator]() },
        }),
      },
      send: async (m: string) => {
        sends.push(m);
      },
    };
    const client = {
      channels: {
        fetch: async (id: string) => {
          if (id === 'CH') return channel;
          // threadId fetch → sendable thread
          return {
            isThread: () => true,
            isSendable: () => true,
            send: async ({ content }: { content: string }) => {
              (threadSends[id] ??= []).push(content);
            },
          };
        },
      },
    } as unknown as Client;
    return { client, created, sends, threadSends };
  }

  const wait = () => new Promise((r) => setTimeout(r, 0));

  it('재기동(맵 소실) 후 같은 TASK → 스레드 생성·포인터 0회 (중복 0)', async () => {
    const f = makeFakeClient();
    const deps = {
      resolveChannelId: () => 'CH',
      fallback: () => {
        throw new Error('fallback 호출되면 안 됨 (taskId 있음)');
      },
    };

    // ── 봇 1세대: 최초 메시지 → 스레드 신규 1회 + 포인터 1회 ──
    const r1 = makeThreadRouter(f.client, deps);
    r1('🤖 KAR-018-THR worker ▶ TASK-KAR-018-THR 착수');
    await wait();
    await wait();
    expect(f.created.length).toBe(1);
    expect(f.created[0].name).toBe('TASK-KAR-018-THR');
    expect(f.sends.length).toBe(1); // 메인채널 포인터 1회

    // ── 봇 2세대(재기동): 새 라우터=빈 맵. 같은 TASK 메시지 ──
    const r2 = makeThreadRouter(f.client, deps);
    r2('🤖 TASK-KAR-018-THR 사용자 질문에 답합니다');
    await wait();
    await wait();
    // 이름검색이 기존 스레드 재사용 → 신규 생성·포인터 추가 0
    expect(f.created.length).toBe(1);
    expect(f.sends.length).toBe(1);

    // ── 봇 3세대: 한 번 더 재기동해도 동일 (안정) ──
    const r3 = makeThreadRouter(f.client, deps);
    r3('🤖 TASK-KAR-018-THR 추가 보고');
    await wait();
    await wait();
    expect(f.created.length).toBe(1);
    // 전 세대 메시지가 전부 *같은* 스레드 id 로 갔는지 (연속성)
    const tid = f.created[0].id;
    expect(Object.keys(f.threadSends)).toEqual([tid]);
    expect(f.threadSends[tid].length).toBe(3);
  });
});

describe('onMissingTask: silent — 사용자 정신없음 fix (2026-05-23)', () => {
  function makeFakeClient() {
    const sends: string[] = [];
    const channel = {
      type: ChannelType.GuildText,
      threads: {
        create: async () => ({ id: 'should-not-create' }),
        fetchActive: async () => ({
          threads: { values: () => [][Symbol.iterator]() },
        }),
        fetchArchived: async () => ({
          threads: { values: () => [][Symbol.iterator]() },
        }),
      },
      send: async (m: string) => {
        sends.push(m);
      },
    };
    const client = {
      channels: {
        fetch: async () => channel,
      },
    } as unknown as Client;
    return { client, sends, channel };
  }

  const wait = () => new Promise((r) => setTimeout(r, 0));

  it('silent + TASK-id 없는 메시지 = fallback 호출 0 + Discord send 0', async () => {
    const f = makeFakeClient();
    let fallbackCalled = 0;
    const router = makeThreadRouter(f.client, {
      resolveChannelId: () => 'CH',
      fallback: () => {
        fallbackCalled++;
      },
      onMissingTask: 'silent',
    });
    router('🛰 cadence digest — 일반 메시지 TASK-id 없음');
    await wait();
    await wait();
    expect(fallbackCalled).toBe(0);
    expect(f.sends.length).toBe(0);
  });

  it('silent + TASK-id 있는 메시지 = 스레드 라우팅 정상 (silent 무관)', async () => {
    const f = makeFakeClient();
    const router = makeThreadRouter(f.client, {
      resolveChannelId: () => 'CH',
      fallback: () => {},
      onMissingTask: 'silent',
    });
    router('🤖 TASK-KAR-018-INIT 발의 결과');
    await wait();
    await wait();
    // 스레드 생성 + 포인터 1회 (silent 는 missing 경우만)
    expect(f.sends.length).toBe(1);
    expect(f.sends[0]).toContain('TASK-KAR-018-INIT');
  });

  it('default (옵션 미명시) = 기존 fallback 동작 (backwards compat)', async () => {
    const f = makeFakeClient();
    let fallbackCalled = 0;
    const router = makeThreadRouter(f.client, {
      resolveChannelId: () => 'CH',
      fallback: () => {
        fallbackCalled++;
      },
    });
    router('🛰 cadence digest — 일반');
    await wait();
    await wait();
    expect(fallbackCalled).toBe(1);
  });
});

describe('chunkForDiscord (순수·결정적)', () => {
  it('한도 이하 = 1청크', () => {
    expect(chunkForDiscord('짧은 보고')).toEqual(['짧은 보고']);
  });
  it('빈/공백 = 빈 배열', () => {
    expect(chunkForDiscord('')).toEqual([]);
    expect(chunkForDiscord('   \n  ')).toEqual([]);
  });
  it('줄 경계 우선 분할, 각 ≤ max', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ` + 'x'.repeat(60));
    const chunks = chunkForDiscord(lines.join('\n'), 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    // 무손실: 모든 줄 보존
    for (let i = 0; i < 50; i++)
      expect(chunks.join('\n')).toContain(`line ${i} `);
  });
  it('한 줄이 max 초과 → 강제 슬라이스(무손실)', () => {
    const long = 'a'.repeat(5000);
    const chunks = chunkForDiscord(long, 1900);
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1900);
    expect(chunks.join('')).toBe(long);
  });
});
