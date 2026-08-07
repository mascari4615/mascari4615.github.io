/**
 * TASK-KL-098 Cycle 2 — 흔적 원장 시험.
 *
 * 여기서 틀리면 사이트에 **거짓 숫자**가 뜬다. 지어낸 수는 안 넣는다는 약속이 코드로
 * 지켜지는지 보는 자리다 — 같은 사람이 새로고침한 것을 여러 명으로 세지 않는가,
 * 한 사람이 표를 두 번 던질 수 있는가.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabTraceStore, kstDay, isValidToolId, isBoardId } from './karmolab-traces';

let tmpDir: string;
let statePath: string;
let store: KarmolabTraceStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl098-traces-'));
  statePath = path.join(tmpDir, 'state.json');
  store = new KarmolabTraceStore(statePath);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('kstDay', () => {
  it('한국 시간 기준으로 날짜를 가른다 — 자정 넘김이 9시간 어긋나면 안 된다', () => {
    // 2026-08-07 15:30 UTC = 2026-08-08 00:30 KST → 한국에선 이미 8일이다.
    expect(kstDay(new Date('2026-08-07T15:30:00Z'))).toBe('2026-08-08');
    expect(kstDay(new Date('2026-08-07T14:30:00Z'))).toBe('2026-08-07');
  });
});

describe('isValidToolId', () => {
  it('아무 문자열이나 원장에 못 들어온다', () => {
    expect(isValidToolId('charcount')).toBe(true);
    expect(isValidToolId('pdf-tool')).toBe(true);
    expect(isValidToolId('../etc')).toBe(false);
    expect(isValidToolId('한글도구')).toBe(false);
    expect(isValidToolId('')).toBe(false);
    expect(isValidToolId(42)).toBe(false);
  });
});

describe('도구 열림 세기', () => {
  it('같은 사람이 계속 눌러도 한 번만 센다 — 새로고침이 방문자가 되면 안 된다', () => {
    expect(store.recordToolOpen('charcount', 'visitor-a')).toBe(true);
    expect(store.recordToolOpen('charcount', 'visitor-a')).toBe(false);
    expect(store.recordToolOpen('charcount', 'visitor-a')).toBe(false);
    expect(store.pulse().opensTotal).toBe(1);
  });

  it('다른 사람은 따로 센다', () => {
    store.recordToolOpen('charcount', 'visitor-a');
    store.recordToolOpen('charcount', 'visitor-b');
    expect(store.pulse().opensTotal).toBe(2);
  });

  it('시간이 지나면 같은 사람도 다시 센다', () => {
    const first = new Date('2026-08-07T01:00:00Z');
    const later = new Date('2026-08-07T02:00:00Z');
    expect(store.recordToolOpen('timer', 'visitor-a', first)).toBe(true);
    expect(store.recordToolOpen('timer', 'visitor-a', later)).toBe(true);
    expect(store.pulse(later).opensTotal).toBe(2);
  });

  it('이상한 도구 이름은 안 센다', () => {
    expect(store.recordToolOpen('../../etc/passwd', 'visitor-a')).toBe(false);
    expect(store.pulse().opensTotal).toBe(0);
  });

  it('집계는 최근 7일이 앞에 오고, 안 열린 도구는 아예 안 나온다', () => {
    const now = new Date('2026-08-07T01:00:00Z');
    const old = new Date('2026-06-01T01:00:00Z');
    store.recordToolOpen('old-tool', 'v1', old);
    store.recordToolOpen('hot-tool', 'v1', now);
    store.recordToolOpen('hot-tool', 'v2', now);

    const stats = store.toolStats(now);
    expect(stats.map((s) => s.toolId)).toEqual(['hot-tool', 'old-tool']);
    expect(stats[0].recent).toBe(2);
    expect(stats[1].recent).toBe(0); // 오래전 것은 합계에만 남는다
    expect(stats[1].total).toBe(1);
    expect(stats.some((s) => s.toolId === 'never-opened')).toBe(false);
  });

  it('다시 켜도 숫자가 남는다', () => {
    store.recordToolOpen('qrgen', 'v1');
    store.flush();
    expect(new KarmolabTraceStore(statePath).pulse().opensTotal).toBe(1);
  });

  it('상태 파일이 깨져도 기동한다 — 숫자 하나 때문에 사이트가 멈추면 안 된다', () => {
    fs.writeFileSync(statePath, 'not json at all', 'utf-8');
    const reopened = new KarmolabTraceStore(statePath);
    expect(reopened.pulse().opensTotal).toBe(0);
    expect(() => reopened.recordToolOpen('timer', 'v1')).not.toThrow();
  });
});

describe('글판 — 이야기·도구 요청', () => {
  it('올린 사람의 첫 표가 이미 들어가 있다 — 자기 요청이 0표로 시작하면 어색하다', () => {
    store.addPost({ board: 'request', text: '엑셀을 CSV 로 바꾸는 도구', accountId: 'acc-1', handle: 'kim' });
    const list = store.publicPosts('request', 'acc-1');
    expect(list[0].votes).toBe(1);
    expect(list[0].votedByMe).toBe(true);
    expect(list[0].status).toBe('open');
  });

  it('한 사람은 한 표뿐 — 두 번 누르면 취소된다', () => {
    const request = store.addPost({ board: 'request', text: '테스트', accountId: 'acc-1', handle: 'kim' });
    expect(store.toggleVote(request.id, 'acc-2')).toBe(true);
    expect(store.publicPosts('request', null)[0].votes).toBe(2);
    expect(store.toggleVote(request.id, 'acc-2')).toBe(false);
    expect(store.publicPosts('request', null)[0].votes).toBe(1);
    // 몇 번을 눌러도 사람 수를 넘지 않는다
    store.toggleVote(request.id, 'acc-2');
    store.toggleVote(request.id, 'acc-2');
    expect(store.publicPosts('request', null)[0].votes).toBe(1);
  });

  it('없는 요청에 투표하면 null', () => {
    expect(store.toggleVote('없는id', 'acc-1')).toBeNull();
  });

  it('표 많은 순으로 서고, 같으면 새 것이 위', () => {
    const a = store.addPost({ board: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' });
    store.addPost({ board: 'request', text: 'B', accountId: 'acc-2', handle: 'lee' });
    store.toggleVote(a.id, 'acc-3');
    store.toggleVote(a.id, 'acc-4');
    expect(store.publicPosts('request', null).map((r) => r.text)).toEqual(['A', 'B']);
  });

  it('로그인 안 한 사람에게는 「내가 눌렀나」가 전부 거짓', () => {
    store.addPost({ board: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicPosts('request', null)[0].votedByMe).toBe(false);
  });

  it('하루에 올린 개수를 센다 — 도배 막는 근거', () => {
    const day = new Date('2026-08-07T01:00:00Z');
    store.addPost({ board: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' }, day);
    store.addPost({ board: 'request', text: 'B', accountId: 'acc-1', handle: 'kim' }, day);
    store.addPost({ board: 'request', text: 'C', accountId: 'acc-2', handle: 'lee' }, day);
    expect(store.postsTodayBy('acc-1', 'request', day)).toBe(2);
    expect(store.postsTodayBy('acc-2', 'request', day)).toBe(1);
    expect(store.postsTodayBy('acc-1', 'request', new Date('2026-08-09T01:00:00Z'))).toBe(0);
  });

  it('주인은 요청 상태를 바꾼다 — 이상한 값은 무시', () => {
    const request = store.addPost({ board: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' });
    store.updatePost(request.id, { status: 'planned' });
    expect(store.publicPosts('request', null)[0].status).toBe('planned');
    store.updatePost(request.id, { status: '아무거나' });
    expect(store.publicPosts('request', null)[0].status).toBe('planned');
  });

  it('판이 다르면 서로의 목록에 안 섞인다', () => {
    store.addPost({ board: 'free', title: '인사', text: '안녕하세요', accountId: 'acc-1', handle: 'kim' });
    store.addPost({ board: 'request', text: '도구 하나만', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicPosts('free', null).map((p) => p.title)).toEqual(['인사']);
    expect(store.publicPosts('request', null).map((p) => p.text)).toEqual(['도구 하나만']);
  });

  it('이야기는 표가 0 에서 시작한다 — 글은 요청이 아니다', () => {
    store.addPost({ board: 'free', title: '제목', text: '본문', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicPosts('free', 'acc-1')[0].votes).toBe(0);
  });

  it('답글이 달리면 그 글이 목록 위로 올라온다 — 대화가 가라앉으면 아무도 안 본다', () => {
    const first = store.addPost(
      { board: 'free', title: '먼저', text: 'x', accountId: 'acc-1', handle: 'kim' },
      new Date('2026-08-01T00:00:00Z'),
    );
    store.addPost(
      { board: 'free', title: '나중', text: 'y', accountId: 'acc-2', handle: 'lee' },
      new Date('2026-08-02T00:00:00Z'),
    );
    expect(store.publicPosts('free', null).map((p) => p.title)).toEqual(['나중', '먼저']);

    store.addReply(
      first.id,
      { text: '답글!', accountId: 'acc-3', handle: 'park', byOwner: false },
      new Date('2026-08-03T00:00:00Z'),
    );
    const after = store.publicPosts('free', null);
    expect(after.map((p) => p.title)).toEqual(['먼저', '나중']);
    expect(after[0].replies).toHaveLength(1);
    expect(after[0].replies[0].authorHandle).toBe('park');
  });

  it('없는 글에는 답글이 안 달린다', () => {
    expect(store.addReply('없는id', { text: 'x', accountId: 'a', handle: 'h', byOwner: false })).toBeNull();
  });

  it('남의 글은 못 지우고, 본인과 주인은 지운다', () => {
    const mine = store.addPost({ board: 'free', title: '내 글', text: 'x', accountId: 'acc-1', handle: 'kim' });
    expect(store.deletePost(mine.id, 'acc-2', false)).toBe(false);
    expect(store.publicPosts('free', null)).toHaveLength(1);
    expect(store.deletePost(mine.id, 'acc-1', false)).toBe(true);
    expect(store.publicPosts('free', null)).toHaveLength(0);

    const other = store.addPost({ board: 'free', title: '남 글', text: 'y', accountId: 'acc-9', handle: 'lee' });
    expect(store.deletePost(other.id, 'acc-2', true)).toBe(true);
  });

  it('방문자 열쇠에는 주소가 안 남는다', () => {
    const key = KarmolabTraceStore.visitorKey('203.0.113.7', 'Mozilla/5.0');
    expect(key).not.toContain('203.0.113.7');
    expect(key).toBe(KarmolabTraceStore.visitorKey('203.0.113.7', 'Mozilla/5.0'));
    expect(key).not.toBe(KarmolabTraceStore.visitorKey('203.0.113.8', 'Mozilla/5.0'));
  });
});

describe('판(게시판)', () => {
  it('아는 판만 받는다', () => {
    expect(isBoardId('free')).toBe(true);
    expect(isBoardId('request')).toBe(true);
    expect(isBoardId('없는판')).toBe(false);
    expect(isBoardId(3)).toBe(false);
  });

  it('판마다 글 수를 센다 — 판 고르는 줄에 실제 수를 띄우려고', () => {
    store.addPost({ board: 'free', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    store.addPost({ board: 'free', title: 'b', text: 'y', accountId: 'u1', handle: 'kim' });
    store.addPost({ board: 'qna', title: 'c', text: 'z', accountId: 'u2', handle: 'lee' });
    expect(store.boardCounts()).toEqual({ free: 2, qna: 1 });
  });

  it('고정한 글은 언제나 맨 위', () => {
    store.addPost({ board: 'free', title: '오래된', text: 'x', accountId: 'u1', handle: 'kim' },
      new Date('2026-08-01T00:00:00Z'));
    const pinned = store.addPost({ board: 'free', title: '고정', text: 'y', accountId: 'u1', handle: 'kim' },
      new Date('2026-07-01T00:00:00Z'));
    store.addPost({ board: 'free', title: '새것', text: 'z', accountId: 'u1', handle: 'kim' },
      new Date('2026-08-05T00:00:00Z'));
    store.updatePost(pinned.id, { pinned: true });
    expect(store.publicPosts('free', null).map((p) => p.title)).toEqual(['고정', '새것', '오래된']);
  });

  it('인기순은 좋아요와 답글을 함께 본다', () => {
    const quiet = store.addPost({ board: 'free', title: '조용', text: 'x', accountId: 'u1', handle: 'kim' });
    const loud = store.addPost({ board: 'free', title: '북적', text: 'y', accountId: 'u2', handle: 'lee' });
    store.toggleLike(loud.id, 'u3');
    store.addReply(loud.id, { text: '오', accountId: 'u4', handle: 'park', byOwner: false });
    expect(store.publicPosts('free', null, 'top')[0].title).toBe('북적');
    expect(store.publicPosts('free', null, 'top')[1].title).toBe('조용');
    void quiet;
  });

  it('좋아요와 표는 따로 센다 — 뜻이 다르다', () => {
    const post = store.addPost({ board: 'request', text: '엑셀 변환', accountId: 'u1', handle: 'kim' });
    store.toggleLike(post.id, 'u2');
    const shown = store.publicPosts('request', 'u2')[0];
    expect(shown.votes).toBe(1); // 올린 사람의 첫 표
    expect(shown.likes).toBe(1);
    expect(shown.likedByMe).toBe(true);
    expect(shown.votedByMe).toBe(false);
  });

  it('조회수는 같은 사람 새로고침으로 안 오른다', () => {
    const post = store.addPost({ board: 'free', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    store.recordPostView(post.id, 'visitor-a');
    store.recordPostView(post.id, 'visitor-a');
    store.recordPostView(post.id, 'visitor-b');
    expect(store.publicPost(post.id, null)?.views).toBe(2);
  });

  it('대댓글은 한 단만 접는다 — 더 깊으면 누가 누구에게 하는 말인지 못 읽는다', () => {
    const post = store.addPost({ board: 'free', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    const top = store.addReply(post.id, { text: '첫 답글', accountId: 'u2', handle: 'lee', byOwner: false })!;
    const child = store.addReply(post.id, { text: '답글의 답글', accountId: 'u3', handle: 'park', byOwner: false, parentId: top.id })!;
    const grand = store.addReply(post.id, { text: '더 깊이', accountId: 'u4', handle: 'choi', byOwner: false, parentId: child.id })!;
    expect(child.parentId).toBe(top.id);
    expect(grand.parentId).toBe(top.id); // 같은 단으로 붙는다
  });

  it('답글을 지우면 거기 달린 대댓글도 같이 사라진다', () => {
    const post = store.addPost({ board: 'free', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    const top = store.addReply(post.id, { text: '부모', accountId: 'u2', handle: 'lee', byOwner: false })!;
    store.addReply(post.id, { text: '자식', accountId: 'u3', handle: 'park', byOwner: false, parentId: top.id });
    expect(store.publicPost(post.id, null)?.replies).toHaveLength(2);
    expect(store.deleteReply(post.id, top.id, 'u2', false)).toBe(true);
    expect(store.publicPost(post.id, null)?.replies).toHaveLength(0);
  });

  it('남의 답글은 못 지운다', () => {
    const post = store.addPost({ board: 'free', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    const reply = store.addReply(post.id, { text: '내 답글', accountId: 'u2', handle: 'lee', byOwner: false })!;
    expect(store.deleteReply(post.id, reply.id, 'u9', false)).toBe(false);
    expect(store.deleteReply(post.id, reply.id, 'u9', true)).toBe(true); // 주인은 된다
  });

  it('옛 글도 그대로 읽힌다 — 판·조회수 칸이 없던 시절 것', () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        tools: {},
        posts: [
          { id: 'old-1', kind: 'talk', title: '옛 글', text: 'x', authorHandle: 'kim', authorAccountId: 'u1',
            createdAt: '2026-01-01T00:00:00Z', voterAccountIds: [], status: 'open', replies: [], bumpedAt: '2026-01-01T00:00:00Z' },
          { id: 'old-2', kind: 'request', text: '옛 요청', authorHandle: 'lee', authorAccountId: 'u2',
            createdAt: '2026-01-02T00:00:00Z', voterAccountIds: ['u2'], status: 'open', replies: [], bumpedAt: '2026-01-02T00:00:00Z' },
        ],
      }),
      'utf-8',
    );
    const reopened = new KarmolabTraceStore(statePath);
    expect(reopened.publicPosts('free', null).map((p) => p.title)).toEqual(['옛 글']);
    expect(reopened.publicPosts('request', null).map((p) => p.text)).toEqual(['옛 요청']);
    expect(reopened.publicPost('old-1', null)?.views).toBe(0);
    expect(reopened.publicPost('old-1', null)?.likes).toBe(0);
  });

  it('사람마다 활동을 센다 — 공개 프로필에 실린다', () => {
    const post = store.addPost({ board: 'free', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    store.addReply(post.id, { text: 'r1', accountId: 'u2', handle: 'lee', byOwner: false });
    store.addReply(post.id, { text: 'r2', accountId: 'u2', handle: 'lee', byOwner: false });
    expect(store.activityOf('kim')).toEqual({ posts: 1, replies: 0 });
    expect(store.activityOf('lee')).toEqual({ posts: 0, replies: 2 });
  });
});
