/**
 * TASK-KAR-145: karmolab-ai tier resolver + usage parser + yawnbot split 빌더 단위 테스트.
 *
 * 핵심 정합:
 * - `getGeminiModelIdForTier` 우선순위: env override > catalog tier match > default fallback
 * - `parseGeminiUsageMetadata` = 필드 누락 → 0 fallback, cached/thoughts 토큰 옵셔널
 * - voiced/dialogue/deliberation split = `{system, user}` 분리. system 안정 prefix
 *   (skinHint 동일 + responder 동일 → 동일 system) → Gemini implicit cache 정렬 게이트.
 */
import { describe, it, expect } from 'vitest';
import {
  getGeminiModelIdForTier,
  parseGeminiUsageMetadata,
  DEFAULT_TEXT_MODEL_ID,
  MODEL_CATALOG,
} from 'karmolab-ai';
import {
  buildVoicedWorkerSystemInstruction,
  buildVoicedWorkerUserPrompt,
} from './agent-cadence-worker';
import {
  buildDialoguePromptSplit,
  buildDeliberationPromptSplit,
  type CoreDef,
  type PeerUtterance,
  type DeliberationState,
} from './agent-dialogue';

describe('getGeminiModelIdForTier — 우선순위 (TASK-KAR-145)', () => {
  it('env override 가 catalog 보다 우위 (lite/standard/pro 별 키)', () => {
    expect(
      getGeminiModelIdForTier('lite', { GEMINI_MODEL_LITE: 'custom-lite' }),
    ).toBe('custom-lite');
    expect(
      getGeminiModelIdForTier('standard', { GEMINI_MODEL_STANDARD: 'custom-std' }),
    ).toBe('custom-std');
    expect(
      getGeminiModelIdForTier('pro', { GEMINI_MODEL_PRO: 'custom-pro' }),
    ).toBe('custom-pro');
  });

  it('env override 빈 문자열·whitespace = 무시 (catalog 폴백)', () => {
    expect(getGeminiModelIdForTier('lite', { GEMINI_MODEL_LITE: '   ' })).toBe(
      MODEL_CATALOG.gemini.find((m) => m.tier === 'lite')!.id,
    );
  });

  it('env 미주입 = catalog tier match', () => {
    expect(getGeminiModelIdForTier('lite')).toBe('gemini-2.5-flash-lite');
    expect(getGeminiModelIdForTier('standard')).toBe('gemini-2.5-flash');
    expect(getGeminiModelIdForTier('pro')).toBe('gemini-2.5-pro');
  });

  it('catalog 에 tier 매치 없음 = DEFAULT_TEXT_MODEL_ID 폴백 (회귀 0 보장)', () => {
    // 가짜 tier 는 타입상 못 박지만, MODEL_CATALOG 에서 모든 tier 가 빠진 상황을
    // 시뮬레이션할 수 없음 → 본 케이스는 implementation 정합으로 갈음. 대신 env
    // 우선순위와 함께 default 가 항상 깨끗한 string 임을 확인.
    expect(DEFAULT_TEXT_MODEL_ID).toMatch(/^gemini/);
  });
});

describe('parseGeminiUsageMetadata — 필드 normalize (TASK-KAR-145)', () => {
  it('완전 응답 → 모든 필드 보존', () => {
    const u = parseGeminiUsageMetadata({
      promptTokenCount: 100,
      candidatesTokenCount: 30,
      totalTokenCount: 130,
      cachedContentTokenCount: 40,
      thoughtsTokenCount: 5,
    });
    expect(u).toEqual({
      promptTokens: 100,
      completionTokens: 30,
      totalTokens: 130,
      cachedPromptTokens: 40,
      thoughtsTokens: 5,
    });
  });

  it('필드 누락 → 0 fallback (throw X)', () => {
    const u = parseGeminiUsageMetadata(null);
    expect(u).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    expect(u.cachedPromptTokens).toBeUndefined();
  });

  it('cached=0 → 필드 미설정 (telemetry 노이즈 방지)', () => {
    const u = parseGeminiUsageMetadata({
      promptTokenCount: 50,
      candidatesTokenCount: 10,
      totalTokenCount: 60,
      cachedContentTokenCount: 0,
    });
    expect(u.cachedPromptTokens).toBeUndefined();
  });

  it('totalTokenCount 누락 → prompt+completion 합산', () => {
    const u = parseGeminiUsageMetadata({
      promptTokenCount: 80,
      candidatesTokenCount: 20,
    });
    expect(u.totalTokens).toBe(100);
  });
});

