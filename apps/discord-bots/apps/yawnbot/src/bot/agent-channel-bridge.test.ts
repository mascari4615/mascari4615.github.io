/**
 * agent-channel-bridge 회귀 (TASK-KAR-018-LT-DIVERSITY D-2).
 *
 * substrate 입력의 *유일한 게이트*. 분류·멘션 파싱·자기루프 차단 의 핵심
 * 회귀를 잠근다 (잘못 분류되면 daemon 이 self-loop 또는 잡음 폭주).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseMentionedCoreIds,
  parseMentionedUserIds,
  publishIncomingDiscord,
  publishToBus,
} from './agent-channel-bridge';
import { readRecentBusEvents } from './agent-channel-bus';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-bridge-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('parseMentionedCoreIds', () => {
  const cores = [
    { id: 'atlas', displayName: 'Atlas' },
    { id: 'echo', displayName: 'Echo' },
    { id: 'kar-worker', displayName: 'Kar' },
  ];

  it('@id 형식 매칭', () => {
    expect(parseMentionedCoreIds('@atlas 의견 좀', cores)).toEqual(['atlas']);
  });

  it('호명 + 쉼표 형식 매칭', () => {
    expect(parseMentionedCoreIds('echo, 도와줘', cores)).toEqual(['echo']);
  });

  it('displayName 도 매칭 (대소문자 무관)', () => {
    expect(parseMentionedCoreIds('@Atlas 봐줘', cores)).toEqual(['atlas']);
  });

  it('일상 단어 false-positive 차단 (호명 구두점 없으면 매치 X)', () => {
    // 'atlas' 가 본문 한가운데 단어로 나와도 '@' 나 ',:' 동반 없으면 매치 X
    expect(parseMentionedCoreIds('나는 atlas 책을 읽었어', cores)).toEqual([]);
  });

  it('빈 텍스트 = 빈 배열', () => {
    expect(parseMentionedCoreIds('', cores)).toEqual([]);
  });

  it('복수 멘션 모두 회수', () => {
    const out = parseMentionedCoreIds('@atlas, @echo 둘 다 봐줘', cores);
    expect(out.sort()).toEqual(['atlas', 'echo']);
  });
});

describe('parseMentionedUserIds', () => {
  it('Discord <@id> 멘션 회수', () => {
    expect(parseMentionedUserIds('<@123456> 안녕')).toEqual(['123456']);
  });

  it('<@!id> nickname mention 도 회수', () => {
    expect(parseMentionedUserIds('<@!987654321> 와')).toEqual(['987654321']);
  });

  it('멘션 없음 = []', () => {
    expect(parseMentionedUserIds('plain text')).toEqual([]);
  });

  it('중복 user id 중복 제거', () => {
    expect(parseMentionedUserIds('<@111111> <@111111> <@222222>').sort()).toEqual([
      '111111',
      '222222',
    ]);
  });
});

describe('publishIncomingDiscord — 분류 + bus write', () => {
  it('사람 사용자 메시지 = channel-msg', () => {
    const ev = publishIncomingDiscord(env(), {
      channelId: 'C1',
      messageId: 'M1',
      ts: '2026-05-23T03:00:00.000Z',
      text: '안녕',
      authorId: 'u1',
      authorName: 'fourth',
      isBot: false,
      isOwnAgentWebhook: false,
    });
    expect(ev?.type).toBe('channel-msg');
    expect(ev?.source).toBe('discord');
    const events = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T05:00:00Z'),
    });
    expect(events.length).toBe(1);
    expect(events[0].text).toBe('안녕');
  });

  it('봇 자기 agent webhook + coreId = core-utter', () => {
    const ev = publishIncomingDiscord(env(), {
      channelId: 'C1',
      messageId: 'M2',
      ts: '2026-05-23T03:00:00.000Z',
      text: '안녕 사용자',
      authorId: 'bot',
      authorName: 'Atlas',
      isBot: true,
      webhookId: 'wh1',
      isOwnAgentWebhook: true,
      coreIdForWebhook: 'atlas',
    });
    expect(ev?.type).toBe('core-utter');
    expect(ev?.coreId).toBe('atlas');
  });

  it('자기 agent webhook 인데 coreId 못 찾으면 skip (자기루프 차단)', () => {
    const ev = publishIncomingDiscord(env(), {
      channelId: 'C1',
      messageId: 'M3',
      ts: '2026-05-23T03:00:00.000Z',
      text: '미식별 webhook',
      authorId: 'bot',
      authorName: 'wh',
      isBot: true,
      webhookId: 'wh1',
      isOwnAgentWebhook: true,
      coreIdForWebhook: null,
    });
    expect(ev).toBeNull();
  });

  it('외부 봇/webhook 메시지 = publish 안함 (substrate 잡음 차단)', () => {
    const ev = publishIncomingDiscord(env(), {
      channelId: 'C1',
      messageId: 'M4',
      ts: '2026-05-23T03:00:00.000Z',
      text: '외부 봇',
      authorId: 'otherbot',
      authorName: 'OtherBot',
      isBot: true,
      webhookId: null,
      isOwnAgentWebhook: false,
    });
    expect(ev).toBeNull();
  });

  it('빈 텍스트 = publish 안함', () => {
    const ev = publishIncomingDiscord(env(), {
      channelId: 'C1',
      messageId: 'M5',
      ts: '2026-05-23T03:00:00.000Z',
      text: '',
      authorId: 'u1',
      authorName: 'u',
      isBot: false,
      isOwnAgentWebhook: false,
    });
    expect(ev).toBeNull();
  });

  it('mentionedCoreIds 가 BusEvent.refs 에 채워짐 (멘션 우회 결정 입력)', () => {
    const ev = publishIncomingDiscord(
      env(),
      {
        channelId: 'C1',
        messageId: 'M6',
        ts: '2026-05-23T03:00:00.000Z',
        text: '@echo 봐줘',
        authorId: 'u1',
        authorName: 'u',
        isBot: false,
        isOwnAgentWebhook: false,
      },
      [{ id: 'echo', displayName: 'Echo' }],
    );
    expect(ev?.refs?.mentionedCoreIds).toEqual(['echo']);
  });

  it('mentionedUserIds 도 refs 에 채워짐', () => {
    const ev = publishIncomingDiscord(
      env(),
      {
        channelId: 'C1',
        messageId: 'M7',
        ts: '2026-05-23T03:00:00.000Z',
        text: '<@111111> 봐줘',
        authorId: 'u1',
        authorName: 'u',
        isBot: false,
        isOwnAgentWebhook: false,
      },
      [],
    );
    expect(ev?.refs?.mentionedUserIds).toEqual(['111111']);
  });

  it('MEMO_REPO_PATH 미설정 = null + 봇 진행 비차단', () => {
    const ev = publishIncomingDiscord(
      {} as NodeJS.ProcessEnv,
      {
        channelId: 'C1',
        messageId: 'M8',
        ts: '2026-05-23T03:00:00.000Z',
        text: 'hi',
        authorId: 'u1',
        authorName: 'u',
        isBot: false,
        isOwnAgentWebhook: false,
      },
      [],
    );
    expect(ev).toBeNull();
  });
});

describe('publishToBus — daemon/KL adapter 공통 entry', () => {
  it('core-utter publish 가능 (daemon path)', () => {
    const ev = publishToBus(env(), {
      source: 'agent-runtime',
      channelId: 'C1',
      ts: '2026-05-23T03:00:00.000Z',
      text: '제 의견은…',
      coreId: 'atlas',
      type: 'core-utter',
    });
    expect(ev?.type).toBe('core-utter');
  });

  it('core-utter 인데 coreId 누락 = null (스키마 보호)', () => {
    const ev = publishToBus(env(), {
      source: 'agent-runtime',
      channelId: 'C1',
      text: '익명 utter',
      type: 'core-utter',
    });
    expect(ev).toBeNull();
  });

  it('알려지지 않은 type 도 null (보호)', () => {
    const ev = publishToBus(env(), {
      source: 'x',
      channelId: 'C1',
      text: 't',
      type: 'unknown' as any,
    });
    expect(ev).toBeNull();
  });
});
