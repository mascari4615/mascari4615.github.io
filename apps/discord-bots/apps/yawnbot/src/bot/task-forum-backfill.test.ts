/**
 * task-forum-backfill — TASK md scan + 멱등 backfill 단위 테스트.
 * TASK-YB-039 P6.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseTaskFile,
  listPickableTasks,
  runTaskForumBackfillOnce,
} from './task-forum-backfill';
import { appendTaskForumLink } from './task-forum-bridge';
import type { ClientLike } from './forum-post';

function freshMemo(): { root: string; env: NodeJS.ProcessEnv } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-tfbf-'));
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

describe('parseTaskFile', () => {
  let mem: ReturnType<typeof freshMemo>;
  beforeEach(() => {
    mem = freshMemo();
  });

  it('frontmatter status + H1 title', () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-100-x.md',
      '---\nid: TASK-YB-100\nstatus: ready\n---\n\n# 진짜 제목\n\n내용',
    );
    const r = parseTaskFile(
      path.join(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-100-x.md'),
      'TASK-YB-100-x.md',
    );
    expect(r.status).toBe('ready');
    expect(r.title).toBe('진짜 제목');
  });

  it('title frontmatter 우선 > H1', () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-101.md',
      '---\nstatus: seed\ntitle: "frontmatter 제목"\n---\n\n# H1 제목\n',
    );
    const r = parseTaskFile(
      path.join(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-101.md'),
      'TASK-YB-101.md',
    );
    expect(r.title).toBe('frontmatter 제목');
  });

  it('title + H1 둘 다 없으면 filename body', () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-102-foo-bar.md',
      '---\nstatus: in_progress\n---\n\n본문만\n',
    );
    const r = parseTaskFile(
      path.join(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-102-foo-bar.md'),
      'TASK-YB-102-foo-bar.md',
    );
    expect(r.title).toBe('foo bar');
  });
});

describe('listPickableTasks', () => {
  let mem: ReturnType<typeof freshMemo>;
  beforeEach(() => {
    mem = freshMemo();
  });

  it('pickable status 만 (done/wont_do 제외)', () => {
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-A.md',
      '---\nstatus: ready\n---\n# A\n',
    );
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-B.md',
      '---\nstatus: in_progress\n---\n# B\n',
    );
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-C.md',
      '---\nstatus: seed\n---\n# C\n',
    );
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-D.md',
      '---\nstatus: done\n---\n# D\n',
    );
    writeTask(
      mem.root,
      'projects/yawnbot/tasks',
      'TASK-YB-E.md',
      '---\nstatus: wont_do\n---\n# E\n',
    );
    const r = listPickableTasks(mem.root);
    expect(r.map((t) => t.taskId).sort()).toEqual(['TASK-YB-A', 'TASK-YB-B', 'TASK-YB-C']);
  });

  it('5 TASK_DIRS 전체 스캔', () => {
    writeTask(mem.root, 'tasks', 'TASK-KAR-1.md', '---\nstatus: ready\n---\n# k\n');
    writeTask(mem.root, 'wm/tasks', 'TASK-WM-1.md', '---\nstatus: ready\n---\n# w\n');
    writeTask(mem.root, 'projects/karmolab/tasks', 'TASK-KL-1.md', '---\nstatus: ready\n---\n# l\n');
    writeTask(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-1.md', '---\nstatus: ready\n---\n# y\n');
    writeTask(mem.root, 'life/tasks', 'TASK-LIFE-1.md', '---\nstatus: ready\n---\n# i\n');
    const ids = listPickableTasks(mem.root).map((t) => t.taskId).sort();
    expect(ids).toEqual([
      'TASK-KAR-1',
      'TASK-KL-1',
      'TASK-LIFE-1',
      'TASK-WM-1',
      'TASK-YB-1',
    ]);
  });

  it('TASK- prefix 아닌 파일 = skip', () => {
    writeTask(mem.root, 'projects/yawnbot/tasks', 'README.md', '# x\n');
    writeTask(mem.root, 'projects/yawnbot/tasks', 'notes.md', '# x\n');
    expect(listPickableTasks(mem.root)).toEqual([]);
  });

  it('memoRoot 미존재 = 빈 배열', () => {
    expect(listPickableTasks('/nonexistent/zzz')).toEqual([]);
    expect(listPickableTasks('')).toEqual([]);
  });
});

// ── fake forum (forum-post.test 패턴 재사용) ──
interface FakeForum {
  client: ClientLike;
  createCalls: { name: string; appliedTags?: string[]; embeds?: unknown[] }[];
}

function buildFakeForum(channelId: string): FakeForum {
  const createCalls: FakeForum['createCalls'] = [];
  const tags = [
    'proposal', 'worker-report', 'discovery',
    'pending', 'in-progress', 'approved', 'rejected', 'done',
    'WM', 'KAR', 'YB', 'KL',
  ].map((name) => ({ name, id: `t-${name}` }));
  let seq = 0;
  const channel = {
    id: channelId,
    type: 15,
    availableTags: tags,
    threads: {
      create: async (o: {
        name: string;
        message: { embeds?: unknown[] };
        appliedTags?: string[];
      }) => {
        createCalls.push({
          name: o.name,
          appliedTags: o.appliedTags,
          embeds: o.message.embeds,
        });
        const id = `th-${++seq}`;
        return {
          id,
          appliedTags: o.appliedTags ?? [],
          send: async () => {},
          fetchStarterMessage: async () => null,
          setAppliedTags: async () => {},
          setArchived: async () => {},
        };
      },
      fetch: async () => null,
    },
  };
  return {
    client: {
      channels: { fetch: async (id: string) => (id === channelId ? channel : null) },
    } as unknown as ClientLike,
    createCalls,
  };
}

describe('runTaskForumBackfillOnce — 멱등 + 가시 로그', () => {
  let mem: ReturnType<typeof freshMemo>;
  beforeEach(async () => {
    mem = freshMemo();
    // channel-provision rememberMap 로 'agent-work' → channelId 박음
    const { rememberMap } = await import('../services/channel-provision');
    rememberMap('g1', { 'agent-work': 'ch-bf' }, {
      YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
    } as NodeJS.ProcessEnv);
    mem.env.YAWNBOT_ALLOWED_GUILD_IDS = 'g1';
  });

  it('첫 호출 = pickable 전수 created', async () => {
    writeTask(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-9.md', '---\nstatus: ready\n---\n# nine\n');
    writeTask(mem.root, 'tasks', 'TASK-KAR-9.md', '---\nstatus: in_progress\n---\n# kar9\n');
    const forum = buildFakeForum('ch-bf');
    const logger = { log: () => {}, warn: () => {} };
    const r = await runTaskForumBackfillOnce(forum.client, mem.env, { logger });
    expect(r.scanned).toBe(2);
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.errors).toBe(0);
    expect(forum.createCalls.length).toBe(2);
    // YB 도메인 태그 확인
    const ybCall = forum.createCalls.find((c) => c.name.startsWith('[TASK-YB-9]'));
    expect(ybCall).toBeTruthy();
    expect(ybCall!.appliedTags).toContain('t-YB');
    expect(ybCall!.appliedTags).toContain('t-pending');
  });

  it('두 번째 호출 = 같은 TASK 전부 skipped (멱등)', async () => {
    writeTask(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-10.md', '---\nstatus: ready\n---\n# ten\n');
    const forum = buildFakeForum('ch-bf');
    const logger = { log: () => {}, warn: () => {} };
    await runTaskForumBackfillOnce(forum.client, mem.env, { logger });
    expect(forum.createCalls.length).toBe(1);
    const r2 = await runTaskForumBackfillOnce(forum.client, mem.env, { logger });
    expect(r2.scanned).toBe(1);
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(1);
    expect(forum.createCalls.length).toBe(1); // forum-post 추가 생성 X
  });

  it('이미 ledger 에 있는 TASK = skip (외부 박힌 매핑 존중)', async () => {
    writeTask(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-11.md', '---\nstatus: ready\n---\n# eleven\n');
    appendTaskForumLink(mem.env, {
      taskId: 'TASK-YB-11',
      postId: 'th-pre',
      channelId: 'ch-bf',
    });
    const forum = buildFakeForum('ch-bf');
    const r = await runTaskForumBackfillOnce(forum.client, mem.env, {
      logger: { log: () => {}, warn: () => {} },
    });
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
    expect(forum.createCalls.length).toBe(0);
  });

  it('forum 미프로비저닝 = abort (다음 부팅 재시도)', async () => {
    writeTask(mem.root, 'projects/yawnbot/tasks', 'TASK-YB-12.md', '---\nstatus: ready\n---\n# twelve\n');
    // rememberMap 미설정 환경 — 새 env (다른 guild)
    const isolated = {
      MEMO_REPO_PATH: mem.root,
    } as unknown as NodeJS.ProcessEnv;
    const forum = buildFakeForum('ch-bf');
    const warnings: string[] = [];
    const r = await runTaskForumBackfillOnce(forum.client, isolated, {
      logger: { log: () => {}, warn: (m: string) => warnings.push(m) },
    });
    expect(r.created).toBe(0);
    expect(warnings.some((m) => m.includes('미프로비저닝'))).toBe(true);
  });
});
