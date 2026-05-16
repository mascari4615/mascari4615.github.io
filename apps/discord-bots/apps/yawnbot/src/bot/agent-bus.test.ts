/**
 * agent-bus 순수부 회귀 (KAR-018-V V-1).
 * 카드 내용(render)·메시지↔발굴 매핑 round-trip 잠금. Discord 송신은
 * 통합(라이브 봇 관측)이라 단위 X — 순수 경계만.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendProposalMsg,
  lookupProposalByMessage,
  proposalMsgsPath,
} from './agent-bus';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('proposal 메시지 매핑 (V-2 리액션 승인이 소비)', () => {
  it('append → lookup round-trip', () => {
    appendProposalMsg(env(), {
      messageId: 'm1',
      threadId: 't1',
      id: 'pABC',
      kind: 'task',
      target: 'task-new',
      title: '제목',
      ts: 'now',
    });
    const hit = lookupProposalByMessage(env(), 'm1');
    expect(hit?.id).toBe('pABC');
    expect(hit?.threadId).toBe('t1');
    expect(hit?.kind).toBe('task');
  });

  it('미존재 messageId → null', () => {
    expect(lookupProposalByMessage(env(), 'nope')).toBeNull();
  });

  it('같은 messageId 중복 시 마지막 우선 (idempotent 재게시 대비)', () => {
    appendProposalMsg(env(), {
      messageId: 'm2', threadId: 't', id: 'old', kind: 'task',
      target: 'task-new', title: 'a', ts: '1',
    });
    appendProposalMsg(env(), {
      messageId: 'm2', threadId: 't', id: 'new', kind: 'task',
      target: 'task-new', title: 'b', ts: '2',
    });
    expect(lookupProposalByMessage(env(), 'm2')?.id).toBe('new');
  });

  it('MEMO_REPO_PATH 미설정 → path 빈 문자열 (안전 no-op)', () => {
    expect(proposalMsgsPath({} as NodeJS.ProcessEnv)).toBe('');
  });
});
