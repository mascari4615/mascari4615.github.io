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
  runRetroOnce,
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

  it('LT-8 수정 채택 → 합의 수정안이 *새 카드*로 게시 (사람 승인 게이트 불변)', async () => {
    writeProposal('p1', { title: 'WM 던전망', body: '원안 본문', domain: 'WM' });
    const spoke: string[] = [];
    const r = await runCoreDialogueOnce(env(), {
      reserve: () => true,
      cooldown: () => true,
      generate: async (prompt: string) =>
        prompt.includes('토론을 *닫아라*')
          ? '결정: 수정 채택 — 입력검증 가드를 먼저 추가\n그게 더 안전.'
          : prompt.includes('정면 응답')
            ? '가드 먼저 넣겠습니다.'
            : '우려: 검증 빠지면 깨짐. 대안=가드 선행.',
      speak: async (_c: string, t: string) => {
        spoke.push(t);
        return true;
      },
    });
    expect(r).toBe('deliberation:3:adopt-mods');
    // 팀이 새 카드 안내 발화 (D3 미세 재발 근본 — 원 카드 영속 X)
    expect(spoke.some((t) => t.includes('팀 수정안을 새 카드로'))).toBe(true);
    // proposals.jsonl 에 *새* 엔벨로프(수정안) 추가 — 원 p1 그대로 + 신규
    const lines = fs
      .readFileSync(path.join(root, '.claude', 'proposals.jsonl'), 'utf-8')
      .trim()
      .split(/\r?\n/)
      .map((l) => JSON.parse(l));
    expect(lines.length).toBe(2); // 원안 + 수정안 새 카드
    const mod = lines[1];
    expect(mod.id).not.toBe('p1'); // 새 pid (payload 변화)
    expect(String(mod.envelope.payload.body)).toContain('[팀 수정안]');
    expect(String(mod.envelope.payload.body)).toContain('입력검증 가드');
    // 원안은 미변경(사람 ✅/❌ 최종권 보존 — verdict 가 승인 대체 X)
    expect(lines[0].id).toBe('p1');
    expect(String(lines[0].envelope.payload.body)).toBe('원안 본문');
  });

  it('LT-8 바운드: 팀-수정 카드는 재숙의 X (영구기관 차단, restart-safe)', async () => {
    writeProposal('p1', { title: 'WM 던전망', body: '원안', domain: 'WM' });
    const deps = {
      reserve: () => true,
      cooldown: () => true,
      generate: async (prompt: string) =>
        prompt.includes('토론을 *닫아라*')
          ? '결정: 수정 채택 — 동일 보강'
          : prompt.includes('정면 응답')
            ? '수용'
            : '우려: x. 대안=y.',
      speak: async () => true,
    };
    expect(await runCoreDialogueOnce(env(), deps)).toBe(
      'deliberation:3:adopt-mods',
    );
    // 새 수정 카드가 latest → in-process dedupe 풀어도 *구조적* 마커
    // 가드로 재숙의 차단(사람 ✅/❌ 대기). 자기 산출물 무한 재수정 X.
    resetDialogueDedupe();
    expect(await runCoreDialogueOnce(env(), deps)).toBe(
      'dialogue-modified-pending',
    );
    const lines = fs
      .readFileSync(path.join(root, '.claude', 'proposals.jsonl'), 'utf-8')
      .trim()
      .split(/\r?\n/);
    expect(lines.length).toBe(2); // 원안 + 수정안 1개 (재수정 폭주 0)
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

  it('LT-5b 발굴 projectId 누락이라도 채택 → topProject(WM) progressLog 귀속 (앵커 정합, prod 근본 2026-05-18)', async () => {
    // prod 실증: 발굴 LLM 이 엔벨로프 projectId 를 자주 누락 → adopt
    // 났는데 progressLog=[] (deliberation 은 topProject 앵커로 도는데
    // appendProgress 만 빈 엔벨로프 projectId 를 봐 어긋남). fallback 후
    // = topProject(weight 최대 active=wm) 에 귀속.
    fs.writeFileSync(
      path.join(root, '.claude', 'team-portfolio.json'),
      JSON.stringify({
        projects: [
          { id: 'agent-team', title: '팀인프라', northStar: 's', weight: 40, status: 'active', instrumental: true, progressLog: [] },
          { id: 'wm', title: 'WM', northStar: '팬100', weight: 100, status: 'active', progressLog: [] },
        ],
      }),
      'utf-8',
    );
    // projectId *없는* 엔벨로프 (발굴 LLM 누락 = prod 실제 케이스)
    fs.appendFileSync(
      path.join(root, '.claude', 'proposals.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(),
        id: 'pNoPid',
        target: 'task-new',
        kind: 'objective',
        envelope: {
          kind: 'objective',
          payload: { summary: '환경 백지 복구 점검 체계', derivation: [], alignment: [] },
        },
      }) + '\n',
      'utf-8',
    );
    const r = await runCoreDialogueOnce(env(), {
      reserve: () => true,
      cooldown: () => true,
      generate: async () => '좋아요',
      speak: async () => true,
    });
    expect(r).toBe('deliberation:1:adopt');
    const pf = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'team-portfolio.json'), 'utf-8'),
    );
    const wm = pf.projects.find((p: { id: string }) => p.id === 'wm');
    const at = pf.projects.find((p: { id: string }) => p.id === 'agent-team');
    expect(wm.progressLog).toHaveLength(1); // topProject(w100) 귀속
    expect(at.progressLog).toHaveLength(0); // instrumental 엔 안 박힘
    expect(wm.progressLog[0].evidence).toContain('topProject 귀속');
    expect(wm.progressLog[0].evidence).toContain('pNoPid');
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

