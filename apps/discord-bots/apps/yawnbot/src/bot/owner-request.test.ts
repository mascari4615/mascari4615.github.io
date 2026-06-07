import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isOwnerRequest,
  stripRequestSignal,
  captureOwnerRequest,
  readOwnerRequests,
  pendingOwnerRequests,
  markAddressed,
  ownerRequestsPath,
} from './owner-request';

describe('isOwnerRequest — 멘션 또는 키워드 prefix', () => {
  it('봇 멘션이면 무조건 요청', () => {
    expect(isOwnerRequest('아무 내용', true)).toBe(true);
    expect(isOwnerRequest('', true)).toBe(true);
  });
  it('키워드 prefix 면 요청 (변형 관대)', () => {
    expect(isOwnerRequest('요청: 이거 고쳐줘', false)).toBe(true);
    expect(isOwnerRequest('부탁 : 저것도', false)).toBe(true);
    expect(isOwnerRequest('  요청: 앞 공백', false)).toBe(true);
    expect(isOwnerRequest('TODO: 나중에', false)).toBe(true);
  });
  it('멘션·키워드 없으면 일반 잡담 = 요청 아님', () => {
    expect(isOwnerRequest('그냥 잡담이야', false)).toBe(false);
    expect(isOwnerRequest('요청사항 없음', false)).toBe(false); // prefix 콜론 아님
  });
});

describe('stripRequestSignal — 신호 제거 본문', () => {
  it('키워드 prefix 제거', () => {
    expect(stripRequestSignal('요청: 이거 고쳐줘', undefined)).toBe('이거 고쳐줘');
  });
  it('멘션 토큰 제거', () => {
    expect(stripRequestSignal('<@123456> 저것 좀', undefined)).toBe('저것 좀');
    expect(stripRequestSignal('<@!999> 부탁: 합치기', undefined)).toBe('합치기');
  });
});

describe('owner-requests store — capture/read/pending/addressed', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oreq-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('빈 상태 = 0건', () => {
    expect(readOwnerRequests(dir)).toEqual([]);
    expect(pendingOwnerRequests(dir)).toEqual([]);
  });

  it('capture → pending 1건, .claude/owner-requests.jsonl 생성', () => {
    const rec = captureOwnerRequest(dir, {
      text: '이거 고쳐줘',
      author: 'Yon',
      channelId: 'c1',
      messageId: 'm123456',
      ts: '2026-06-07T10:00:00.000Z',
    });
    expect(rec.status).toBe('pending');
    expect(rec.id).toContain('oreq-');
    expect(fs.existsSync(ownerRequestsPath(dir))).toBe(true);
    const pending = pendingOwnerRequests(dir);
    expect(pending).toHaveLength(1);
    expect(pending[0].text).toBe('이거 고쳐줘');
  });

  it('markAddressed → pending 에서 빠짐 (append-wins)', () => {
    const rec = captureOwnerRequest(dir, {
      text: 'A',
      author: 'Yon',
      channelId: 'c1',
      messageId: 'mAAAAAA',
      ts: '2026-06-07T10:00:00.000Z',
    });
    expect(markAddressed(dir, rec.id)).toBe(true);
    expect(pendingOwnerRequests(dir)).toHaveLength(0);
    // 전체엔 남아있고 status=addressed
    const all = readOwnerRequests(dir);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('addressed');
    // 중복 markAddressed = false
    expect(markAddressed(dir, rec.id)).toBe(false);
  });

  it('여러 건 pending 최신순', () => {
    captureOwnerRequest(dir, { text: '먼저', author: 'Yon', channelId: 'c1', messageId: 'm111111', ts: '2026-06-07T09:00:00.000Z' });
    captureOwnerRequest(dir, { text: '나중', author: 'Yon', channelId: 'c1', messageId: 'm222222', ts: '2026-06-07T11:00:00.000Z' });
    const pending = pendingOwnerRequests(dir);
    expect(pending).toHaveLength(2);
    expect(pending[0].text).toBe('나중'); // 최신 먼저
  });
});
