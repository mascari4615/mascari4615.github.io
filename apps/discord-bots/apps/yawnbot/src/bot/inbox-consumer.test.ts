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
} from './proposal-adapter';

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

describe('materializeTaskProposal — 미지 도메인 거부 (날조 0)', () => {
  it('도메인 미지 → null (파일 X)', () => {
    expect(
      materializeTaskProposal(env(), {
        title: 't',
        body: 'b',
        domain: 'nonsense',
      }),
    ).toBeNull();
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
