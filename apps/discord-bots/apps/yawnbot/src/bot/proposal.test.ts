/**
 * proposal 순수부 행동 테스트 (KAR-018-W slice-1).
 * tracer-bullet: 판별 union 파싱(형식오류·부분=null 날조0) + 결정적 라우팅.
 */
import { describe, it, expect } from 'vitest';
import { parseProposalEnvelope, routeProposal } from './proposal';

const env = JSON.stringify({
  kind: 'env',
  payload: { id: 'P1', summary: 's', targetFiles: ['a'], source: 'self-task' },
});
const skill = JSON.stringify({
  kind: 'skill',
  payload: { id: 'S1', name: 'n', summary: 's', source: 'x', coreId: 'atlas' },
});
const agent = JSON.stringify({
  kind: 'agent',
  payload: { id: 'A1', coreId: 'nova', role: 'r', name: 'N', source: 'x' },
});
const task = JSON.stringify({
  kind: 'task',
  payload: { title: 't', body: 'b', domain: 'kar' },
});
const obj = JSON.stringify({
  kind: 'objective',
  payload: { summary: 's', derivation: 'self-task:x', alignment: '§1' },
});

describe('parseProposalEnvelope — 검증 (날조 0)', () => {
  it('5 kind 다 정상 파싱', () => {
    expect(parseProposalEnvelope(env)?.kind).toBe('env');
    expect(parseProposalEnvelope(skill)?.kind).toBe('skill');
    expect(parseProposalEnvelope(agent)?.kind).toBe('agent');
    expect(parseProposalEnvelope(task)?.kind).toBe('task');
    expect(parseProposalEnvelope(obj)?.kind).toBe('objective');
  });

  it('코드펜스 ```json 감싸도 추출', () => {
    expect(parseProposalEnvelope('```json\n' + env + '\n```')?.kind).toBe('env');
  });

  it('JSON 깨짐 → null', () => {
    expect(parseProposalEnvelope('{not json')).toBeNull();
    expect(parseProposalEnvelope('')).toBeNull();
  });

  it('kind 미지 → null', () => {
    expect(
      parseProposalEnvelope(JSON.stringify({ kind: 'wat', payload: {} })),
    ).toBeNull();
  });

  it('payload 필수필드 누락 → null (부분 거부)', () => {
    expect(
      parseProposalEnvelope(JSON.stringify({ kind: 'env', payload: { id: 'P1' } })),
    ).toBeNull();
    expect(
      parseProposalEnvelope(
        JSON.stringify({ kind: 'agent', payload: { id: 'A1', coreId: 'n' } }),
      ),
    ).toBeNull();
  });

  it('불릿 배열 본문 필드 → join 정규화 후 통과 (KAR-018-Y 회귀근본)', () => {
    // buildDiscoveryPrompt 가 derivation/alignment/body 를 *불릿*으로
    // 요구 → 모델이 string[] 반환. 파서가 그 형식을 수용해야 함(계약).
    const objArr = parseProposalEnvelope(
      JSON.stringify({
        kind: 'objective',
        payload: {
          summary: '에이전트 상태 추적 표준',
          derivation: ['- 문제: 형식 없음', '- 제안: 표준 모델', '- 효과: 투명성'],
          alignment: ['- 가시성', '- 거버넌스'],
        },
      }),
    );
    expect(objArr?.kind).toBe('objective');
    const p = objArr?.payload as Record<string, string>;
    expect(p.derivation).toBe('- 문제: 형식 없음\n- 제안: 표준 모델\n- 효과: 투명성');
    expect(p.alignment).toBe('- 가시성\n- 거버넌스');

    const taskArr = parseProposalEnvelope(
      JSON.stringify({
        kind: 'task',
        payload: { title: 't', body: ['- 현황', '- 제안'], domain: 'kar' },
      }),
    );
    expect(taskArr?.kind).toBe('task');
    expect((taskArr?.payload as Record<string, string>).body).toBe('- 현황\n- 제안');

    // env.targetFiles 는 배열이 정당 — join 으로 망가뜨리면 안 됨
    const envOk = parseProposalEnvelope(
      JSON.stringify({
        kind: 'env',
        payload: { id: 'P1', summary: 's', targetFiles: ['a', 'b'], source: 'x' },
      }),
    );
    expect(Array.isArray((envOk?.payload as Record<string, unknown>).targetFiles)).toBe(true);

    // 빈 배열·비-문자열 배열 = 정규화 안 함 → 여전히 거부(날조 0)
    expect(
      parseProposalEnvelope(
        JSON.stringify({
          kind: 'objective',
          payload: { summary: 's', derivation: [], alignment: 'a' },
        }),
      ),
    ).toBeNull();
  });

  it('payload 가 배열/스칼라 → null', () => {
    expect(parseProposalEnvelope(JSON.stringify({ kind: 'task', payload: [] }))).toBeNull();
    expect(parseProposalEnvelope(JSON.stringify({ kind: 'task', payload: 'x' }))).toBeNull();
  });

  it('env targetFiles 가 배열 아니면 → null', () => {
    expect(
      parseProposalEnvelope(
        JSON.stringify({ kind: 'env', payload: { id: 'P', summary: 's', targetFiles: 'a', source: 'x' } }),
      ),
    ).toBeNull();
  });
});

describe('routeProposal — 결정적 매핑', () => {
  it('kind → 엔진 타겟', () => {
    expect(routeProposal(parseProposalEnvelope(env)!)).toBe('self-improve');
    expect(routeProposal(parseProposalEnvelope(skill)!)).toBe('self-skill');
    expect(routeProposal(parseProposalEnvelope(agent)!)).toBe('agent-factory');
    expect(routeProposal(parseProposalEnvelope(task)!)).toBe('task-new');
    expect(routeProposal(parseProposalEnvelope(obj)!)).toBe('objectives');
  });
});

describe('parseProposalEnvelope — LT-2 projectId 추출 (순수)', () => {
  const b = { kind: 'task', payload: { title: 't', body: 'b', domain: 'kar' } };
  it('projectId 문자열 → 추출', () => {
    expect(
      parseProposalEnvelope(JSON.stringify({ ...b, projectId: 'wm' }))?.projectId,
    ).toBe('wm');
  });
  it('projectId 부재 → undefined (파서 거부 X — 정책 게이트 소관)', () => {
    const e = parseProposalEnvelope(JSON.stringify(b));
    expect(e?.kind).toBe('task');
    expect(e?.projectId).toBeUndefined();
  });
  it('projectId 비문자열/공백 → undefined', () => {
    expect(
      parseProposalEnvelope(JSON.stringify({ ...b, projectId: 42 }))?.projectId,
    ).toBeUndefined();
    expect(
      parseProposalEnvelope(JSON.stringify({ ...b, projectId: '  ' }))?.projectId,
    ).toBeUndefined();
  });
});
