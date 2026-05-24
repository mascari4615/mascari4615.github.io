/**
 * forum-tag-recovery 행동 테스트 (페이크 Discord + 페이크 ledger).
 *
 * TDD tracer-bullet: 태그 소실·손상·정상·미추적 케이스 전부 public 인터페이스
 * (recoverForumTagsOnce) 로 행동 검증. FS 격리 = MEMO_REPO_PATH 미설정.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recoverForumTagsOnce, type RecoveryClientLike } from './forum-tag-recovery';
import { rememberMap } from '../services/channel-provision';

// spec 과 동일한 13개 태그 정의 (channel-provision.test.ts 의 spec 과 독립).
const AVAILABLE_TAGS = [
  { id: 'k-proposal', name: 'proposal' },
  { id: 'k-task', name: 'task' },
  { id: 'k-worker-report', name: 'worker-report' },
  { id: 'k-discovery', name: 'discovery' },
  { id: 's-pending', name: 'pending' },
  { id: 's-in-progress', name: 'in-progress' },
  { id: 's-approved', name: 'approved' },
  { id: 's-rejected', name: 'rejected' },
  { id: 's-done', name: 'done' },
  { id: 'd-WM', name: 'WM' },
  { id: 'd-KAR', name: 'KAR' },
  { id: 'd-YB', name: 'YB' },
  { id: 'd-KL', name: 'KL' },
];

interface FakeThread {
  id: string;
  name: string;
  appliedTags: string[];
  setAppliedTags: (ids: string[]) => Promise<void>;
}

function fakeClient(threads: FakeThread[]): RecoveryClientLike {
  const threadMap = new Map(threads.map((t) => [t.id, t]));
  return {
    channels: {
      fetch: async () => ({
        id: 'chan-1',
        availableTags: AVAILABLE_TAGS,
        threads: {
          fetchActive: async () => ({ threads: threadMap }),
        },
      }),
    },
  };
}

const FAKE_GUILD_ID = 'test-guild-recovery';

/**
 * agent-work 는 ENV_KEY_BY_LOGICAL 에 없어 provision OFF 폴백 X.
 * rememberMap 으로 liveMaps 에 직접 주입 + YAWNBOT_ALLOWED_GUILD_IDS 로 guildId 고정.
 * MEMO_REPO_PATH 미설정 = ledger lookup 전부 null (FS 격리).
 */
const BASE_ENV = {
  YAWNBOT_ALLOWED_GUILD_IDS: FAKE_GUILD_ID,
} as unknown as NodeJS.ProcessEnv;

/** 각 테스트 전 liveMaps 에 agent-work → chan-1 주입 */
function injectChannelMap(): void {
  rememberMap(FAKE_GUILD_ID, { 'agent-work': 'chan-1' }, BASE_ENV);
}

/** MEMO_REPO_PATH 미설정 env (ledger FS 격리). */
const NO_MEMO_ENV = BASE_ENV;

