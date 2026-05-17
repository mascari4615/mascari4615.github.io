/**
 * self-skill-adapter 행동 테스트 (KAR-018-F slice-2).
 * tracer-bullet: 시나리오 DI → archive(3 verdict) → accept roster / escalate
 * pending(sub-D 재사용) / reject 폐기. FS 격리 tmpdir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runSelfSkill, type SelfSkillDeps } from './self-skill-adapter';
import type { SkillProposal, SkillEvalResults } from './self-skill';
import { archivePath } from './self-improve-adapter';
import { approvalsPath } from './governance-adapter';

const meta: SkillProposal = {
  id: 'SK-1',
  name: 'diagnose-ladder',
  summary: 's',
  source: 'self-task',
  coreId: 'atlas',
};
const PASS: SkillEvalResults = {
  scenarios: [{ name: 's1', passed: true }],
  touchesPersonaCore: false,
};

let root: string;
let notes: string[];
function deps(over: Partial<SelfSkillDeps> = {}): SelfSkillDeps {
  return {
    env: { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv,
    runScenarios: async () => PASS,
    notify: (m) => notes.push(m),
    ...over,
  };
}
function envObj() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  notes = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('runSelfSkill — accept', () => {
  it('전 PASS → accept + archive(self) + roster 적용 + notify', async () => {
    const applyRosterSkill = vi.fn().mockResolvedValue(undefined);
    const out = await runSelfSkill(meta, deps({ applyRosterSkill }));
    expect(out.verdict.kind).toBe('accept');
    expect(out.rosterApplied).toBe(true);
    expect(applyRosterSkill).toHaveBeenCalledOnce();
    const line = fs.readFileSync(archivePath(envObj()), 'utf-8').trim();
    expect(JSON.parse(line).track).toBe('self');
    expect(JSON.parse(line).verdict).toBe('accept');
  });

  it('applyRosterSkill 미배선 → accept 기록되되 rosterApplied=false', async () => {
    const out = await runSelfSkill(meta, deps());
    expect(out.verdict.kind).toBe('accept');
    expect(out.rosterApplied).toBe(false);
  });
});

describe('runSelfSkill — escalate (persona-core, sub-D 재사용)', () => {
  it('persona-core 수정 → escalate + approvals.jsonl pending, roster X', async () => {
    const applyRosterSkill = vi.fn();
    const d = deps({
      runScenarios: async () => ({ ...PASS, touchesPersonaCore: true }),
      applyRosterSkill,
    });
    const out = await runSelfSkill(meta, d);
    expect(out.verdict.kind).toBe('escalate');
    expect(applyRosterSkill).not.toHaveBeenCalled();
    const ap = fs.readFileSync(approvalsPath(envObj()), 'utf-8');
    expect(ap).toContain('"status":"pending"');
    expect(ap).toContain('SK-1');
  });

  it('재호출 시 pending 중복 X', async () => {
    const d = deps({ runScenarios: async () => ({ ...PASS, touchesPersonaCore: true }) });
    await runSelfSkill(meta, d);
    await runSelfSkill(meta, d);
    const lines = fs
      .readFileSync(approvalsPath(envObj()), 'utf-8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1);
  });
});

describe('runSelfSkill — reject (DGM)', () => {
  it('시나리오 fail → reject + archive(reject), roster X', async () => {
    const applyRosterSkill = vi.fn();
    const out = await runSelfSkill(
      meta,
      deps({
        runScenarios: async () => ({ scenarios: [{ name: 's', passed: false }], touchesPersonaCore: false }),
        applyRosterSkill,
      }),
    );
    expect(out.verdict.kind).toBe('reject');
    expect(applyRosterSkill).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(archivePath(envObj()), 'utf-8').trim()).verdict).toBe('reject');
  });
});
