/**
 * forum-post — 1포스트=1흐름객체 단일 seam 행동 테스트 (TASK-KAR-018-LT-FORUM P2).
 *
 * 검증 = 진화 모델 1 사이클: 생성(create) → 진화(evolve: embed+status+thread)
 * → 종결(archive). 평행 정의 0 / deep module / silent best-effort.
 */
import { describe, it, expect } from 'vitest';
import {
  createForumPost,
  evolveForumPost,
  archiveForumPost,
  type AvailableTag,
  type ClientLike,
  type ForumChannelLike,
  type ThreadChannelLike,
  type StarterMessageLike,
} from './forum-post';

const TAGS_SPEC: { name: string; id: string }[] = [
  { name: 'proposal', id: 't-prop' },
  { name: 'worker-report', id: 't-wr' },
  { name: 'discovery', id: 't-disc' },
  { name: 'pending', id: 't-pend' },
  { name: 'in-progress', id: 't-ip' },
  { name: 'approved', id: 't-app' },
  { name: 'rejected', id: 't-rej' },
  { name: 'done', id: 't-done' },
  { name: 'WM', id: 't-wm' },
  { name: 'KAR', id: 't-kar' },
  { name: 'YB', id: 't-yb' },
  { name: 'KL', id: 't-kl' },
];

interface CreateCall {
  name: string;
  message: { embeds?: unknown[]; content?: string };
  appliedTags?: string[];
  autoArchiveDuration?: number;
}

interface FakeForum {
  client: ClientLike;
  channel: ForumChannelLike;
  threads: Map<string, FakeThread>;
  createCalls: CreateCall[];
}

interface FakeThread extends ThreadChannelLike {
  sendCalls: { content?: string; embeds?: unknown[] }[];
  starterEdits: { embeds?: unknown[]; content?: string }[];
  setTagsCalls: string[][];
  archivedCalls: boolean[];
  setNameCalls: string[];
  /** thread 명 — setName 호출 시 갱신 (rename 검증용). */
  name: string;
}

function buildFakeForum(opts: {
  channelId: string;
  availableTags?: AvailableTag[];
}): FakeForum {
  const tags = opts.availableTags ?? TAGS_SPEC.map((t) => ({ ...t }));
  const threads = new Map<string, FakeThread>();
  const createCalls: CreateCall[] = [];
  let seq = 0;
  const channel: ForumChannelLike = {
    id: opts.channelId,
    type: 15, // discord.js ChannelType.GuildForum = 15
    availableTags: tags,
    threads: {
      create: async (o) => {
        createCalls.push(o);
        const id = `th-${++seq}`;
        const starterEdits: { embeds?: unknown[]; content?: string }[] = [];
        const starter: StarterMessageLike = {
          edit: async (e) => {
            starterEdits.push(e);
          },
        };
        const sendCalls: { content?: string; embeds?: unknown[] }[] = [];
        const setTagsCalls: string[][] = [];
        const archivedCalls: boolean[] = [];
        const setNameCalls: string[] = [];
        const thread: FakeThread = {
          id,
          name: o.name,
          appliedTags: [...(o.appliedTags ?? [])],
          send: async (m) => {
            sendCalls.push(m);
          },
          fetchStarterMessage: async () => starter,
          setAppliedTags: async (ids) => {
            setTagsCalls.push([...ids]);
            thread.appliedTags = [...ids];
          },
          setArchived: async (b) => {
            archivedCalls.push(b);
          },
          setName: async (n) => {
            setNameCalls.push(n);
            thread.name = n;
          },
          sendCalls,
          starterEdits,
          setTagsCalls,
          archivedCalls,
          setNameCalls,
        };
        threads.set(id, thread);
        return thread;
      },
      fetch: async (id) => threads.get(id) ?? null,
    },
  };
  const client: ClientLike = {
    channels: {
      fetch: async (id) => (id === opts.channelId ? channel : null),
    },
  };
  return { client, channel, threads, createCalls };
}

const PROV_ENV = {
  YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
  // channelIdFor('agent-work') = provisionedId → 없음 → env 폴백 = 없음 → null.
  // 테스트는 env 미설정이라도 reconcile 후 rememberMap 으로 박은 ID 가 쓰임.
} as unknown as NodeJS.ProcessEnv;