describe('recoverForumTagsOnce — 태그 소실 복원', () => {
  beforeEach(() => injectChannelMap());

  it('태그가 전혀 없는 스레드 → 기본 [proposal, pending, KAR] 복원', async () => {
    const thread: FakeThread = {
      id: 'th-1',
      name: '제안 kar-001: 뭔가',
      appliedTags: [],
      setAppliedTags: async (ids) => {
        thread.appliedTags = ids;
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([thread]), NO_MEMO_ENV);
    expect(r.fixed).toBe(1);
    expect(thread.appliedTags).toContain('k-proposal');
    expect(thread.appliedTags).toContain('s-pending');
    expect(thread.appliedTags).toContain('d-KAR');
  });

  it('stale ID(유효하지 않은 ID) 포함 스레드 → 복원', async () => {
    const thread: FakeThread = {
      id: 'th-2',
      name: '제안 kar-002: 뭔가2',
      appliedTags: ['OLD-proposal-id', 'OLD-pending-id', 'OLD-KAR-id'],
      setAppliedTags: async (ids) => {
        thread.appliedTags = ids;
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([thread]), NO_MEMO_ENV);
    expect(r.fixed).toBe(1);
    // 현재 유효한 ID 로 교체됨
    expect(thread.appliedTags).toContain('k-proposal');
    expect(thread.appliedTags.every((id) => id.startsWith('k-') || id.startsWith('s-') || id.startsWith('d-'))).toBe(true);
  });

  it('유효 태그 + 3 그룹 전부 커버 → skip (fixed=0)', async () => {
    const thread: FakeThread = {
      id: 'th-3',
      name: '정상 스레드',
      appliedTags: ['k-proposal', 's-pending', 'd-KAR'],
      setAppliedTags: async (ids) => {
        thread.appliedTags = ids;
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([thread]), NO_MEMO_ENV);
    expect(r.fixed).toBe(0);
    expect(r.skipped).toBe(1);
    // 변경 없음
    expect(thread.appliedTags).toEqual(['k-proposal', 's-pending', 'd-KAR']);
  });

  it('kind 그룹 누락(status+domain만) → 복원', async () => {
    const thread: FakeThread = {
      id: 'th-4',
      name: '제안 kar-003',
      appliedTags: ['s-pending', 'd-KAR'], // kind 없음
      setAppliedTags: async (ids) => {
        thread.appliedTags = ids;
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([thread]), NO_MEMO_ENV);
    expect(r.fixed).toBe(1);
    expect(thread.appliedTags).toContain('k-proposal');
  });

  it('제목 [TASK-YB-NNN] 패턴 = kind=task, domain=YB, status=in-progress', async () => {
    const thread: FakeThread = {
      id: 'th-5',
      name: '[TASK-YB-039] 음성 동반자',
      appliedTags: [],
      setAppliedTags: async (ids) => {
        thread.appliedTags = ids;
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([thread]), NO_MEMO_ENV);
    expect(r.fixed).toBe(1);
    expect(thread.appliedTags).toContain('k-task');
    expect(thread.appliedTags).toContain('s-in-progress');
    expect(thread.appliedTags).toContain('d-YB');
  });

  it('제목 [TASK-WM-NNN] → domain=WM', async () => {
    const thread: FakeThread = {
      id: 'th-6',
      name: '[TASK-WM-107] 아키텍처 위임',
      appliedTags: [],
      setAppliedTags: async (ids) => {
        thread.appliedTags = ids;
      },
    };
    await recoverForumTagsOnce(fakeClient([thread]), NO_MEMO_ENV);
    expect(thread.appliedTags).toContain('d-WM');
    expect(thread.appliedTags).toContain('k-task');
  });

  it('복수 스레드 — 손상+정상 혼재 → 손상만 fix', async () => {
    const broken: FakeThread = {
      id: 'th-7',
      name: '깨진 포스트',
      appliedTags: ['STALE-ID'],
      setAppliedTags: async (ids) => {
        broken.appliedTags = ids;
      },
    };
    const good: FakeThread = {
      id: 'th-8',
      name: '정상 포스트',
      appliedTags: ['k-task', 's-in-progress', 'd-KL'],
      setAppliedTags: async () => {
        throw new Error('should not be called');
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([broken, good]), NO_MEMO_ENV);
    expect(r.checked).toBe(2);
    expect(r.fixed).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('채널 미설정 → result 0 반환 (throw X)', async () => {
    const r = await recoverForumTagsOnce(
      { channels: { fetch: async () => null } },
      {} as unknown as NodeJS.ProcessEnv,
    );
    expect(r.checked).toBe(0);
    expect(r.fixed).toBe(0);
  });

  it('fetchActive 실패 → result 0 반환 (throw X)', async () => {
    const client: RecoveryClientLike = {
      channels: {
        fetch: async () => ({
          id: 'chan-fail',
          availableTags: AVAILABLE_TAGS,
          threads: {
            fetchActive: async () => {
              throw new Error('rate limited');
            },
          },
        }),
      },
    };
    const r = await recoverForumTagsOnce(client, NO_MEMO_ENV);
    expect(r.checked).toBe(0);
  });

  it('setAppliedTags 실패해도 다른 스레드 계속 처리', async () => {
    let secondCalled = false;
    const fail: FakeThread = {
      id: 'th-fail',
      name: '실패 스레드',
      appliedTags: [],
      setAppliedTags: async () => {
        throw new Error('discord API error');
      },
    };
    const ok: FakeThread = {
      id: 'th-ok',
      name: '성공 스레드',
      appliedTags: [],
      setAppliedTags: async (ids) => {
        secondCalled = true;
        ok.appliedTags = ids;
      },
    };
    const r = await recoverForumTagsOnce(fakeClient([fail, ok]), NO_MEMO_ENV);
    expect(secondCalled).toBe(true);
    expect(r.checked).toBe(2);
    // fail 은 fixed 안 됨 (setAppliedTags throw)
    expect(r.fixed).toBe(1);
  });
});
