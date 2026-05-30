/**
 * forum-dedup 단위 테스트 — planDedup(순수) + auditForumDupsOnce(페이크 forum) +
 * buildForumGroundTruth. "TASK당 1개"를 *예방*으로 보장하고, 봇 경로는 **삭제 안 함**을 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  planDedup,
  auditForumDupsOnce,
  buildForumGroundTruth,
  type DedupThread,
} from './forum-dedup';
import { rememberMap } from '../services/channel-provision';

let guildSeq = 0;
/** 'agent-work' 는 provision 전용(env 폴백 키 없음) → rememberMap 으로 채널 주입.
 *  테스트별 고유 guild 로 캐시 충돌 회피 (forum-post.test 패턴 정합). */
function envWith(channelId: string): NodeJS.ProcessEnv {
  const g = `g-dd-${++guildSeq}`;
  const env = { YAWNBOT_ALLOWED_GUILD_IDS: g } as NodeJS.ProcessEnv;
  rememberMap(g, { 'agent-work': channelId }, env);
  return env;
}

/** 페이크 forum — archived/deleted 호출 기록 (archive 됨·delete 안 됨 검증). */
function fakeForum(channelId: string, threads: DedupThread[]) {
  const deleted: string[] = [];
  const archivedCalls: string[] = [];
  const mkCol = (arr: DedupThread[]) => ({
    size: arr.length,
    values: () =>
      arr.map((t) => ({
        id: t.id,
        name: t.name,
        archived: t.archived,
        archivedTimestamp: Number(t.id),
      })),
  });
  const active = threads.filter((t) => !t.archived);
  const archived = threads.filter((t) => t.archived);
  const channel = {
    threads: {
      fetchActive: async () => ({ threads: mkCol(active) }),
      fetchArchived: async (opts: { before?: unknown } = {}) => ({
        threads: opts.before ? mkCol([]) : mkCol(archived),
        hasMore: false,
      }),
      fetch: async (id: string) => {
        const t = threads.find((x) => x.id === id);
        return t
          ? {
              id,
              delete: async (_r?: string) => void deleted.push(id),
              setArchived: async (_v: boolean, _r?: string) =>
                void archivedCalls.push(id),
            }
          : null;
      },
    },
  };
  const client = {
    channels: { fetch: async (id: string) => (id === channelId ? channel : null) },
  };
  return { client, deleted, archivedCalls };
}

describe('planDedup (순수)', () => {
  it('제목 [...] 키로 그룹화 + newest canonical, 나머지 dup, 무-id 무시', () => {
    const threads: DedupThread[] = [
      { id: '100', name: '[TASK-KAR-148] microrule', archived: false },
      { id: '300', name: '[TASK-KAR-148] microrule dup', archived: true },
      { id: '200', name: '[TASK-KAR-148] microrule dup2', archived: true },
      { id: '50', name: '[TASK-WM-1] single', archived: false },
      { id: '60', name: 'no task id thread', archived: false },
    ];
    const { byTaskId, canonical, dups, dupGroups } = planDedup(threads);
    expect(byTaskId.size).toBe(2);
    expect(dupGroups).toBe(1);
    expect(canonical.find((c) => c.taskId === 'TASK-KAR-148')?.postId).toBe('300');
    expect(dups.map((v) => v.id).sort()).toEqual(['100', '200']);
  });

  it('하위태스크는 별개 키 — 오병합 X (KAR-150 회귀가드)', () => {
    // 제목 [...] 안 풀 id = backfill 저장 키. SUB-A/REVIEW/짧은 id 는 distinct.
    const threads: DedupThread[] = [
      { id: '10', name: '[TASK-KAR-115] parent', archived: false },
      { id: '11', name: '[TASK-KAR-115-SUB-A] sub a', archived: false },
      { id: '12', name: '[TASK-KAR-115-SUB-B] sub b', archived: false },
      { id: '13', name: '[TASK-KAR-115-REVIEW] review', archived: false },
    ];
    const { byTaskId, dups, dupGroups } = planDedup(threads);
    expect(byTaskId.size).toBe(4); // 4 distinct (짧은 parseTaskId 면 1로 뭉침 — 버그)
    expect(dupGroups).toBe(0);
    expect(dups.length).toBe(0);
  });

  it('keep=oldest', () => {
    const { canonical, dups } = planDedup(
      [
        { id: '100', name: '[TASK-X-1] a', archived: false },
        { id: '300', name: '[TASK-X-1] b', archived: false },
      ],
      'oldest',
    );
    expect(canonical[0].postId).toBe('100');
    expect(dups[0].id).toBe('300');
  });

  it('중복 없으면 dup 0', () => {
    const { dups, dupGroups } = planDedup([
      { id: '1', name: '[TASK-A-1] x', archived: false },
      { id: '2', name: '[TASK-A-2] y', archived: false },
    ]);
    expect(dups.length).toBe(0);
    expect(dupGroups).toBe(0);
  });
});

