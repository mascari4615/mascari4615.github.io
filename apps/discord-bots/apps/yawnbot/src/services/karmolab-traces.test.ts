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
import { KarmolabTraceStore, kstDay, isValidToolId, isValidGalleryId, slugifyGalleryId } from './karmolab-traces';

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

describe('사람들 기기의 성능 분포 (TASK-KL-201)', () => {
  it('칸에 세고, 되돌려서 한 사람을 못 찾는다 — 개별 기록은 안 남긴다', () => {
    store.recordPerf({ ready: 120, lcp: 900, cls: 0.02 });
    store.recordPerf({ ready: 3000, lcp: 5000, cls: 0.2 });
    const stats = store.perfStats();
    expect(stats.metrics.ready.n).toBe(2);
    // 칸으로 세므로 정확한 ms 가 아니라 「칸의 위 경계」다 — 그 성질을 그대로 지킨다.
    expect(stats.metrics.ready.p50).toBeLessThanOrEqual(250);
    expect(stats.metrics.ready.p75).toBeGreaterThanOrEqual(2000);
  });

  it('값이 없거나 말이 안 되면 그 지표만 건너뛴다 — 0 으로 채우면 아주 빠른 판이 하나 생긴다', () => {
    store.recordPerf({ ready: -1, lcp: Number.NaN, inp: 'x' as unknown as number, cls: 0.01 });
    const stats = store.perfStats();
    expect(stats.metrics.ready.n).toBe(0);
    expect(stats.metrics.lcp.n).toBe(0);
    expect(stats.metrics.inp.n).toBe(0);
    expect(stats.metrics.cls.n).toBe(1);
  });

  it('아무도 안 보냈으면 0 이 아니라 「표본 없음」으로 읽히게 — 중앙값이 null 이다', () => {
    const stats = store.perfStats();
    expect(stats.samples).toBe(0);
    expect(stats.metrics.lcp.p50).toBeNull();
  });
});

describe('방문 세기 (Total / Today)', () => {
  it('같은 사람이 화면을 옮겨 다녀도 한 번만 센다 — 안 그러면 수가 「내가 링크를 잘 걸었다」만 말한다', () => {
    expect(store.recordVisit('visitor-a')).toBe(true);
    expect(store.recordVisit('visitor-a')).toBe(false);
    const stats = store.visitStats();
    expect(stats.total).toBe(1);
    expect(stats.peopleToday).toBe(1);
  });

  it('다른 사람은 따로 센다', () => {
    store.recordVisit('visitor-a');
    store.recordVisit('visitor-b');
    const stats = store.visitStats();
    expect(stats.total).toBe(2);
    expect(stats.today).toBe(2);
    expect(stats.peopleToday).toBe(2);
  });

  it('30분이 지나면 방문은 다시 세지만 「오늘 다녀간 사람」은 그대로다 — 한 사람은 하루 한 명이다', () => {
    const first = new Date('2026-08-08T01:00:00Z');
    const later = new Date('2026-08-08T02:00:00Z');
    expect(store.recordVisit('visitor-a', 'human', first)).toBe(true);
    expect(store.recordVisit('visitor-a', 'human', later)).toBe(true);
    const stats = store.visitStats(later);
    expect(stats.total).toBe(2);
    expect(stats.peopleToday).toBe(1);
  });

  it('날이 바뀌면 오늘 수는 0부터, 누적은 이어진다', () => {
    const yesterday = new Date('2026-08-07T05:00:00Z');
    const today = new Date('2026-08-08T05:00:00Z');
    store.recordVisit('visitor-a', 'human', yesterday);
    store.recordVisit('visitor-b', 'human', today);
    const stats = store.visitStats(today);
    expect(stats.total).toBe(2);
    expect(stats.today).toBe(1);
    expect(stats.peopleToday).toBe(1);
  });

  it('봇이 다시 떠도 오늘 사람 수가 두 배가 되지 않는다 — 열쇠를 저장하기 때문', () => {
    const now = new Date('2026-08-08T05:00:00Z');
    store.recordVisit('visitor-a', 'human', now);
    store.flush();
    // 재시작 = 30분 창(메모리)은 사라진다. 그래도 「오늘 이미 센 사람」은 파일에 남아 있어야 한다.
    const reopened = new KarmolabTraceStore(statePath);
    expect(reopened.recordVisit('visitor-a', 'human', now)).toBe(true);
    expect(reopened.visitStats(now).peopleToday).toBe(1);
    expect(reopened.visitStats(now).total).toBe(2);
  });

  it('이 칸이 없던 예전 상태 파일에서도 기동한다', () => {
    fs.writeFileSync(statePath, JSON.stringify({ version: 1, tools: {}, posts: [] }), 'utf-8');
    const reopened = new KarmolabTraceStore(statePath);
    expect(reopened.visitStats().total).toBe(0);
    expect(() => reopened.recordVisit('v1')).not.toThrow();
  });

  it('최근 14일을 오래된 날부터 오늘까지 빠짐없이 준다 — 빈 날도 0으로 있어야 그래프가 안 찌그러진다', () => {
    const now = new Date('2026-08-08T05:00:00Z');
    store.recordVisit('visitor-a', 'human', now);
    const days = store.visitStats(now).recentDays;
    expect(days).toHaveLength(14);
    expect(days[13].day).toBe(kstDay(now));
    expect(days[13].visits).toBe(1);
    expect(days[0].visits).toBe(0);
  });
});

