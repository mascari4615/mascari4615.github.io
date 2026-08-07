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
import { KarmolabTraceStore, kstDay, isValidToolId } from './karmolab-traces';

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
    store.addPost({ kind: 'request', text: '엑셀을 CSV 로 바꾸는 도구', accountId: 'acc-1', handle: 'kim' });
    const list = store.publicPosts('request', 'acc-1');
    expect(list[0].votes).toBe(1);
    expect(list[0].votedByMe).toBe(true);
    expect(list[0].status).toBe('open');
  });

  it('한 사람은 한 표뿐 — 두 번 누르면 취소된다', () => {
    const request = store.addPost({ kind: 'request', text: '테스트', accountId: 'acc-1', handle: 'kim' });
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
    const a = store.addPost({ kind: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' });
    store.addPost({ kind: 'request', text: 'B', accountId: 'acc-2', handle: 'lee' });
    store.toggleVote(a.id, 'acc-3');
    store.toggleVote(a.id, 'acc-4');
    expect(store.publicPosts('request', null).map((r) => r.text)).toEqual(['A', 'B']);
  });

  it('로그인 안 한 사람에게는 「내가 눌렀나」가 전부 거짓', () => {
    store.addPost({ kind: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicPosts('request', null)[0].votedByMe).toBe(false);
  });

  it('하루에 올린 개수를 센다 — 도배 막는 근거', () => {
    const day = new Date('2026-08-07T01:00:00Z');
    store.addPost({ kind: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' }, day);
    store.addPost({ kind: 'request', text: 'B', accountId: 'acc-1', handle: 'kim' }, day);
    store.addPost({ kind: 'request', text: 'C', accountId: 'acc-2', handle: 'lee' }, day);
    expect(store.postsTodayBy('acc-1', 'request', day)).toBe(2);
    expect(store.postsTodayBy('acc-2', 'request', day)).toBe(1);
    expect(store.postsTodayBy('acc-1', 'request', new Date('2026-08-09T01:00:00Z'))).toBe(0);
  });

  it('주인은 요청 상태를 바꾼다 — 이상한 값은 무시', () => {
    const request = store.addPost({ kind: 'request', text: 'A', accountId: 'acc-1', handle: 'kim' });
    store.updatePost(request.id, { status: 'planned' });
    expect(store.publicPosts('request', null)[0].status).toBe('planned');
    store.updatePost(request.id, { status: '아무거나' });
    expect(store.publicPosts('request', null)[0].status).toBe('planned');
  });

  it('이야기와 요청은 서로의 목록에 안 섞인다', () => {
    store.addPost({ kind: 'talk', title: '인사', text: '안녕하세요', accountId: 'acc-1', handle: 'kim' });
    store.addPost({ kind: 'request', text: '도구 하나만', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicPosts('talk', null).map((p) => p.title)).toEqual(['인사']);
    expect(store.publicPosts('request', null).map((p) => p.text)).toEqual(['도구 하나만']);
  });

  it('이야기는 표가 0 에서 시작한다 — 글은 요청이 아니다', () => {
    store.addPost({ kind: 'talk', title: '제목', text: '본문', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicPosts('talk', 'acc-1')[0].votes).toBe(0);
  });

  it('답글이 달리면 그 글이 목록 위로 올라온다 — 대화가 가라앉으면 아무도 안 본다', () => {
    const first = store.addPost(
      { kind: 'talk', title: '먼저', text: 'x', accountId: 'acc-1', handle: 'kim' },
      new Date('2026-08-01T00:00:00Z'),
    );
    store.addPost(
      { kind: 'talk', title: '나중', text: 'y', accountId: 'acc-2', handle: 'lee' },
      new Date('2026-08-02T00:00:00Z'),
    );
    expect(store.publicPosts('talk', null).map((p) => p.title)).toEqual(['나중', '먼저']);

    store.addReply(
      first.id,
      { text: '답글!', accountId: 'acc-3', handle: 'park', byOwner: false },
      new Date('2026-08-03T00:00:00Z'),
    );
    const after = store.publicPosts('talk', null);
    expect(after.map((p) => p.title)).toEqual(['먼저', '나중']);
    expect(after[0].replies).toHaveLength(1);
    expect(after[0].replies[0].authorHandle).toBe('park');
  });

  it('없는 글에는 답글이 안 달린다', () => {
    expect(store.addReply('없는id', { text: 'x', accountId: 'a', handle: 'h', byOwner: false })).toBeNull();
  });

  it('남의 글은 못 지우고, 본인과 주인은 지운다', () => {
    const mine = store.addPost({ kind: 'talk', title: '내 글', text: 'x', accountId: 'acc-1', handle: 'kim' });
    expect(store.deletePost(mine.id, 'acc-2', false)).toBe(false);
    expect(store.publicPosts('talk', null)).toHaveLength(1);
    expect(store.deletePost(mine.id, 'acc-1', false)).toBe(true);
    expect(store.publicPosts('talk', null)).toHaveLength(0);

    const other = store.addPost({ kind: 'talk', title: '남 글', text: 'y', accountId: 'acc-9', handle: 'lee' });
    expect(store.deletePost(other.id, 'acc-2', true)).toBe(true);
  });

  it('방문자 열쇠에는 주소가 안 남는다', () => {
    const key = KarmolabTraceStore.visitorKey('203.0.113.7', 'Mozilla/5.0');
    expect(key).not.toContain('203.0.113.7');
    expect(key).toBe(KarmolabTraceStore.visitorKey('203.0.113.7', 'Mozilla/5.0'));
    expect(key).not.toBe(KarmolabTraceStore.visitorKey('203.0.113.8', 'Mozilla/5.0'));
  });
});
