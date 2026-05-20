/**
 * 승인 게이트 인박스 소비자 행동 테스트 (KAR-018-W slice-3).
 *
 * task kind = 미션 §2.3 "일반 코드 자율" → 게이트 없음, autoReady 시 즉시 ready.
 * objective/agent kind = 사람 승인 게이트 유지 (W-4 불변식).
 * FS 격리 tmpdir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { proposalId, type ProposalEnvelope } from './proposal';
import {
  runInboxConsumerOnce,
  readMaterialized,
  materializeTaskProposal,
  materializeEngineProposalAsTask,
  materializeObjectiveProposal,
  materializeAgentProposal,
} from './proposal-adapter';
import { loadCoreDef } from '../services/agent-core';

const OBJ_MD = [
  '# objectives',
  '',
  '| id | 목표 | 도출 | 정렬 | status | 승인 | TASK |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| OBJ-001 | 예시 | self-task:x | §1 | proposed | - | - |',
  '',
  '## cross-cut',
  '',
  '- 뒤 prose 보존 검증용',
].join('\n');

const taskEnv: ProposalEnvelope = {
  kind: 'task',
  payload: { title: '보드 mojibake 추적', body: '## 증상\n깨짐', domain: 'kar' },
};

let root: string;
function env() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}
function writeProposal(e: ProposalEnvelope) {
  fs.appendFileSync(
    path.join(root, '.claude', 'proposals.jsonl'),
    JSON.stringify({
      ts: 't',
      id: proposalId(e),
      target: 'task-new',
      kind: e.kind,
      envelope: e,
    }) + '\n',
  );
}
function approve(id: string) {
  fs.appendFileSync(
    path.join(root, '.claude', 'agent-approvals.jsonl'),
    JSON.stringify({ ts: 't', objId: id, core: 'x', status: 'approved', reason: 'ok' }) +
      '\n',
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('proposalId — 결정적 식별자', () => {
  it('같은 엔벨로프 = 같은 id', () => {
    expect(proposalId(taskEnv)).toBe(proposalId({ ...taskEnv }));
  });
  it('내용 다르면 id 다름', () => {
    const other: ProposalEnvelope = {
      kind: 'task',
      payload: { title: 'X', body: 'Y', domain: 'kar' },
    };
    expect(proposalId(other)).not.toBe(proposalId(taskEnv));
  });
});

describe('runInboxConsumerOnce — task kind 자율 실행 (미션 §2.3)', () => {
  it('task = 게이트 없음 — 승인 없어도 autoReady 시 즉시 ready TASK 생성', async () => {
    writeProposal(taskEnv);
    // autoReady: true = 미션 §2.3 일반 코드 자율 경로
    const n = await runInboxConsumerOnce(env(), { notify: () => {}, autoReady: true });
    expect(n).toBe(1);
    const files = fs.readdirSync(path.join(root, 'tasks'));
    expect(files).toHaveLength(1);
    const md = fs.readFileSync(path.join(root, 'tasks', files[0]), 'utf-8');
    expect(md).toContain('status: ready'); // seed 아닌 ready — 워커 즉시 픽업
    expect(md).toContain('id: TASK-KAR-');
  });

  it('task autoReady 없으면 seed (기존 경로 보존)', async () => {
    writeProposal(taskEnv);
    approve(proposalId(taskEnv));
    const n = await runInboxConsumerOnce(env(), { notify: () => {} });
    expect(n).toBe(1);
    const files = fs.readdirSync(path.join(root, 'tasks'));
    const md = fs.readFileSync(path.join(root, 'tasks', files[0]), 'utf-8');
    expect(md).toContain('status: seed'); // 사람 승인 + autoReady 없음 = seed
  });

  it('멱등 — 2회차는 0건 (materialized skip, 무한증식 차단)', async () => {
    writeProposal(taskEnv);
    await runInboxConsumerOnce(env(), { notify: () => {}, autoReady: true });
    expect(await runInboxConsumerOnce(env(), { notify: () => {}, autoReady: true })).toBe(0);
    expect(fs.readdirSync(path.join(root, 'tasks'))).toHaveLength(1);
  });

  it('비-task kind 미승인 → inert (env/skill/objective/agent 게이트 유지)', async () => {
    const skill: ProposalEnvelope = {
      kind: 'skill',
      payload: { id: 'S', name: 'n', summary: 's', source: 'x', coreId: 'c' },
    };
    writeProposal(skill);
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
  });

  it('승인 env → yawnbot 검증 TASK 로 materialize 되어 죽은 self-improve 라우팅을 닫는다', async () => {
    const envProposal: ProposalEnvelope = {
      kind: 'env',
      payload: {
        id: 'ENV-1',
        summary: 'trace 분류 보강',
        targetFiles: ['apps/discord-bots/apps/yawnbot/src/bot/agent-cadence-worker.ts'],
        source: 'gap-analysis',
      },
    };
    writeProposal(envProposal);
    approve(proposalId(envProposal));
    expect(await runInboxConsumerOnce(env(), { notify: () => {}, autoReady: true })).toBe(1);
    const files = fs.readdirSync(path.join(root, 'projects', 'yawnbot', 'tasks'));
    expect(files[0]).toContain('TASK-YB-');
    const md = fs.readFileSync(
      path.join(root, 'projects', 'yawnbot', 'tasks', files[0]),
      'utf-8',
    );
    expect(md).toContain('status: ready');
    expect(md).toContain('자가개선 환경 트랙 제안');
    expect(md).toContain('trace 분류 보강');
    expect(md).toContain('agent-cadence-worker.ts');
  });

  it('승인 skill → yawnbot 검증 TASK 로 materialize 되어 죽은 self-skill 라우팅을 닫는다', async () => {
    const skill: ProposalEnvelope = {
      kind: 'skill',
      payload: {
        id: 'SK-1',
        name: 'diagnose-ladder',
        summary: '실패 로그를 먼저 분류한다',
        source: 'self-task',
        coreId: 'atlas',
      },
    };
    writeProposal(skill);
    approve(proposalId(skill));
    expect(await runInboxConsumerOnce(env(), { notify: () => {}, autoReady: true })).toBe(1);
    const files = fs.readdirSync(path.join(root, 'projects', 'yawnbot', 'tasks'));
    const md = fs.readFileSync(
      path.join(root, 'projects', 'yawnbot', 'tasks', files[0]),
      'utf-8',
    );
    expect(md).toContain('자가스킬 행동평가 제안');
    expect(md).toContain('diagnose-ladder');
    expect(md).toContain('coreId: atlas');
  });
});

describe('materializeTaskProposal — 도메인 별칭 정규화 (KAR-018-V fix)', () => {
  it('별칭("yawnbot") → 정식 폴더(yb) 생성 — 증발 X', () => {
    const r = materializeTaskProposal(env(), {
      title: 'x',
      body: 'b',
      domain: 'yawnbot',
    });
    expect(r).toContain('TASK-YB-');
  });

  it('미지 도메인 → null 아님, kar(메타)로 안착 (승인 결정 무손실)', () => {
    const r = materializeTaskProposal(env(), {
      title: 'y',
      body: 'b',
      domain: 'nonsense-xyz',
    });
    expect(r).not.toBeNull();
    expect(r).toContain('TASK-KAR-');
  });

  it('대소문자·공백·언더스코어 흡수 ("Karmo Lab" → kl)', () => {
    expect(
      materializeTaskProposal(env(), { title: 'z', body: 'b', domain: 'Karmo Lab' }),
    ).toContain('TASK-KL-');
  });
});

describe('materializeEngineProposalAsTask — env/skill 엔진 라우팅 폐쇄', () => {
  it('env 는 YB 검증 TASK 본문으로 변환', () => {
    const r = materializeEngineProposalAsTask(
      env(),
      {
        kind: 'env',
        payload: {
          id: 'E',
          summary: '검증 자동화',
          targetFiles: ['x.ts'],
          source: 'gap',
        },
      },
      { autoReady: true },
    );
    expect(r).toContain('TASK-YB-');
    const raw = fs.readFileSync(r!, 'utf-8');
    expect(raw).toContain('status: ready');
    expect(raw).toContain('targetFiles: x.ts');
  });
});

describe('materializeObjectiveProposal — proposed 행 (자동실행 X)', () => {
  it('objectives.md 부재 → null (정본 구조 날조 X)', () => {
    expect(
      materializeObjectiveProposal(env(), {
        summary: 's',
        derivation: 'd',
        alignment: '§1',
      }),
    ).toBeNull();
  });

  it('표에 proposed 행 append + 다음 OBJ id + 뒤 prose 보존', () => {
    fs.writeFileSync(path.join(root, '.claude', 'objectives.md'), OBJ_MD);
    const r = materializeObjectiveProposal(env(), {
      summary: '자율발굴목표',
      derivation: 'self-task:발굴',
      alignment: '§1 공통목표',
    });
    expect(r).toBe('objectives.md:OBJ-002');
    const md = fs.readFileSync(
      path.join(root, '.claude', 'objectives.md'),
      'utf-8',
    );
    expect(md).toMatch(/\| OBJ-002 \| 자율발굴목표 \|.*\| proposed \| - \| - \|/);
    expect(md).toContain('## cross-cut'); // 뒤 prose 보존
    // active 아님 = cadence 미픽업 (parseCadenceObjective 는 active 만)
    expect(md).not.toMatch(/OBJ-002.*\| active \|/);
  });
});

describe('runInboxConsumerOnce — objective kind 승인 게이트', () => {
  const objEnv: ProposalEnvelope = {
    kind: 'objective',
    payload: { summary: '발굴된목표', derivation: 'self-task:y', alignment: '§1' },
  };

  it('미승인 objective → inert (objectives.md 무변경)', async () => {
    fs.writeFileSync(path.join(root, '.claude', 'objectives.md'), OBJ_MD);
    writeProposal(objEnv);
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
    expect(
      fs.readFileSync(path.join(root, '.claude', 'objectives.md'), 'utf-8'),
    ).toBe(OBJ_MD);
  });

  it('승인 objective → proposed 행 + 멱등', async () => {
    fs.writeFileSync(path.join(root, '.claude', 'objectives.md'), OBJ_MD);
    writeProposal(objEnv);
    approve(proposalId(objEnv));
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(1);
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
    const md = fs.readFileSync(
      path.join(root, '.claude', 'objectives.md'),
      'utf-8',
    );
    expect((md.match(/\| OBJ-002 \| 발굴된목표 \|/g) || []).length).toBe(1);
  });
});

// ── KAR-018-V R-4-i3a: agent kind 머터리얼라이즈 (팀이 팀을 만든다) ──
const agentEnv: ProposalEnvelope = {
  kind: 'agent',
  payload: {
    id: 'PROP-A1',
    coreId: 'scout',
    role: '리서치/조사 도메인을 점검해 발굴한다',
    name: 'Scout',
    source: '⑦\' 자율 발굴',
  },
};

describe('materializeAgentProposal — 새 코어 Draft (i3a)', () => {
  it('승인 agent → core.md Draft + mem/README + loadCoreDef 읽힘 + 멱등', async () => {
    writeProposal(agentEnv);
    approve(proposalId(agentEnv));
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(1);
    const core = loadCoreDef(root, 'scout');
    expect(core).not.toBeNull();
    expect(core!.id).toBe('scout');
    expect(core!.status).toBe('draft'); // materialize 직후는 draft, active flip 은 LT-11 게이트
    expect(core!.role).toContain('리서치');
    expect(core!.displayName).toBe('Scout');
    const q = fs.readFileSync(
      path.join(root, '.claude', 'agent-core-promotion-candidates.jsonl'),
      'utf-8',
    );
    expect(q).toContain('"coreId":"scout"');
    expect(
      fs.existsSync(path.join(root, '.claude', 'agents', 'scout', 'mem', 'README.md')),
    ).toBe(true);
    // 멱등 — 2회째 0건, core.md 비덮어쓰기
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
  });

  it('미승인 agent → 0건, core.md/승격후보 안 생김', async () => {
    writeProposal(agentEnv);
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude', 'agents', 'scout'))).toBe(false);
    expect(
      fs.existsSync(path.join(root, '.claude', 'agent-core-promotion-candidates.jsonl')),
    ).toBe(false);
  });

  it('기존 코어 절대 비덮어쓰기 (atlas/echo/선행 보존 — 멱등 skip)', () => {
    const dir = path.join(root, '.claude', 'agents', 'atlas');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'core.md'), '---\nid: atlas\n---\n\n# atlas\n원본');
    const r = materializeAgentProposal(env(), {
      id: 'P', coreId: 'atlas', role: '탈취 시도', name: 'X', source: 's',
    });
    expect(r).toBe(path.join('.claude', 'agents', 'atlas', 'core.md'));
    expect(fs.readFileSync(path.join(dir, 'core.md'), 'utf-8')).toContain('원본'); // 불변
  });

  it('부적합 coreId / 불완전 spec → null (날조 X)', () => {
    expect(
      materializeAgentProposal(env(), { id: 'P', coreId: '../evil', role: 'r', name: 'n', source: 's' }),
    ).toBeNull();
    expect(
      materializeAgentProposal(env(), { id: 'P', coreId: 'ok', role: '', name: 'n', source: 's' }),
    ).toBeNull();
  });
});
