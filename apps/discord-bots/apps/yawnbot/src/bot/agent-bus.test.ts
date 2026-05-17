/**
 * agent-bus 순수부 회귀 (KAR-018-V V-1).
 * 카드 내용(render)·메시지↔발굴 매핑 round-trip 잠금. Discord 송신은
 * 통합(라이브 봇 관측)이라 단위 X — 순수 경계만.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendProposalMsg,
  lookupProposalByMessage,
  proposalMsgsPath,
  sanitizeVoicedIntro,
} from './agent-bus';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('sanitizeVoicedIntro — 거부/표덤프 방어 (KAR-018-Y)', () => {
  it('디스클레이머 발화 → 결정적 폴백', () => {
    const r = sanitizeVoicedIntro(
      '안녕하세요. 저는 Anthropic의 Claude이며, karmoddrine 팀의 실제 동료가 될 수는 없습니다. 실제로 필요한 게 무엇인가요?',
      '온보딩 가이드',
    );
    expect(r).toContain('온보딩 가이드');
    expect(r).toContain('카드 봐주세요');
    expect(r).not.toMatch(/Claude이며|동료가 될 수는 없/);
  });

  it('카드 마크다운 표 복붙 → 표 제거 후 문장만', () => {
    const r = sanitizeVoicedIntro(
      '팀, 점검하다 이게 눈에 띄어요.\n\n[제안 카드]\n| 항목 | 내용 |\n|------|------|\n| 발견명 | X |\n| 제안 | Y |',
      'T',
    );
    expect(r).toContain('눈에 띄어요');
    expect(r).not.toContain('|');
    expect(r).not.toContain('제안 카드');
  });

  it('정상 1~2문장 발화 → 그대로(폴백 X)', () => {
    const good = '팀 확장 시 온보딩이 없어 진입이 느려 보입니다. 가이드로 개선할 수 있을 것 같아요.';
    expect(sanitizeVoicedIntro(good, 'T')).toBe(good);
  });

  it('빈 출력 → 폴백 (title 인용)', () => {
    const r = sanitizeVoicedIntro('', '새 에이전트 시험장');
    expect(r).toContain('새 에이전트 시험장');
    expect(r.length).toBeGreaterThan(8);
  });
});

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
});
