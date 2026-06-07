import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isOwnerRequest,
  classifyOwnerRequest,
  makeRequestClassifier,
  DOMAIN_AGENT,
  type RequestClassifier,
  type OwnerRequestClass,
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

describe('classifyOwnerRequest — fast path(멘션/키워드) + LLM 도메인', () => {
  const wm: RequestClassifier = async (): Promise<OwnerRequestClass> => ({ isRequest: true, domain: 'WM' });
  const no: RequestClassifier = async (): Promise<OwnerRequestClass> => ({ isRequest: false, domain: 'general' });

  it('멘션/키워드 = 요청 확정, 도메인은 LLM (fast path)', async () => {
    expect(await classifyOwnerRequest('요청: x', false)).toEqual({ isRequest: true, domain: 'general' });
    const r = await classifyOwnerRequest('요청: 마도서', false, wm);
    expect(r).toEqual({ isRequest: true, domain: 'WM' });
  });
  it('평범한 대화 = classifier 판정 (도메인 포함)', async () => {
    expect(await classifyOwnerRequest('마도서 좀 고쳐주지', false, wm)).toEqual({ isRequest: true, domain: 'WM' });
    expect(await classifyOwnerRequest('오늘 날씨 좋다', false, no)).toEqual({ isRequest: false, domain: 'general' });
  });
  it('classifier 없으면 평범한 대화 = 요청 아님', async () => {
    expect(await classifyOwnerRequest('마도서 좀 고쳐주지', false)).toEqual({ isRequest: false, domain: 'general' });
  });
  it('너무 짧은 메시지(<4) = LLM skip', async () => {
    expect(await classifyOwnerRequest('ㅇㅋ', false, wm)).toEqual({ isRequest: false, domain: 'general' });
  });
  it('classifier throw = fast path 결과 + general (안전)', async () => {
    const boom: RequestClassifier = async () => {
      throw new Error('llm down');
    };
    expect(await classifyOwnerRequest('마도서 고쳐주지 좀', false, boom)).toEqual({ isRequest: false, domain: 'general' });
    // 멘션이면 throw 나도 요청 확정 유지
    expect(await classifyOwnerRequest('아무거나', true, boom)).toEqual({ isRequest: true, domain: 'general' });
  });
});

describe('makeRequestClassifier — JSON {request,domain} 파싱', () => {
  it('정상 JSON 파싱', async () => {
    const c = makeRequestClassifier(async () => '{"request": true, "domain": "WM"}');
    expect(await c('마도서 고쳐줘')).toEqual({ isRequest: true, domain: 'WM' });
  });
  it('잡담 = request false', async () => {
    const c = makeRequestClassifier(async () => '{"request": false, "domain": "general"}');
    expect(await c('ㅋㅋㅋ')).toEqual({ isRequest: false, domain: 'general' });
  });
  it('알 수 없는 domain → general 보정', async () => {
    const c = makeRequestClassifier(async () => '{"request": true, "domain": "ZZZ"}');
    expect(await c('x')).toEqual({ isRequest: true, domain: 'general' });
  });
  it('JSON 아닌 응답 → 안전 default', async () => {
    const c = makeRequestClassifier(async () => '음 글쎄');
    expect(await c('x')).toEqual({ isRequest: false, domain: 'general' });
  });
});

describe('DOMAIN_AGENT — 도메인 → 에이전트 매핑', () => {
  it('각 도메인에 응답 에이전트', () => {
    expect(DOMAIN_AGENT.WM).toBe('wm-scout');
    expect(DOMAIN_AGENT.KL).toBe('kl-worker');
    expect(DOMAIN_AGENT.YB).toBe('echo');
    expect(DOMAIN_AGENT.KAR).toBe('atlas');
    expect(DOMAIN_AGENT.general).toBe('atlas');
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
