/**
 * agent-dialogue 순수 결정 회귀 테스트 (KAR-018-Y-1, i3b 복원).
 *
 * tracer-bullet: 코어↔코어 1턴 결정이 *결정적·바운드* 임을 잠금 —
 * 도메인 주인 라우팅 / 피어 폴백 / 체인깊이 컷 / self 응답 금지 /
 * 억지발화(PASS) 차단. LLM 무관(날조 0) = 입력→출력 순수.
 */
import { describe, it, expect } from 'vitest';
import {
  decideDialogueTurn,
  buildDialoguePrompt,
  isDialoguePass,
  classifyDeliberationReply,
  parseVerdict,
  nextDeliberationStep,
  buildDeliberationPrompt,
  type PeerUtterance,
  type DeliberationState,
} from './agent-dialogue';
import type { CoreDef } from '../services/agent-core';

function core(
  id: string,
  opts: Partial<CoreDef> & { kind?: string; domain?: string } = {},
): CoreDef {
  const fm: Record<string, string> = {};
  if (opts.kind) fm.kind = opts.kind;
  if (opts.domain) fm.domain = opts.domain;
  return {
    id,
    role: opts.role ?? `${id} role`,
    status: opts.status ?? 'active',
    defaultSkin: opts.defaultSkin ?? 'alisa',
    emoji: opts.emoji ?? '🛰',
    displayName: opts.displayName ?? id,
    body: opts.body ?? `${id} body`,
    skills: opts.skills ?? [],
    frontmatter: { ...fm, ...(opts.frontmatter ?? {}) },
  };
}

const atlas = core('atlas');
const echo = core('echo');
const wmWorker = core('wm-worker', { kind: 'worker', domain: 'WM' });
const klWorker = core('kl-worker', { kind: 'worker', domain: 'KL' });
const ALL = [atlas, echo, wmWorker, klWorker];

const NO_CHAIN = { depth: 0, cap: 6 };

describe('decideDialogueTurn — 결정적 라우팅', () => {
  it('proposal 도메인 주인 워커가 인수 의사로 응답', () => {
    const u: PeerUtterance = {
      speakerCoreId: 'atlas',
      kind: 'proposal',
      domain: 'WM',
      text: 'WM 던전 회귀망 보강',
    };
    const t = decideDialogueTurn(u, ALL, NO_CHAIN);
    expect(t?.responderCoreId).toBe('wm-worker');
    expect(t?.reason).toContain('도메인 주인');
  });

  it('도메인 주인 없으면 비-워커 피어가 코멘트', () => {
    const u: PeerUtterance = {
      speakerCoreId: 'atlas',
      kind: 'proposal',
      domain: 'LIFE', // 주인 워커 없음
      text: 'LIFE 모듈 아이디어',
    };
    const t = decideDialogueTurn(u, ALL, NO_CHAIN);
    expect(t?.responderCoreId).toBe('echo'); // speaker(atlas) 아닌 첫 비-워커
    expect(t?.reason).toContain('피어');
  });

  it('self 응답 금지 — speaker 는 후보에서 제외', () => {
    const u: PeerUtterance = {
      speakerCoreId: 'echo',
      kind: 'proposal',
      domain: 'YB',
      text: 'yawnbot 개선',
    };
    const t = decideDialogueTurn(u, [atlas, echo], NO_CHAIN);
    expect(t?.responderCoreId).toBe('atlas');
    expect(t?.responderCoreId).not.toBe('echo');
  });

  it('worker-report 는 도메인 주인 skip(자기보고) → 피어만', () => {
    const u: PeerUtterance = {
      speakerCoreId: 'wm-worker',
      kind: 'worker-report',
      domain: 'WM',
      text: 'WM-119 자율 착수',
    };
    const t = decideDialogueTurn(u, ALL, NO_CHAIN);
    // 도메인 주인 = wm-worker 자신 → ② skip, ③ 피어(atlas)
    expect(t?.responderCoreId).toBe('atlas');
  });

  it('체인깊이 상한 도달 → null (폭주 차단, 이중 안전)', () => {
    const u: PeerUtterance = {
      speakerCoreId: 'atlas',
      kind: 'proposal',
      domain: 'WM',
      text: 'x',
    };
    expect(decideDialogueTurn(u, ALL, { depth: 6, cap: 6 })).toBeNull();
    expect(decideDialogueTurn(u, ALL, { depth: 7, cap: 6 })).toBeNull();
  });

  it('응답 후보 없음(코어 1개=speaker뿐) → null', () => {
    const u: PeerUtterance = {
      speakerCoreId: 'atlas',
      kind: 'proposal',
      text: 'x',
    };
    expect(decideDialogueTurn(u, [atlas], NO_CHAIN)).toBeNull();
  });

  it('비활성(draft) 워커는 도메인 주인 자격 X — 피어 폴백', () => {
    const draftWm = core('wm-worker', {
      kind: 'worker',
      domain: 'WM',
      status: 'draft',
    });
    const u: PeerUtterance = {
      speakerCoreId: 'atlas',
      kind: 'proposal',
      domain: 'WM',
      text: 'WM 작업',
    };
    const t = decideDialogueTurn(u, [atlas, echo, draftWm], NO_CHAIN);
    expect(t?.responderCoreId).toBe('echo'); // draft 워커 skip → 피어
  });
});

