// agent-thread-router 순수 코어 전수검증 (Discord IO 무관). KAR-018-Y/-THR.
import { describe, it, expect, vi } from 'vitest';
import {
  extractTaskId,
  chunkForDiscord,
  resolveTaskThread,
  type ThreadResolveIO,
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

// ── KAR-018-THR: lookup 체인 순수 분기 + 재기동 시뮬 ───────────────
function makeIO(over: Partial<ThreadResolveIO> = {}): {
  io: ThreadResolveIO;
  mem: Map<string, string>;
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mem = new Map<string, string>();
  const persisted = new Map<string, string>();
  const spies = {
    threadAlive: vi.fn(async () => true),
    findByName: vi.fn(async () => null as string | null),
    create: vi.fn(async (id: string) => `new-${id}`),
    persistedSet: vi.fn((id: string, tid: string) => persisted.set(id, tid)),
  };
  const io: ThreadResolveIO = {
    memoryGet: (id) => mem.get(id) ?? null,
    memorySet: (id, tid) => void mem.set(id, tid),
    persistedGet: (id) => persisted.get(id) ?? null,
    persistedSet: spies.persistedSet,
    threadAlive: spies.threadAlive,
    findByName: spies.findByName,
    create: spies.create,
    ...over,
  };
  return { io, mem, spies };
}

describe('resolveTaskThread (lookup 순서 — 재기동-중복 0 불변식)', () => {
  const TID = 'TASK-KAR-018-THR';

  it('1) memory hit → 즉시, 하위 IO 무호출', async () => {
    const { io, mem, spies } = makeIO();
    mem.set(TID, 'cached-1');
    expect(await resolveTaskThread(TID, io)).toBe('cached-1');
    expect(spies.findByName).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('2) 재기동 시뮬: 맵 clear + 파일기록 hit → 생성 0', async () => {
    const { io, mem, spies } = makeIO();
    io.persistedGet = () => 'persisted-9'; // TASK 파일에 기록돼 있음
    mem.clear(); // 봇 nssm restart 로 in-memory Map 소실
    expect(await resolveTaskThread(TID, io)).toBe('persisted-9');
    expect(spies.create).not.toHaveBeenCalled(); // ★ 중복 스레드 0
    expect(mem.get(TID)).toBe('persisted-9'); // 캐시 부활
  });

  it('2b) 파일기록이 stale(스레드 삭제됨) → 이름검색 fall-through', async () => {
    const { io, spies } = makeIO({
      persistedGet: () => 'dead-thread',
      threadAlive: vi.fn(async () => false),
      findByName: vi.fn(async () => 'found-by-name'),
    });
    expect(await resolveTaskThread(TID, io)).toBe('found-by-name');
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('3) 파일기록 없음 + 기존 이름검색 hit → 채택 + write-back', async () => {
    const { io, spies } = makeIO({
      findByName: vi.fn(async () => 'old-named-thread'),
    });
    expect(await resolveTaskThread(TID, io)).toBe('old-named-thread');
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.persistedSet).toHaveBeenCalledWith(TID, 'old-named-thread');
  });

  it('4) 전부 miss → 생성 + memory/파일 write-back', async () => {
    const { io, mem, spies } = makeIO();
    expect(await resolveTaskThread(TID, io)).toBe(`new-${TID}`);
    expect(spies.create).toHaveBeenCalledOnce();
    expect(mem.get(TID)).toBe(`new-${TID}`);
    expect(spies.persistedSet).toHaveBeenCalledWith(TID, `new-${TID}`);
  });

  it('생성 실패 → null, write-back 안 함', async () => {
    const { io, spies } = makeIO({ create: vi.fn(async () => null) });
    expect(await resolveTaskThread(TID, io)).toBeNull();
    expect(spies.persistedSet).not.toHaveBeenCalled();
  });
});
