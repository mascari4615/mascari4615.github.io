/**
 * runCoreDialogueOnce 어댑터 합성 회귀 (KAR-018-Y-1, i3b 복원).
 *
 * tracer-bullet: 코어↔코어 1턴이 *6중 차단 + bounded* 임을 잠금 —
 * kill / 예산 deny / 쿨다운 / dedupe(매 tick 재코멘트 X) / PASS(억지
 * 발화 거부) / 응답자 없음. speak DI 가 *응답 코어 정체*로 호출됨 확인.
 * FS 격리 = tmpdir, LLM·Discord 무호출(generate/speak 주입).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runCoreDialogueOnce,
  armKill,
  disarmKill,
  resetDialogueDedupe,
} from './agent-cadence';

let root: string;
function env() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}
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
function writeProposal(id: string, payload: Record<string, unknown>) {
  const p = path.join(root, '.claude', 'proposals.jsonl');
  fs.appendFileSync(
    p,
    JSON.stringify({
      ts: new Date().toISOString(),
      id,
      target: 'task-new',
      kind: 'task',
      envelope: { kind: 'task', payload },
    }) + '\n',
    'utf-8',
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdlg-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  writeCore('atlas', { role: 'infra', status: 'active', emoji: '🛰', display_name: 'Atlas', default_skin: 'alisa' });
  writeCore('echo', { role: 'yawnbot', status: 'active', emoji: '📣', display_name: 'Echo', default_skin: 'ling' });
  writeCore('wm-worker', { role: 'wm', status: 'active', kind: 'worker', domain: 'WM', emoji: '🤖', display_name: 'WM워커', default_skin: 'alisa' });
});
afterEach(() => {
  disarmKill();
  resetDialogueDedupe();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runCoreDialogueOnce — 합성·차단', () => {
  it('proposal 없음 → dialogue-idle', async () => {
    expect(await runCoreDialogueOnce(env())).toBe('dialogue-idle');
  });

  it('kill → killed (proposal 무관)', async () => {
    writeProposal('p1', { title: 'WM 작업', body: 'x', domain: 'WM' });
    armKill();
    expect(await runCoreDialogueOnce(env())).toBe('killed');
  });

  it('LT-3 다중턴 숙의: challenge→refine→converge + 결정 + dedupe', async () => {
    writeProposal('p1', { title: 'WM 던전망', body: '보강', domain: 'WM' });
    const spoke: { core: string; text: string }[] = [];
    const deps = {
      reserve: () => true,
      cooldown: () => true,
      // phase 별 응답 (프롬프트 마커로 분기 — 결정적 검증)
      generate: async (prompt: string) =>
        prompt.includes('토론을 *닫아라*')
          ? '결정: 채택\n던전망과 정렬돼 북극성 전진.'
          : prompt.includes('정면 응답')
            ? '우려 수용해 입력검증 추가하겠습니다.'
            : '우려: 입력 검증 빠지면 깨질 수 있어요. 대안=가드 먼저.',
      speak: async (core: string, text: string) => {
        spoke.push({ core, text });
        return true;
      },
    };
    const r1 = await runCoreDialogueOnce(env(), deps);
    // 단일턴 'dialogue:<r>' 폐기 → 다중턴 deliberation:<n>:<verdict>
    expect(r1).toBe('deliberation:3:adopt');
    expect(spoke.length).toBeGreaterThanOrEqual(3); // challenge·refine·converge
    expect(spoke[0].core).toBe('wm-worker'); // 도메인 주인 = 첫 도전자
    // 깡통 동의가 아니라 실제 우려·응답·결정 (D1 직격 검증)
    expect(spoke[0].text).toContain('우려');
    expect(spoke.some((s) => s.text.includes('결정: 채택'))).toBe(true);
    // dedupe: 같은 proposal 재호출 = dialogue-dup
    const r2 = await runCoreDialogueOnce(env(), deps);
    expect(r2).toBe('dialogue-dup');
    // 코어 기억에 숙의 흔적 append (틱 넘어 누적 = 기둥3)
    expect(
      fs.existsSync(path.join(root, '.claude', 'agents', 'wm-worker', 'mem')),
    ).toBe(true);
  });

  it('LT-3 깡통 동의(bare-agree) challenge → 즉시 채택 수렴(무한 X)', async () => {
    writeProposal('p1', { title: 'WM 작업', body: 'x', domain: 'WM' });
    const spoke: string[] = [];
    const r = await runCoreDialogueOnce(env(), {
      reserve: () => true,
      cooldown: () => true,
      generate: async () => '좋아요 동의합니다', // 깡통 동의만
      speak: async (_c: string, t: string) => {
        spoke.push(t);
        return true;
      },
    });
    expect(r).toBe('deliberation:1:adopt'); // challenge 1턴 → 이의없음 채택
    expect(spoke.some((t) => t.includes('결정: 채택'))).toBe(true);
  });

  it('LT-5 숙의 채택 → team-portfolio progressLog 진전 기록 (D3 측정)', async () => {
    // projectId 단 proposal + 포트폴리오 정본
    fs.writeFileSync(
      path.join(root, '.claude', 'team-portfolio.json'),
      JSON.stringify({
        projects: [
          { id: 'wm', title: 'WM', northStar: '팬100', weight: 100, status: 'active', progressLog: [] },
        ],
      }),
      'utf-8',
    );
    fs.appendFileSync(
      path.join(root, '.claude', 'proposals.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(),
        id: 'pLT5',
        target: 'task-new',
        kind: 'task',
        envelope: {
          kind: 'task',
          projectId: 'wm',
          payload: { title: 'WM 던전 보강', body: 'x', domain: 'WM' },
        },
      }) + '\n',
      'utf-8',
    );
    const r = await runCoreDialogueOnce(env(), {
      reserve: () => true,
      cooldown: () => true,
      generate: async () => '좋아요', // bare-agree → 즉시 adopt
      speak: async () => true,
    });
    expect(r).toBe('deliberation:1:adopt');
    const pf = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'team-portfolio.json'), 'utf-8'),
    );
    const wm = pf.projects.find((p: { id: string }) => p.id === 'wm');
    expect(wm.progressLog).toHaveLength(1);
    expect(wm.progressLog[0].delta).toContain('채택');
    expect(wm.progressLog[0].evidence).toContain('pLT5');
  });

  it('예산 deny → dialogue-gated, 생성·speak 호출 X + trace', async () => {
    writeProposal('p1', { title: 'WM 작업', body: 'x', domain: 'WM' });
    let gen = false;
    const r = await runCoreDialogueOnce(env(), {
      reserve: () => false,
      generate: async () => {
        gen = true;
        return 'x';
      },
      speak: async () => true,
    });
    expect(r).toBe('dialogue-gated');
    expect(gen).toBe(false);
    const trace = fs.readFileSync(
      path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl'),
      'utf-8',
    );
    expect(trace).toContain('dialogue reserve deny');
  });

  it('쿨다운 → dialogue-cooldown', async () => {
    writeProposal('p1', { title: 'WM 작업', body: 'x', domain: 'WM' });
    const r = await runCoreDialogueOnce(env(), {
      reserve: () => true,
      cooldown: () => false,
      generate: async () => 'x',
      speak: async () => true,
    });
    expect(r).toBe('dialogue-cooldown');
  });

  it('PASS(억지 발화 거부) → dialogue-pass, speak 호출 X + dedupe', async () => {
    writeProposal('p1', { title: 'WM 작업', body: 'x', domain: 'WM' });
    let spoke = false;
    const deps = {
      reserve: () => true,
      cooldown: () => true,
      generate: async () => 'PASS',
      speak: async () => {
        spoke = true;
        return true;
      },
    };
    expect(await runCoreDialogueOnce(env(), deps)).toBe('dialogue-pass');
    expect(spoke).toBe(false);
    expect(await runCoreDialogueOnce(env(), deps)).toBe('dialogue-dup');
  });

  it('코어 1개뿐(응답 후보 0) → dialogue-none', async () => {
    fs.rmSync(path.join(root, '.claude', 'agents', 'echo'), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(root, '.claude', 'agents', 'wm-worker'), {
      recursive: true,
      force: true,
    });
    writeProposal('p1', { title: 'x', body: 'y', domain: 'WM' });
    expect(await runCoreDialogueOnce(env(), { reserve: () => true })).toBe(
      'dialogue-none',
    );
  });
});
