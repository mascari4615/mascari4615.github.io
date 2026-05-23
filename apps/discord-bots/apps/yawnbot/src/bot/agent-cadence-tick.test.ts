/**
 * runCadenceTickOnce 합성 E2E (TASK-KAR-018-LT — 안 닫힌 검증 rung).
 *
 * 진단(2026-05-19): per-step(producer/dialogue/retro/worker)은 각자 격리
 * GREEN 인데 *합성*(runCadenceTickOnce)은 테스트 0 → "모든 유닛 GREEN
 * 인데 prod inert"가 정확히 이 seam 에 숨었고, behavior-verify 가 HITL
 * prod-관측으로 강제돼 영영 안 닫혔다. 본 스위트가 그 rung 을 폐쇄:
 * 실제 producer→inbox-consumer→dialogue→adopt-mods write-back 한 틱
 * 핸드오프를 *LLM 경계만* stub 하고 FS 격리·결정적으로 검증한다.
 * (deliberation 엔진 자체 = agent-cadence-dialogue.test.ts 가 이미 커버 —
 *  본 파일은 그 *합성*만, 평행 재구축 0.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  analyzeAgentTeamGaps,
  buildGapDiscoveryContext,
  runCadenceTickOnce,
  disarmKill,
  resetDialogueDedupe,
} from './agent-cadence';

let root: string;
function env(): NodeJS.ProcessEnv {
  return {
    MEMO_REPO_PATH: root,
    // 자동 cadence 타이머 무관(직접 1틱 호출) — retro 게이트는 기본 큰
    // 주기라 첫 틱서 미발동(합성 결과 오염 0).
  } as NodeJS.ProcessEnv;
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
function readProposals(): Array<Record<string, unknown>> {
  const p = path.join(root, '.claude', 'proposals.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
function writeTrace(reason: string, ts = new Date().toISOString()) {
  const p = path.join(root, '.claude', 'discoveries', 'agent-trace.jsonl');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(
    p,
    JSON.stringify({ ts, type: 'budget', core: 'test', reason }) + '\n',
    'utf-8',
  );
}

const SEED_BODY = '던전 드랍 테이블 원안 본문';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  // 3 코어: atlas/echo(피어) + wm-worker(WM 도메인 주인 = 첫 도전자).
  writeCore('atlas', { role: 'infra', status: 'active', emoji: '🛰', display_name: 'Atlas', default_skin: 'alisa' });
  writeCore('echo', { role: 'yawnbot', status: 'active', emoji: '📣', display_name: 'Echo', default_skin: 'ling' });
  writeCore('wm-worker', { role: 'wm', status: 'active', kind: 'worker', domain: 'WM', emoji: '🤖', display_name: 'WM워커', default_skin: 'alisa' });
  // 포트폴리오 정본(producer projectId 게이트가 'wm' 대조) — 으뜸 WM.
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
  // objectives.md 부재 → runGovernedCadenceOnce idle → producer 경로.
});
afterEach(() => {
  disarmKill();
  resetDialogueDedupe();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runCadenceTickOnce — producer→dialogue→write-back 합성 (LT 안 닫힌 rung)', () => {
  // KAR-018-LT-PEER-ONLY P-2 (2026-05-23): dyadic dialogue engine 폐기 후 본 합성
  // 시나리오 (발굴→다중턴 숙의→수정 채택→progressLog) 의 dialogue 부분 inert.
  // it.skip + DEPRECATED 마크. ambient daemon self-tick 패러다임으로 흡수.
  it.skip('한 틱서 발굴 제안이 다중턴 숙의 수정채택 → 새 카드 + progressLog (LLM 경계만 stub) [DEPRECATED P-2]', async () => {
    const spoke: string[] = [];
    const r = await runCadenceTickOnce(env(), {
      includeWorker: false,
      // producer LLM 경계만 stub — 실제 parse/route/inboxDispatch 경유.
      producerOpts: {
        reserve: () => true,
        discover: async () =>
          JSON.stringify({
            kind: 'task',
            projectId: 'wm',
            payload: { title: 'WM 던전 드랍 보강', body: SEED_BODY, domain: 'WM' },
          }),
      },
      // dialogue LLM 경계만 stub — 실제 다중턴 상태머신/verdict/
      // buildModifiedEnvelope/publishEnvelope/appendProgress 경유.
      dialogueDeps: {
        reserve: () => true,
        cooldown: () => true,
        generate: async (prompt: string) =>
          prompt.includes('토론을 *닫아라*')
            ? '결정: 수정 채택 — 입력검증 가드를 드랍 전 선행\n그게 더 안전.'
            : prompt.includes('정면 응답')
              ? '가드 먼저 넣어 보강하겠습니다.'
              : '우려: 검증 빠지면 드랍이 깨질 수 있어요. 대안=가드 선행.',
        speak: async (_c: string, t: string) => {
          spoke.push(t);
          return true;
        },
      },
    });

    // ① 합성 결과 문자열: 발굴→딜리버레이션 한 틱 안에서 체이닝됨.
    expect(r).toContain('producer:task-new');
    expect(r).toContain('deliberation:3:adopt-mods');

    // ② 인박스 ledger: 원안(발굴) + 팀 수정안 새 카드 둘 다 — consumer 가
    //    미승인 제안을 strip 하지 않고(승인된 것만 materialize) dialogue 가
    //    실제로 그 발굴 제안을 집어 처리한 *합성* 입증.
    const props = readProposals();
    expect(props.length).toBeGreaterThanOrEqual(2);
    const bodies = props.map(
      (p) =>
        String(
          (((p.envelope as Record<string, unknown>)?.payload as Record<
            string,
            unknown
          >)?.body) ?? '',
        ),
    );
    const original = bodies.find((b) => b === SEED_BODY);
    const modified = bodies.find((b) => b.includes('[팀 수정안]'));
    expect(original).toBe(SEED_BODY); // 원안 불변(사람 ✅/❌ 최종권 보존)
    expect(modified).toBeTruthy();
    expect(modified).toContain('입력검증 가드'); // 날조 0 — CONVERGE 실출력

    // ③ 전진 측정(D3 근본): 포트폴리오 progressLog 에 수정채택 delta.
    const pf = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'team-portfolio.json'), 'utf-8'),
    );
    const wm = pf.projects.find((p: { id: string }) => p.id === 'wm');
    expect(wm.progressLog.length).toBeGreaterThanOrEqual(1);
    expect(String(wm.progressLog[0].delta)).toContain('채택');

    // ④ 팀이 #team-bus 에 새 카드 안내 발화(D3 미세 재발 근본 — 원 카드
    //    영속 "승인 대기" X). speak 가 응답 코어 정체로 호출됨.
    expect(spoke.some((t) => t.includes('새 카드'))).toBe(true);
  });

  it('seam 미주입(prod 경로) = 동작 무변경: kill 파일 → killed 단락', async () => {
    fs.writeFileSync(path.join(root, '.claude', 'agent-kill'), '1', 'utf-8');
    // opts 무주입 = prod 와 동일 경로. kill 파일이 armKill → 모든 서브런
    // 단락(producer/dialogue 미호출). seam 추가가 기존 게이트 불변 입증.
    const r = await runCadenceTickOnce(env());
    expect(r).not.toContain('deliberation');
    expect(r).not.toContain('producer:task-new');
    expect(readProposals().length).toBe(0);
  });

  it('LT-12: 헬스 이슈 0이면 producer LLM 호출 없이 gap-idle', async () => {
    writeTrace('heartbeat ok');
    const pf = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'team-portfolio.json'), 'utf-8'),
    );
    pf.projects[0].progressLog.push({
      ts: new Date().toISOString(),
      delta: 'recent progress',
      evidence: 'test',
    });
    fs.writeFileSync(
      path.join(root, '.claude', 'team-portfolio.json'),
      JSON.stringify(pf),
      'utf-8',
    );

    const r = await runCadenceTickOnce(env(), {
      includeWorker: false,
      producerOpts: {
        reserve: () => true,
        discover: async () => {
          throw new Error('producer should not run when gap-analysis is clean');
        },
      },
    });

    expect(analyzeAgentTeamGaps(env()).shouldRun).toBe(false);
    expect(r).toContain('idle→gap-idle');
    expect(r).not.toContain('producer:');
    expect(readProposals()).toHaveLength(0);
  });

  it('LT-12: 헬스 이슈가 있으면 gap-analysis 블록을 producer 입력으로 주입', async () => {
    const r = await runCadenceTickOnce(env(), {
      includeWorker: false,
      producerOpts: {
        reserve: () => true,
        discover: async () =>
          JSON.stringify({
            kind: 'task',
            projectId: 'wm',
            payload: { title: '전진 기록 복구', body: 'gap issue', domain: 'WM' },
          }),
      },
      dialogueDeps: {
        reserve: () => false,
      },
    });

    const gap = analyzeAgentTeamGaps(env());
    expect(gap.shouldRun).toBe(true);
    const ctx = buildGapDiscoveryContext(env(), gap);
    expect(ctx).toContain('에이전트 팀 능력격차 입력');
    expect(ctx).toContain('감지된 이슈');
    expect(r).toContain('producer:task-new');
  });
});
