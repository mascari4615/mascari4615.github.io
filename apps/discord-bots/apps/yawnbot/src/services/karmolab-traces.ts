/**
 * KarmoLab 흔적 원장 (TASK-KL-098 Cycle 2).
 *
 * 왜 있나: Cycle 1 로 「내 기록」은 남게 됐지만, 사이트에는 여전히 **남의 흔적이 하나도 안 보인다**.
 * 사람이 와도 왔다는 자국이 안 남으면 아무리 와도 빈 곳으로 보인다 — 「북적북적」의 반대.
 *
 * 왜 원장 하나인가: 사용 횟수·요청·투표를 각자 저장소로 만들면 다음에 「활동 피드」·「랭킹」을
 * 붙일 때 또 새로 만들어야 한다. 흔적은 종류만 다를 뿐 같은 것이므로 한자리에 모은다.
 *
 * 지어낸 수는 절대 안 넣는다. 여기 있는 숫자는 전부 실제로 일어난 일이다.
 * 그래서 초반에는 작을 것이고, 작은 게 맞다.
 *
 * 저장 = `data/karmolab-traces-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

/** 도구 하나의 쓰임. 날짜별로 나눠 둬야 「요즘 뜨는 도구」를 뒤에 붙일 수 있다. */
interface ToolTrace {
  total: number;
  /** YYYY-MM-DD(KST) → 그날 열린 횟수. 오래된 날은 버린다. */
  days: Record<string, number>;
  lastOpenedAt: string;
}

/**
 * 글 한 편.
 *
 * 게시판(이야기)과 도구 요청을 **한 종류로 둔다** — 둘 다 「누가 쓴 글 + 사람들의 반응」이고,
 * 따로 만들면 목록·표·답글·권한을 두 벌씩 갖게 된다. 다른 건 `kind` 하나뿐이다.
 * (이야기는 답글이 주인공, 요청은 표가 주인공 — 화면이 그 차이를 낸다.)
 */
/**
 * 게시판.
 *
 * 커뮤니티는 「글 하나 + 댓글」이 아니라 **어디에 쓰는 글인지**가 먼저 정해지는 곳이다
 * (사용자: "그냥 뭐 댓글만 다는 수준"). 그래서 판을 나눈다.
 * 판마다 성격이 다르므로 목록이 서는 기준도 다르다 — 요청판은 표, 나머지는 마지막 움직임.
 *
 * 판을 늘리는 일은 이 표에 한 줄 넣는 것이 전부다.
 */
export const BOARDS = [
  { id: 'free', label: '자유', desc: '무슨 이야기든' },
  { id: 'qna', label: '질문', desc: '막히는 것을 물어보는 곳' },
  { id: 'show', label: '자랑', desc: '만든 것·찾은 것을 보여주는 곳' },
  { id: 'request', label: '도구 요청', desc: '있었으면 하는 도구' },
  { id: 'notice', label: '공지', desc: '주인이 알리는 것' },
] as const;

export type BoardId = (typeof BOARDS)[number]['id'];

export function isBoardId(raw: unknown): raw is BoardId {
  return typeof raw === 'string' && BOARDS.some((b) => b.id === raw);
}

/** 표가 주인공인 판인가 (목록이 표 순으로 선다). */
export function isVoteBoard(board: BoardId): boolean {
  return board === 'request';
}

/** 주인만 쓸 수 있는 판인가. */
export function isOwnerOnlyBoard(board: BoardId): boolean {
  return board === 'notice';
}

export type PostSort = 'recent' | 'top';

export function isPostSort(raw: unknown): raw is PostSort {
  return raw === 'recent' || raw === 'top';
}

