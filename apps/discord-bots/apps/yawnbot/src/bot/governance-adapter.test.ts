/**
 * governance-adapter 행동 테스트 (KAR-018-D slice-2).
 * tracer-bullet: 전역 kill → deny / verdict→bool / trace jsonl append.
 * FS 격리 = os.tmpdir 임시 memoRoot (determinism).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildGovernanceReserve,
  isGloballyKilled,
  appendTrace,
  killFilePath,
} from './governance-adapter';

let root: string;
function env(): NodeJS.ProcessEnv {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('isGloballyKilled (parent ④ Kill Switch)', () => {
  it('kill 파일 없으면 false', () => {
    expect(isGloballyKilled(env())).toBe(false);
  });
  it('kill 파일 있으면 true', () => {
    fs.writeFileSync(killFilePath(env()), '');
    expect(isGloballyKilled(env())).toBe(true);
  });
  it('MEMO_REPO_PATH 없으면 false (안전)', () => {
    expect(isGloballyKilled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('appendTrace — discoveries jsonl 형식', () => {
  it('jsonl 한 줄 append', () => {
    appendTrace(env(), { ts: 't', type: 'budget', core: 'a', reason: 'ok' });
    appendTrace(env(), { ts: 't2', type: 'kill', core: 'b', reason: 'kill' });
    const lines = fs
      .readFileSync(path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'), 'utf-8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).core).toBe('a');
    expect(JSON.parse(lines[1]).type).toBe('kill');
  });
  it('MEMO_REPO_PATH 없으면 no-op (throw X)', () => {
    expect(() =>
      appendTrace({} as NodeJS.ProcessEnv, { ts: 't', type: 'budget', core: 'a', reason: 'x' }),
    ).not.toThrow();
  });
});

describe('buildGovernanceReserve — verdict→bool + trace', () => {
  it('전역 kill 활성 → deny(false) + kill trace', () => {
    fs.writeFileSync(killFilePath(env()), '');
    const reserve = buildGovernanceReserve(env());
    expect(reserve({ core: 'a', channelId: 'c' })).toBe(false);
    const t = fs.readFileSync(
      path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'),
      'utf-8',
    );
    expect(t).toContain('"type":"kill"');
  });

  it('정상(추정·risk 미상) → allow(true) + budget trace', () => {
    const reserve = buildGovernanceReserve(env());
    expect(reserve({ core: 'a', channelId: 'c' })).toBe(true);
    const t = fs.readFileSync(
      path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'),
      'utf-8',
    );
    expect(t).toContain('"verdict":"allow"');
  });
});