describe('누가 왔나 나눠 세기 · 지금 보는 사람', () => {
  it('검색봇·AI 는 「사람」 수에 안 들어간다 — 공개한 수가 거짓말이 되면 안 된다', () => {
    const now = new Date('2026-08-08T05:00:00Z');
    store.recordVisit('사람1', 'human', now);
    store.recordVisit('구글봇', 'search', now);
    store.recordVisit('AI봇', 'ai', now);
    store.recordVisit('정체불명', 'unknown', now);

    const stats = store.visitStats(now);
    expect(stats.total).toBe(1);
    expect(stats.peopleToday).toBe(1);
  });

  it('그렇다고 버리지도 않는다 — 종류별로 그대로 공개된다', () => {
    const now = new Date('2026-08-08T05:00:00Z');
    store.recordVisit('사람1', 'human', now);
    store.recordVisit('구글봇', 'search', now);
    store.recordVisit('AI봇1', 'ai', now);
    store.recordVisit('AI봇2', 'ai', now);

    const kinds = store.visitStats(now).kinds;
    expect(kinds.total).toEqual({ human: 1, search: 1, ai: 2, unknown: 0 });
    expect(kinds.today).toEqual({ human: 1, search: 1, ai: 2, unknown: 0 });
  });

  it('어제 온 봇은 오늘 칸에 안 들어간다', () => {
    const yesterday = new Date('2026-08-07T05:00:00Z');
    const today = new Date('2026-08-08T05:00:00Z');
    store.recordVisit('AI봇', 'ai', yesterday);
    const kinds = store.visitStats(today).kinds;
    expect(kinds.total.ai).toBe(1);
    expect(kinds.today.ai).toBe(0);
  });

  it('종류 칸이 없던 예전 상태 파일에서도 기동한다', () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ version: 1, tools: {}, posts: [], visits: { total: 5, days: {}, people: {} } }),
      'utf-8',
    );
    const reopened = new KarmolabTraceStore(statePath);
    expect(reopened.visitStats().total).toBe(5);
    expect(reopened.visitStats().kinds.total).toEqual({ human: 0, search: 0, ai: 0, unknown: 0 });
  });

  it('지금 보는 사람은 시간이 지나면 빠진다 — 「지금」이 과거를 끌고 다니면 안 된다', () => {
    const t0 = new Date('2026-08-08T05:00:00Z');
    expect(store.touchPresence('사람1', t0)).toBe(1);
    expect(store.touchPresence('사람2', t0)).toBe(2);
    // 같은 사람이 다시 알려 와도 두 명이 되지 않는다
    expect(store.touchPresence('사람1', new Date(t0.getTime() + 60_000))).toBe(2);
    // 마지막 소식에서 5분이 넘게 지나면 빠진다 (사람1 은 1분 뒤에 알려 왔으므로 더 오래 남는다)
    expect(store.presenceCount(new Date(t0.getTime() + 5.5 * 60_000))).toBe(1);
    expect(store.presenceCount(new Date(t0.getTime() + 7 * 60_000))).toBe(0);
  });

  it('지금 보는 사람은 저장하지 않는다 — 다시 켜면 0이 맞다', () => {
    const now = new Date('2026-08-08T05:00:00Z');
    store.touchPresence('사람1', now);
    store.flush();
    expect(new KarmolabTraceStore(statePath).presenceCount(now)).toBe(0);
  });
});