describe('buildDialoguePrompt — 순수·바운드', () => {
  it('동료 발화·미션·역할 인라인 + 비-agentic 명시 + PASS 규칙', () => {
    const p = buildDialoguePrompt(
      echo,
      '🛰 Atlas',
      { speakerCoreId: 'atlas', kind: 'proposal', text: '제안 X' },
      '미션 텍스트',
    );
    expect(p).toContain('echo');
    expect(p).toContain('🛰 Atlas');
    expect(p).toContain('제안 X');
    expect(p).toContain('미션 텍스트');
    expect(p).toContain('파일 읽기 시도 X');
    expect(p.toUpperCase()).toContain('PASS');
  });
});

describe('isDialoguePass — 억지 발화 차단', () => {
  it('빈값·PASS 변형 = true, 실 발화 = false', () => {
    expect(isDialoguePass('')).toBe(true);
    expect(isDialoguePass('  ')).toBe(true);
    expect(isDialoguePass('PASS')).toBe(true);
    expect(isDialoguePass('pass.')).toBe(true);
    expect(isDialoguePass('이건 WM 회귀망이랑 정렬돼요.')).toBe(false);
  });
});

// ═══ LT-3 다중턴 숙의 엔진 (순수·결정적) ═══
describe('classifyDeliberationReply — 실질성 분류 (D1 직격)', () => {
  it('빈값/PASS = empty', () => {
    expect(classifyDeliberationReply('')).toBe('empty');
    expect(classifyDeliberationReply('PASS')).toBe('empty');
  });
  it('깡통 동의(짧고 동의어뿐) = bare-agree', () => {
    expect(classifyDeliberationReply('좋아요')).toBe('bare-agree');
    expect(classifyDeliberationReply('동의합니다 👍')).toBe('bare-agree');
    expect(classifyDeliberationReply('네 좋은 생각')).toBe('bare-agree');
    expect(classifyDeliberationReply('LGTM')).toBe('bare-agree');
  });
  it('결정 마커 = converge', () => {
    expect(classifyDeliberationReply('결정: 채택 — 정렬됨')).toBe('converge');
    expect(classifyDeliberationReply('이건 반려해야 함')).toBe('converge');
  });
  it('구체 우려·대안 = substantive (깡통 아님)', () => {
    expect(
      classifyDeliberationReply('입력 검증이 빠지면 깨질 수 있어요. 가드 먼저.'),
    ).toBe('substantive');
  });
});

describe('parseVerdict — 결정적 결정 파싱', () => {
  it('채택/수정채택/반려/사용자판단', () => {
    expect(parseVerdict('결정: 채택')).toBe('adopt');
    expect(parseVerdict('결정: 수정 채택 — X 보완')).toBe('adopt-mods');
    expect(parseVerdict('결정: 반려 — 근거 부족')).toBe('reject');
    expect(parseVerdict('결정: 사용자 판단 필요 — 쟁점')).toBe('escalate');
    expect(parseVerdict('애매한 말')).toBe('escalate'); // 불명확=사람
  });
});

