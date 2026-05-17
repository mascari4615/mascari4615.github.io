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
  type PeerUtterance,
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