describe('forum-post — 진입 (createForumPost)', () => {
  it('channelId null = null 반환 (provision 미설정 + env 없음)', async () => {
    const { client } = buildFakeForum({ channelId: 'ch-fw' });
    const r = await createForumPost(client, {} as NodeJS.ProcessEnv, {
      kind: 'proposal',
      domain: 'WM',
      title: '테스트',
      embed: { title: 'x' },
    });
    expect(r).toBeNull();
  });

  it('포스트 생성: 카드 embed + 태그 3 (kind+pending+domain) + 1440 archive', async () => {
    const { client, channel, createCalls } = buildFakeForum({ channelId: 'ch-fw' });
    const env = { YAWNBOT_AGENT_WORK_CHANNEL_ID: 'ch-fw' } as unknown as NodeJS.ProcessEnv;
    // channelIdFor('agent-work') = ENV_KEY_BY_LOGICAL 매핑 없음 → env 폴백 X.
    // → rememberMap 으로 직접 박음 (테스트 환경).
    const { rememberMap } = await import('../services/channel-provision');
    rememberMap('g1', { 'agent-work': 'ch-fw' }, {
      YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
    } as NodeJS.ProcessEnv);
    const r = await createForumPost(
      client,
      { YAWNBOT_ALLOWED_GUILD_IDS: 'g1' } as NodeJS.ProcessEnv,
      {
        kind: 'proposal',
        domain: 'KAR',
        title: 'foo bar 제안',
        embed: { description: '제안 본문' },
        intro: 'atlas voiced intro',
      },
    );
    expect(r).not.toBeNull();
    expect(r!.channelId).toBe('ch-fw');
    expect(createCalls.length).toBe(1);
    const c = createCalls[0];
    expect(c.name).toBe('foo bar 제안');
    expect(c.message.embeds).toEqual([{ description: '제안 본문' }]);
    expect(c.appliedTags).toEqual(['t-prop', 't-pend', 't-kar']);
    expect(c.autoArchiveDuration).toBe(1440);
    // intro = 첫 스레드 메시지
    const thread = (channel.threads as unknown as { fetch: (id: string) => Promise<FakeThread | null> });
    const th = await thread.fetch(r!.postId);
    expect(th!.sendCalls.length).toBe(1);
    expect(th!.sendCalls[0].content).toBe('atlas voiced intro');
    void env;
  });

  it('title 100자 절단', async () => {
    const { client, createCalls } = buildFakeForum({ channelId: 'ch-fw2' });
    const { rememberMap } = await import('../services/channel-provision');
    rememberMap('g1', { 'agent-work': 'ch-fw2' }, {
      YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
    } as NodeJS.ProcessEnv);
    const long = 'A'.repeat(200);
    await createForumPost(
      client,
      { YAWNBOT_ALLOWED_GUILD_IDS: 'g1' } as NodeJS.ProcessEnv,
      { kind: 'discovery', domain: 'YB', title: long, embed: {} },
    );
    expect(createCalls[0].name.length).toBe(100);
  });
});

