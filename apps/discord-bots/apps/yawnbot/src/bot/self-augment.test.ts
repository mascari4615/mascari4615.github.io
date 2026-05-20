/**
 * self-augment 자가증강 닫는 루프 회귀 (TASK-KAR-018-LT-11).
 *
 * 순수 결정부(승격 게이트 분기 / status flip 멱등 / trace 적합도 집계 /
 * 퇴행 판정) + 러너 통합(DI stub). FS 격리 tmpdir, Discord·실 tick 0.
 * 계약 불변식: 구조검증+비충돌만 자율 / 보호코어 제외 / 관측부족=유지
 * (성급 revert X) / 퇴행=자동 draft 원복 / 멱등.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  evaluateCorePromotion,
  setCoreStatus,
  readCoreOutcomes,
  detectCorePromotionRegression,
  runCorePromotionOnce,
  runCorePromotionRevertOnce,
  enqueuePromotionCandidate,
  readPromotionState,
} from './self-augment';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

function writeCore(id: string, fm: Record<string, string>) {
  const dir = path.join(root, '.claude', 'agents', id);
  fs.mkdirSync(dir, { recursive: true });
  const front = Object.entries({ id, ...fm })
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  fs.writeFileSync(
    path.join(dir, 'core.md'),
    `---\n${front}\n---\n${id} 직무 본문.`,
    'utf-8',
  );
}
function traceLine(core: string, ts: string, status: string) {
  const p = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(
    p,
    JSON.stringify({
      ts,
      type: 'budget',
      core,
      reason: `worker TASK-X-001 ${status} agentic feature/x`,
    }) + '\n',
    'utf-8',
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'saug-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('evaluateCorePromotion — 구조검증+비충돌 (순수)', () => {
  it('정상 draft 워커 → ok', () => {
    writeCore('wm-disc', {
      role: 'wm 발굴', status: 'draft', display_name: 'WM디스크',
      kind: 'worker', domain: 'WM',
    });
    expect(evaluateCorePromotion(root, 'wm-disc').ok).toBe(true);
  });

  it('보호 코어(atlas) → 거부 (정체성=사람 영역)', () => {
    writeCore('atlas', { role: 'infra', status: 'draft', display_name: 'A' });
    const d = evaluateCorePromotion(root, 'atlas');
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('보호');
  });

  it('status≠draft → 대상 X', () => {
    writeCore('x', { role: 'r', status: 'active', display_name: 'X' });
    expect(evaluateCorePromotion(root, 'x').ok).toBe(false);
  });

  it('같은 domain active 워커 존재 → 충돌 거부', () => {
    writeCore('wm-old', {
      role: 'r', status: 'active', display_name: 'O', kind: 'worker', domain: 'WM',
    });
    writeCore('wm-new', {
      role: 'r', status: 'draft', display_name: 'N', kind: 'worker', domain: 'WM',
    });
    const d = evaluateCorePromotion(root, 'wm-new');
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('충돌');
  });

  it('필수필드 누락 → 거부', () => {
    writeCore('y', { role: '', status: 'draft', display_name: '' });
    expect(evaluateCorePromotion(root, 'y').ok).toBe(false);
  });
});

describe('setCoreStatus — frontmatter flip (멱등·본문 무오염)', () => {
  it('draft→active flip + 본문 보존', () => {
    writeCore('c', { role: 'r', status: 'draft', display_name: 'C' });
    expect(setCoreStatus(root, 'c', 'active')).toBe(true);
    const raw = fs.readFileSync(
      path.join(root, '.claude', 'agents', 'c', 'core.md'), 'utf-8',
    );
    expect(raw).toContain('status: active');
    expect(raw).not.toContain('status: draft');
    expect(raw).toContain('c 직무 본문.');
  });

  it('부적합 coreId → false (안전)', () => {
    expect(setCoreStatus(root, '../evil', 'active')).toBe(false);
  });
});

describe('readCoreOutcomes + detectCorePromotionRegression (순수)', () => {
  it('trace done/fail 집계 (sinceTs 이전 무시)', () => {
    traceLine('w', '2026-05-19T00:00:00Z', 'done'); // before
    traceLine('w', '2026-05-19T02:00:00Z', 'done');
    traceLine('w', '2026-05-19T02:01:00Z', 'error');
    traceLine('w', '2026-05-19T02:02:00Z', 'done-no-artifact');
    traceLine('other', '2026-05-19T02:02:00Z', 'done'); // 다른 코어
    const o = readCoreOutcomes(env(), 'w', '2026-05-19T01:00:00Z');
    expect(o).toEqual({ done: 1, fail: 2, total: 3 });
  });

  it('관측 부족 → 미퇴행(유지, 성급 revert X)', () => {
    expect(
      detectCorePromotionRegression({ done: 0, fail: 1, total: 1 }).regressed,
    ).toBe(false);
  });

  it('관측 충분 + done 비율 미달 → 퇴행', () => {
    const r = detectCorePromotionRegression({ done: 0, fail: 4, total: 4 });
    expect(r.regressed).toBe(true);
    expect(r.reason).toContain('퇴행');
  });

  it('관측 충분 + done 정상 → 미퇴행', () => {
    expect(
      detectCorePromotionRegression({ done: 3, fail: 1, total: 4 }).regressed,
    ).toBe(false);
  });
});

describe('runCorePromotionOnce / RevertOnce — 통합 (DI)', () => {
  it('후보 → PASS → 자율 active flip + 원장 + notify, 멱등', () => {
    writeCore('wm-new', {
      role: 'r', status: 'draft', display_name: 'N', kind: 'worker', domain: 'WM',
    });
    enqueuePromotionCandidate(env(), 'wm-new');
    const msgs: string[] = [];
    const pro = runCorePromotionOnce(env(), { notify: (m) => msgs.push(m) });
    expect(pro).toEqual(['wm-new']);
    const raw = fs.readFileSync(
      path.join(root, '.claude', 'agents', 'wm-new', 'core.md'), 'utf-8',
    );
    expect(raw).toContain('status: active');
    expect(msgs.some((m) => m.includes('자가증강'))).toBe(true);
    expect(readPromotionState(env()).get('wm-new')?.action).toBe('promoted');
    // 멱등: 재실행 = 재승격 X
    expect(runCorePromotionOnce(env())).toEqual([]);
  });

  it('퇴행 후보 → 자율 active→draft revert + 원장', () => {
    writeCore('bad', {
      role: 'r', status: 'draft', display_name: 'B', kind: 'worker', domain: 'KL',
    });
    enqueuePromotionCandidate(env(), 'bad');
    runCorePromotionOnce(env());
    const promoTs = readPromotionState(env()).get('bad')!.ts;
    // 승격 후 전부 error (적합도 미달)
    for (let i = 0; i < 4; i++) {
      traceLine('bad', new Date(Date.parse(promoTs) + (i + 1) * 1000).toISOString(), 'error');
    }
    const msgs: string[] = [];
    const rev = runCorePromotionRevertOnce(env(), { notify: (m) => msgs.push(m) });
    expect(rev).toEqual(['bad']);
    const raw = fs.readFileSync(
      path.join(root, '.claude', 'agents', 'bad', 'core.md'), 'utf-8',
    );
    expect(raw).toContain('status: draft'); // 자동 원복
    expect(readPromotionState(env()).get('bad')?.action).toBe('reverted');
    expect(msgs.some((m) => m.includes('원복'))).toBe(true);
  });

  it('승격 직후 관측 0 → revert 안 함(성급 X)', () => {
    writeCore('fresh', {
      role: 'r', status: 'draft', display_name: 'F', kind: 'worker', domain: 'YB',
    });
    enqueuePromotionCandidate(env(), 'fresh');
    runCorePromotionOnce(env());
    expect(runCorePromotionRevertOnce(env())).toEqual([]);
  });
});
