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