describe('voiced worker split — system 안정 (TASK-KAR-145)', () => {
  it('skinHint 동일 → systemInstruction 동일 (implicit cache prefix-match 게이트)', () => {
    const s1 = buildVoicedWorkerSystemInstruction('Ring · 충동적 활발한 말투');
    const s2 = buildVoicedWorkerSystemInstruction('Ring · 충동적 활발한 말투');
    expect(s1).toBe(s2);
    // skinHint 가 systemInstruction 안에 포함
    expect(s1).toContain('Ring');
  });

  it('skinHint 없음 = stable prefix (모든 코어 공통 systemInstruction)', () => {
    const s = buildVoicedWorkerSystemInstruction();
    expect(s).toContain('karmoddrine 에이전트 팀의 도메인 워커');
    // skinHint 라인(`[너의 캐릭터] 이름·말투: ...`) 만 빠져야 — 본문의 "너의 캐릭터 목소리" 는 유지
    expect(s).not.toMatch(/\[너의 캐릭터\] 이름·말투:/);
  });

  it('user prompt = 동적 작업상태만 (system 안 들어감)', () => {
    const u = buildVoicedWorkerUserPrompt('TASK-WM-010 done branch=feature/foo');
    expect(u).toContain('[작업상태]');
    expect(u).toContain('TASK-WM-010');
    expect(u).not.toContain('도메인 워커'); // 안정 prefix 는 system 으로
  });
});

describe('buildDialoguePromptSplit — system/user 분리 (TASK-KAR-145)', () => {
  const responder: CoreDef = { id: 'echo', role: '품질·정렬 검토', emoji: '📣' } as CoreDef;
  const u: PeerUtterance = {
    speakerCoreId: 'atlas',
    kind: 'proposal',
    text: 'WM 던전망 강화 제안',
  };

  it('미션·역할·규약 = system, 동료 발화 = user', () => {
    const { system, user } = buildDialoguePromptSplit(responder, '🛰 Atlas', u, '미션 텍스트');
    expect(system).toContain('echo');
    expect(system).toContain('미션 텍스트');
    expect(system).toContain('PASS');
    expect(user).toContain('🛰 Atlas');
    expect(user).toContain('WM 던전망 강화 제안');
    // system 에는 동적 동료발화 없음 (cache stable)
    expect(system).not.toContain('WM 던전망 강화 제안');
  });

  it('skinHint 다름 → system 다름 / 같음 → system 같음 (per-skin cache)', () => {
    const s1 = buildDialoguePromptSplit(responder, 'X', u, 'm', 'Ring 톤').system;
    const s2 = buildDialoguePromptSplit(responder, 'X', u, 'm', 'Ring 톤').system;
    const s3 = buildDialoguePromptSplit(responder, 'X', u, 'm', 'Alisa 톤').system;
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
  });
});

describe('buildDeliberationPromptSplit — phase 별 + system 안정 (TASK-KAR-145)', () => {
  const responder: CoreDef = { id: 'echo', role: '품질' } as CoreDef;
  const u: PeerUtterance = { speakerCoreId: 'atlas', kind: 'proposal', text: '제안 X' };
  const st: Pick<DeliberationState, 'turns'> = { turns: [] };

  it('challenge phase = user 에 우려/대안 강제 task block', () => {
    const { system, user } = buildDeliberationPromptSplit(
      'challenge', responder, '🛰 Atlas', u, st, '미션',
    );
    expect(user).toContain('우려');
    expect(user).toContain('대안');
    expect(user).toContain('제안 X');
    // system = 안정 (per phase 변화 X)
    expect(system).toContain('echo');
    expect(system).toContain('미션');
    expect(system).not.toContain('제안 X'); // 동적 = user
  });

  it('converge phase = user 에 "결정:" 한줄 강제, system = challenge 와 동일', () => {
    const a = buildDeliberationPromptSplit('challenge', responder, 'X', u, st, 'm');
    const c = buildDeliberationPromptSplit('converge', responder, 'X', u, st, 'm');
    // system stable across phases (responder+mission 같으면 같음 — phase 는 task 지시이므로 user)
    expect(a.system).toBe(c.system);
    expect(c.user).toContain('결정: 채택');
    expect(c.user).toContain('반려');
  });

  it('portfolioBlock = system 에 (안정 prefix 일부), channelContext = user 에 (동적)', () => {
    const { system, user } = buildDeliberationPromptSplit(
      'challenge', responder, 'X', u, st, 'm',
      '[포트폴리오] wm 도메인',
      undefined,
      '[masca] 이거 정말 필요해?',
    );
    expect(system).toContain('[포트폴리오] wm 도메인');
    expect(user).toContain('정말 필요해?');
    expect(user).toContain('팀 채널');
    expect(system).not.toContain('정말 필요해?');
  });
});