describe('이슈식 갤러리 — 번호와 상태', () => {
  it('갤러리마다 1번부터 매긴다 — 다른 갤러리와 안 섞인다', () => {
    const a = store.addPost({ board: 'free', title: '가', text: '1', accountId: 'acc-1', handle: 'kim' });
    const b = store.addPost({ board: 'free', title: '나', text: '2', accountId: 'acc-1', handle: 'kim' });
    const c = store.addPost({ board: 'qna', title: '다', text: '3', accountId: 'acc-1', handle: 'kim' });
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 1]);
  });

  it('글을 지워도 번호는 안 당겨 온다 — 어제 남긴 「#2 참고」가 다른 글을 가리키면 안 된다', () => {
    store.addPost({ board: 'free', title: '가', text: '1', accountId: 'acc-1', handle: 'kim' });
    const second = store.addPost({ board: 'free', title: '나', text: '2', accountId: 'acc-1', handle: 'kim' });
    store.deletePost(second.id, 'acc-1', false);
    const third = store.addPost({ board: 'free', title: '다', text: '3', accountId: 'acc-1', handle: 'kim' });
    expect(third.seq).toBe(3);
  });

  it('번호가 없던 옛 글도 갤러리마다 1부터 받고, 오래된 글이 1번이다', () => {
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        tools: {},
        posts: [
          { id: 'p3', board: 'free', text: '새 글', createdAt: '2026-08-03T00:00:00Z' },
          { id: 'p2', board: 'free', text: '중간', createdAt: '2026-08-02T00:00:00Z' },
          { id: 'p1', board: 'free', text: '옛 글', createdAt: '2026-08-01T00:00:00Z' },
        ],
      }),
      'utf-8',
    );
    const reopened = new KarmolabTraceStore(statePath);
    expect(reopened.post('p1')?.seq).toBe(1);
    expect(reopened.post('p2')?.seq).toBe(2);
    expect(reopened.post('p3')?.seq).toBe(3);
  });

  it('다시 켠 뒤에 쓴 글도 남의 번호를 다시 받지 않는다 — 카운터가 옛 글보다 뒤에 있으면 안 된다', () => {
    store.addPost({ board: 'free', title: '가', text: '1', accountId: 'acc-1', handle: 'kim' });
    store.addPost({ board: 'free', title: '나', text: '2', accountId: 'acc-1', handle: 'kim' });
    store.flush();
    const reopened = new KarmolabTraceStore(statePath);
    const next = reopened.addPost({ board: 'free', title: '다', text: '3', accountId: 'acc-1', handle: 'kim' });
    expect(next.seq).toBe(3);
  });

  it('상태를 바꾸면 언제·누가가 남는다 — 없으면 닫힌 글이 사라진 글처럼 읽힌다', () => {
    const post = store.addPost({ board: 'request', text: '엑셀 도구', accountId: 'acc-1', handle: 'kim' });
    const at = new Date('2026-08-08T05:00:00Z');
    store.updatePost(post.id, { status: 'done', statusNote: '만들었어요', by: 'owner' }, at);

    const updated = store.post(post.id)!;
    expect(updated.status).toBe('done');
    expect(updated.statusNote).toBe('만들었어요');
    expect(updated.statusBy).toBe('owner');
    expect(updated.statusAt).toBe(at.toISOString());
  });

  it('같은 상태로 다시 바꿔도 시각을 새로 찍지 않는다 — 안 일어난 일이다', () => {
    const post = store.addPost({ board: 'request', text: '요청', accountId: 'acc-1', handle: 'kim' });
    store.updatePost(post.id, { status: 'done', by: 'owner' }, new Date('2026-08-08T05:00:00Z'));
    store.updatePost(post.id, { status: 'done', by: 'other' }, new Date('2026-08-09T05:00:00Z'));
    expect(store.post(post.id)?.statusAt).toBe('2026-08-08T05:00:00.000Z');
    expect(store.post(post.id)?.statusBy).toBe('owner');
  });

  it('이슈식은 껐다 켜도 글이 안 다친다 — 보여줄지만 정하는 스위치다', () => {
    const post = store.addPost({ board: 'free', title: '가', text: '1', accountId: 'acc-1', handle: 'kim' });
    store.updatePost(post.id, { status: 'planned', by: 'owner' });
    expect(store.setGalleryStyle('free', { issueStyle: true })?.issueStyle).toBe(true);
    expect(store.setGalleryStyle('free', { issueStyle: false })?.issueStyle).toBe(false);
    expect(store.post(post.id)?.status).toBe('planned');
    expect(store.post(post.id)?.seq).toBe(1);
  });

  it('도구 요청판은 처음부터 이슈식이다 — 원래 「열림 → 만들어짐」으로 살아 왔다', () => {
    expect(store.gallery('request')?.issueStyle).toBe(true);
    expect(store.gallery('free')?.issueStyle).toBe(false);
  });
});