export interface PostReply {
  id: string;
  text: string;
  authorHandle: string;
  authorAccountId: string;
  createdAt: string;
  /** 주인이 단 답인가 — 화면에서 다르게 보여 주려고. */
  byOwner: boolean;
  /** 어느 답글에 달린 답글인가. 최상위면 null (대댓글은 한 단만 접는다 — 더 깊으면 못 읽는다). */
  parentId: string | null;
  /** 이 답글에 좋아요를 누른 사람들. */
  likerAccountIds: string[];
}

export interface Post {
  id: string;
  board: BoardId;
  title: string | null;
  text: string;
  authorHandle: string;
  authorAccountId: string;
  createdAt: string;
  /** 표를 준 사람들 (요청판). 사람 수를 세려면 목록이어야 한다. */
  voterAccountIds: string[];
  /** 좋아요를 누른 사람들 (모든 판). 표와 다르다 — 표는 「이거 만들어 줘」, 좋아요는 「좋다」. */
  likerAccountIds: string[];
  /** 몇 번 열렸나. 같은 사람이 계속 눌러도 잠깐은 한 번만 센다. */
  views: number;
  /** 요청판의 진행 상태. 다른 판은 늘 open. */
  status: 'open' | 'planned' | 'done' | 'declined';
  replies: PostReply[];
  /** 마지막 움직임 — 답글이 달리면 갱신된다. 목록은 보통 이 순서로 선다. */
  bumpedAt: string;
  /** 주인이 목록 맨 위에 고정했나. */
  pinned: boolean;
}

interface TracesState {
  version: 1;
  tools: Record<string, ToolTrace>;
  posts: Post[];
}

const STATE_FILE = 'karmolab-traces-state.json';

/** 날짜별 칸을 남겨 두는 기간. 이보다 오래된 날은 합계에만 남고 칸은 버린다. */
const DAY_RETENTION = 60;

/** 같은 사람이 한 도구를 계속 눌러도 이 시간 안에는 한 번만 센다. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** 도구 요청 = 한 줄. 길어지면 요청이 아니라 이야기다. */
export const REQUEST_MAX_LEN = 200;

/** 이야기 본문 상한. 긴 글도 쓰게 두되 소설은 아니다. */
export const TALK_MAX_LEN = 4000;

/** 이야기 제목 상한. */
export const TITLE_MAX_LEN = 80;

/** 답글 상한. */
export const REPLY_MAX_LEN = 1000;

/** 한 계정이 하루에 올릴 수 있는 글 수 (종류별로 따로 센다). */
export const REQUEST_DAILY_LIMIT = 5;
export const TALK_DAILY_LIMIT = 10;

export function maxLenFor(board: BoardId): number {
  return board === 'request' ? REQUEST_MAX_LEN : TALK_MAX_LEN;
}

export function dailyLimitFor(board: BoardId): number {
  return board === 'request' ? REQUEST_DAILY_LIMIT : TALK_DAILY_LIMIT;
}

/** 오늘(KST) 날짜 문자열. 사이트 전체가 KST 로 말한다. */
export function kstDay(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 도구 id 로 받아들일 모양인지. 아무 문자열이나 받으면 원장이 쓰레기로 찬다. */
export function isValidToolId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(raw);
}

export interface ToolStat {
  toolId: string;
  total: number;
  /** 최근 7일 합 — 「요즘」을 보여주는 값. */
  recent: number;
}

export interface PublicReply {
  id: string;
  text: string;
  authorHandle: string;
  createdAt: string;
  byOwner: boolean;
  parentId: string | null;
  likes: number;
  likedByMe: boolean;
}

export interface PublicPost {
  id: string;
  board: BoardId;
  title: string | null;
  text: string;
  authorHandle: string;
  createdAt: string;
  bumpedAt: string;
  votes: number;
  likes: number;
  views: number;
  replyCount: number;
  status: Post['status'];
  pinned: boolean;
  replies: PublicReply[];
  votedByMe: boolean;
  likedByMe: boolean;
  mine: boolean;
}

