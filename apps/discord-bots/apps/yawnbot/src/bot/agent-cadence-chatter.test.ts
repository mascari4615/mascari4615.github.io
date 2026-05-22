/**
 * KAR-018-SO-2: idle chatter 진척 0 자가차단 회귀.
 *
 * 사용자 raw dump (2026-05-22): 「KlWorker 가 점심 메뉴 등 잡담 박음. 실작업 0」
 *   → 「뭐 되는게 전혀 없어」 인상의 주범.
 * fix = chatter 발화 전 직전 N시간 *실 진척* (pushed worker + core-promoted)
 * 카운트 → 0 이면 chatter 전체 skip + trace.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runIdleChatterOnce,
  resetChatterCooldown,
  recentRealProgressCount,
} from './agent-cadence-ops';
import { disarmKill } from './agent-cadence-state';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  disarmKill();
  resetChatterCooldown();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'so2-'));
  fs.mkdirSync(path.join(root, '.claude', 'discoveries'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('recentRealProgressCount (순수)', () => {
  it('agent-trace 의 "worker TASK-X done agentic" 만 카운트 (done-no-artifact/escalated 제외)', () => {
    const tracePath = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
    const now = Date.now();
    const recentTs = new Date(now - 30 * 60 * 1000).toISOString();
    const lines = [
      { ts: recentTs, type: 'budget', core: 'wm-worker',
        reason: 'worker TASK-WM-1 done agentic feature/x' },
      { ts: recentTs, type: 'budget', core: 'wm-worker',
        reason: 'worker TASK-WM-2 done-no-artifact agentic feature/y' },
      { ts: recentTs, type: 'budget', core: 'wm-worker',
        reason: 'worker TASK-WM-3 escalated agentic feature/z' },
      { ts: recentTs, type: 'budget', core: 'kl-worker',
        reason: 'worker TASK-KL-99 done agentic feature/k' },
    ];
    fs.writeFileSync(tracePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    expect(recentRealProgressCount(root, 6)).toBe(2);
  });

  it('windowHours 밖 entry 제외', () => {
    const tracePath = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
    const oldTs = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(tracePath,
      JSON.stringify({ ts: oldTs, reason: 'worker TASK-WM-1 done agentic b' }) + '\n');
    expect(recentRealProgressCount(root, 6)).toBe(0);
  });

  it('evolution-events 의 core-promoted/reverted 도 진척으로 합산', () => {
    const evoPath = path.join(root, '.claude', 'evolution-events.jsonl');
    const recentTs = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const events = [
      { ts: recentTs, code: 'core-promoted', subject: 'wm-support' },
      { ts: recentTs, code: 'core-reverted', subject: 'kl-worker' },
      { ts: recentTs, code: 'worker-failed', subject: 'x' },  // 진척 아님
    ];
    fs.writeFileSync(evoPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    expect(recentRealProgressCount(root, 6)).toBe(2);
  });

  it('부재·빈 root = 0 (graceful)', () => {
    expect(recentRealProgressCount(root, 6)).toBe(0);
    expect(recentRealProgressCount('', 6)).toBe(0);
  });
});

describe('runIdleChatterOnce — SO-2 진척 0 자가차단', () => {
  it('진척 0 → chatter 전체 skip + trace, speak 호출 0', async () => {
    let speakCalls = 0;
    const r = await runIdleChatterOnce(env(), {
      speak: async () => { speakCalls += 1; return true; },
      generate: async () => 'hi',
      progressCounter: () => 0,  // 진척 0 강제
      progressWindowHours: 6,
    });
    expect(r).toMatch(/^chatter-skip:no-progress-/);
    expect(speakCalls).toBe(0);
    // trace 적재 확인
    const tracePath = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
    expect(fs.existsSync(tracePath)).toBe(true);
    const last = fs.readFileSync(tracePath, 'utf-8').trim().split(/\r?\n/).pop()!;
    const e = JSON.parse(last);
    expect(e.core).toBe('chatter');
    expect(e.reason).toContain('SO-2 chatter skip');
  });

  it('진척 >= 1 → 가드 통과 (chatter 정상 흐름, core 없으면 chatter-none)', async () => {
    const r = await runIdleChatterOnce(env(), {
      speak: async () => true,
      generate: async () => 'hi',
      progressCounter: () => 5,  // 진척 5건
      progressWindowHours: 6,
    });
    // active core 없음 → chatter-none (skip 가드는 통과)
    expect(r).toBe('chatter-none');
  });

  it('progressWindowHours=0 → 가드 무효 (legacy 동작 fallback)', async () => {
    const r = await runIdleChatterOnce(env(), {
      speak: async () => true,
      generate: async () => 'hi',
      progressCounter: () => 0,  // 진척 0 이지만
      progressWindowHours: 0,    // 가드 무효
    });
    // 가드 skip 안 함 → 정상 흐름 (core 없음 → chatter-none)
    expect(r).toBe('chatter-none');
  });
});