describe('runRetroOnce — LT-7 retro 밸브 (gated·목표 자동조정)', () => {
  function writePf(proj: Record<string, unknown>) {
    fs.writeFileSync(
      path.join(root, '.claude', 'team-portfolio.json'),
      JSON.stringify({ projects: [proj] }),
      'utf-8',
    );
  }
  const base = {
    id: 'wm',
    title: 'WM',
    northStar: '팬100',
    weight: 100,
    status: 'active',
    currentObjective: { text: '허브 만들기', openedTs: '2026-05-01T00:00:00Z' },
    progressLog: [
      { ts: '2026-05-18T00:00:00Z', projectId: 'wm', delta: '진전 A', evidence: 'pX' },
    ],
  };

  it('진전 없음 → retro-skip (게이트)', async () => {
    writePf({ ...base, progressLog: [] });
    expect(await runRetroOnce(env())).toBe('retro-skip');
  });

  it('조정 결정 → currentObjective 교체 + lastRetroTs 스탬프 + 알림', async () => {
    writePf(base);
    const notes: string[] = [];
    const r = await runRetroOnce(env(), {
      generate: async () => '조정: 던전 루프 닫기\n그게 북극성에 더 가깝다',
      notify: (m) => notes.push(m),
      missionText: '미션',
    });
    expect(r).toBe('retro:adjust');
    const pf = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'team-portfolio.json'), 'utf-8'),
    );
    expect(pf.projects[0].currentObjective.text).toBe('던전 루프 닫기');
    expect(typeof pf.projects[0].lastRetroTs).toBe('string');
    expect(notes.some((n) => n.includes('회고') && n.includes('던전 루프 닫기'))).toBe(true);
  });

  it('lastRetroTs 최근 + 긴 주기 → retro-skip (영속 게이트)', async () => {
    writePf({ ...base, lastRetroTs: new Date().toISOString() });
    expect(
      await runRetroOnce(
        { ...env(), AGENT_RETRO_INTERVAL_MS: '3600000' } as NodeJS.ProcessEnv,
        { generate: async () => '조정: X', notify: () => {} },
      ),
    ).toBe('retro-skip');
  });

  it('유지 결정 → retro:keep, 목표 불변(보수·날조0)', async () => {
    writePf(base);
    const r = await runRetroOnce(env(), {
      generate: async () => '유지\n현 목표가 옳다',
      notify: () => {},
    });
    expect(r).toBe('retro:keep');
    const pf = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'team-portfolio.json'), 'utf-8'),
    );
    expect(pf.projects[0].currentObjective.text).toBe('허브 만들기'); // 불변
    expect(typeof pf.projects[0].lastRetroTs).toBe('string'); // keep 도 스탬프
  });
});
