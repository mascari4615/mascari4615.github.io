/**
 * task-forum-reconciler — md status drift → forum tag sync 단위 테스트.
 * TASK-YB-039 P5.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  reconcileTaskForumStatusOnce,
  readStatusState,
  writeStatusState,
} from './task-forum-reconciler';
import { appendTaskForumLink } from './task-forum-bridge';
import type { ClientLike, ThreadChannelLike, ForumChannelLike } from './forum-post';

function freshMemo(): { root: string; env: NodeJS.ProcessEnv } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-tfr-'));
  return {
    root,
    env: { MEMO_REPO_PATH: root } as unknown as NodeJS.ProcessEnv,
  };
}

function writeTask(
  root: string,
  dir: string,
  filename: string,
  body: string,
): void {
  const d = path.join(root, dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, filename), body, 'utf-8');
}

interface EvolveCall {
  postId: string;
  statusTag?: string;
  threadMessage?: string;
}

function buildFakeClient(channelId: string, postIds: string[]): {
  client: ClientLike;
  evolveCalls: EvolveCall[];
} {
  const evolveCalls: EvolveCall[] = [];
  const tags = [
    'proposal', 'worker-report', 'discovery',
    'pending', 'in-progress', 'approved', 'rejected', 'done',
    'WM', 'KAR', 'YB', 'KL',
  ].map((name) => ({ name, id: `t-${name}` }));
  const threads = new Map<string, ThreadChannelLike>();
  for (const pid of postIds) {
    const t: ThreadChannelLike = {
      id: pid,
      appliedTags: ['t-worker-report', 't-pending', 't-YB'],
      send: async (m) => {
        evolveCalls.push({ postId: pid, threadMessage: m.content });
      },
      fetchStarterMessage: async () => null,
      setAppliedTags: async () => {},
      setArchived: async () => {},
    };
    threads.set(pid, t);
  }
  const channel: ForumChannelLike = {
    id: channelId,
    type: 15,
    availableTags: tags,
    threads: {
      create: async () => threads.values().next().value!,
      fetch: async (id) => threads.get(id) ?? null,
    },
  };
  const client: ClientLike = {
    channels: { fetch: async (id) => (id === channelId ? channel : null) },
  };
  // 메시지 send 도 evolveCalls 누적 / setAppliedTags 도 추적
  for (const [pid, t] of threads) {
    const orig = t.setAppliedTags;
    t.setAppliedTags = async (ids: string[]) => {
      // status 태그만 추적 (tag id 가 't-<status>' 패턴)
      const statusId = ids.find((id) =>
        ['t-pending', 't-in-progress', 't-approved', 't-rejected', 't-done'].includes(id),
      );
      evolveCalls.push({
        postId: pid,
        statusTag: statusId ? statusId.slice(2) : undefined,
      });
      void orig;
    };
  }
  return { client, evolveCalls };
}

describe('readStatusState / writeStatusState', () => {
  it('round-trip', () => {
    const { env } = freshMemo();
    expect(readStatusState(env)).toEqual({});
    writeStatusState(env, { 'TASK-YB-1': 'in-progress' });
    expect(readStatusState(env)).toEqual({ 'TASK-YB-1': 'in-progress' });
  });
  it('malformed = 빈 객체', () => {
    const { env, root } = freshMemo();
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.claude', 'task-forum-status-state.json'),
      'not-json',
      'utf-8',
    );
    expect(readStatusState(env)).toEqual({});
  });
});

describe('reconcileTaskForumStatusOnce', () => {
  let mem: ReturnType<typeof freshMemo>;
  beforeEach(() => {
    mem = freshMemo();
  });

  it('빈 ledger = no-op (scanned=0)', async () => {
    const r = await reconcileTaskForumStatusOnce(null, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(r).toEqual({ scanned: 0, drifted: 0, skipped: 0, missing: 0, errors: 0 });
  });

  it('첫 sync = 모든 entry drifted (state 캐시 미존재)', async () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-1.md',
      '---\nstatus: in_progress\n---\n# x\n',
    );
    appendTaskForumLink(mem.env, {
      taskId: 'TASK-YB-1',
      postId: 'th-1',
      channelId: 'ch-tw',
    });
    const { client, evolveCalls } = buildFakeClient('ch-tw', ['th-1']);
    const r = await reconcileTaskForumStatusOnce(client, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(r.scanned).toBe(1);
    expect(r.drifted).toBe(1);
    expect(r.skipped).toBe(0);
    expect(evolveCalls.some((c) => c.statusTag === 'in-progress')).toBe(true);
    // state 캐시에 박힘
    expect(readStatusState(mem.env)).toEqual({ 'TASK-YB-1': 'in-progress' });
  });

  it('변화 없으면 skipped (Discord API 미호출)', async () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-2.md',
      '---\nstatus: done\n---\n# x\n',
    );
    appendTaskForumLink(mem.env, {
      taskId: 'TASK-YB-2',
      postId: 'th-2',
      channelId: 'ch-tw',
    });
    writeStatusState(mem.env, { 'TASK-YB-2': 'done' }); // 이미 last-applied 박힘
    const { client, evolveCalls } = buildFakeClient('ch-tw', ['th-2']);
    const r = await reconcileTaskForumStatusOnce(client, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(r.drifted).toBe(0);
    expect(r.skipped).toBe(1);
    expect(evolveCalls.length).toBe(0);
  });

  it('drift 감지 (in-progress → done)', async () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-3.md',
      '---\nstatus: done\n---\n# x\n',
    );
    appendTaskForumLink(mem.env, {
      taskId: 'TASK-YB-3',
      postId: 'th-3',
      channelId: 'ch-tw',
    });
    writeStatusState(mem.env, { 'TASK-YB-3': 'in-progress' });
    const { client, evolveCalls } = buildFakeClient('ch-tw', ['th-3']);
    await reconcileTaskForumStatusOnce(client, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(evolveCalls.some((c) => c.statusTag === 'done')).toBe(true);
    expect(evolveCalls.some((c) => c.threadMessage?.includes('in-progress'))).toBe(true);
    expect(evolveCalls.some((c) => c.threadMessage?.includes('done'))).toBe(true);
  });

  it('md 파일 못 찾음 = missing 카운트', async () => {
    appendTaskForumLink(mem.env, {
      taskId: 'TASK-YB-999',
      postId: 'th-orphan',
      channelId: 'ch-tw',
    });
    const { client, evolveCalls } = buildFakeClient('ch-tw', ['th-orphan']);
    const r = await reconcileTaskForumStatusOnce(client, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(r.missing).toBe(1);
    expect(r.drifted).toBe(0);
    expect(evolveCalls.length).toBe(0);
  });

  it('client=null = dry-run (drift 카운트만, API 미호출)', async () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-4.md',
      '---\nstatus: ready\n---\n# x\n',
    );
    appendTaskForumLink(mem.env, {
      taskId: 'TASK-YB-4',
      postId: 'th-4',
      channelId: 'ch-tw',
    });
    const r = await reconcileTaskForumStatusOnce(null, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(r.drifted).toBe(1);
    // dry-run 도 state 박음 (실제 sync 등가)
    expect(readStatusState(mem.env)).toEqual({ 'TASK-YB-4': 'pending' });
  });
});