describe('nextDeliberationStep — 순수 상태머신', () => {
  const base: DeliberationState = {
    speakerCoreId: 'atlas',
    peerCoreId: 'echo',
    turns: [],
    cap: 4,
  };
  it('turns 0 → challenge(peer)', () => {
    const s = nextDeliberationStep(base);
    expect(s).toEqual({ kind: 'turn', phase: 'challenge', speakerCoreId: 'echo' });
  });
  it('substantive challenge → refine(speaker)', () => {
    const s = nextDeliberationStep({
      ...base,
      turns: [{ coreId: 'echo', phase: 'challenge', text: '우려: 검증 없으면 깨짐, 가드 먼저' }],
    });
    expect(s).toEqual({ kind: 'turn', phase: 'refine', speakerCoreId: 'atlas' });
  });
  it('bare-agree challenge → done adopt (무한 X)', () => {
    const s = nextDeliberationStep({
      ...base,
      turns: [{ coreId: 'echo', phase: 'challenge', text: '좋아요' }],
    });
    expect(s).toEqual({
      kind: 'done',
      verdict: 'adopt',
      reason: expect.stringContaining('이의 없음'),
    });
  });
  it('refine → converge(peer); converge → done(verdict)', () => {
    const afterRefine = nextDeliberationStep({
      ...base,
      turns: [
        { coreId: 'echo', phase: 'challenge', text: '우려: A 빠짐 — 대안 B' },
        { coreId: 'atlas', phase: 'refine', text: 'B 수용해 보강' },
      ],
    });
    expect(afterRefine).toEqual({ kind: 'turn', phase: 'converge', speakerCoreId: 'echo' });
    const done = nextDeliberationStep({
      ...base,
      turns: [
        { coreId: 'echo', phase: 'challenge', text: '우려: A' },
        { coreId: 'atlas', phase: 'refine', text: '보강' },
        { coreId: 'echo', phase: 'converge', text: '결정: 채택' },
      ],
    });
    expect(done).toEqual({ kind: 'done', verdict: 'adopt', reason: expect.any(String) });
  });
  it('cap 도달 → done escalate (입막음 아닌 사용자에게·바운드)', () => {
    const s = nextDeliberationStep({
      ...base,
      cap: 2,
      turns: [
        { coreId: 'echo', phase: 'challenge', text: '우려: A' },
        { coreId: 'atlas', phase: 'refine', text: '응답' },
      ],
    });
    expect(s).toEqual({
      kind: 'done',
      verdict: 'escalate',
      reason: expect.stringContaining('cap'),
    });
  });
});

describe('buildDeliberationPrompt — phase별 (맨 동의 금지 강제)', () => {
  const u: PeerUtterance = { speakerCoreId: 'atlas', kind: 'proposal', text: '제안 X' };
  const st = { turns: [] as DeliberationState['turns'] };
  it('challenge = 우려/대안/근거endorse 강제 + 맨동의 폐기 명시', () => {
    const p = buildDeliberationPrompt('challenge', echo, '🛰 Atlas', u, st, '미션');
    expect(p).toContain('제안 X');
    expect(p).toContain('우려');
    expect(p).toContain('대안');
    expect(p).toMatch(/맨 동의|그냥 "좋다/);
  });
  it('converge = 한 줄 결정 형식 강제', () => {
    const p = buildDeliberationPrompt('converge', echo, '🛰 Atlas', u, st, '미션');
    expect(p).toContain('결정: 채택');
    expect(p).toContain('반려');
  });
  it('portfolioBlock 주입 시 포함', () => {
    const p = buildDeliberationPrompt('challenge', echo, 'A', u, st, 'm', '[포트폴리오] wm');
    expect(p).toContain('[포트폴리오] wm');
  });

  it('SO-2-A: channelContextText 주입 시 #team-bus 직전 발언 블록 inline', () => {
    const p = buildDeliberationPrompt(
      'challenge', echo, 'A', u, st, 'm', '', undefined,
      '[masca] 이거 정말 필요해?',
    );
    expect(p).toContain('팀 채널(#team-bus) 직전 발언');
    expect(p).toContain('정말 필요해?');
  });

  it('SO-2-A: channelContextText 빈 = 블록 미포함', () => {
    const p = buildDeliberationPrompt('challenge', echo, 'A', u, st, 'm', '', undefined, '');
    expect(p).not.toContain('팀 채널(#team-bus) 직전 발언');
  });
});
