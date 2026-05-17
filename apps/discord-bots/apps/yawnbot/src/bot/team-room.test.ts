/**
 * team-room 루프가드 4겹 행동 테스트 (KAR-018-A slice-3t).
 *
 * TDD tracer-bullet (quality.md): public 인터페이스로 *행동* 검증, 1 테스트 1 행동,
 * 구현 아님. 모듈 상태 격리 = 테스트별 유니크 키 (테스트용 reset API 추가 X).
 * 임계 경로 = Freysa 드리프트 차단 (sub-A-1/sub-D 가 이 위에 의존).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isTeamRoom,
  isTeamRoomMessage,
  registerOwnWebhookMessage,
  isOwnWebhookMessage,
  checkAndStampCooldown,
  reserveBudget,
  setBudgetReserve,
  bumpChain,
  resetChain,
} from './team-room';
import type { CharacterService } from '../services/character-service';

/** resolveCore 만 쓰는 최소 스텁 (isTeamRoom 검증용). */
function fakeCS(core: string | null): CharacterService {
  return { resolveCore: () => core } as unknown as CharacterService;
}

describe('isTeamRoom — 코어 바인딩 채널 판정', () => {
  it('DM 은 코어가 있어도 팀 방이 아니다', () => {
    expect(isTeamRoom(fakeCS('atlas'), 'dm:42', true)).toBe(false);
  });

  it('코어 미바인딩(null) 채널은 팀 방이 아니다', () => {
    expect(isTeamRoom(fakeCS(null), 'ch-A', false)).toBe(false);
  });

  it('코어 바인딩된 비-DM 채널은 팀 방이다', () => {
    expect(isTeamRoom(fakeCS('atlas'), 'ch-B', false)).toBe(true);
  });
});

describe('isTeamRoomMessage — main.ts bot-gate 임계경로', () => {
  function fakeMsg(channelId: string, isDM: boolean) {
    return {
      author: { id: 'u1' },
      channel: { id: channelId, isDMBased: () => isDM },
    } as unknown as import('discord.js').Message;
  }

  it('코어 바인딩 비-DM 채널 메시지 = 팀 방 메시지', () => {
    expect(isTeamRoomMessage(fakeCS('atlas'), fakeMsg('tm-ch', false))).toBe(true);
  });

  it('코어 미바인딩 채널 메시지 = 팀 방 아님 (bot-gate drop 유지)', () => {
    expect(isTeamRoomMessage(fakeCS(null), fakeMsg('tm-ch', false))).toBe(false);
  });

  describe('YAWNBOT_AGENT_CHANNEL_ID env 격리 (prod/dev 크로스봇 차단)', () => {
    const KEY = 'YAWNBOT_AGENT_CHANNEL_ID';
    afterEach(() => {
      delete process.env[KEY];
    });

    it('env 설정 → 그 채널만 true (.active.json 무시)', () => {
      process.env[KEY] = 'dev-ch';
      // 코어 바인딩 없어도(fakeCS(null)) env 채널이면 true
      expect(isTeamRoomMessage(fakeCS(null), fakeMsg('dev-ch', false))).toBe(true);
    });

    it('env 설정 → 다른 채널(=prod의 .active.json 채널)은 false', () => {
      process.env[KEY] = 'dev-ch';
      // 코어 바인딩 있어도(fakeCS("atlas")) env 채널 아니면 false = prod 채널 무반응
      expect(isTeamRoomMessage(fakeCS('atlas'), fakeMsg('prod-ch', false))).toBe(false);
    });

    it('env 설정 + DM → false (DM 격리 유지)', () => {
      process.env[KEY] = 'dev-ch';
      expect(isTeamRoomMessage(fakeCS('atlas'), fakeMsg('dev-ch', true))).toBe(false);
    });

    it('env 미설정(prod default) → 기존 .active.json 동작 불변', () => {
      expect(isTeamRoomMessage(fakeCS('atlas'), fakeMsg('any', false))).toBe(true);
      expect(isTeamRoomMessage(fakeCS(null), fakeMsg('any', false))).toBe(false);
    });
  });
});

