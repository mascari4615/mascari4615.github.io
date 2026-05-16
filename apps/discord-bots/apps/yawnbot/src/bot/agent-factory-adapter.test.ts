/**
 * agent-factory-adapter 행동 테스트 (KAR-018-E slice-2).
 * tracer-bullet: context+dry-run DI → archive(factory) → escalate(sub-D 재사용,
 * 중복억제) / reject 폐기. 자동 활성화 0. FS 격리 tmpdir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runAgentFactory, type AgentFactoryDeps } from './agent-factory-adapter';
import type { AgentSpec } from './agent-factory';
import { archivePath } from './self-improve-adapter';
import { approvalsPath } from './governance-adapter';

const spec: AgentSpec = {
  id: 'AG-1',
  coreId: 'nova',
  role: 'research',
  name: 'Nova',
  source: 'self-task',
};

let root: string;
let notes: string[];
function deps(over: Partial<AgentFactoryDeps> = {}): AgentFactoryDeps {
  return {
    env: { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv,
    loadContext: async () => ({ existingCoreIds: ['atlas'], occupiedSlots: ['A'] }),
    dryRun: async () => true,
    notify: (m) => notes.push(m),
    ...over,
  };
}
function envObj() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  notes = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('runAgentFactory — escalate (parent ⑤, 자동 활성화 X)', () => {
  it('전 PASS → escalate + archive(factory) + approvals pending', async () => {
    const out = await runAgentFactory(spec, deps());
    expect(out.verdict.kind).toBe('escalate');
    expect(JSON.parse(fs.readFileSync(archivePath(envObj()), 'utf-8').trim()).track).toBe('factory');
    expect(fs.readFileSync(approvalsPath(envObj()), 'utf-8')).toContain('"status":"pending"');
  });

  it('재호출 시 pending 중복 X', async () => {
    await runAgentFactory(spec, deps());
    await runAgentFactory(spec, deps());
    const lines = fs
      .readFileSync(approvalsPath(envObj()), 'utf-8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1);
  });
});

describe('runAgentFactory — reject (DGM)', () => {
  it('coreId 충돌 → reject + archive(reject), pending X', async () => {
    const out = await runAgentFactory(
      { ...spec, coreId: 'atlas' },
      deps(),
    );
    expect(out.verdict.kind).toBe('reject');
    expect(fs.existsSync(approvalsPath(envObj()))).toBe(false);
    expect(JSON.parse(fs.readFileSync(archivePath(envObj()), 'utf-8').trim()).verdict).toBe('reject');
  });

  it('dry-run 실패 → reject', async () => {
    const out = await runAgentFactory(spec, deps({ dryRun: async () => false }));
    expect(out.verdict.kind).toBe('reject');
  });
});
