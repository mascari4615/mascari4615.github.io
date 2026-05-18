// agent-thread-router 순수 코어 전수검증 (Discord IO 무관). KAR-018-Y/THR.
import { describe, it, expect, vi } from 'vitest';
import {
  extractTaskId,
  chunkForDiscord,
  resolveTaskThread,
  type ThreadResolveOps,
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
  it('THR §흡수(A): 제안 id(pXXX)도 스레드 키 — TASK 우선', () => {
    expect(extractTaskId('제안 p42c94051 숙의: 검토 부탁')).toBe(
      'p42c94051',
    );
    // TASK 와 pXXX 공존 시 TASK 우선(회귀 0)
    expect(extractTaskId('TASK-KAR-018-THR 관련 제안 p42c94051')).toBe(
      'TASK-KAR-018-THR',
    );
    // pXXX 형식 아닌 p-단어 오매칭 X
    expect(extractTaskId('proposal pipeline')).toBeNull();
  });
});

describe('resolveTaskThread — lookup 순서 (스펙 §검증 단위)', () => {
  function ops(over: Partial<ThreadResolveOps> = {}): {
    o: ThreadResolveOps;
    spies: Record<string, ReturnType<typeof vi.fn>>;
  } {
    const store = new Map<string, string>(); // 파일기록 시뮬
    let cache = new Map<string, string>();
    const spies = {
      isAlive: vi.fn(async () => true),
      findByName: vi.fn(async () => null as string | null),
      create: vi.fn(async () => 'NEW'),
      recordedSet: vi.fn((k: string, id: string) => void store.set(k, id)),
    };
    const o: ThreadResolveOps = {
      cacheGet: (k) => cache.get(k),
      cacheSet: (k, id) => void cache.set(k, id),
      recordedGet: (k) => store.get(k) ?? null,
      recordedSet: spies.recordedSet,
      isAlive: spies.isAlive,
      findByName: spies.findByName,
      create: spies.create,
      ...over,
    };
    // 재기동 시뮬용 — 캐시만 비움(store=파일기록 영속)
    (o as any).__clearCache = () => (cache = new Map());
    return { o, spies };
  }

  it('① in-memory hit = 파일/검색/생성 0', async () => {
    const { o, spies } = ops();
    o.cacheSet('K', 'MEM');
    expect(await resolveTaskThread('K', o)).toBe('MEM');
    expect(spies.findByName).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('② 파일기록 hit(살아있음) = 이름검색/생성 0', async () => {
    const { o, spies } = ops();
    o.recordedSet('K', 'REC');
    expect(await resolveTaskThread('K', o)).toBe('REC');
    expect(spies.isAlive).toHaveBeenCalledWith('REC');
    expect(spies.findByName).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('② 파일기록 stale(죽음) → 이름검색으로 폴스루', async () => {
    const { o, spies } = ops({
      isAlive: vi.fn(async () => false),
      findByName: vi.fn(async () => 'FOUND'),
    });
    o.recordedSet('K', 'DEAD');
    expect(await resolveTaskThread('K', o)).toBe('FOUND');
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('③ 이름검색 hit = 생성 0 + 기록 backfill', async () => {
    const { o, spies } = ops({ findByName: vi.fn(async () => 'EXIST') });
    expect(await resolveTaskThread('K', o)).toBe('EXIST');
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.recordedSet).toHaveBeenCalledWith('K', 'EXIST');
  });

  it('④ 전부 miss = 생성 + 캐시·기록 write-back', async () => {
    const { o, spies } = ops();
    expect(await resolveTaskThread('K', o)).toBe('NEW');
    expect(spies.create).toHaveBeenCalledOnce();
    expect(spies.recordedSet).toHaveBeenCalledWith('K', 'NEW');
    expect(o.cacheGet('K')).toBe('NEW');
  });

  it('재기동 시뮬: 1회 생성 후 맵 clear → 파일기록 hit = 중복생성 0', async () => {
    const { o, spies } = ops();
    expect(await resolveTaskThread('K', o)).toBe('NEW'); // 최초 생성
    expect(spies.create).toHaveBeenCalledOnce();
    const findCallsBefore = spies.findByName.mock.calls.length;
    (o as any).__clearCache(); // ← nssm restart = in-memory Map 소실
    const again = await resolveTaskThread('K', o);
    expect(again).toBe('NEW'); // 같은 스레드 (파일기록 hit)
    expect(spies.create).toHaveBeenCalledOnce(); // 중복생성 0 (근본 fix)
    // 재기동 후 resolve = 파일기록 hit → 이름검색 추가 호출 0
    expect(spies.findByName.mock.calls.length).toBe(findCallsBefore);
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
