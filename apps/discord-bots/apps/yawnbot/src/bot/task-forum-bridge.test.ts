/**
 * task-forum-bridge — TASK id 추출 + ledger append/lookup 단위 테스트.
 *
 * TASK-YB-039 P2.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseTaskId,
  forumTitleForTask,
  taskForumLedgerPath,
  appendTaskForumLink,
  lookupTaskForumLinkByTaskId,
  lookupTaskForumLinkByPostId,
} from './task-forum-bridge';

function freshEnv(): NodeJS.ProcessEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-tfb-'));
  return { MEMO_REPO_PATH: root } as unknown as NodeJS.ProcessEnv;
}

describe('parseTaskId', () => {
  it('표준 basename 에서 추출', () => {
    expect(parseTaskId('TASK-YB-039-team-work-단일-board-통합.md')).toBe(
      'TASK-YB-039',
    );
  });
  it('도메인 prefix 다양 (KAR/WM/KL/YB)', () => {
    expect(parseTaskId('TASK-KAR-018.md')).toBe('TASK-KAR-018');
    expect(parseTaskId('TASK-WM-099-x.md')).toBe('TASK-WM-099');
    expect(parseTaskId('TASK-KL-001.md')).toBe('TASK-KL-001');
  });
  it('임의 문자열 안에서도 hit', () => {
    expect(parseTaskId('생성됨: TASK-YB-040 (foo)')).toBe('TASK-YB-040');
  });
  it('hit 없음 = null', () => {
    expect(parseTaskId('random.md')).toBeNull();
    expect(parseTaskId('')).toBeNull();
    expect(parseTaskId(null)).toBeNull();
    expect(parseTaskId(undefined)).toBeNull();
  });
  it('소문자/하이픈 부족 = miss', () => {
    expect(parseTaskId('task-yb-039.md')).toBeNull();
    expect(parseTaskId('TASK-YB039.md')).toBeNull();
  });
});

describe('forumTitleForTask', () => {
  it('body 있으면 prefix + body', () => {
    expect(forumTitleForTask('TASK-YB-039', '제안 abc: 통합')).toBe(
      '[TASK-YB-039] 제안 abc: 통합',
    );
  });
  it('body 비면 prefix 만 (공백 trim)', () => {
    expect(forumTitleForTask('TASK-YB-039')).toBe('[TASK-YB-039]');
    expect(forumTitleForTask('TASK-YB-039', '')).toBe('[TASK-YB-039]');
    expect(forumTitleForTask('TASK-YB-039', '   ')).toBe('[TASK-YB-039]');
  });
  it('100자 한도 — body 절단', () => {
    const out = forumTitleForTask('TASK-YB-039', 'A'.repeat(200));
    expect(out.length).toBe(100);
    expect(out.startsWith('[TASK-YB-039] ')).toBe(true);
  });
});

describe('ledger append / lookup', () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    env = freshEnv();
  });

  it('append 후 동일 taskId lookup', () => {
    appendTaskForumLink(env, {
      taskId: 'TASK-YB-039',
      postId: 'th-1',
      channelId: 'ch-tw',
      proposalId: 'p-abc',
    });
    const hit = lookupTaskForumLinkByTaskId(env, 'TASK-YB-039');
    expect(hit).not.toBeNull();
    expect(hit!.postId).toBe('th-1');
    expect(hit!.channelId).toBe('ch-tw');
    expect(hit!.proposalId).toBe('p-abc');
    expect(typeof hit!.ts).toBe('string');
  });

  it('미존재 taskId = null', () => {
    expect(lookupTaskForumLinkByTaskId(env, 'TASK-YB-001')).toBeNull();
  });

  it('동일 taskId 중복 append = 최신 1건 반환', () => {
    appendTaskForumLink(env, {
      taskId: 'TASK-YB-039',
      postId: 'th-old',
      channelId: 'ch-tw',
    });
    appendTaskForumLink(env, {
      taskId: 'TASK-YB-039',
      postId: 'th-new',
      channelId: 'ch-tw',
    });
    expect(lookupTaskForumLinkByTaskId(env, 'TASK-YB-039')!.postId).toBe(
      'th-new',
    );
  });

  it('postId 역방향 lookup', () => {
    appendTaskForumLink(env, {
      taskId: 'TASK-YB-039',
      postId: 'th-1',
      channelId: 'ch-tw',
    });
    expect(lookupTaskForumLinkByPostId(env, 'th-1')!.taskId).toBe(
      'TASK-YB-039',
    );
    expect(lookupTaskForumLinkByPostId(env, 'th-none')).toBeNull();
  });

  it('MEMO_REPO_PATH 미설정 = noop (path "" / lookup null)', () => {
    const empty = {} as NodeJS.ProcessEnv;
    expect(taskForumLedgerPath(empty)).toBe('');
    appendTaskForumLink(empty, {
      taskId: 'TASK-X-1',
      postId: 'th',
      channelId: 'ch',
    });
    expect(lookupTaskForumLinkByTaskId(empty, 'TASK-X-1')).toBeNull();
  });

  it('malformed 라인 = skip (전체 안 깨짐)', () => {
    const p = taskForumLedgerPath(env);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      'not-json\n' +
        JSON.stringify({
          taskId: 'TASK-YB-039',
          postId: 'th-1',
          channelId: 'ch-tw',
          ts: '2026-05-23T00:00:00.000Z',
        }) +
        '\n',
      'utf-8',
    );
    expect(lookupTaskForumLinkByTaskId(env, 'TASK-YB-039')!.postId).toBe(
      'th-1',
    );
  });
});