describe('가드 ① 자기 webhook 무응답', () => {
  it('등록 안 한 메시지 id 는 자기 발화로 보지 않는다', () => {
    expect(isOwnWebhookMessage('g1-unseen')).toBe(false);
  });

  it('register 한 메시지 id 는 자기 발화로 인식한다 (응답 안 함)', () => {
    registerOwnWebhookMessage('g1-mine');
    expect(isOwnWebhookMessage('g1-mine')).toBe(true);
  });
});

describe('가드 ② (core,channel) cooldown', () => {
  afterEach(() => vi.useRealTimers());

  it('동일 (core,channel) 즉시 재트리거는 차단된다', () => {
    expect(checkAndStampCooldown('g2c', 'g2ch')).toBe(true); // 첫 트리거 통과
    expect(checkAndStampCooldown('g2c', 'g2ch')).toBe(false); // 쿨다운 중 차단
  });

  it('cooldown 경과 후 다시 통과한다', () => {
    vi.useFakeTimers();
    expect(checkAndStampCooldown('g2c2', 'g2ch2')).toBe(true);
    vi.advanceTimersByTime(5000); // 기본 4000ms 초과
    expect(checkAndStampCooldown('g2c2', 'g2ch2')).toBe(true);
  });

  it('다른 채널은 서로의 cooldown 에 영향 없다', () => {
    expect(checkAndStampCooldown('g2c3', 'chX')).toBe(true);
    expect(checkAndStampCooldown('g2c3', 'chY')).toBe(true); // 독립 키
  });
});

describe('가드 ③ 예산 reserve 훅 (sub-D 교체 지점)', () => {
  afterEach(() => setBudgetReserve(() => true)); // default 복원

  it('기본값은 항상 allow (sub-D 미구현 시 통과)', () => {
    expect(reserveBudget('g3c', 'g3ch')).toBe(true);
  });

  it('주입된 훅이 reject 하면 차단된다', () => {
    setBudgetReserve(() => false);
    expect(reserveBudget('g3c', 'g3ch')).toBe(false);
  });

  it('훅은 core/channel 컨텍스트를 받는다', () => {
    const seen: { core: string; channelId: string }[] = [];
    setBudgetReserve((ctx) => {
      seen.push(ctx);
      return true;
    });
    reserveBudget('g3core', 'g3chan');
    expect(seen).toEqual([{ core: 'g3core', channelId: 'g3chan' }]);
  });
});

describe('가드 ④ 체인 깊이 상한', () => {
  it('사람 발화는 체인을 리셋한다 (depth 0, 미초과)', () => {
    const r = bumpChain('g4-human', true);
    expect(r).toEqual({ depth: 0, exceeded: false });
  });

  it('에이전트 트리거 연속은 상한(기본 6) 초과 시 exceeded', () => {
    const ch = 'g4-chain';
    for (let i = 1; i <= 6; i++) {
      expect(bumpChain(ch, false).exceeded).toBe(false); // 1..6 미초과
    }
    expect(bumpChain(ch, false).exceeded).toBe(true); // 7번째 초과
  });

  it('사람 발화가 끼면 체인이 끊겨 다시 1부터', () => {
    const ch = 'g4-break';
    bumpChain(ch, false);
    bumpChain(ch, false);
    bumpChain(ch, true); // 사람 개입 → 리셋
    expect(bumpChain(ch, false)).toEqual({ depth: 1, exceeded: false });
  });

  it('resetChain 후 depth 가 0 에서 다시 시작한다', () => {
    const ch = 'g4-reset';
    bumpChain(ch, false);
    bumpChain(ch, false);
    resetChain(ch);
    expect(bumpChain(ch, false).depth).toBe(1);
  });
});
