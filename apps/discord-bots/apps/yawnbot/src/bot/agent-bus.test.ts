/**
 * agent-bus 순수부 회귀 (KAR-018-V V-1).
 * 카드 내용(render)·메시지↔발굴 매핑 round-trip 잠금. Discord 송신은
 * 통합(라이브 봇 관측)이라 단위 X — 순수 경계만.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EmbedBuilder } from 'discord.js';
import {
  appendProposalMsg,
  lookupProposalByMessage,
  lookupProposalById,
  proposalMsgsPath,
  applyCardEmbedState,
} from './agent-bus';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('proposal 메시지 매핑 (V-2 리액션 승인이 소비)', () => {
  it('append → lookup round-trip', () => {
    appendProposalMsg(env(), {
      messageId: 'm1',
      threadId: 't1',
      id: 'pABC',
      kind: 'task',
      target: 'task-new',
      title: '제목',
      ts: 'now',
    });
    const hit = lookupProposalByMessage(env(), 'm1');
    expect(hit?.id).toBe('pABC');
    expect(hit?.threadId).toBe('t1');
    expect(hit?.kind).toBe('task');
  });

  it('미존재 messageId → null', () => {
    expect(lookupProposalByMessage(env(), 'nope')).toBeNull();
  });

  it('같은 messageId 중복 시 마지막 우선 (idempotent 재게시 대비)', () => {
    appendProposalMsg(env(), {
      messageId: 'm2', threadId: 't', id: 'old', kind: 'task',
      target: 'task-new', title: 'a', ts: '1',
    });
    appendProposalMsg(env(), {
      messageId: 'm2', threadId: 't', id: 'new', kind: 'task',
      target: 'task-new', title: 'b', ts: '2',
    });
    expect(lookupProposalByMessage(env(), 'm2')?.id).toBe('new');
  });

  it('MEMO_REPO_PATH 미설정 → path 빈 문자열 (안전 no-op)', () => {
    expect(proposalMsgsPath({} as NodeJS.ProcessEnv)).toBe('');
  });

  it('lookupProposalById — id 로 카드 매핑 회수 (verdict reconciler)', () => {
    appendProposalMsg(env(), {
      messageId: 'mX', threadId: 'tX', channelId: 'cX', id: 'pZ',
      kind: 'task', target: 'task-new', title: 'z', ts: '1',
    });
    const hit = lookupProposalById(env(), 'pZ');
    expect(hit?.messageId).toBe('mX');
    expect(hit?.channelId).toBe('cX');
    expect(lookupProposalById(env(), 'none')).toBeNull();
  });
});

describe('applyCardEmbedState (KAR-018-LT — 사람·팀 verdict 공용 embed)', () => {
  // 그동안의 미반영 근본 = embed 변형이 lockCard 하나뿐 + 사람
  // 리액션에서만. 변형 공용화 = 팀 verdict 도 같은 경로로 카드 반영.
  function baseEmbed() {
    return new EmbedBuilder()
      .setTitle('💡 제안')
      .addFields(
        { name: '📌 상태', value: '🟡 승인 대기', inline: true },
        { name: '🆔', value: '`p1`', inline: true },
      );
  }

  it('team-reject → 상태/색/푸터 갱신, 미잠금(동료 override 유효)', () => {
    const eb = applyCardEmbedState(
      baseEmbed().data,
      'team-reject',
      '팀 반려 — 중복 우려',
      '🧑‍🤝‍🧑 팀 토론 결과',
    );
    const d = eb.toJSON();
    const status = d.fields?.find((f) => f.name === '📌 상태');
    expect(status?.value).toContain('팀 반려');
    expect(d.color).toBe(0x95a5a6);
    expect(d.footer?.text).toContain('팀이 반려'); // team-reject 표시
    expect(
      d.fields?.some((f) => f.name === '🧑‍🤝‍🧑 팀 토론 결과'),
    ).toBe(true);
  });

  it('team-escalate → 동료 결정 필요 상태 (여기서만 사람 게이트)', () => {
    const d = applyCardEmbedState(
      baseEmbed().data,
      'team-escalate',
      '쟁점 미수렴',
      '🧑‍🤝‍🧑 팀 토론 결과',
    ).toJSON();
    expect(
      d.fields?.find((f) => f.name === '📌 상태')?.value,
    ).toContain('팀 미수렴'); // ✅ 폐지 후: 사람 게이트 X, 동료 ❌ veto 또는 묵힘
  });

  it('재반영 멱등 — 같은 결과 필드 중복 X (reconciler 재시도 안전)', () => {
    const once = applyCardEmbedState(
      baseEmbed().data,
      'team-adopt',
      'r1',
      '🧑‍🤝‍🧑 팀 토론 결과',
    );
    const twice = applyCardEmbedState(
      once.data,
      'team-adopt',
      'r2',
      '🧑‍🤝‍🧑 팀 토론 결과',
    ).toJSON();
    const hits = (twice.fields ?? []).filter(
      (f) => f.name === '🧑‍🤝‍🧑 팀 토론 결과',
    );
    expect(hits.length).toBe(1); // 누적 X
    expect(hits[0].value).toBe('r2'); // 최신으로 갱신
  });
});
