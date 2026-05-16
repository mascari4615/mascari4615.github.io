/**
 * runGovernedProducerOnce 게이트 회귀 테스트 (KAR-018-W 안전 근본).
 *
 * tracer-bullet: idle→발굴 경로가 objective 경로와 동형으로 *예산 통제* 됨을
 * 잠금. kill·reserve deny 시 발굴 LLM 호출 자체가 일어나지 않아야 한다
 * (parent ④/Freysa — 자율 spawn 폭주 차단). FS 격리 = tmpdir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runGovernedProducerOnce,
  armKill,
  disarmKill,
} from './agent-cadence';

const envJson = JSON.stringify({
  kind: 'env',
  payload: { id: 'P1', summary: 's', targetFiles: ['a'], source: 'self-task' },
});

let root: string;
function env() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}
function tracePath() {
  return path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gprod-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => {
  disarmKill();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runGovernedProducerOnce — 게이트 분기', () => {
  it('kill → killed, 발굴 호출 X', async () => {
    armKill();
    let called = false;
    const r = await runGovernedProducerOnce(env(), {
      discover: async () => {
        called = true;
        return envJson;
      },
      reserve: () => true,
    });
    expect(r).toBe('killed');
    expect(called).toBe(false);
  });

  it('reserve deny → producer-gated, 발굴 호출 X + trace', async () => {
    let called = false;
    const r = await runGovernedProducerOnce(env(), {
      discover: async () => {
        called = true;
        return envJson;
      },
      reserve: () => false,
    });
    expect(r).toBe('producer-gated');
    expect(called).toBe(false);
    const t = fs.readFileSync(tracePath(), 'utf-8');
    expect(t).toContain('producer');
    expect(t).toContain('reserve deny');
  });

  it('reserve allow → 발굴 호출 + 인박스 라우팅', async () => {
    let called = false;
    const r = await runGovernedProducerOnce(env(), {
      discover: async () => {
        called = true;
        return envJson;
      },
      reserve: () => true,
    });
    expect(called).toBe(true);
    expect(r).toBe('self-improve'); // env kind → self-improve, inboxDispatch
    const inbox = fs
      .readFileSync(path.join(root, '.claude', 'proposals.jsonl'), 'utf-8')
      .trim();
    expect(JSON.parse(inbox).envelope.payload.id).toBe('P1');
  });

  it('reserve 기본값 = team-room reserveBudget (미주입 시 주입훅 경유)', async () => {
    // 주입 안 함 → 모듈 default reserveBudget. 기본 budgetReserve=()=>true
    // 라 발굴 시도 (discover 만 stub — 실 claude 비호출).
    let called = false;
    const r = await runGovernedProducerOnce(env(), {
      discover: async () => {
        called = true;
        return envJson;
      },
    });
    expect(called).toBe(true);
    expect(r).toBe('self-improve');
  });
});
