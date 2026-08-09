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
import type { VisitorKind } from './karmolab-visitor-kind';

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
  /**
   * 이슈식 갤러리 — 깃허브 이슈처럼 「글마다 번호와 상태가 있고, 언젠가 닫힌다」 (사용자 요청).
   *
   * 왜 스위치 하나인가: 이야기 갤러리와 이슈 갤러리는 **다른 게시판이 아니라 같은 게시판의
   * 다른 쓰임**이다. 글·답글·말머리·좋아요는 그대로고, 달라지는 건 「이 글이 끝났는가」를
   * 함께 들고 다니느냐뿐이다. 따로 만들면 두 벌을 영원히 같이 고쳐야 한다.
   *
   * 켜면: 글마다 번호(#3) · 상태(열림/할 예정/됐음/안 함) · 열림만 보기 · 닫으며 남기는 한 줄.
   */
  issueStyle: boolean;
}

/**
 * 처음부터 있는 갤러리.
 *
 * 이제 갤러리는 **데이터**다 — 사람이 새로 만들 수 있다 (디시·아카의 갤러리·채널처럼).
 * 아래는 씨앗일 뿐이고, 저장소에 없으면 한 번 심는다.
 */
export const SEED_GALLERIES: Gallery[] = [
  { id: 'free', label: '자유', desc: '무슨 이야기든', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['잡담', '질문', '정보'], issueStyle: false },
  { id: 'qna', label: '질문', desc: '막히는 것을 물어보는 곳', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['도구', '계정', '기타'], issueStyle: false },
  { id: 'show', label: '자랑', desc: '만든 것·찾은 것을 보여주는 곳', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['만든 것', '찾은 것'], issueStyle: false },
  { id: 'request', label: '도구 요청', desc: '있었으면 하는 도구', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: true, ownerOnly: false, titled: false, tags: [], issueStyle: true },
  { id: 'notice', label: '공지', desc: '주인이 알리는 것', createdByHandle: null, createdAt: '2026-01-01T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: true, titled: true, tags: [], issueStyle: false },
  // KarmoLab 이 WM(Witch-Mendokusai) 의 메인 웹이 되면서 생긴 자리 (TASK-KL-165).
  // WM 페이지(`/karmolab/#wm`)가 이 갤러리를 제 이야기판으로 읽는다.
  { id: 'wm', label: '마녀 이야기', desc: 'Witch-Mendokusai — 감상 · 설정 이야기 · 그림 · 바라는 것', createdByHandle: null, createdAt: '2026-08-08T00:00:00.000Z', builtin: true, voteStyle: false, ownerOnly: false, titled: true, tags: ['감상', '설정', '그림', '바라는 것'], issueStyle: false },
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
/** 상태를 바꾸며 남기는 한 줄. 길어지면 그건 답글로 쓸 말이다. */
export const STATUS_NOTE_MAX = 120;

/** 계정을 지운 사람의 글에 남는 이름. 이 이름으로는 아무도 로그인할 수 없다(주소 규칙 밖). */
export const DELETED_HANDLE = '지운 계정';

export type PostSort = 'recent' | 'top';

export function isPostSort(raw: unknown): raw is PostSort {
  return raw === 'recent' || raw === 'top';
}

/**
 * 익명으로 남긴 글·답글의 얼굴 (TASK-KL-157).
 *
 * 채팅과 **같은 이름표**를 쓴다 — 채팅에서 「연보라 수달」이던 사람이 글에서도 그렇게 보인다.
 * 그래야 두 자리가 한 커뮤니티가 된다. 이 값이 있으면 `authorHandle` 은 비어 있고(빈 문자열),
 * 검색·활동·프로필 어디에도 안 잡힌다 — 익명은 끝까지 익명이어야 한다.
 */
export interface AnonFace {
  name: string;
  color: string;
}

export interface PostReply {
  id: string;
  text: string;
  authorHandle: string;
  authorAccountId: string;
  /** 익명으로 남겼으면 그 얼굴. 실명이면 null. */
  anon: AnonFace | null;
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
  /** 익명으로 남겼으면 그 얼굴. 실명이면 null. */
  anon: AnonFace | null;
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
  /**
   * 갤러리 안에서의 번호 (#3). 이슈식 갤러리에서 「그 3번 말이야」라고 부를 수 있게 한다.
   * **한 번 준 번호는 안 바뀐다** — 글이 지워져도 뒤 글이 당겨 오지 않는다. 번호가 움직이면
   * 어제 남긴 「#3 참고」가 오늘 다른 글을 가리키게 된다.
   */
  seq: number;
  /** 상태를 바꾸며 남긴 한 줄 (닫는 이유·만들어진 것). 안 남겼으면 null. */
  statusNote: string | null;
  /** 상태를 바꾼 시각·사람. 「언제 닫혔나」가 안 보이면 닫힌 글은 그냥 사라진 글처럼 읽힌다. */
  statusAt: string | null;
  statusBy: string | null;
}

export interface Report {
  id: string;
  /**
   * 무엇에 대한 신고인가 (TASK-KL-157).
   * 예전에 쌓인 줄은 전부 글이었다 — 없으면 `post` 로 읽는다.
   */
  kind: 'post' | 'chat';
  /** 글 신고면 글 id, 채팅 신고면 그 줄의 id. */
  postId: string;
  replyId: string | null;
  byAccountId: string;
  reason: string;
  /**
   * **신고 당시의 그 말**을 통째로 베껴 둔다.
   *
   * 채팅은 하루 뒤 사라지고 글은 고쳐질 수 있다. 원본만 가리키는 신고는, 주인이 열어 볼
   * 때쯤이면 「무엇을 보고 판단하라는 것인지」가 사라져 있다. 그러면 신고는 처리되지 않고
   * 쌓이기만 한다.
   */
  subject: string;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * 사이트를 다녀간 자국 (블로그의 Total / Today 와 같은 것).
 *
 * 도구 열림과 따로 센다 — 첫 화면만 보고 나간 사람도 다녀간 사람이고, 그 수가 곧
 * 「이 사이트에 사람이 오나」다. 도구 열림만 세면 첫 화면은 영원히 아무도 안 온 곳이 된다.
 *
 * 주소는 저장하지 않는다. 같은 사람인지 알아볼 열쇠(되돌릴 수 없게 섞은 것)만 오늘치를 들고
 * 있다가 날이 바뀌면 버린다 — 오늘 몇 명인지 세는 데는 오늘 것만 있으면 된다.
 */
interface VisitTrace {
  /** 지금까지 방문 수 — **사람만** (같은 사람의 연속 조작은 30분에 한 번만 센다). */
  total: number;
  /** 날짜별 방문 수 (사람만). */
  days: Record<string, number>;
  /** 날짜별 다녀간 사람 수 (같은 사람은 하루 한 번). */
  people: Record<string, number>;
  /** `todayKeys` 가 어느 날 것인가. 날이 바뀌면 통째로 버린다. */
  day: string;
  /** 오늘 이미 센 사람들의 열쇠. 봇이 다시 떠도 오늘 수가 두 배가 되지 않게 저장한다. */
  todayKeys: string[];
  /**
   * 누가 왔나 종류별 누적 — 사람 · 검색엔진 · AI · 알 수 없음.
   * 봇 방문을 버리지 않고 **나눠서** 센다. 버리면 사실이 사라지고, 섞으면 사람 수가 거짓이 된다.
   */
  kinds: Record<VisitorKind, number>;
  /** 날짜별 종류. 「요즘 AI 가 부쩍 긁어 간다」 같은 것이 이 칸에서만 보인다. */
  kindDays: Record<string, Partial<Record<VisitorKind, number>>>;
}

/**
 * 성능 분포 (TASK-KL-201).
 *
 * 왜 개별 기록을 안 남기나: 누가 언제 얼마나 느렸는지는 **사람을 따라다니는 자료**가 된다.
 * 우리가 알고 싶은 것은 「요즘 사람들에게 얼마나 걸리나」뿐이라, 날짜별로 **칸에 세기만** 한다.
 * 칸(버킷)에 세면 나중에 중앙값·나쁜 쪽을 뽑을 수 있고, 되돌려서 한 사람을 찾을 수는 없다.
 */
interface PerfTrace {
  /** `YYYY-MM-DD`(KST) → 지표 → 칸 index → 개수. */
  days: Record<string, Record<string, number[]>>;
}

/** 칸 경계 (ms). 마지막 칸은 「그보다 느림」. */
const PERF_BUCKETS: Record<string, number[]> = {
  ready: [100, 250, 500, 1000, 2000, 4000],
  fcp: [500, 1000, 1800, 3000, 5000],
  lcp: [1000, 2500, 4000, 6000, 10000],
  inp: [50, 100, 200, 500, 1000],
  ttfb: [100, 300, 800, 1800],
  /** 밀림은 1000 배해서 넣는다(0.1 → 100) — 정수 칸으로 다루려고. */
  cls: [10, 25, 50, 100, 250],
};

function emptyPerf(prev?: Partial<PerfTrace>): PerfTrace {
  return { days: prev?.days ?? {} };
}

interface TracesState {
  version: 1;
  tools: Record<string, ToolTrace>;
  posts: Post[];
  galleries: Gallery[];
  reports: Report[];
  visits: VisitTrace;
  /** 사람들 기기에서 잰 성능 — **개별 기록은 안 남긴다**, 날짜별 칸만 (TASK-KL-201). */
  perf: PerfTrace;
  /**
   * 갤러리별로 **마지막까지 준 번호**. 지금 남아 있는 글에서 최댓값을 구하면 안 된다 —
   * 3번 글을 지우는 순간 다음 글이 다시 3번을 받고, 어제 남긴 「#3 참고」가 다른 글을 가리킨다.
   */
  seqByBoard: Record<BoardId, number>;
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
  anon: AnonFace | null;
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
  anon: AnonFace | null;
  /** 이 글을 찾을 때 쓰는 글자 한 벌 (소문자). 서버와 화면이 **같은 것**을 본다. */
  searchable: string;
  createdAt: string;
  bumpedAt: string;
  votes: number;
  likes: number;
  views: number;
  replyCount: number;
  status: Post['status'];
  pinned: boolean;
  tag: string | null;
  seq: number;
  statusNote: string | null;
  statusAt: string | null;
  statusBy: string | null;
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
    // 이슈식 칸도 나중에 생겼다. 처음부터 있던 갤러리는 씨앗이 정한 값을 받는다
    // (요청판은 원래 「열림 → 만들어짐」으로 살아 왔다 — 이름만 이제 붙는다).
    const issueStyle =
      typeof g.issueStyle === 'boolean' ? g.issueStyle : seed && g.builtin ? seed.issueStyle : false;
    return { ...g, tags, issueStyle };
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
    // 예전에 쌓인 글은 전부 실명이었다 — 없으면 null 이 맞다 (TASK-KL-157).
    anon: raw.anon ?? null,
    createdAt,
    voterAccountIds: raw.voterAccountIds ?? [],
    likerAccountIds: raw.likerAccountIds ?? [],
    views: typeof raw.views === 'number' ? raw.views : 0,
    status: raw.status ?? 'open',
    replies: (raw.replies ?? []).map((r) => ({
      ...r,
      parentId: r.parentId ?? null,
      anon: r.anon ?? null,
      likerAccountIds: r.likerAccountIds ?? [],
    })),
    bumpedAt: raw.bumpedAt ?? createdAt,
    pinned: raw.pinned === true,
    tag: typeof raw.tag === 'string' ? raw.tag : null,
    // 번호는 나중에 생겼다. 옛 글은 0 으로 두고 아래 `numberOldPosts` 가 한 번에 매긴다 —
    // 여기서 매기면 글마다 따로 매겨져 같은 번호가 여러 개 나온다.
    seq: typeof raw.seq === 'number' ? raw.seq : 0,
    statusNote: typeof raw.statusNote === 'string' ? raw.statusNote : null,
    statusAt: typeof raw.statusAt === 'string' ? raw.statusAt : null,
    statusBy: typeof raw.statusBy === 'string' ? raw.statusBy : null,
  };
}

/**
 * 번호가 없던 옛 글에 번호를 매긴다 (갤러리마다 1부터, 오래된 글이 1번).
 *
 * 한 번만 도는 일이다 — 매기고 나면 그 값은 파일에 남아 다시는 안 바뀐다.
 * 새 글은 「그 갤러리의 가장 큰 번호 + 1」을 받으므로, 여기서 겹치지 않게 매겨 두면 끝이다.
 */
function numberOldPosts(posts: Post[]): Post[] {
  const needs = posts.filter((p) => !p.seq);
  if (needs.length === 0) return posts;
  const nextByBoard = new Map<BoardId, number>();
  for (const post of posts) {
    if (!post.seq) continue;
    nextByBoard.set(post.board, Math.max(nextByBoard.get(post.board) ?? 0, post.seq));
  }
  // 오래된 것부터 1번. 목록은 새 글이 앞이므로 뒤에서부터 훑는다.
  for (const post of [...needs].reverse()) {
    const next = (nextByBoard.get(post.board) ?? 0) + 1;
    post.seq = next;
    nextByBoard.set(post.board, next);
  }
  return posts;
}

/**
 * 방문 자국의 빈 값 — 예전 상태 파일에는 이 칸이 아예 없다.
 * 없는 칸을 그대로 두면 첫 방문에서 터진다. 없으면 0부터 시작하는 게 맞다(지어내지 않는다).
 */
function emptyVisits(from?: Partial<VisitTrace>): VisitTrace {
  return {
    total: typeof from?.total === 'number' ? from.total : 0,
    days: from?.days ?? {},
    people: from?.people ?? {},
    day: typeof from?.day === 'string' ? from.day : '',
    todayKeys: Array.isArray(from?.todayKeys) ? from.todayKeys : [],
    kinds: { human: 0, search: 0, ai: 0, unknown: 0, ...(from?.kinds ?? {}) },
    kindDays: from?.kindDays ?? {},
  };
}

/** 오늘 열쇠를 몇 개까지 들고 있을지. 넘치면 세는 것만 멈추고 방문 수는 계속 센다. */
const VISITOR_KEYS_CAP = 50000;

/** 「지금 보고 있다」로 치는 시간. 이보다 오래 소식이 없으면 나간 것으로 본다. */
const PRESENCE_WINDOW_MS = 5 * 60 * 1000;

export class KarmolabTraceStore {
  private state: TracesState;
  private dirty = false;
  /** `<방문자열쇠>:<도구>` → 마지막으로 센 시각. 메모리에만 둔다 (재시작하면 한 번 더 세도 무해). */
  private readonly recentOpens = new Map<string, number>();
  /** 지금 보고 있는 사람들 — 열쇠 → 마지막 소식 시각. **저장하지 않는다** (「지금」은 과거가 없다). */
  private readonly presence = new Map<string, number>();

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
    // 번호 카운터가 이미 나간 번호보다 뒤에 있으면 안 된다 — 그러면 다음 글이 남의 번호를
    // 다시 받는다. 카운터가 없던 옛 파일에서 특히 그렇다.
    for (const post of this.state.posts) {
      const known = this.state.seqByBoard[post.board] ?? 0;
      if (post.seq > known) this.state.seqByBoard[post.board] = post.seq;
    }
  }

  private load(): TracesState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<TracesState>;
        return {
          version: 1,
          tools: parsed.tools ?? {},
          posts: numberOldPosts((parsed.posts ?? []).map(migratePost)),
          galleries: withSeeds(parsed.galleries ?? []),
          reports: parsed.reports ?? [],
          visits: emptyVisits(parsed.visits),
          perf: emptyPerf(parsed.perf),
          seqByBoard: parsed.seqByBoard ?? {},
        };
      }
    } catch (error) {
      console.error('[karmolab-traces] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return {
      version: 1,
      tools: {},
      posts: [],
      galleries: withSeeds([]),
      reports: [],
      visits: emptyVisits(),
      perf: emptyPerf(),
      seqByBoard: {},
    };
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

  /**
   * 누가 사이트에 왔다 (도구를 열든 안 열든).
   *
   * 같은 사람의 이동은 30분에 한 번만 센다 — 안 그러면 화면을 옮길 때마다 방문 수가 오른다.
   * 그 수는 「사람이 왔다」가 아니라 「내가 링크를 잘 걸었다」밖에 안 말해 준다.
   *
   * @returns 실제로 셌으면 true.
   */
  recordVisit(visitorKey: string, kind: VisitorKind = 'human', now: Date = new Date()): boolean {
    const day = kstDay(now);
    const visits = this.state.visits;

    const dedupeKey = `visit:${visitorKey}`;
    const last = this.recentOpens.get(dedupeKey);
    if (last !== undefined && now.getTime() - last < DEDUPE_WINDOW_MS) return false;
    this.recentOpens.set(dedupeKey, now.getTime());

    // 종류는 **버리지 않고 전부** 센다. 봇 방문도 실제로 일어난 일이다.
    visits.kinds[kind] = (visits.kinds[kind] ?? 0) + 1;
    const bucket = visits.kindDays[day] ?? {};
    bucket[kind] = (bucket[kind] ?? 0) + 1;
    visits.kindDays[day] = bucket;
    for (const old of Object.keys(visits.kindDays).sort().slice(0, -DAY_RETENTION)) delete visits.kindDays[old];

    // 아래 「방문 · 사람」 수에는 **사람만** 들어간다. 봇을 섞으면 공개한 수가 거짓말이 된다.
    if (kind !== 'human') {
      this.markDirty();
      return false;
    }

    // 날이 바뀌면 어제 사람들 열쇠는 버린다. 오늘 몇 명인지 세는 데 어제 것은 필요 없다.
    if (visits.day !== day) {
      visits.day = day;
      visits.todayKeys = [];
    }

    visits.total += 1;
    visits.days[day] = (visits.days[day] ?? 0) + 1;

    if (!visits.todayKeys.includes(visitorKey)) {
      if (visits.todayKeys.length < VISITOR_KEYS_CAP) visits.todayKeys.push(visitorKey);
      visits.people[day] = (visits.people[day] ?? 0) + 1;
    }

    // 오래된 날은 칸을 버린다 (합계는 `total` 에 남는다).
    for (const dayBucket of [visits.days, visits.people]) {
      const keep = Object.keys(dayBucket).sort().slice(-DAY_RETENTION);
      if (keep.length < Object.keys(dayBucket).length) {
        for (const key of Object.keys(dayBucket)) if (!keep.includes(key)) delete dayBucket[key];
      }
    }

    this.markDirty();
    return true;
  }

  /**
   * 지금 보고 있다고 알려 온다 (몇 분에 한 번씩).
   *
   * **저장하지 않는다** — 메모리에만 둔다. 「지금」은 과거가 되면 아무 뜻이 없고,
   * 봇이 다시 뜨면 0에서 시작하는 게 맞다 (그때는 정말 아무도 안 보고 있으니까).
   */
  touchPresence(visitorKey: string, now: Date = new Date()): number {
    this.presence.set(visitorKey, now.getTime());
    return this.presenceCount(now);
  }

  /** 지금 몇 명이 보고 있나. 오래된 것은 훑어 버린다. */
  presenceCount(now: Date = new Date()): number {
    const cutoff = now.getTime() - PRESENCE_WINDOW_MS;
    for (const [key, at] of this.presence) if (at < cutoff) this.presence.delete(key);
    return this.presence.size;
  }

  /** 방문 집계 — 블로그의 Total / Today 와 같은 것. 아래 수는 전부 **사람만**이다. */
  /**
   * 한 사람의 한 판을 **칸에 하나 더한다** (TASK-KL-201).
   *
   * 값이 없거나 말이 안 되면 그 지표만 건너뛴다 — 0 으로 채우면 「아주 빠른 판」이 하나
   * 생기고, 그건 없느니만 못하다. 하루에 몇 판이든 다 세지만 누구인지는 안 남는다.
   */
  recordPerf(sample: Record<string, unknown>, now: Date = new Date()): number {
    const day = kstDay(now);
    const perf = this.state.perf ?? (this.state.perf = emptyPerf());
    const forDay = perf.days[day] ?? (perf.days[day] = {});
    let counted = 0;
    for (const [key, edges] of Object.entries(PERF_BUCKETS)) {
      const raw = sample[key];
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) continue;
      const value = key === 'cls' ? Math.round(raw * 1000) : Math.round(raw);
      // 말이 안 되게 큰 값은 버린다(시계가 튄 판·백그라운드 탭 등).
      if (value > 600000) continue;
      let index = edges.findIndex((edge) => value <= edge);
      if (index < 0) index = edges.length;
      const row = forDay[key] ?? (forDay[key] = new Array(edges.length + 1).fill(0));
      row[index] = (row[index] ?? 0) + 1;
      counted += 1;
    }
    if (counted) this.flush();
    return counted;
  }

  /**
   * 요즘 사람들에게 얼마나 걸리나 — 최근 N일 칸을 합쳐 중앙값·나쁜 쪽(p75)을 낸다.
   *
   * 칸으로 세었으므로 정확한 값이 아니라 **칸의 위 경계**다. 그걸 숨기지 않고 그대로 준다
   * (「1000ms 이하」처럼). 표본이 적으면 수를 같이 준다 — 적은 표본의 중앙값은 숫자놀음이다.
   */
  perfStats(days = 14, now: Date = new Date()): {
    samples: number;
    metrics: Record<string, { p50: number | null; p75: number | null; n: number; edges: number[]; counts: number[] }>;
  } {
    const perf = this.state.perf ?? emptyPerf();
    const metrics: Record<string, { p50: number | null; p75: number | null; n: number; edges: number[]; counts: number[] }> = {};
    let samples = 0;
    for (const [key, edges] of Object.entries(PERF_BUCKETS)) {
      const counts = new Array(edges.length + 1).fill(0);
      for (let i = 0; i < days; i += 1) {
        const day = kstDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
        const row = perf.days[day]?.[key];
        if (!row) continue;
        for (let j = 0; j < counts.length; j += 1) counts[j] += row[j] ?? 0;
      }
      const n = counts.reduce((sum, c) => sum + c, 0);
      const at = (ratio: number): number | null => {
        if (!n) return null;
        let seen = 0;
        for (let j = 0; j < counts.length; j += 1) {
          seen += counts[j];
          if (seen >= n * ratio) return edges[j] ?? edges[edges.length - 1];
        }
        return edges[edges.length - 1];
      };
      metrics[key] = { p50: at(0.5), p75: at(0.75), n, edges, counts };
      samples = Math.max(samples, n);
    }
    return { samples, metrics };
  }

  visitStats(now: Date = new Date()): {
    total: number;
    today: number;
    peopleToday: number;
    /** 지금 보고 있는 사람 수. */
    online: number;
    /** 최근 14일 (오래된 날 → 오늘). 작은 막대 그래프용. */
    recentDays: { day: string; visits: number; people: number }[];
    /** 누가 왔나 — 사람 · 검색엔진 · AI · 알 수 없음 (누적 / 오늘). */
    kinds: { total: Record<VisitorKind, number>; today: Record<VisitorKind, number> };
  } {
    const visits = this.state.visits;
    const today = kstDay(now);
    const recentDays: { day: string; visits: number; people: number }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const day = kstDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
      recentDays.push({ day, visits: visits.days[day] ?? 0, people: visits.people[day] ?? 0 });
    }
    const todayKinds = visits.kindDays[today] ?? {};
    return {
      total: visits.total,
      today: visits.days[today] ?? 0,
      peopleToday: visits.people[today] ?? 0,
      online: this.presenceCount(now),
      recentDays,
      kinds: {
        total: { ...visits.kinds },
        today: {
          human: todayKinds.human ?? 0,
          search: todayKinds.search ?? 0,
          ai: todayKinds.ai ?? 0,
          unknown: todayKinds.unknown ?? 0,
        },
      },
    };
  }

  /**
   * 주간 결산 — 「이번 주 KarmoLab」.
   *
   * **새로 저장하는 것이 하나도 없다.** 이미 날짜별로 세고 있는 값에서 그때그때 계산한다 —
   * 결산을 따로 쌓아 두면 원본과 어긋나는 순간부터 아무도 어느 쪽이 맞는지 모른다.
   *
   * 지난 7일과 그 전 7일을 나란히 놓는다. 「많다/적다」는 혼자서는 뜻이 없고 늘 비교값이 있어야 한다.
   */
  weeklyRecap(now: Date = new Date()): {
    from: string;
    to: string;
    visits: { now: number; before: number };
    people: { now: number; before: number };
    toolOpens: { now: number; before: number };
    /** 이번 주 많이 열린 도구 셋. */
    topTools: { toolId: string; opens: number }[];
    /** 지난주엔 한 번도 안 열렸는데 이번 주에 열린 도구. */
    newTools: string[];
    posts: number;
    replies: number;
    /** 이번 주 가장 많은 표를 받은 글 (없으면 null). */
    topPost: { id: string; title: string | null; text: string; votes: number } | null;
  } {
    const dayAt = (offset: number) => kstDay(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000));
    const thisWeek: string[] = [];
    const lastWeek: string[] = [];
    for (let i = 0; i < 7; i += 1) thisWeek.push(dayAt(i));
    for (let i = 7; i < 14; i += 1) lastWeek.push(dayAt(i));

    const sum = (bucket: Record<string, number>, days: string[]) =>
      days.reduce((total, day) => total + (bucket[day] ?? 0), 0);

    const visits = this.state.visits;
    const opensIn = (days: string[]) => {
      let total = 0;
      for (const trace of Object.values(this.state.tools)) total += sum(trace.days, days);
      return total;
    };

    const toolsThisWeek: { toolId: string; opens: number }[] = [];
    const newTools: string[] = [];
    for (const [toolId, trace] of Object.entries(this.state.tools)) {
      const opens = sum(trace.days, thisWeek);
      if (opens === 0) continue;
      toolsThisWeek.push({ toolId, opens });
      if (sum(trace.days, lastWeek) === 0) newTools.push(toolId);
    }
    toolsThisWeek.sort((a, b) => b.opens - a.opens);

    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
    const freshPosts = this.state.posts.filter((p) => new Date(p.createdAt).getTime() >= since);
    let replies = 0;
    for (const post of this.state.posts) {
      replies += post.replies.filter((r) => new Date(r.createdAt).getTime() >= since).length;
    }
    const ranked = [...freshPosts].sort((a, b) => b.voterAccountIds.length - a.voterAccountIds.length);
    const best = ranked[0];

    return {
      from: thisWeek[thisWeek.length - 1],
      to: thisWeek[0],
      visits: { now: sum(visits.days, thisWeek), before: sum(visits.days, lastWeek) },
      people: { now: sum(visits.people, thisWeek), before: sum(visits.people, lastWeek) },
      toolOpens: { now: opensIn(thisWeek), before: opensIn(lastWeek) },
      topTools: toolsThisWeek.slice(0, 3),
      newTools: newTools.slice(0, 5),
      posts: freshPosts.length,
      replies,
      topPost: best
        ? { id: best.id, title: best.title, text: best.text.slice(0, 80), votes: best.voterAccountIds.length }
        : null,
    };
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

  /**
   * 방금 열린 도구들 (TASK-KL-196 G) — **새로 적는 것이 없다.**
   *
   * 도구마다 「마지막으로 열린 시각」은 이미 적고 있다. 실황을 위해 사건을 따로 쌓으면
   * 같은 사실이 두 벌이 되고, 그 벌은 노트북 메모리에서 조용히 어긋난다.
   *
   * 한 도구는 **한 번만** 나온다(사건 기록이 아니라 마지막 시각이므로). 사람도 안 센다 —
   * 누가 열었는지는 애초에 저장하지 않는다.
   * 오래된 것은 안 준다: 어제 열린 도구를 「방금」이라고 부르면 그건 실황이 아니라 거짓이다.
   */
  recentlyOpened(limit = 8, now: Date = new Date(), windowMs = 6 * 60 * 60 * 1000): Array<{ toolId: string; at: string }> {
    const floor = now.getTime() - windowMs;
    return Object.entries(this.state.tools)
      .map(([toolId, trace]) => ({ toolId, at: trace.lastOpenedAt }))
      .filter((row) => {
        const at = Date.parse(row.at);
        return Number.isFinite(at) && at >= floor && at <= now.getTime() + 60000;
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, Math.max(1, Math.min(30, limit)));
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
    input: {
      board: BoardId;
      title?: string | null;
      text: string;
      accountId: string;
      handle: string;
      tag?: string | null;
      /** 익명으로 남기면 그 얼굴. 주면 `handle` 은 무시하고 빈 문자열로 둔다. */
      anon?: AnonFace | null;
    },
    now: Date = new Date(),
  ): Post {
    const at = now.toISOString();
    const post: Post = {
      id: crypto.randomUUID(),
      board: input.board,
      title: input.title ?? null,
      text: input.text,
      /* 익명이면 손잡이를 **아예 안 적는다.** 적어 두면 검색·활동·프로필 어딘가에서 새어
       * 나온다 — 익명은 「화면에서 안 보이기」가 아니라 「기록에 안 남기」여야 한다. */
      authorHandle: input.anon ? '' : input.handle,
      authorAccountId: input.accountId,
      anon: input.anon ?? null,
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
      seq: this.nextSeq(input.board),
      statusNote: null,
      statusAt: null,
      statusBy: null,
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
    input: {
      text: string;
      accountId: string;
      handle: string;
      byOwner: boolean;
      parentId?: string | null;
      anon?: AnonFace | null;
    },
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
      authorHandle: input.anon ? '' : input.handle,
      authorAccountId: input.accountId,
      anon: input.anon ?? null,
      createdAt: now.toISOString(),
      // 익명인데 「주인」 표식이 붙으면 그 자체로 정체가 드러난다.
      byOwner: input.anon ? false : input.byOwner,
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

  /**
   * 계정이 지워질 때 — 그 사람이 남긴 글·답글·표·좋아요에서 사람을 떼어낸다.
   *
   * 글 자체는 안 지운다. 답글이 달린 글을 통째로 지우면 **남의 답글이 뜻을 잃는다** —
   * 대화는 혼자 만든 것이 아니다. 대신 누가 썼는지를 지운다: 이름은 「지운 계정」이 되고
   * 계정과 이어 주던 열쇠는 빈 값이 된다(다시 이어 붙일 수 없다).
   *
   * 표와 좋아요는 뺀다 — 없는 사람의 표가 계속 세어지면 그 수가 거짓이 된다.
   *
   * @returns 손댄 글 수.
   */
  forgetAuthor(accountId: string): number {
    if (!accountId) return 0;
    let touched = 0;
    for (const post of this.state.posts) {
      let changed = false;
      if (post.authorAccountId === accountId) {
        post.authorAccountId = '';
        post.authorHandle = DELETED_HANDLE;
        changed = true;
      }
      for (const reply of post.replies) {
        if (reply.authorAccountId !== accountId) continue;
        reply.authorAccountId = '';
        reply.authorHandle = DELETED_HANDLE;
        changed = true;
      }
      const votesBefore = post.voterAccountIds.length;
      const likesBefore = post.likerAccountIds.length;
      post.voterAccountIds = post.voterAccountIds.filter((id) => id !== accountId);
      post.likerAccountIds = post.likerAccountIds.filter((id) => id !== accountId);
      for (const reply of post.replies) {
        reply.likerAccountIds = reply.likerAccountIds.filter((id) => id !== accountId);
      }
      if (votesBefore !== post.voterAccountIds.length || likesBefore !== post.likerAccountIds.length) changed = true;
      if (changed) touched += 1;
    }
    // 신고도 함께 지운다 — 신고한 사람이 없어졌는데 신고만 남으면 아무도 확인할 수 없다.
    const reportsBefore = this.state.reports.length;
    this.state.reports = this.state.reports.filter((r) => r.byAccountId !== accountId);
    if (touched > 0 || reportsBefore !== this.state.reports.length) this.markDirty();
    return touched;
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
  updatePost(
    postId: string,
    patch: { status?: unknown; pinned?: unknown; statusNote?: unknown; by?: string | null },
    now: Date = new Date(),
  ): Post | null {
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return null;
    const allowed: Post['status'][] = ['open', 'planned', 'done', 'declined'];
    if (typeof patch.status === 'string' && allowed.includes(patch.status as Post['status'])) {
      const changed = post.status !== patch.status;
      post.status = patch.status as Post['status'];
      if (changed) {
        // 「언제·누가」가 없으면 닫힌 글은 그냥 사라진 글처럼 읽힌다.
        post.statusAt = now.toISOString();
        post.statusBy = patch.by ?? null;
      }
    }
    if (typeof patch.statusNote === 'string') {
      const note = patch.statusNote.trim().slice(0, STATUS_NOTE_MAX);
      post.statusNote = note.length > 0 ? note : null;
    }
    if (typeof patch.pinned === 'boolean') post.pinned = patch.pinned;
    this.markDirty();
    return post;
  }

  /**
   * 갤러리 성격 바꾸기 — 지금은 「이슈식으로 쓸래」 하나뿐이다.
   *
   * 껐다 켜도 글은 안 다친다. 상태·번호는 원래 모든 글이 들고 있고, 이슈식은 그걸
   * **화면에 보여줄지**를 정할 뿐이다. 그래서 잘못 켜도 되돌리면 그만이다.
   */
  setGalleryStyle(boardId: BoardId, patch: { issueStyle?: unknown }): Gallery | null {
    const gallery = this.state.galleries.find((g) => g.id === boardId);
    if (!gallery) return null;
    if (typeof patch.issueStyle === 'boolean') gallery.issueStyle = patch.issueStyle;
    this.markDirty();
    return gallery;
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

  /**
   * 「이 글을 무엇으로 찾을 수 있나」 — **한 벌만** 만든다 (TASK-KL-159).
   *
   * 예전에는 같은 규칙이 서버 검색과 화면 거르기 두 곳에 각각 적혀 있었다. 이름표를 찾을
   * 거리에 넣을 때 양쪽을 다 손대야 했고, 한쪽만 고치면 「서버에선 찾히는데 화면에선 안
   * 찾히는」 상태가 된다 — 그건 검색이 거짓말을 하는 것이다.
   * 그래서 서버가 이 문자열을 만들어 내려보내고, 화면은 그것만 본다.
   */
  static searchableOf(post: Post): string {
    return `${post.title ?? ''} ${post.text} ${post.authorHandle} ${post.anon?.name ?? ''} ${post.tag ?? ''} ${post.replies
      .map((r) => `${r.text} ${r.anon?.name ?? ''} ${r.authorHandle}`)
      .join(' ')}`
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toPublic(post: Post, viewerAccountId: string | null): PublicPost {
    return {
      id: post.id,
      board: post.board,
      title: post.title,
      text: post.text,
      authorHandle: post.authorHandle,
      anon: post.anon,
      /* 화면이 목록 안에서 거를 때 쓰는 **같은** 찾을 거리. 규칙을 두 벌로 갈라 두면
         「서버에선 찾히는데 화면에선 안 찾히는」 상태가 생긴다 (TASK-KL-159). */
      searchable: KarmolabTraceStore.searchableOf(post),
      createdAt: post.createdAt,
      bumpedAt: post.bumpedAt,
      votes: post.voterAccountIds.length,
      likes: post.likerAccountIds.length,
      views: post.views,
      replyCount: post.replies.length,
      status: post.status,
      pinned: post.pinned,
      tag: post.tag,
      seq: post.seq,
      statusNote: post.statusNote,
      statusAt: post.statusAt,
      statusBy: post.statusBy,
      replies: post.replies.map((r) => ({
        id: r.id,
        text: r.text,
        authorHandle: r.authorHandle,
        anon: r.anon,
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
        // 찾을 거리는 한 벌뿐이다 (`searchableOf`). 여기서 또 짜맞추지 않는다.
        return KarmolabTraceStore.searchableOf(p).includes(needle);
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
  report(
    input: {
      postId: string;
      replyId?: string | null;
      byAccountId: string;
      reason: string;
      /** 안 주면 글 신고다 (예전과 같다). */
      kind?: 'post' | 'chat';
      /** 채팅 신고는 원본이 여기 없으므로 부르는 쪽이 그 말을 넘겨준다. */
      subject?: string;
    },
    now: Date = new Date(),
  ): boolean {
    const kind = input.kind ?? 'post';
    const post = this.state.posts.find((p) => p.id === input.postId);
    // 채팅 줄은 이 저장소에 없다 — 있는지 확인하는 쪽은 부르는 쪽이다.
    if (kind === 'post' && !post) return false;
    if (kind === 'post' && input.replyId && !post.replies.some((r) => r.id === input.replyId)) return false;
    // 같은 사람이 같은 것을 여러 번 신고해도 한 줄이다.
    const already = this.state.reports.some(
      (r) => r.postId === input.postId && (r.replyId ?? null) === (input.replyId ?? null) && r.byAccountId === input.byAccountId,
    );
    if (already) return true;
    /* 신고 당시의 그 말을 베껴 둔다. 글 신고면 여기서 뜨고, 채팅 신고면 넘겨받는다. */
    const snapshot =
      input.subject ??
      (input.replyId
        ? (post?.replies.find((r) => r.id === input.replyId)?.text ?? '')
        : `${post?.title ? `${post.title} — ` : ''}${post?.text ?? ''}`);
    this.state.reports.unshift({
      id: crypto.randomUUID(),
      kind,
      postId: input.postId,
      replyId: input.replyId ?? null,
      byAccountId: input.byAccountId,
      reason: String(input.reason ?? '').trim().slice(0, 100),
      subject: String(snapshot).slice(0, 300),
      createdAt: now.toISOString(),
      resolvedAt: null,
    });
    this.markDirty();
    return true;
  }

  /** 아직 안 본 신고 (주인용). */
  openReports(): Report[] {
    /* 예전에 쌓인 줄에는 `kind`·`subject` 가 없다. 여기서 채워서 내보낸다 —
       화면이 「없을 수도 있는 칸」을 매번 방어하게 만들면 그 방어가 곧 빈틈이 된다. */
    return this.state.reports
      .filter((r) => r.resolvedAt === null)
      .map((r) => {
        if (r.kind && r.subject) return r;
        const post = this.state.posts.find((p) => p.id === r.postId);
        const text = r.replyId
          ? (post?.replies.find((x) => x.id === r.replyId)?.text ?? '')
          : `${post?.title ? `${post.title} — ` : ''}${post?.text ?? ''}`;
        return { ...r, kind: r.kind ?? 'post', subject: r.subject ?? (text || '(원본이 사라졌다)') };
      });
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
  /**
   * 이 갤러리의 다음 번호. **줬으면 되돌리지 않는다** — 글을 지워도 그 번호는 영영 비어 있다.
   * 빈 번호가 보이는 편이, 남이 남긴 「#3 참고」가 엉뚱한 글을 가리키는 것보다 낫다.
   */
  private nextSeq(board: BoardId): number {
    const next = (this.state.seqByBoard[board] ?? 0) + 1;
    this.state.seqByBoard[board] = next;
    return next;
  }

  /** 글 하나 — 권한을 따질 때 「이 글이 어느 갤러리 것인가」를 알아야 한다. */
  post(postId: string): Post | null {
    return this.state.posts.find((p) => p.id === postId) ?? null;
  }

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
      issueStyle: false,
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