describe('forum-post — 진화 (evolveForumPost)', () => {
  async function setupPost(channelId: string): Promise<{
    forum: FakeForum;
    handle: { postId: string; channelId: string };
  }> {
    const forum = buildFakeForum({ channelId });
    const { rememberMap } = await import('../services/channel-provision');
    rememberMap('g1', { 'agent-work': channelId }, {
      YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
    } as NodeJS.ProcessEnv);
    const handle = await createForumPost(
      forum.client,
      { YAWNBOT_ALLOWED_GUILD_IDS: 'g1' } as NodeJS.ProcessEnv,
      {
        kind: 'proposal',
        domain: 'WM',
        title: '시작',
        embed: { v: 1 },
      },
    );
    return { forum, handle: handle! };
  }

  it('embedEdit = starter message edit 호출', async () => {
    const { forum, handle } = await setupPost('ch-ev1');
    await evolveForumPost(forum.client, handle, {
      embedEdit: { v: 2, status: 'updated' },
    });
    const th = forum.threads.get(handle.postId)!;
    expect(th.starterEdits.length).toBe(1);
    expect(th.starterEdits[0].embeds).toEqual([{ v: 2, status: 'updated' }]);
  });

  it('statusTag = 기존 status 만 교체 (kind/domain 보존)', async () => {
    const { forum, handle } = await setupPost('ch-ev2');
    // 진입 = [proposal, pending, WM] = [t-prop, t-pend, t-wm]
    await evolveForumPost(forum.client, handle, { statusTag: 'in-progress' });
    const th = forum.threads.get(handle.postId)!;
    expect(th.setTagsCalls.length).toBe(1);
    const next = th.setTagsCalls[0].sort();
    expect(next).toEqual(['t-ip', 't-prop', 't-wm'].sort());
  });

  it('statusTag 연속 전이 = pending → in-progress → done (toggle exclusive)', async () => {
    const { forum, handle } = await setupPost('ch-ev3');
    await evolveForumPost(forum.client, handle, { statusTag: 'in-progress' });
    await evolveForumPost(forum.client, handle, { statusTag: 'done' });
    const th = forum.threads.get(handle.postId)!;
    expect(th.appliedTags.sort()).toEqual(['t-done', 't-prop', 't-wm'].sort());
  });

  it('threadMessage = thread.send 추가 (intro 후 누적)', async () => {
    const { forum, handle } = await setupPost('ch-ev4');
    await evolveForumPost(forum.client, handle, {
      threadMessage: 'verdict: approved (KarWorker 픽업)',
    });
    const th = forum.threads.get(handle.postId)!;
    expect(th.sendCalls.some((m) => m.content?.includes('verdict'))).toBe(true);
  });

  it('embed + status + threadMessage 동시 = 3 호출 다 발생', async () => {
    const { forum, handle } = await setupPost('ch-ev5');
    await evolveForumPost(forum.client, handle, {
      embedEdit: { v: 9 },
      statusTag: 'approved',
      threadMessage: '결정',
    });
    const th = forum.threads.get(handle.postId)!;
    expect(th.starterEdits.length).toBe(1);
    expect(th.setTagsCalls.length).toBe(1);
    expect(th.sendCalls.some((m) => m.content === '결정')).toBe(true);
  });

  it('setName = thread.setName 호출 + 100자 절단 (TASK-YB-039)', async () => {
    const { forum, handle } = await setupPost('ch-name1');
    await evolveForumPost(forum.client, handle, {
      setName: '[TASK-YB-039] 제안 → TASK 채택',
    });
    const th = forum.threads.get(handle.postId)!;
    expect(th.setNameCalls).toEqual(['[TASK-YB-039] 제안 → TASK 채택']);
    expect(th.name).toBe('[TASK-YB-039] 제안 → TASK 채택');
  });

  it('setName 100자 초과 = 절단', async () => {
    const { forum, handle } = await setupPost('ch-name2');
    await evolveForumPost(forum.client, handle, {
      setName: 'A'.repeat(200),
    });
    const th = forum.threads.get(handle.postId)!;
    expect(th.setNameCalls[0].length).toBe(100);
  });

  it('channel fetch 실패 = silent skip (throw X)', async () => {
    const broken: ClientLike = { channels: { fetch: async () => null } };
    await expect(
      evolveForumPost(broken, { postId: 'x', channelId: 'y' }, {
        statusTag: 'done',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('forum-post — 종결 (archiveForumPost)', () => {
  it('setArchived(true) 호출 — lock=false (Discord native)', async () => {
    const forum = buildFakeForum({ channelId: 'ch-arc' });
    const { rememberMap } = await import('../services/channel-provision');
    rememberMap('g1', { 'agent-work': 'ch-arc' }, {
      YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
    } as NodeJS.ProcessEnv);
    const handle = await createForumPost(
      forum.client,
      { YAWNBOT_ALLOWED_GUILD_IDS: 'g1' } as NodeJS.ProcessEnv,
      { kind: 'worker-report', domain: 'KL', title: '완료', embed: {} },
    );
    await archiveForumPost(forum.client, handle!);
    const th = forum.threads.get(handle!.postId)!;
    expect(th.archivedCalls).toEqual([true]);
  });
});

void PROV_ENV;