describe('auditForumDupsOnce — 잉여 archive, 절대 delete X', () => {
  const silent = { logger: { log() {}, warn() {} } };

  it('잉여 active 스레드 archive, canonical(최신)·이미archived 는 그대로, delete X', async () => {
    const env = envWith('chA');
    const { client, deleted, archivedCalls } = fakeForum('chA', [
      { id: '100', name: '[TASK-KAR-148] a', archived: false }, // 잉여 active → archive
      { id: '200', name: '[TASK-KAR-148] a', archived: true }, // 이미 archived → 무시
      { id: '300', name: '[TASK-KAR-148] a', archived: true }, // newest = canonical
      { id: '10', name: '[TASK-WM-9] s', archived: false }, // 단일 → 무시
    ]);
    const r = await auditForumDupsOnce(client, env, silent);
    expect(r.taskIds).toBe(2);
    expect(r.dupGroups).toBe(1);
    expect(r.dupThreads).toBe(2);
    expect(r.archived).toBe(1); // 100 만 (active 잉여)
    expect(archivedCalls).toEqual(['100']);
    expect(deleted.length).toBe(0); // ★ delete 절대 X
  });

  it('archive:false = 감지만 (archive X)', async () => {
    const env = envWith('chAF');
    const { client, deleted, archivedCalls } = fakeForum('chAF', [
      { id: '1', name: '[TASK-A-1] x', archived: false },
      { id: '2', name: '[TASK-A-1] x', archived: false },
    ]);
    const r = await auditForumDupsOnce(client, env, { ...silent, archive: false });
    expect(r.dupGroups).toBe(1);
    expect(r.archived).toBe(0);
    expect(archivedCalls.length).toBe(0);
    expect(deleted.length).toBe(0);
  });

  it('YAWNBOT_FORUM_DEDUP_ARCHIVE=0 = 감지만', async () => {
    const env = envWith('chENV');
    (env as Record<string, string>).YAWNBOT_FORUM_DEDUP_ARCHIVE = '0';
    const { client, archivedCalls } = fakeForum('chENV', [
      { id: '1', name: '[TASK-A-1] x', archived: false },
      { id: '2', name: '[TASK-A-1] x', archived: false },
    ]);
    const r = await auditForumDupsOnce(client, env, silent);
    expect(r.dupGroups).toBe(1);
    expect(archivedCalls.length).toBe(0);
  });

  it('중복 정리 시 notify 호출', async () => {
    const env = envWith('chN');
    const { client, deleted } = fakeForum('chN', [
      { id: '1', name: '[TASK-A-1] x', archived: false },
      { id: '2', name: '[TASK-A-1] x', archived: false },
    ]);
    const msgs: string[] = [];
    const r = await auditForumDupsOnce(client, env, {
      ...silent,
      notify: (m) => void msgs.push(m),
    });
    expect(r.dupGroups).toBe(1);
    expect(r.archived).toBe(1);
    expect(deleted.length).toBe(0);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('정리');
  });

  it('중복 없으면 healthy (dupGroups 0, notify X, archive X)', async () => {
    const env = envWith('chH');
    const { client, deleted, archivedCalls } = fakeForum('chH', [
      { id: '1', name: '[TASK-A-1] x', archived: false },
      { id: '2', name: '[TASK-B-2] y', archived: false },
    ]);
    const msgs: string[] = [];
    const r = await auditForumDupsOnce(client, env, {
      ...silent,
      notify: (m) => void msgs.push(m),
    });
    expect(r.dupGroups).toBe(0);
    expect(msgs.length).toBe(0);
    expect(archivedCalls.length).toBe(0);
    expect(deleted.length).toBe(0);
  });
});

describe('buildForumGroundTruth — 예방용 진실 맵', () => {
  it('taskId → canonical postId (Discord 기준)', async () => {
    const env = envWith('chD');
    const { client } = fakeForum('chD', [
      { id: '100', name: '[TASK-KAR-148] a', archived: false },
      { id: '300', name: '[TASK-KAR-148] a', archived: true },
      { id: '10', name: '[TASK-WM-9] s', archived: false },
    ]);
    const gt = await buildForumGroundTruth(client, env);
    expect(gt.get('TASK-KAR-148')).toBe('300');
    expect(gt.get('TASK-WM-9')).toBe('10');
    expect(gt.size).toBe(2);
  });
});