/**
 * 옛 글을 새 모양으로 옮긴다.
 *
 * 판(board)·조회수·좋아요·고정은 나중에 생겼다. 옛 글에는 그 칸이 없으므로 읽을 때 채운다 —
 * 파일을 한 번에 갈아엎지 않는 이유는, 갈아엎다 중간에 죽으면 글이 통째로 날아가기 때문이다.
 * 읽을 때마다 채우면 언제 죽어도 잃는 것이 없다.
 */
function migratePost(raw: Partial<Post> & { kind?: string }): Post {
  const board: BoardId = isBoardId(raw.board) ? raw.board : raw.kind === 'request' ? 'request' : 'free';
  const createdAt = raw.createdAt ?? new Date().toISOString();
  return {
    id: raw.id ?? crypto.randomUUID(),
    board,
    title: raw.title ?? null,
    text: raw.text ?? '',
    authorHandle: raw.authorHandle ?? '알 수 없음',
    authorAccountId: raw.authorAccountId ?? '',
    createdAt,
    voterAccountIds: raw.voterAccountIds ?? [],
    likerAccountIds: raw.likerAccountIds ?? [],
    views: typeof raw.views === 'number' ? raw.views : 0,
    status: raw.status ?? 'open',
    replies: (raw.replies ?? []).map((r) => ({
      ...r,
      parentId: r.parentId ?? null,
      likerAccountIds: r.likerAccountIds ?? [],
    })),
    bumpedAt: raw.bumpedAt ?? createdAt,
    pinned: raw.pinned === true,
  };
}

