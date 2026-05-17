/**
 * agent-webhook 루프가드 회귀 테스트 (KAR-018-A self-loop 회귀 근본 fix).
 * tracer-bullet: isOwnAgentWebhook 가 *send 전에* true (register-after-send
 * race 부재 입증) — 이 순서가 깨지면 main.ts 게이트가 자기 답장을 재인입.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendAsSkin, isOwnAgentWebhook } from './agent-webhook';
import type { CharacterCard } from '../services/character-service';

const card = {
  slug: 'yawn',
  name: 'Yawn',
  displayName: 'Yawn',
  frontmatter: { avatar_url: '' },
} as unknown as CharacterCard;

/** fetchWebhooks 가 비어있어 createWebhook 경로 → hook.id='WH1'. */
function mockChannel(onSendAssert: () => void) {
  const hook = {
    id: 'WH1',
    name: 'yawnbot-agent',
    send: vi.fn(async () => {
      onSendAssert(); // send *시점* 에 이미 등록돼 있어야 race-free
      return { id: 'MSG1' };
    }),
  };
  return {
    id: 'CH1',
    client: { user: { id: 'BOT' } },
    fetchWebhooks: vi.fn(async () => ({ find: () => undefined })),
    createWebhook: vi.fn(async () => hook),
    _hook: hook,
  };
}

describe('isOwnAgentWebhook — race-free 루프가드', () => {
  beforeEach(() => {
    // 모듈 전역 set 누수 무해(미지의 id 는 false) — 본 테스트 id 만 검증
  });

  it('미지/null/undefined → false (안전 기본)', () => {
    expect(isOwnAgentWebhook(undefined)).toBe(false);
    expect(isOwnAgentWebhook(null)).toBe(false);
    expect(isOwnAgentWebhook('UNKNOWN')).toBe(false);
  });

  it('sendAsSkin: webhook id 가 *hook.send 호출 전* 이미 등록됨 (race 0)', async () => {
    let registeredAtSendTime = false;
    const ch = mockChannel(() => {
      registeredAtSendTime = isOwnAgentWebhook('WH1');
    });
    await sendAsSkin(ch as never, card, { content: 'hi' });
    // 핵심: send 가 실행되는 순간 이미 own 으로 인식 (register-after-send 였다면 false)
    expect(registeredAtSendTime).toBe(true);
    expect(isOwnAgentWebhook('WH1')).toBe(true);
    expect(ch._hook.send).toHaveBeenCalledOnce();
  });
});
