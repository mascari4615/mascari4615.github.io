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

describe('도구 요청·투표', () => {
  it('올린 사람의 첫 표가 이미 들어가 있다 — 자기 요청이 0표로 시작하면 어색하다', () => {
    store.addRequest({ text: '엑셀을 CSV 로 바꾸는 도구', accountId: 'acc-1', handle: 'kim' });
    const list = store.publicRequests('acc-1');
    expect(list[0].votes).toBe(1);
    expect(list[0].votedByMe).toBe(true);
    expect(list[0].status).toBe('open');
  });

  it('한 사람은 한 표뿐 — 두 번 누르면 취소된다', () => {
    const request = store.addRequest({ text: '테스트', accountId: 'acc-1', handle: 'kim' });
    expect(store.toggleVote(request.id, 'acc-2')).toBe(true);
    expect(store.publicRequests(null)[0].votes).toBe(2);
    expect(store.toggleVote(request.id, 'acc-2')).toBe(false);
    expect(store.publicRequests(null)[0].votes).toBe(1);
    // 몇 번을 눌러도 사람 수를 넘지 않는다
    store.toggleVote(request.id, 'acc-2');
    store.toggleVote(request.id, 'acc-2');
    expect(store.publicRequests(null)[0].votes).toBe(1);
  });

  it('없는 요청에 투표하면 null', () => {
    expect(store.toggleVote('없는id', 'acc-1')).toBeNull();
  });

  it('표 많은 순으로 서고, 같으면 새 것이 위', () => {
    const a = store.addRequest({ text: 'A', accountId: 'acc-1', handle: 'kim' });
    store.addRequest({ text: 'B', accountId: 'acc-2', handle: 'lee' });
    store.toggleVote(a.id, 'acc-3');
    store.toggleVote(a.id, 'acc-4');
    expect(store.publicRequests(null).map((r) => r.text)).toEqual(['A', 'B']);
  });

  it('로그인 안 한 사람에게는 「내가 눌렀나」가 전부 거짓', () => {
    store.addRequest({ text: 'A', accountId: 'acc-1', handle: 'kim' });
    expect(store.publicRequests(null)[0].votedByMe).toBe(false);
  });

  it('하루에 올린 개수를 센다 — 도배 막는 근거', () => {
    const day = new Date('2026-08-07T01:00:00Z');
    store.addRequest({ text: 'A', accountId: 'acc-1', handle: 'kim' }, day);
    store.addRequest({ text: 'B', accountId: 'acc-1', handle: 'kim' }, day);
    store.addRequest({ text: 'C', accountId: 'acc-2', handle: 'lee' }, day);
    expect(store.requestsTodayBy('acc-1', day)).toBe(2);
    expect(store.requestsTodayBy('acc-2', day)).toBe(1);
    expect(store.requestsTodayBy('acc-1', new Date('2026-08-09T01:00:00Z'))).toBe(0);
  });

  it('주인은 답과 상태를 고친다 — 안 준 항목은 그대로', () => {
    const request = store.addRequest({ text: 'A', accountId: 'acc-1', handle: 'kim' });
    store.updateRequest(request.id, { status: 'planned' });
    expect(store.publicRequests(null)[0].status).toBe('planned');
    store.updateRequest(request.id, { reply: '다음 주에 만들게요' });
    expect(store.publicRequests(null)[0].status).toBe('planned');
    expect(store.publicRequests(null)[0].reply).toBe('다음 주에 만들게요');
    // 이상한 상태는 무시한다
    store.updateRequest(request.id, { status: '아무거나' });
    expect(store.publicRequests(null)[0].status).toBe('planned');
  });

  it('방문자 열쇠에는 주소가 안 남는다', () => {
    const key = KarmolabTraceStore.visitorKey('203.0.113.7', 'Mozilla/5.0');
    expect(key).not.toContain('203.0.113.7');
    expect(key).toBe(KarmolabTraceStore.visitorKey('203.0.113.7', 'Mozilla/5.0'));
    expect(key).not.toBe(KarmolabTraceStore.visitorKey('203.0.113.8', 'Mozilla/5.0'));
  });
});
