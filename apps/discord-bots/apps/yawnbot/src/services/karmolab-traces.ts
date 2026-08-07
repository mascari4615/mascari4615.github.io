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
export interface Gallery {
  id: string;
  label: string;
  desc: string;
  /** 만든 사람. 처음부터 있던 갤러리는 null. */
  createdByHandle: string | null;
  createdAt: string;
  /** 처음부터 있던 갤러리 — 아무도 못 지운다. */
  builtin: boolean;
  /** 표가 주인공인 갤러리 (목록이 표 순으로 선다). 도구 요청판이 그렇다. */
  voteStyle: boolean;
  /** 주인만 글을 쓸 수 있는 갤러리 (공지). */
  ownerOnly: boolean;
  /** 글에 제목이 있는가. 요청판처럼 한 줄짜리는 제목이 없다. */
  titled: boolean;
  /**
   * 말머리 — 갤러리 안에서 글을 한 번 더 가르는 이름들 (디시·아카의 말머리/카테고리).
   * 갤러리마다 다르다. 만든 사람이 정한다. 없으면 말머리 없이 쓴다.
   */
  tags: string[];
}

/**
 * 처음부터 있는 갤러리.
 *
 * 이제 갤러리는 **데이터**다 — 사람이 새로 만들 수 있다 (디시·아카의 갤러리·채널처럼).
 * 아래는 씨앗일 뿐이고, 저장소에 없으면 한 번 심는다.
 */
export const SEED_GALLERIES: Gallery[] = [
  { id: 'free', label: '자유', desc: '무슨 이야기든', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['잡담', '질문', '정보'] },
  { id: 'qna', label: '질문', desc: '막히는 것을 물어보는 곳', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['도구', '계정', '기타'] },
  { id: 'show', label: '자랑', desc: '만든 것·찾은 것을 보여주는 곳', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['만든 것', '찾은 것'] },
  { id: 'request', label: '도구 요청', desc: '있었으면 하는 도구', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: true, ownerOnly: false, titled: false, tags: [] },
  { id: 'notice', label: '공지', desc: '주인이 알리는 것', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: true, titled: true, tags: [] },
];

export type BoardId = string;

/** 갤러리 주소로 쓸 수 있는 모양인가. 주소에 들어가므로 영소문자·숫자·붙임표만. */
export function isValidGalleryId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9][a-z0-9-]{1,20}$/.test(raw);
}

/** 이름에서 주소를 만든다. 한글 이름이면 못 만드니 그때는 사람이 직접 적게 한다. */
export function slugifyGalleryId(label: string): string {
  return String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 21);
}

export const GALLERY_LABEL_MAX = 20;
export const GALLERY_DESC_MAX = 60;
/** 한 사람이 하루에 만들 수 있는 갤러리 수 — 빈 갤러리가 늘어나면 목록이 죽는다. */
export const GALLERY_DAILY_LIMIT = 3;
export const TAG_MAX_LEN = 10;
/** 말머리가 너무 많으면 고르는 것이 일이 된다. */
export const TAG_MAX_COUNT = 8;

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
  /** 말머리 — 그 갤러리가 가진 것 중 하나. 안 골랐으면 null. */
  tag: string | null;
}

