/** TASK-WM-201 — 기기 로그 저장소. 폰이 보내는 값은 외부 입력이라 경계값이 본체. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  DEFAULT_LIMITS,
  deleteSession,
  appendBatch,
  errorFingerprint,
  isErrorLevel,
  isValidSession,
  listSessions,
  parseBatch,
  pruneSessions,
  resolveSession,
  sessionFilePath,
  tailSession,
} from './device-log-store';

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-log-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function line(msg: string, level = 'log', t = 1_700_000_000_000) {
  return { t, level, msg };
}

describe('parseBatch — 외부 입력 방어', () => {
  it('세션 이름에 경로 조작이 오면 거절한다', () => {
    for (const bad of ['../etc/passwd', 'a/b', 'a\\b', '', '.hidden', 'x'.repeat(65)]) {
      expect(isValidSession(bad), bad).toBe(false);
      expect(parseBatch({ session: bad, lines: [] }).batch).toBeNull();
    }
  });

  it('정상 세션 + 줄을 정규화한다', () => {
    const result = parseBatch({
      session: 'android-20260805-1200',
      device: 'Pixel 7',
      platform: 'Android',
      lines: [{ t: 5, level: 'ERROR', msg: 'boom', stack: 'at Foo()' }],
    });
    expect(result.error).toBeNull();
    expect(result.batch?.lines[0]).toEqual({ t: 5, level: 'error', msg: 'boom', stack: 'at Foo()' });
  });

  it('알 수 없는 레벨은 log 로, 빈 메시지는 버린다', () => {
    const result = parseBatch({ session: 's1', lines: [{ msg: 'ok', level: 'weird' }, { msg: '' }, 42] });
    expect(result.batch?.lines).toHaveLength(1);
    expect(result.batch?.lines[0].level).toBe('log');
    expect(result.dropped).toBe(2);
  });

  it('배치 줄 수·길이 상한을 넘기면 잘라내고 버린 수를 알려준다', () => {
    const many = Array.from({ length: DEFAULT_LIMITS.maxLinesPerBatch + 10 }, (_, i) => line(`m${i}`));
    const result = parseBatch({ session: 's1', lines: many });
    expect(result.batch?.lines).toHaveLength(DEFAULT_LIMITS.maxLinesPerBatch);
    expect(result.dropped).toBe(10);

    const long = parseBatch({ session: 's1', lines: [{ msg: 'x'.repeat(99_999) }] });
    expect(long.batch?.lines[0].msg.length).toBe(DEFAULT_LIMITS.maxMsgChars);
  });

  it('lines 가 배열이 아니면 400 사유를 준다', () => {
    expect(parseBatch({ session: 's1' }).error).toContain('lines');
    expect(parseBatch(null).error).toContain('JSON');
  });
});

describe('appendBatch / tailSession', () => {
  it('첫 배치는 meta 헤더를 남기고, 이후 배치는 줄만 붙인다', () => {
    appendBatch(dir, { session: 's1', device: 'Pixel 7', platform: 'Android', build: 'b1', lines: [line('a')] });
    appendBatch(dir, { session: 's1', lines: [line('b')] });
    const raw = fs.readFileSync(sessionFilePath(dir, 's1'), 'utf-8').trim().split('\n');
    expect(JSON.parse(raw[0]).kind).toBe('meta');
    expect(JSON.parse(raw[0]).device).toBe('Pixel 7');
    expect(raw).toHaveLength(3);
  });

  it('첫 배치만 created 를 참으로 준다 (기기가 막 붙은 순간)', () => {
    expect(appendBatch(dir, { session: 's1', lines: [line('a')] }).created).toBe(true);
    expect(appendBatch(dir, { session: 's1', lines: [line('b')] }).created).toBe(false);
  });

  it('tail 은 마지막 N 줄을 시간순으로 준다', () => {
    appendBatch(dir, { session: 's1', lines: Array.from({ length: 50 }, (_, i) => line(`m${i}`)) });
    const tail = tailSession(dir, 's1', { limit: 3 });
    expect(tail.map((l) => l.msg)).toEqual(['m47', 'm48', 'm49']);
  });

  it('큰 파일에서도 뒤에서부터 읽어 마지막 줄을 정확히 준다', () => {
    const bulk = Array.from({ length: 5000 }, (_, i) => line(`line-${i} ${'p'.repeat(200)}`));
    appendBatch(dir, { session: 's1', lines: bulk.slice(0, 500) });
    for (let i = 500; i < 5000; i += 500) {
      appendBatch(dir, { session: 's1', lines: bulk.slice(i, i + 500) });
    }
    const tail = tailSession(dir, 's1', { limit: 2 });
    expect(tail.map((l) => l.msg.split(' ')[0])).toEqual(['line-4998', 'line-4999']);
  });

  it('레벨·검색 필터가 먹는다 (파일 전체를 훑어서라도 찾는다)', () => {
    appendBatch(dir, {
      session: 's1',
      lines: [
        line('첫 에러', 'error'),
        ...Array.from({ length: 300 }, (_, i) => line(`noise-${i}`)),
        line('경고다', 'warning'),
      ],
    });
    expect(tailSession(dir, 's1', { limit: 10, levels: ['error'] }).map((l) => l.msg)).toEqual(['첫 에러']);
    expect(tailSession(dir, 's1', { limit: 10, contains: '경고' }).map((l) => l.msg)).toEqual(['경고다']);
  });

  it('세션 파일이 상한을 넘으면 더 받지 않고 full 을 알린다', () => {
    const tiny = { ...DEFAULT_LIMITS, maxSessionBytes: 200 };
    appendBatch(dir, { session: 's1', lines: [line('x'.repeat(300))] }, tiny);
    const second = appendBatch(dir, { session: 's1', lines: [line('more')] }, tiny);
    expect(second.full).toBe(true);
    expect(second.written).toBe(0);
  });

  it('깨진 줄이 섞여도 나머지 줄은 살아 나온다', () => {
    appendBatch(dir, { session: 's1', lines: [line('good1')] });
    fs.appendFileSync(sessionFilePath(dir, 's1'), '{깨진 JSON\n', 'utf-8');
    appendBatch(dir, { session: 's1', lines: [line('good2')] });
    expect(tailSession(dir, 's1', { limit: 10 }).map((l) => l.msg)).toEqual(['good1', 'good2']);
  });

  it('없는 세션 tail 은 빈 배열', () => {
    expect(tailSession(dir, 'nope', { limit: 5 })).toEqual([]);
  });
});

describe('listSessions / resolveSession', () => {
  it('최근 갱신 순으로 주고 latest 가 그 첫 줄을 가리킨다', () => {
    appendBatch(dir, { session: 'old', device: 'A', lines: [line('a')] });
    fs.utimesSync(sessionFilePath(dir, 'old'), new Date(1000), new Date(1000));
    appendBatch(dir, { session: 'new', device: 'B', lines: [line('b')] });

    const sessions = listSessions(dir);
    expect(sessions.map((s) => s.session)).toEqual(['new', 'old']);
    expect(sessions[0].device).toBe('B');
    expect(resolveSession(dir, 'latest')).toBe('new');
    expect(resolveSession(dir, undefined)).toBe('new');
    expect(resolveSession(dir, 'old')).toBe('old');
    expect(resolveSession(dir, '../evil')).toBeNull();
  });

  it('세션이 하나도 없으면 latest 는 null', () => {
    expect(resolveSession(dir, 'latest')).toBeNull();
    expect(listSessions(dir)).toEqual([]);
  });
});

describe('pruneSessions', () => {
  it('보존일수를 넘긴 세션을 지운다', () => {
    appendBatch(dir, { session: 'stale', lines: [line('a')] });
    appendBatch(dir, { session: 'fresh', lines: [line('b')] });
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(sessionFilePath(dir, 'stale'), old, old);

    const result = pruneSessions(dir, DEFAULT_LIMITS);
    expect(result.removed).toEqual(['stale']);
    expect(listSessions(dir).map((s) => s.session)).toEqual(['fresh']);
  });

  it('총량 상한을 넘기면 오래된 세션부터 지운다', () => {
    appendBatch(dir, { session: 'a1', lines: [line('x'.repeat(500))] });
    fs.utimesSync(sessionFilePath(dir, 'a1'), new Date(1000), new Date(1000));
    appendBatch(dir, { session: 'b2', lines: [line('y'.repeat(500))] });

    const result = pruneSessions(dir, { ...DEFAULT_LIMITS, maxTotalBytes: 700 });
    expect(result.removed).toEqual(['a1']);
    expect(listSessions(dir).map((s) => s.session)).toEqual(['b2']);
  });
});

describe('deleteSession', () => {
  it('시험용 세션을 지우고, 없는 세션·경로조작은 false', () => {
    appendBatch(dir, { session: 'smoke', lines: [line('a')] });
    expect(deleteSession(dir, 'smoke')).toBe(true);
    expect(listSessions(dir)).toEqual([]);
    expect(deleteSession(dir, 'smoke')).toBe(false);
    expect(deleteSession(dir, '../evil')).toBe(false);
  });
});

describe('에러 판정 · 지문', () => {
  it('에러급 레벨만 참', () => {
    expect(['error', 'exception', 'assert'].every(isErrorLevel)).toBe(true);
    expect(['log', 'warning'].some(isErrorLevel)).toBe(false);
  });

  it('같은 에러의 반복은 같은 지문 — 뒷줄이 달라도 접힌다', () => {
    const a = { t: 1, level: 'exception', msg: 'NullReferenceException\n어쩌고', stack: 'at Foo() line 1\nat Bar()' };
    const b = { t: 2, level: 'exception', msg: 'NullReferenceException\n다른 뒷줄', stack: 'at Foo() line 1\nat Baz()' };
    const c = { t: 3, level: 'exception', msg: 'IndexOutOfRange', stack: 'at Foo() line 1' };
    expect(errorFingerprint(a)).toBe(errorFingerprint(b));
    expect(errorFingerprint(a)).not.toBe(errorFingerprint(c));
  });
});
