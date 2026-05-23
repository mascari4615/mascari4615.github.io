/**
 * surgery dedupe 회귀 — 같은 critical 조합으로 24h 내 seed 박은 이력 있으면
 * runSelfSurgeryOnce 가 LLM 호출 *전* skip + `surgery:dedupe:<key>` 반환.
 *
 * 발단: KAR-130/132/138-144 — 같은 worker-fail-critical 진단을 매 cycle 새
 * TASK 로 박아 8+ 중복. trace 기반 fingerprint dedupe.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runSelfSurgeryOnce, recentSurgeryDedupeHit } from './agent-cadence-ops';

let root: string;
function env() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}
function writePf() {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'team-portfolio.json'),
    JSON.stringify({
      projects: [
        {
          id: 'wm',
          title: 'WM',
          northStar: '팬100',
          weight: 100,
          status: 'active',
          currentObjective: { text: '허브 만들기', openedTs: '2026-05-01T00:00:00Z' },
          progressLog: [],
        },
      ],
    }),
    'utf-8',
  );
}
function writeTrace(entries: Array<{ ts: string; core: string; reason: string }>) {
  const dir = path.join(root, '.claude', 'discoveries');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'agent-trace.jsonl'),
    entries.map((e) => JSON.stringify({ type: 'budget', ...e })).join('\n') + '\n',
    'utf-8',
  );
}
// diagnoseHealth 가 critical 2개 (progress-stale + worker-fail-critical) 반환하게 만드는 HealthSignals shape.
const criticalSignals = {
  traceStalenessHrs: 0,
  progressStale: true,
  workerFailRatio: 1.0,
  traceErrorCount: 0,
  brokenLoopTaskCount: 0,
} as never;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'srgdd-'));
  writePf();
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('recentSurgeryDedupeHit — trace 기반 fingerprint', () => {
  it('trace 부재 → hit=false (graceful)', () => {
    const r = recentSurgeryDedupeHit(env(), 'worker-fail-critical', 24 * 3600_000);
    expect(r.hit).toBe(false);
    expect(r.count).toBe(0);
  });

  it('24h 내 같은 codes seed trace 있음 → hit=true + count', () => {
    const now = Date.now();
    writeTrace([
      { ts: new Date(now - 3 * 3600_000).toISOString(), core: 'surgery', reason: 'surgery seed: foo (progress-stale,worker-fail-critical)' },
      { ts: new Date(now - 1 * 3600_000).toISOString(), core: 'surgery', reason: 'surgery seed: bar (progress-stale,worker-fail-critical)' },
    ]);
    const key = ['progress-stale', 'worker-fail-critical'].sort().join(',');
    const r = recentSurgeryDedupeHit(env(), key, 24 * 3600_000);
    expect(r.hit).toBe(true);
    expect(r.count).toBe(2);
  });

  it('window 밖 trace → hit=false', () => {
    const now = Date.now();
    writeTrace([
      { ts: new Date(now - 48 * 3600_000).toISOString(), core: 'surgery', reason: 'surgery seed: stale (worker-fail-critical)' },
    ]);
    const r = recentSurgeryDedupeHit(env(), 'worker-fail-critical', 24 * 3600_000);
    expect(r.hit).toBe(false);
  });

  it('다른 codes → hit=false (fingerprint mismatch)', () => {
    const now = Date.now();
    writeTrace([
      { ts: new Date(now - 1 * 3600_000).toISOString(), core: 'surgery', reason: 'surgery seed: x (trace-errors)' },
    ]);
    const r = recentSurgeryDedupeHit(env(), 'worker-fail-critical', 24 * 3600_000);
    expect(r.hit).toBe(false);
  });
});

describe('runSelfSurgeryOnce — dedupe 게이트', () => {
  it('24h 내 같은 critical key trace 있음 → LLM 미호출 + surgery:dedupe 반환', async () => {
    const now = Date.now();
    const key = ['progress-stale', 'worker-fail-critical'].sort().join(',');
    writeTrace([
      { ts: new Date(now - 2 * 3600_000).toISOString(), core: 'surgery', reason: `surgery seed: 워커 진단 (${key})` },
    ]);
    let generateCalled = 0;
    let notifyCalled = 0;
    const r = await runSelfSurgeryOnce(env(), {
      healthSignals: criticalSignals,
      generate: async () => { generateCalled++; return 'seed: x\nbody'; },
      notify: () => { notifyCalled++; },
      missionText: '미션',
    });
    expect(r).toBe(`surgery:dedupe:${key}`);
    expect(generateCalled).toBe(0); // LLM 호출 X
    expect(notifyCalled).toBe(0);    // #team-bus 침묵 (skip = silent)
    // trace 에 dedupe 라인 누적 확인
    const trace = fs.readFileSync(path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'), 'utf-8');
    expect(trace).toMatch(/surgery dedupe:/);
  });

  it('force=true → dedupe 우회 (수동 트리거)', async () => {
    const now = Date.now();
    const key = ['progress-stale', 'worker-fail-critical'].sort().join(',');
    writeTrace([
      { ts: new Date(now - 1 * 3600_000).toISOString(), core: 'surgery', reason: `surgery seed: dup (${key})` },
    ]);
    let generateCalled = 0;
    const r = await runSelfSurgeryOnce(env(), {
      force: true,
      healthSignals: criticalSignals,
      generate: async () => { generateCalled++; return '유지: 사유'; },
      notify: () => {},
      writeTask: () => null,
      missionText: '미션',
    });
    // force = dedupe 우회 → generate 호출됨
    expect(generateCalled).toBe(1);
    expect(r.startsWith('surgery:dedupe:')).toBe(false);
  });
});
