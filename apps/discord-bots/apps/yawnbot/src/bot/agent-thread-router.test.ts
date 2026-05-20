// agent-thread-router 순수 코어 전수검증 (Discord IO 무관). KAR-018-Y +
// KAR-018-THR (재기동 영속·이름검색·proposal 라우팅 확장).
import { describe, it, expect } from 'vitest';
import {
  extractTaskId,
  extractProposalId,
  extractRouteKey,
  chunkForDiscord,
} from './agent-thread-router';

describe('extractTaskId (순수)', () => {
  it('워커 메시지에서 TASK id 추출', () => {
    expect(
      extractTaskId('🤖 KlWorker ▶ TASK-KL-071 수행 — 브랜치 feature/...'),
    ).toBe('TASK-KL-071');
  });
  it('서브 접미(-A/-B/-X) 포함', () => {
    expect(extractTaskId('⚠ TASK-KAR-018-X error')).toBe('TASK-KAR-018-X');
    expect(extractTaskId('TASK-KL-055-B 점유')).toBe('TASK-KL-055-B');
  });
  it('첫 매치만 (그 틱 대상)', () => {
    expect(extractTaskId('TASK-WM-084 vs TASK-WM-116')).toBe('TASK-WM-084');
  });
  it('TASK 없으면 null (팀-공통=하트비트)', () => {
    expect(extractTaskId('🛰 팀 한 바퀴: 동료 echo 한마디')).toBeNull();
    expect(extractTaskId('')).toBeNull();
  });
});

describe('extractProposalId (THR — pXXX 라우팅 키)', () => {
  it('proposalId 헥사 매치 (8자+)', () => {
    expect(extractProposalId('p42c94051 채택 — 진행')).toBe('p42c94051');
    expect(extractProposalId('발굴 [p1234abcd5678] dispatch')).toBe(
      'p1234abcd5678',
    );
  });
  it('TASK·일반 텍스트 = null (서로 namespace 안 겹침)', () => {
    expect(extractProposalId('TASK-KL-071 작업')).toBeNull();
    expect(extractProposalId('팀 한 바퀴')).toBeNull();
    expect(extractProposalId('')).toBeNull();
  });
  it('p + <8 hex 또는 비hex = null (false-positive 차단)', () => {
    expect(extractProposalId('p1234567')).toBeNull(); // 7자
    expect(extractProposalId('pgggggggg')).toBeNull(); // 비hex
  });
});

describe('extractRouteKey (TASK > proposal > 팀공통)', () => {
  it('TASK 가 있으면 TASK 우선 (더 구체적)', () => {
    expect(extractRouteKey('TASK-KL-071 ref p42c94051')).toEqual({
      kind: 'task',
      id: 'TASK-KL-071',
    });
  });
  it('proposal 만 있으면 proposal', () => {
    expect(extractRouteKey('p42c94051 dispatched')).toEqual({
      kind: 'proposal',
      id: 'p42c94051',
    });
  });
  it('아무것도 없으면 null (팀-공통 fallback)', () => {
    expect(extractRouteKey('🛰 한 바퀴')).toBeNull();
  });
});

describe('chunkForDiscord (순수·결정적)', () => {
  it('한도 이하 = 1청크', () => {
    expect(chunkForDiscord('짧은 보고')).toEqual(['짧은 보고']);
  });
  it('빈/공백 = 빈 배열', () => {
    expect(chunkForDiscord('')).toEqual([]);
    expect(chunkForDiscord('   \n  ')).toEqual([]);
  });
  it('줄 경계 우선 분할, 각 ≤ max', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ` + 'x'.repeat(60));
    const chunks = chunkForDiscord(lines.join('\n'), 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    // 무손실: 모든 줄 보존
    for (let i = 0; i < 50; i++)
      expect(chunks.join('\n')).toContain(`line ${i} `);
  });
  it('한 줄이 max 초과 → 강제 슬라이스(무손실)', () => {
    const long = 'a'.repeat(5000);
    const chunks = chunkForDiscord(long, 1900);
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1900);
    expect(chunks.join('')).toBe(long);
  });
});
