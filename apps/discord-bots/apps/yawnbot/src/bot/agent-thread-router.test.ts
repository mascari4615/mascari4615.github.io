// agent-thread-router 순수 코어 전수검증 (Discord IO 무관). KAR-018-Y.
import { describe, it, expect } from 'vitest';
import {
  extractTaskId,
  chunkForDiscord,
  threadIdFromLink,
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
  it('흡수 A: 제안 id(p+8hex)도 스레드 키 (메인채널 누수 fix)', () => {
    expect(extractTaskId('제안 p42c94051 검토 부탁')).toBe('p42c94051');
    expect(extractTaskId('새 카드 (id `p0a1b2c3d`)')).toBe('p0a1b2c3d');
  });
  it('TASK 가 제안 id 보다 우선 (같이 있으면 TASK)', () => {
    expect(extractTaskId('TASK-KAR-018-THR (p42c94051)')).toBe(
      'TASK-KAR-018-THR',
    );
  });
  it('p+8hex 아닌 토큰은 키 아님 (오검출 0)', () => {
    expect(extractTaskId('port 8080 응답')).toBeNull();
    expect(extractTaskId('pull request #123')).toBeNull();
    expect(extractTaskId('p123')).toBeNull(); // 8 미만
  });
});

describe('threadIdFromLink (순수)', () => {
  it('숫자 id 원문', () => {
    expect(threadIdFromLink('1380999900000000000')).toBe(
      '1380999900000000000',
    );
  });
  it('디스코드 url 끝 숫자 id 추출', () => {
    expect(
      threadIdFromLink('https://discord.com/channels/111/222/1380999900'),
    ).toBe('1380999900');
  });
  it('빈/형식미상 = null (스테일 무시)', () => {
    expect(threadIdFromLink('')).toBeNull();
    expect(threadIdFromLink(null)).toBeNull();
    expect(threadIdFromLink('not-an-id')).toBeNull();
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