export class KarmolabTraceStore {
  private state: TracesState;
  private dirty = false;
  /** `<방문자열쇠>:<도구>` → 마지막으로 센 시각. 메모리에만 둔다 (재시작하면 한 번 더 세도 무해). */
  private readonly recentOpens = new Map<string, number>();

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): TracesState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<TracesState>;
        return { version: 1, tools: parsed.tools ?? {}, posts: (parsed.posts ?? []).map(migratePost) };
      }
    } catch (error) {
      console.error('[karmolab-traces] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return { version: 1, tools: {}, posts: [] };
  }

  /**
   * 저장. 도구 열림은 자주 일어나므로 **매번 디스크에 쓰지 않는다** —
   * 표시만 해 두고 `flush()` 가 실제로 쓴다 (호출부가 주기적으로 부른다).
   */
  private markDirty(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
      this.dirty = false;
    } catch (error) {
      console.error('[karmolab-traces] 상태 저장 실패:', error);
    }
  }

  /**
   * 방문자를 가리키는 열쇠 — **주소 자체는 저장하지 않는다.**
   * 같은 사람인지만 알면 되지 누구인지는 알 필요가 없다. 그래서 되돌릴 수 없게 섞어서 쓴다.
   */
  static visitorKey(ip: string, userAgent: string): string {
    return crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 16);
  }

  /**
   * 도구가 열렸다. 이미 최근에 센 사람이면 세지 않는다.
   * @returns 실제로 셌으면 true.
   */
  recordToolOpen(toolId: string, visitorKey: string, now: Date = new Date()): boolean {
    if (!isValidToolId(toolId)) return false;

    const dedupeKey = `${visitorKey}:${toolId}`;
    const last = this.recentOpens.get(dedupeKey);
    if (last !== undefined && now.getTime() - last < DEDUPE_WINDOW_MS) return false;
    this.recentOpens.set(dedupeKey, now.getTime());
    // 메모리에 무한정 쌓이지 않게 가끔 훑어 버린다.
    if (this.recentOpens.size > 20000) {
      const cutoff = now.getTime() - DEDUPE_WINDOW_MS;
      for (const [key, at] of this.recentOpens) if (at < cutoff) this.recentOpens.delete(key);
    }

    const day = kstDay(now);
    const trace = this.state.tools[toolId] ?? { total: 0, days: {}, lastOpenedAt: now.toISOString() };
    trace.total += 1;
    trace.days[day] = (trace.days[day] ?? 0) + 1;
    trace.lastOpenedAt = now.toISOString();

    const keep = Object.keys(trace.days).sort().slice(-DAY_RETENTION);
    if (keep.length < Object.keys(trace.days).length) {
      const trimmed: Record<string, number> = {};
      for (const key of keep) trimmed[key] = trace.days[key];
      trace.days = trimmed;
    }

    this.state.tools[toolId] = trace;
    this.markDirty();
    return true;
  }

  /** 공개 집계. 한 번도 안 열린 도구는 아예 안 나온다 — 0 을 줄줄이 보여줄 이유가 없다. */
  toolStats(now: Date = new Date()): ToolStat[] {
    const recentDays = new Set<string>();
    for (let i = 0; i < 7; i += 1) {
      recentDays.add(kstDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    return Object.entries(this.state.tools)
      .map(([toolId, trace]) => {
        let recent = 0;
        for (const day of recentDays) recent += trace.days[day] ?? 0;
        return { toolId, total: trace.total, recent };
      })
      .sort((a, b) => b.recent - a.recent || b.total - a.total);
  }

  /** 사이트가 얼마나 쓰였나 한 줄 — 실제 합계다. */
  pulse(now: Date = new Date()): { toolsUsed: number; opensTotal: number; opensToday: number } {
    const today = kstDay(now);
    let opensTotal = 0;
    let opensToday = 0;
    for (const trace of Object.values(this.state.tools)) {
      opensTotal += trace.total;
      opensToday += trace.days[today] ?? 0;
    }
    return { toolsUsed: Object.keys(this.state.tools).length, opensTotal, opensToday };
  }

  /** 오늘 이 계정이 이 판에 몇 개 올렸나 — 도배 방지. */
  postsTodayBy(accountId: string, board: BoardId, now: Date = new Date()): number {
    const today = kstDay(now);
    return this.state.posts.filter(
      (p) => p.authorAccountId === accountId && p.board === board && kstDay(new Date(p.createdAt)) === today,
    ).length;
  }

  addPost(
    input: { board: BoardId; title?: string | null; text: string; accountId: string; handle: string },
    now: Date = new Date(),
  ): Post {
    const at = now.toISOString();
    const post: Post = {
      id: crypto.randomUUID(),
      board: input.board,
      title: input.title ?? null,
      text: input.text,
      authorHandle: input.handle,
      authorAccountId: input.accountId,
      createdAt: at,
      // 올린 사람은 이미 원하는 사람이다. 자기 요청에 또 눌러야 하면 첫 표가 어색하게 0 이 된다.
      voterAccountIds: isVoteBoard(input.board) ? [input.accountId] : [],
      likerAccountIds: [],
      views: 0,
      status: 'open',
      replies: [],
      bumpedAt: at,
      pinned: false,
    };
    this.state.posts.unshift(post);
    this.markDirty();
    return post;
  }

  /** 표(요청판)를 껐다 켰다. @returns 지금 눌린 상태. null = 없는 글. */
  toggleVote(postId: string, accountId: string): boolean | null {
    return this.toggleIn(postId, accountId, 'voterAccountIds');
  }

  /** 좋아요(모든 판)를 껐다 켰다. */
  toggleLike(postId: string, accountId: string): boolean | null {
    return this.toggleIn(postId, accountId, 'likerAccountIds');
  }

  private toggleIn(postId: string, accountId: string, field: 'voterAccountIds' | 'likerAccountIds'): boolean | null {
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return null;
    const list = post[field];
    const index = list.indexOf(accountId);
    if (index >= 0) list.splice(index, 1);
    else list.push(accountId);
    this.markDirty();
    return index < 0;
  }

  /** 답글 좋아요. */
  toggleReplyLike(postId: string, replyId: string, accountId: string): boolean | null {
    const reply = this.state.posts.find((p) => p.id === postId)?.replies.find((r) => r.id === replyId);
    if (!reply) return null;
    const index = reply.likerAccountIds.indexOf(accountId);
    if (index >= 0) reply.likerAccountIds.splice(index, 1);
    else reply.likerAccountIds.push(accountId);
    this.markDirty();
    return index < 0;
  }

  /**
   * 답글을 단다. 달리면 글이 목록 위로 올라온다 — 대화가 이어지는 곳이 아래로 가라앉으면
   * 아무도 안 본다.
   *
   * `parentId` 를 주면 그 답글에 달리는 답글(대댓글)이다. **한 단만 접는다** — 답글의 답글의
   * 답글까지 가면 화면에서 누가 누구에게 하는 말인지 못 읽는다. 더 깊이 달면 같은 단으로 붙인다.
   */
  addReply(
    postId: string,
    input: { text: string; accountId: string; handle: string; byOwner: boolean; parentId?: string | null },
    now: Date = new Date(),
  ): PostReply | null {
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return null;

    let parentId: string | null = null;
    if (input.parentId) {
      const parent = post.replies.find((r) => r.id === input.parentId);
      if (parent) parentId = parent.parentId ?? parent.id;
    }

    const reply: PostReply = {
      id: crypto.randomUUID(),
      text: input.text,
      authorHandle: input.handle,
      authorAccountId: input.accountId,
      createdAt: now.toISOString(),
      byOwner: input.byOwner,
      parentId,
      likerAccountIds: [],
    };
    post.replies.push(reply);
    post.bumpedAt = reply.createdAt;
    this.markDirty();
    return reply;
  }

  /** 쓴 사람 본인이나 주인만 지운다. */
  deletePost(postId: string, accountId: string, isOwner: boolean): boolean {
    const index = this.state.posts.findIndex((p) => p.id === postId);
    if (index < 0) return false;
    if (!isOwner && this.state.posts[index].authorAccountId !== accountId) return false;
    this.state.posts.splice(index, 1);
    this.markDirty();
    return true;
  }

  /** 답글도 본인이나 주인만 지운다. 달린 대댓글도 같이 사라진다. */
  deleteReply(postId: string, replyId: string, accountId: string, isOwner: boolean): boolean {
    const post = this.state.posts.find((p) => p.id === postId);
    const reply = post?.replies.find((r) => r.id === replyId);
    if (!post || !reply) return false;
    if (!isOwner && reply.authorAccountId !== accountId) return false;
    post.replies = post.replies.filter((r) => r.id !== replyId && r.parentId !== replyId);
    this.markDirty();
    return true;
  }

  /** 주인이 상태·고정을 바꾼다. 준 것만 바꾼다. */
  updatePost(postId: string, patch: { status?: unknown; pinned?: unknown }): Post | null {
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return null;
    const allowed: Post['status'][] = ['open', 'planned', 'done', 'declined'];
    if (typeof patch.status === 'string' && allowed.includes(patch.status as Post['status'])) {
      post.status = patch.status as Post['status'];
    }
    if (typeof patch.pinned === 'boolean') post.pinned = patch.pinned;
    this.markDirty();
    return post;
  }

  /**
   * 글을 열었다. 같은 사람이 잠깐 사이에 여러 번 열어도 한 번만 센다 —
   * 새로고침이 조회수가 되면 그 숫자는 아무 뜻이 없다.
   */
  recordPostView(postId: string, visitorKey: string, now: Date = new Date()): void {
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return;
    const key = `view:${visitorKey}:${postId}`;
    const last = this.recentOpens.get(key);
    if (last !== undefined && now.getTime() - last < DEDUPE_WINDOW_MS) return;
    this.recentOpens.set(key, now.getTime());
    post.views += 1;
    this.markDirty();
  }

  private toPublic(post: Post, viewerAccountId: string | null): PublicPost {
    return {
      id: post.id,
      board: post.board,
      title: post.title,
      text: post.text,
      authorHandle: post.authorHandle,
      createdAt: post.createdAt,
      bumpedAt: post.bumpedAt,
      votes: post.voterAccountIds.length,
      likes: post.likerAccountIds.length,
      views: post.views,
      replyCount: post.replies.length,
      status: post.status,
      pinned: post.pinned,
      replies: post.replies.map((r) => ({
        id: r.id,
        text: r.text,
        authorHandle: r.authorHandle,
        createdAt: r.createdAt,
        byOwner: r.byOwner,
        parentId: r.parentId,
        likes: r.likerAccountIds.length,
        likedByMe: viewerAccountId ? r.likerAccountIds.includes(viewerAccountId) : false,
      })),
      votedByMe: viewerAccountId ? post.voterAccountIds.includes(viewerAccountId) : false,
      likedByMe: viewerAccountId ? post.likerAccountIds.includes(viewerAccountId) : false,
      mine: viewerAccountId !== null && post.authorAccountId === viewerAccountId,
    };
  }

  /** 글 하나 — 커뮤니티의 글 상세 화면이 쓴다. */
  publicPost(postId: string, viewerAccountId: string | null): PublicPost | null {
    const post = this.state.posts.find((p) => p.id === postId);
    return post ? this.toPublic(post, viewerAccountId) : null;
  }

  /**
   * 목록.
   *
   * 고정된 글이 언제나 맨 위. 그다음은 판·정렬에 따라 —
   *  - 요청판: 표 순 (뭘 원하는지 보려는 목록이다)
   *  - `top`: 좋아요 + 답글이 많은 순 (지난 이야기 중 볼 만한 것)
   *  - 그 외: 마지막 움직임 순 (대화가 살아 있는 것이 위)
   */
  publicPosts(board: BoardId, viewerAccountId: string | null, sort: PostSort = 'recent'): PublicPost[] {
    const score = (p: Post): number => p.likerAccountIds.length * 2 + p.replies.length;
    return this.state.posts
      .filter((p) => p.board === board)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (isVoteBoard(board)) return b.voterAccountIds.length - a.voterAccountIds.length || b.createdAt.localeCompare(a.createdAt);
        if (sort === 'top') return score(b) - score(a) || b.bumpedAt.localeCompare(a.bumpedAt);
        return b.bumpedAt.localeCompare(a.bumpedAt);
      })
      .map((p) => this.toPublic(p, viewerAccountId));
  }

  /** 판마다 글이 몇 개인지 — 목록 위 판 고르는 줄에 실제 수를 띄운다. */
  boardCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const post of this.state.posts) counts[post.board] = (counts[post.board] ?? 0) + 1;
    return counts;
  }

  /** 이 사람이 쓴 글·답글 수 — 공개 프로필의 「활동」. */
  activityOf(handle: string): { posts: number; replies: number } {
    let posts = 0;
    let replies = 0;
    for (const post of this.state.posts) {
      if (post.authorHandle === handle) posts += 1;
      replies += post.replies.filter((r) => r.authorHandle === handle).length;
    }
    return { posts, replies };
  }

  /** 첫 화면에 띄울 최근 글 — 판을 가리지 않고 마지막 움직임 순. */
  recentPosts(limit: number, viewerAccountId: string | null): PublicPost[] {
    return [...this.state.posts]
      .sort((a, b) => b.bumpedAt.localeCompare(a.bumpedAt))
      .slice(0, limit)
      .map((p) => this.toPublic(p, viewerAccountId));
  }
}

let singleton: KarmolabTraceStore | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function getKarmolabTraceStore(): KarmolabTraceStore {
  if (!singleton) {
    singleton = new KarmolabTraceStore();
    // 도구 열림은 잦다. 모아서 20초에 한 번 쓴다 — 봇이 죽어도 20초어치만 잃는다.
    flushTimer = setInterval(() => singleton?.flush(), 20_000);
    flushTimer.unref?.();
  }
  return singleton;
}
