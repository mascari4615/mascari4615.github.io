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

/** 페이크 forum — active/archived 스레드 + delete 호출 기록(삭제 안 됨을 검증). */
function fakeForum(channelId: string, threads: DedupThread[]) {
  const deleted: string[] = [];
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
          ? { id, delete: async (_r?: string) => void deleted.push(id) }
          : null;
      },
    },
  };
  const client = {
    channels: { fetch: async (id: string) => (id === channelId ? channel : null) },
  };
  return { client, deleted };
}

describe('planDedup (순수)', () => {
  it('taskId 별 그룹화 + newest canonical, 나머지 dup, 무-id 무시', () => {
    const threads: DedupThread[] = [
      { id: '100', name: '[TASK-KAR-148-] microrule', archived: false },
      { id: '300', name: '[TASK-KAR-148-] microrule dup', archived: true },
      { id: '200', name: '[TASK-KAR-148-] microrule dup2', archived: true },
      { id: '50', name: '[TASK-WM-1-] single', archived: false },
      { id: '60', name: 'no task id thread', archived: false },
    ];
    const { byTaskId, canonical, dups, dupGroups } = planDedup(threads);
    expect(byTaskId.size).toBe(2);
    expect(dupGroups).toBe(1);
    expect(canonical.find((c) => c.taskId === 'TASK-KAR-148')?.postId).toBe('300');
    expect(dups.map((v) => v.id).sort()).toEqual(['100', '200']);
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

describe('auditForumDupsOnce — 감지+heal, 절대 삭제 X', () => {
  const silent = { logger: { log() {}, warn() {} } };

  it('중복 감지하되 스레드는 삭제하지 않는다', async () => {
    const env = envWith('chA');
    const { client, deleted } = fakeForum('chA', [
      { id: '100', name: '[TASK-KAR-148] a', archived: false },
      { id: '200', name: '[TASK-KAR-148] a', archived: true },
      { id: '300', name: '[TASK-KAR-148] a', archived: true },
      { id: '10', name: '[TASK-WM-9] s', archived: false },
    ]);
    const r = await auditForumDupsOnce(client, env, silent);
    expect(r.taskIds).toBe(2);
    expect(r.dupGroups).toBe(1);
    expect(r.dupThreads).toBe(2);
    expect(deleted.length).toBe(0); // ★ 삭제 안 함
  });

  it('중복 발견 시 notify 호출 (삭제 대신 알림)', async () => {
    const env = envWith('chN');
    const { client, deleted } = fakeForum('chN', [
      { id: '1', name: '[TASK-A-1] x', archived: false },
      { id: '2', name: '[TASK-A-1] x', archived: true },
    ]);
    const msgs: string[] = [];
    const r = await auditForumDupsOnce(client, env, {
      ...silent,
      notify: (m) => void msgs.push(m),
    });
    expect(r.dupGroups).toBe(1);
    expect(deleted.length).toBe(0);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('중복');
  });

  it('중복 없으면 healthy (dupGroups 0, notify X)', async () => {
    const env = envWith('chH');
    const { client, deleted } = fakeForum('chH', [
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
