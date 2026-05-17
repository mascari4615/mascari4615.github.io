/**
 * ⑦' 발굴 비-agentic 하드-보장 회귀 테스트 (KAR-018-W 안전 근본).
 *
 * 황금의 정신: agentic 재발 = 자율 루프가 임의 파일/명령 쓰기 = parent ④
 * 위반. buildDiscoveryArgs 가 *결정적으로* 비-agentic 인자만 낸다는 계약을
 * 잠금. 이 테스트가 깨지면 = 누군가 발굴에 쓰기/세션/권한스킵을 다시 열었음.
 */
import { describe, it, expect } from 'vitest';
import { buildDiscoveryArgs } from 'karmolab-ai/node';

describe('buildDiscoveryArgs — 비-agentic 하드 보장', () => {
  const args = buildDiscoveryArgs();
  const joined = args.join(' ');

  it('단발 비대화 (--print)', () => {
    expect(args).toContain('--print');
  });

  it('--bare 절대 X (2026-05-17 실측: --bare → OAuth 미독 → EXIT1 "Not logged in"; CLAUDE.md 오염은 빈 임시 cwd 로 차단)', () => {
    expect(args).not.toContain('--bare');
  });

  it('--strict-mcp-config (+ --mcp-config 미부여 → MCP 서버 spawn 0)', () => {
    expect(args).toContain('--strict-mcp-config');
  });

  it('--no-session-persistence (ephemeral, 공유 세션 경합 0)', () => {
    expect(args).toContain('--no-session-persistence');
  });

  it('--disallowedTools 로 쓰기·실행 도구 명시 거부', () => {
    const i = args.indexOf('--disallowedTools');
    expect(i).toBeGreaterThanOrEqual(0);
    const denied = args[i + 1] ?? '';
    for (const t of ['Bash', 'Edit', 'Write', 'Read', 'Task']) {
      expect(denied).toContain(t);
    }
  });

  it('권한 스킵 절대 X (cwd 경로 자체 부재)', () => {
    expect(joined).not.toContain('--dangerously-skip-permissions');
    expect(joined).not.toContain('--allow-dangerously-skip-permissions');
    expect(joined).not.toContain('bypassPermissions');
    expect(args).not.toContain('--add-dir');
  });

  it('세션 재개·이름 고정 X (무상태 단발 — 공유 세션 비오염)', () => {
    for (const flag of [
      '--continue',
      '-c',
      '--resume',
      '-r',
      '--name',
      '-n',
      '--fork-session',
    ]) {
      expect(args).not.toContain(flag);
    }
  });
});