describe('주간 결산', () => {
  const now = new Date('2026-08-08T05:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it('지난 7일과 그 전 7일을 나란히 준다 — 비교값 없는 수는 뜻이 없다', () => {
    store.recordVisit('a', 'human', daysAgo(1));
    store.recordVisit('b', 'human', daysAgo(2));
    store.recordVisit('c', 'human', daysAgo(9));

    const recap = store.weeklyRecap(now);
    expect(recap.visits.now).toBe(2);
    expect(recap.visits.before).toBe(1);
  });

  it('이번 주 많이 열린 도구 셋과, 지난주엔 없다가 이번 주 처음 열린 도구를 준다', () => {
    store.recordToolOpen('charcount', 'v1', daysAgo(1));
    store.recordToolOpen('charcount', 'v2', daysAgo(2));
    store.recordToolOpen('qrgen', 'v1', daysAgo(3));
    // 지난주에도 있었던 도구는 「새로」가 아니다
    store.recordToolOpen('qrgen', 'v9', daysAgo(9));

    const recap = store.weeklyRecap(now);
    expect(recap.topTools[0]).toEqual({ toolId: 'charcount', opens: 2 });
    expect(recap.newTools).toContain('charcount');
    expect(recap.newTools).not.toContain('qrgen');
  });

  it('이번 주 글·답글 수와 가장 표를 많이 받은 글을 준다', () => {
    const post = store.addPost({ board: 'request', text: '이번 주 요청', accountId: 'acc-1', handle: 'kim' });
    store.toggleVote(post.id, 'acc-2');
    store.addReply(post.id, { text: '좋아요', accountId: 'acc-2', handle: 'lee', byOwner: false });

    const recap = store.weeklyRecap();
    expect(recap.posts).toBe(1);
    expect(recap.replies).toBe(1);
    expect(recap.topPost?.votes).toBe(2);
  });

  it('아무 일도 없던 주에는 0 과 null 을 준다 — 지어내지 않는다', () => {
    const recap = store.weeklyRecap(now);
    expect(recap.visits.now).toBe(0);
    expect(recap.topTools).toEqual([]);
    expect(recap.topPost).toBeNull();
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
  it('갤러리 주소로 쓸 수 있는 모양만 받는다', () => {
    expect(isValidGalleryId('free')).toBe(true);
    expect(isValidGalleryId('my-gallery')).toBe(true);
    expect(isValidGalleryId('한글')).toBe(false);
    expect(isValidGalleryId('a')).toBe(false); // 너무 짧다
    expect(isValidGalleryId('-nope')).toBe(false);
    expect(isValidGalleryId(3)).toBe(false);
  });

  it('이름에서 주소를 만든다', () => {
    expect(slugifyGalleryId('Tool Talk')).toBe('tool-talk');
    expect(slugifyGalleryId('한글이름')).toBe(''); // 못 만들면 사람이 직접 적어야 한다
  });

  it('처음부터 있는 갤러리는 늘 있다', () => {
    expect(store.galleries().map((g) => g.id)).toEqual(
      expect.arrayContaining(['free', 'qna', 'show', 'request', 'notice']),
    );
    expect(store.gallery('free')?.builtin).toBe(true);
    expect(store.gallery('request')?.voteStyle).toBe(true);
    expect(store.gallery('notice')?.ownerOnly).toBe(true);
  });

  it('갤러리를 만들고, 같은 주소는 두 번 안 만들어진다', () => {
    const made = store.addGallery({ id: 'my-gal', label: '내 갤', desc: '설명', handle: 'kim' });
    expect(made?.id).toBe('my-gal');
    expect(made?.builtin).toBe(false);
    expect(made?.createdByHandle).toBe('kim');
    expect(store.addGallery({ id: 'my-gal', label: '또', desc: '', handle: 'lee' })).toBeNull();
  });

  it('빈 갤러리만 지운다 — 글이 있으면 그 글들이 갈 곳을 잃는다', () => {
    store.addGallery({ id: 'my-gal', label: '내 갤', desc: '', handle: 'kim' });
    expect(store.deleteGallery('my-gal', 'lee', false)).toBe('not_allowed'); // 남
    store.addPost({ board: 'my-gal', title: 'a', text: 'x', accountId: 'u1', handle: 'kim' });
    expect(store.deleteGallery('my-gal', 'kim', false)).toBe('not_empty');
    expect(store.deleteGallery('free', 'kim', true)).toBe('not_allowed'); // 처음부터 있던 것
    expect(store.deleteGallery('없는갤', 'kim', true)).toBe('not_found');
  });

  it('하루에 만든 갤러리 수를 센다', () => {
    const day = new Date('2026-08-07T01:00:00Z');
    store.addGallery({ id: 'g-one', label: 'a', desc: '', handle: 'kim' }, day);
    store.addGallery({ id: 'g-two', label: 'b', desc: '', handle: 'kim' }, day);
    expect(store.galleriesTodayBy('kim', day)).toBe(2);
    expect(store.galleriesTodayBy('lee', day)).toBe(0);
  });

  it('다시 켜도 만든 갤러리가 남는다', () => {
    store.addGallery({ id: 'keep-me', label: '남아라', desc: '', handle: 'kim' });
    store.flush();
    expect(new KarmolabTraceStore(statePath).gallery('keep-me')?.label).toBe('남아라');
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