export interface Report {
  id: string;
  postId: string;
  replyId: string | null;
  byAccountId: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface TracesState {
  version: 1;
  tools: Record<string, ToolTrace>;
  posts: Post[];
  galleries: Gallery[];
  reports: Report[];
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

export function maxLenFor(gallery: Gallery): number {
  return gallery.titled ? TALK_MAX_LEN : REQUEST_MAX_LEN;
}

export function dailyLimitFor(gallery: Gallery): number {
  return gallery.titled ? TALK_DAILY_LIMIT : REQUEST_DAILY_LIMIT;
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
  tag: string | null;
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
/** 처음부터 있어야 하는 갤러리를 채워 넣는다 (없을 때만 — 사람이 고친 것은 안 덮는다). */
function withSeeds(existing: Gallery[]): Gallery[] {
  // 말머리 칸은 나중에 생겼다 — 없으면 빈 목록으로 채운다.
  // 처음부터 있던 갤러리는 씨앗의 말머리를 받는다 (기능이 생기기 전에 만들어졌으므로 비어 있다).
  const out = existing.map((g) => {
    const seed = SEED_GALLERIES.find((x) => x.id === g.id);
    const tags = Array.isArray(g.tags) && g.tags.length > 0 ? g.tags : (seed && g.builtin ? [...seed.tags] : []);
    return { ...g, tags };
  });
  for (const seed of SEED_GALLERIES) {
    if (!out.some((g) => g.id === seed.id)) out.push({ ...seed });
  }
  return out;
}

function migratePost(raw: Partial<Post> & { kind?: string }): Post {
  const board: BoardId = isValidGalleryId(raw.board) ? raw.board : raw.kind === 'request' ? 'request' : 'free';
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
    tag: typeof raw.tag === 'string' ? raw.tag : null,
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
        return {
          version: 1,
          tools: parsed.tools ?? {},
          posts: (parsed.posts ?? []).map(migratePost),
          galleries: withSeeds(parsed.galleries ?? []),
          reports: parsed.reports ?? [],
        };
      }
    } catch (error) {
      console.error('[karmolab-traces] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return { version: 1, tools: {}, posts: [], galleries: withSeeds([]), reports: [] };
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
    input: { board: BoardId; title?: string | null; text: string; accountId: string; handle: string; tag?: string | null },
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
      voterAccountIds: this.gallery(input.board)?.voteStyle ? [input.accountId] : [],
      likerAccountIds: [],
      views: 0,
      status: 'open',
      replies: [],
      bumpedAt: at,
      pinned: false,
      tag: input.tag ?? null,
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
      tag: post.tag,
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

  /**
   * 갤러리를 가리지 않는 검색.
   *
   * 지금까지는 보고 있는 갤러리 안에서만 걸렀다 — 「그 글 어디 있더라」를 못 찾는다.
   * 제목·본문·글쓴이·답글까지 본다. 답글까지 보는 이유: 사람은 답글에 적힌 말을 기억한다.
   */
  searchPosts(query: string, viewerAccountId: string | null, limit = 40): PublicPost[] {
    const needle = String(query ?? '').trim().toLowerCase();
    if (needle.length < 1) return [];
    return this.state.posts
      .filter((p) => {
        const hay = `${p.title ?? ''} ${p.text} ${p.authorHandle} ${p.tag ?? ''} ${p.replies
          .map((r) => r.text)
          .join(' ')}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a2, b) => b.bumpedAt.localeCompare(a2.bumpedAt))
      .slice(0, limit)
      .map((p) => this.toPublic(p, viewerAccountId));
  }

  /** 이 사람이 쓴 글 — 프로필의 「쓴 글」. */
  postsBy(handle: string, viewerAccountId: string | null, limit = 30): PublicPost[] {
    return this.state.posts
      .filter((p) => p.authorHandle === handle)
      .sort((a2, b) => b.createdAt.localeCompare(a2.createdAt))
      .slice(0, limit)
      .map((p) => this.toPublic(p, viewerAccountId));
  }

  /** 이 사람이 단 답글 — 어느 글에 달았는지까지 같이 준다. */
  repliesBy(handle: string, limit = 30): Array<{ postId: string; postTitle: string; text: string; createdAt: string }> {
    const out: Array<{ postId: string; postTitle: string; text: string; createdAt: string }> = [];
    for (const post of this.state.posts) {
      for (const reply of post.replies) {
        if (reply.authorHandle !== handle) continue;
        out.push({
          postId: post.id,
          postTitle: post.title ?? post.text.slice(0, 30),
          text: reply.text,
          createdAt: reply.createdAt,
        });
      }
    }
    return out.sort((a2, b) => b.createdAt.localeCompare(a2.createdAt)).slice(0, limit);
  }

  /**
   * 신고 — 사람이 늘면 반드시 필요해진다.
   * 지우지는 않는다. **주인이 볼 목록에 올릴 뿐이다** — 신고 한 번으로 글이 사라지면
   * 그것 자체가 남을 지우는 단추가 된다.
   */
  report(input: { postId: string; replyId?: string | null; byAccountId: string; reason: string }, now: Date = new Date()): boolean {
    const post = this.state.posts.find((p) => p.id === input.postId);
    if (!post) return false;
    if (input.replyId && !post.replies.some((r) => r.id === input.replyId)) return false;
    // 같은 사람이 같은 것을 여러 번 신고해도 한 줄이다.
    const already = this.state.reports.some(
      (r) => r.postId === input.postId && (r.replyId ?? null) === (input.replyId ?? null) && r.byAccountId === input.byAccountId,
    );
    if (already) return true;
    this.state.reports.unshift({
      id: crypto.randomUUID(),
      postId: input.postId,
      replyId: input.replyId ?? null,
      byAccountId: input.byAccountId,
      reason: String(input.reason ?? '').trim().slice(0, 100),
      createdAt: now.toISOString(),
      resolvedAt: null,
    });
    this.markDirty();
    return true;
  }

  /** 아직 안 본 신고 (주인용). */
  openReports(): Report[] {
    return this.state.reports.filter((r) => r.resolvedAt === null);
  }

  /** 신고를 봤다고 표시 (주인용). 글은 안 건드린다 — 지우는 것은 따로 누른다. */
  resolveReport(id: string, now: Date = new Date()): boolean {
    const found = this.state.reports.find((r) => r.id === id);
    if (!found || found.resolvedAt) return false;
    found.resolvedAt = now.toISOString();
    this.markDirty();
    return true;
  }

  /** 글의 날것 — 알림 보낼 때 글쓴이 계정 id 가 필요하다 (공개 모양에는 없다). */
  rawPost(postId: string): Post | null {
    return this.state.posts.find((p) => p.id === postId) ?? null;
  }

  /** 그 답글을 쓴 사람의 계정 id — 대댓글 알림이 쓴다. */
  replyAuthorAccountId(postId: string, replyId: string): string | null {
    return this.state.posts.find((p) => p.id === postId)?.replies.find((r) => r.id === replyId)?.authorAccountId ?? null;
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
  publicPosts(board: BoardId, viewerAccountId: string | null, sort: PostSort = 'recent', tag: string | null = null): PublicPost[] {
    const score = (p: Post): number => p.likerAccountIds.length * 2 + p.replies.length;
    const voteStyle = this.gallery(board)?.voteStyle === true;
    return this.state.posts
      .filter((p) => p.board === board)
      .filter((p) => !tag || p.tag === tag)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (voteStyle) return b.voterAccountIds.length - a.voterAccountIds.length || b.createdAt.localeCompare(a.createdAt);
        if (sort === 'top') return score(b) - score(a) || b.bumpedAt.localeCompare(a.bumpedAt);
        return b.bumpedAt.localeCompare(a.bumpedAt);
      })
      .map((p) => this.toPublic(p, viewerAccountId));
  }

  /** 갤러리 전부 (만든 순서 — 처음부터 있던 것이 앞). */
  galleries(): Gallery[] {
    return [...this.state.galleries];
  }

  gallery(id: string): Gallery | null {
    return this.state.galleries.find((g) => g.id === id) ?? null;
  }

  /** 오늘 이 사람이 갤러리를 몇 개 만들었나 — 빈 갤러리가 늘어나면 목록이 죽는다. */
  galleriesTodayBy(handle: string, now: Date = new Date()): number {
    const today = kstDay(now);
    return this.state.galleries.filter(
      (g) => g.createdByHandle === handle && kstDay(new Date(g.createdAt)) === today,
    ).length;
  }

  /** 갤러리를 만든다. 같은 주소가 있으면 null. */
  addGallery(
    input: { id: string; label: string; desc: string; handle: string },
    now: Date = new Date(),
  ): Gallery | null {
    if (this.state.galleries.some((g) => g.id === input.id)) return null;
    const gallery: Gallery = {
      id: input.id,
      label: input.label,
      desc: input.desc,
      createdByHandle: input.handle,
      createdAt: now.toISOString(),
      builtin: false,
      voteStyle: false,
      ownerOnly: false,
      titled: true,
      tags: [],
    };
    this.state.galleries.push(gallery);
    this.markDirty();
    return gallery;
  }

  /**
   * 갤러리를 지운다 — **빈 갤러리만**. 글이 있는데 지우면 그 글들이 갈 곳을 잃는다.
   * 만든 사람이나 주인만 지운다. 처음부터 있던 갤러리는 아무도 못 지운다.
   */
  deleteGallery(id: string, handle: string, isOwner: boolean): 'ok' | 'not_found' | 'not_allowed' | 'not_empty' {
    const gallery = this.state.galleries.find((g) => g.id === id);
    if (!gallery) return 'not_found';
    if (gallery.builtin) return 'not_allowed';
    if (!isOwner && gallery.createdByHandle !== handle) return 'not_allowed';
    if (this.state.posts.some((p) => p.board === id)) return 'not_empty';
    this.state.galleries = this.state.galleries.filter((g) => g.id !== id);
    this.markDirty();
    return 'ok';
  }

  /**
   * 갤러리의 말머리를 정한다 — 만든 사람이나 주인만.
   * 이미 그 말머리로 쓴 글이 있어도 지울 수 있다. 그 글의 말머리는 그대로 남되 거르는 줄에서만
   * 사라진다 (글을 건드리는 것보다 낫다).
   */
  setGalleryTags(id: string, tags: string[], handle: string, isOwner: boolean): 'ok' | 'not_found' | 'not_allowed' {
    const gallery = this.state.galleries.find((g) => g.id === id);
    if (!gallery) return 'not_found';
    if (!isOwner && gallery.createdByHandle !== handle) return 'not_allowed';
    const cleaned: string[] = [];
    for (const raw of tags) {
      const tag = String(raw ?? '').trim().slice(0, TAG_MAX_LEN);
      if (tag && !cleaned.includes(tag)) cleaned.push(tag);
      if (cleaned.length >= TAG_MAX_COUNT) break;
    }
    gallery.tags = cleaned;
    this.markDirty();
    return 'ok';
  }

  /** 갤러리마다 글이 몇 개인지 — 고르는 줄에 실제 수를 띄운다. */
  boardCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const post of this.state.posts) counts[post.board] = (counts[post.board] ?? 0) + 1;
    return counts;
  }

  /**
   * 갤러리 한 줄 요약 — 목록 화면이 쓴다.
   * 글 수만 있으면 어느 갤러리가 살아 있는지 모른다. **마지막 글 제목과 시각**이 있어야
   * 「여기 지금 뭐가 오가나」가 보인다.
   */
  boardSummaries(): Record<string, { count: number; lastTitle: string | null; lastAt: string | null }> {
    const out: Record<string, { count: number; lastTitle: string | null; lastAt: string | null }> = {};
    for (const post of this.state.posts) {
      const entry = out[post.board] ?? { count: 0, lastTitle: null, lastAt: null };
      entry.count += 1;
      if (!entry.lastAt || post.bumpedAt > entry.lastAt) {
        entry.lastAt = post.bumpedAt;
        entry.lastTitle = post.title ?? post.text.slice(0, 40);
      }
      out[post.board] = entry;
    }
    return out;
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

  /** 갤러리를 가리지 않는 최근 글 — 첫 화면·커뮤니티 홈이 쓴다. */
  recentPosts(limit: number, viewerAccountId: string | null): PublicPost[] {
    return [...this.state.posts]
      .sort((a, b) => b.bumpedAt.localeCompare(a.bumpedAt))
      .slice(0, limit)
      .map((p) => this.toPublic(p, viewerAccountId));
  }

  /**
   * 베스트 — 갤러리를 가리지 않고 **반응이 모인 글**.
   * (아카의 「베스트 라이브」 자리: 추천이 몰린 글만 따로 모은다.)
   * 반응이 아예 없는 글은 안 넣는다 — 그냥 최근 글과 같아지면 그 자리가 뜻을 잃는다.
   */
  bestPosts(limit: number, viewerAccountId: string | null): PublicPost[] {
    const score = (p: Post): number => p.likerAccountIds.length * 2 + p.voterAccountIds.length + p.replies.length;
    return this.state.posts
      .filter((p) => score(p) > 0)
      .sort((a, b) => score(b) - score(a) || b.bumpedAt.localeCompare(a.bumpedAt))
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
