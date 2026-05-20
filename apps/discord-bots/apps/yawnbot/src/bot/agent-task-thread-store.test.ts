// agent-task-thread-store 순수 코어 전수검증. KAR-018-THR.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseTaskThreadLine,
  latestThreadFor,
  taskThreadsPath,
  lookupTaskThread,
  recordTaskThread,
} from './agent-task-thread-store';

describe('parseTaskThreadLine (순수)', () => {
  it('정상 → 레코드', () => {
    const r = parseTaskThreadLine(
      '{"taskId":"TASK-WM-010","threadId":"t1","channelId":"c1","ts":"2026"}',
    );
    expect(r).toEqual({
      taskId: 'TASK-WM-010',
      threadId: 't1',
      channelId: 'c1',
      ts: '2026',
    });
  });
  it('channelId/ts 누락 = 빈문자 fallback (견고)', () => {
    const r = parseTaskThreadLine('{"taskId":"T","threadId":"x"}');
    expect(r).toEqual({ taskId: 'T', threadId: 'x', channelId: '', ts: '' });
  });
  it('빈/JSON 손상/필수필드 누락 = null (이상행 skip)', () => {
    expect(parseTaskThreadLine('')).toBeNull();
    expect(parseTaskThreadLine('   ')).toBeNull();
    expect(parseTaskThreadLine('not-json')).toBeNull();
    expect(parseTaskThreadLine('{"taskId":""}')).toBeNull();
    expect(parseTaskThreadLine('{"threadId":"x"}')).toBeNull();
    expect(parseTaskThreadLine('{"taskId":"T","threadId":""}')).toBeNull();
  });
});

describe('latestThreadFor (순수)', () => {
  it('같은 taskId 의 *마지막* 줄 유효 (재배치 견고)', () => {
    const lines = [
      '{"taskId":"TASK-A","threadId":"t1"}',
      '{"taskId":"TASK-A","threadId":"t2"}',
      '{"taskId":"TASK-B","threadId":"t3"}',
    ];
    expect(latestThreadFor(lines, 'TASK-A')).toMatchObject({
      taskId: 'TASK-A',
      threadId: 't2',
    });
    expect(latestThreadFor(lines, 'TASK-B')).toMatchObject({
      threadId: 't3',
    });
  });
  it('미존재 = null', () => {
    expect(latestThreadFor([], 'TASK-X')).toBeNull();
    expect(
      latestThreadFor(['{"taskId":"TASK-A","threadId":"t1"}'], 'TASK-X'),
    ).toBeNull();
  });
});

describe('taskThreadsPath / record + lookup 왕복 (IO)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thr-store-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('memoRoot 빈문자 = "" path (부재·noop)', () => {
    expect(taskThreadsPath('')).toBe('');
    expect(lookupTaskThread('', 'X')).toBeNull();
    expect(recordTaskThread('', { taskId: 'T', threadId: 't', channelId: 'c' })).toBe(false);
  });

  it('record 1건 → lookup 동일 record', () => {
    const ok = recordTaskThread(tmp, {
      taskId: 'TASK-KAR-018',
      threadId: '1234',
      channelId: '5678',
    });
    expect(ok).toBe(true);
    const got = lookupTaskThread(tmp, 'TASK-KAR-018');
    expect(got).toMatchObject({
      taskId: 'TASK-KAR-018',
      threadId: '1234',
      channelId: '5678',
    });
    expect(got!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
  });

  it('재기동 시뮬: 같은 taskId 재append → 최신 줄 유효 (스레드 재생성·rename 견고)', () => {
    recordTaskThread(tmp, { taskId: 'T', threadId: 'old', channelId: 'c' });
    recordTaskThread(tmp, { taskId: 'T', threadId: 'new', channelId: 'c' });
    expect(lookupTaskThread(tmp, 'T')!.threadId).toBe('new');
  });

  it('파일 부재 = null (lookup 견고)', () => {
    expect(lookupTaskThread(tmp, 'NONE')).toBeNull();
  });

  it('손상 라인 섞여있어도 정상 라인은 살아있음', () => {
    const p = taskThreadsPath(tmp);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      [
        'not-json',
        '{"taskId":"T","threadId":"good"}',
        '{"bad":true}',
        '',
      ].join('\n'),
      'utf-8',
    );
    expect(lookupTaskThread(tmp, 'T')).toMatchObject({ threadId: 'good' });
  });
});
