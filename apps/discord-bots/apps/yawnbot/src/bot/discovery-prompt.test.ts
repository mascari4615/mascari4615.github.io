/**
 * 발굴 프롬프트 자족성 회귀 (KAR-018-W, 2026-05-17 hang 근본 fix).
 *
 * 버그: 옛 프롬프트가 "agent-mission.md 자가검사"(파일 읽기)를 시켜 →
 * 비-agentic claude(도구 거부)가 못 읽는 파일에 무한 deliberation →
 * 풀 타임아웃 hang. fix = 미션 텍스트를 어댑터가 fs 로 읽어 *인라인*.
 * 이 테스트가 깨지면 = 누군가 프롬프트에 파일읽기 지시를 되살렸음.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildDiscoveryPrompt, readMissionText } from './agent-cadence';

describe('buildDiscoveryPrompt — 자족(파일 비의존)', () => {
  const p = buildDiscoveryPrompt('§1 TEST_MISSION_MARKER 공통목표');

  it('전달된 미션 텍스트를 인라인 임베드', () => {
    expect(p).toContain('TEST_MISSION_MARKER');
  });

  it('"파일 읽기 시도 X" 를 명시 (도구 거부 루프 방지)', () => {
    expect(p).toContain('도구·파일');
    expect(p).toMatch(/파일을 읽으려 시도하지 마라/);
  });

  it('옛 버그 지시("agent-mission.md ... 자가검사" 파일읽기) 부재', () => {
    expect(p).not.toContain('agent-mission.md §1');
    expect(p).not.toMatch(/agent-mission\.md.*자가검사/);
  });

  it('판별 union 5 kind + 빈출력=폐기 계약 유지', () => {
    for (const k of ['env', 'skill', 'agent', 'task', 'objective']) {
      expect(p).toContain(k);
    }
    expect(p).toContain('확신 없으면');
  });
});

describe('readMissionText — 어댑터 fs read + fallback', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-'));
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('MEMO_REPO_PATH 미설정 → fallback (hang 대신 degraded)', () => {
    expect(readMissionText({} as NodeJS.ProcessEnv)).toContain('§1 공통목표');
  });

  it('파일 부재 → fallback', () => {
    const t = readMissionText({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv);
    expect(t).toContain('§3 비목표');
  });

  it('파일 존재 → 그 본문 반환', () => {
    fs.writeFileSync(
      path.join(root, '.claude', 'agent-mission.md'),
      'REAL_MISSION_BODY §1',
    );
    expect(
      readMissionText({ MEMO_REPO_PATH: root } as NodeJS.ProcessEnv),
    ).toBe('REAL_MISSION_BODY §1');
  });
});
