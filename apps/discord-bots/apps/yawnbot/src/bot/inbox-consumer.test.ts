/**
 * 승인 게이트 인박스 소비자 행동 테스트 (KAR-018-W slice-3).
 *
 * tracer-bullet: proposalId 결정성 + 미승인=inert + 승인 task→seed TASK
 * 머터리얼라이즈 + 멱등 + 비-task/미지도메인 skip. canon 정합 잠금:
 * 승인 없으면 절대 파일 안 생김(W-4 no-auto-exec / mission §3 무한증식).
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

describe('runInboxConsumerOnce — 승인 게이트', () => {
  it('미승인 → 0건, TASK 파일 안 생김 (inert, W-4)', async () => {
    writeProposal(taskEnv);
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
    expect(fs.existsSync(path.join(root, 'tasks'))).toBe(false);
  });

  it('승인 → seed TASK 머터리얼라이즈 + materialized 기록', async () => {
    writeProposal(taskEnv);
    approve(proposalId(taskEnv));
    const n = await runInboxConsumerOnce(env(), { notify: () => {} });
    expect(n).toBe(1);
    const files = fs.readdirSync(path.join(root, 'tasks'));
    expect(files).toHaveLength(1);
    const md = fs.readFileSync(path.join(root, 'tasks', files[0]), 'utf-8');
    expect(md).toContain('status: seed');
    expect(md).toContain('id: TASK-KAR-');
    expect(md).toContain('보드 mojibake 추적');
    expect(readMaterialized(env()).has(proposalId(taskEnv))).toBe(true);
  });

  it('멱등 — 2회차는 0건 (materialized skip, 무한증식 차단)', async () => {
    writeProposal(taskEnv);
    approve(proposalId(taskEnv));
    await runInboxConsumerOnce(env(), { notify: () => {} });
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
    expect(fs.readdirSync(path.join(root, 'tasks'))).toHaveLength(1);
  });

  it('비-task kind 승인돼도 무시 (이 slice=task 한정)', async () => {
    const skill: ProposalEnvelope = {
      kind: 'skill',
      payload: { id: 'S', name: 'n', summary: 's', source: 'x', coreId: 'c' },
    };
    writeProposal(skill);
    approve(proposalId(skill));
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
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
    expect(core!.status).toBe('draft'); // 절대 active X (불변식)
    expect(core!.role).toContain('리서치');
    expect(core!.displayName).toBe('Scout');
    expect(
      fs.existsSync(path.join(root, '.claude', 'agents', 'scout', 'mem', 'README.md')),
    ).toBe(true);
    // 멱등 — 2회째 0건, core.md 비덮어쓰기
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
  });

  it('미승인 agent → 0건, core.md 안 생김 (W-4 / 자동활성 X 불변식)', async () => {
    writeProposal(agentEnv);
    expect(await runInboxConsumerOnce(env(), { notify: () => {} })).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude', 'agents', 'scout'))).toBe(false);
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
