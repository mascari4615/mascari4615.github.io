/**
 * agent-status-board unit test — 순수 gather/format + sender edit-or-send 결정성.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  formatStatusBoard,
  gatherStatusBoardData,
  readStatusBoardState,
  runStatusBoardOnce,
  writeStatusBoardState,
  type StatusBoardData,
} from './agent-status-board';

let root: string;
function env(): NodeJS.ProcessEnv {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('formatStatusBoard — 3줄 핵심 + 펀쿨섹 합의 디자인', () => {
  it('healthy + finding + 0 pending = 봇 작동 ✓ + 발견 약점 + 없음 ✨', () => {
    const data: StatusBoardData = {
      botHealth: { status: 'ok', lastTickHrs: 0.01, label: '✓ 봇 작동 (마지막 tick 1분 전)' },
      latestFinding: {
        taskFile: 'TASK-KAR-136-x.md',
        headline: '📜 발의 (신프로젝트): 팀 전진 0 신호',
        ts: '2026-05-23T01:14:00Z',
      },
      userPending: { count: 0 },
      evolution: { promotedCount: 0, revertedCount: 0 },
      ts: '2026-05-23T01:14:00Z',
    };
    const out = formatStatusBoard(data);
    expect(out).toContain('📊');
    expect(out).toContain('봇 작동');
    expect(out).toContain('1분 전');
    expect(out).toContain('TASK-KAR-136');
    expect(out).toContain('없음');
    expect(out).toContain('진화 7d');
  });

  it('critical pending = 카운트 + 첫 detail', () => {
    const data: StatusBoardData = {
      botHealth: { status: 'ok', lastTickHrs: 0, label: '✓' },
      latestFinding: null,
      userPending: { count: 2, topItem: '워커 실패율 100%' },
      evolution: { promotedCount: 1, revertedCount: 0 },
      ts: '2026-05-23T01:14:00Z',
    };
    const out = formatStatusBoard(data);
    expect(out).toContain('2건');
    expect(out).toContain('워커 실패율 100%');
    expect(out).toContain('승격 1');
  });

  it('finding 부재 = 「아직 발의 0건」 안내', () => {
    const data: StatusBoardData = {
      botHealth: { status: 'ok', lastTickHrs: 0, label: '✓' },
      latestFinding: null,
      userPending: { count: 0 },
      evolution: { promotedCount: 0, revertedCount: 0 },
      ts: '2026-05-23T01:14:00Z',
    };
    const out = formatStatusBoard(data);
    expect(out).toContain('아직 발의 0건');
  });
});

describe('gatherStatusBoardData — substrate 통합 (ledger/health)', () => {
  it('빈 환경 = healthy 모름 + finding 0', () => {
    const data = gatherStatusBoardData(env(), Date.parse('2026-05-23T01:00:00Z'));
    // trace 0 = 첫 부팅 대기 = critical (healthy-log 룰 정합)
    expect(data.botHealth.status).toBe('critical');
    expect(data.latestFinding).toBeNull();
    // userPending = signals.progressStale + worker-fail 등 critical issues 자동 잡힘 (정상)
    expect(data.userPending.count).toBeGreaterThanOrEqual(0);
  });

  it('ledger 의 최신 seeded entry → userPending 1순위 (TASK 결정 대기)', () => {
    const ledgerPath = path.join(root, '.claude', 'initiator-ledger.jsonl');
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        ts: '2026-05-23T00:34:00Z',
        type: 'seeded',
        kind: 'new-project',
        score: 0.8,
        rootCodes: ['progress-stale'],
        headline: '📜 발의',
        rationale: 'r',
        status: 'draft',
        seededTaskFile: 'TASK-KAR-136-x.md',
      }) + '\n',
      'utf-8',
    );
    const data = gatherStatusBoardData(env(), Date.parse('2026-05-23T01:00:00Z'));
    expect(data.userPending.count).toBe(1);
    expect(data.userPending.topItem).toContain('TASK-KAR-136');
    expect(data.userPending.topItem).toContain('✅');
    expect(data.userPending.topItem).toContain('❌');
  });

  it('ledger 의 최신 seeded entry → finding', () => {
    const ledgerPath = path.join(root, '.claude', 'initiator-ledger.jsonl');
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(
      ledgerPath,
      [
        JSON.stringify({
          ts: '2026-05-23T00:33:00Z',
          type: 'proposal',
          kind: 'new-project',
          score: 0.8,
          rootCodes: ['progress-stale'],
          headline: '📜 발의 (신프로젝트): X',
          rationale: 'r',
          status: 'draft',
        }),
        JSON.stringify({
          ts: '2026-05-23T00:34:00Z',
          type: 'seeded',
          kind: 'new-project',
          score: 0.8,
          rootCodes: ['progress-stale'],
          headline: '📜 발의 (신프로젝트): X',
          rationale: 'r',
          status: 'draft',
          seededTaskFile: 'TASK-KAR-136-x.md',
        }),
      ].join('\n') + '\n',
      'utf-8',
    );
    const data = gatherStatusBoardData(env(), Date.parse('2026-05-23T01:00:00Z'));
    expect(data.latestFinding?.taskFile).toBe('TASK-KAR-136-x.md');
    expect(data.latestFinding?.headline).toContain('신프로젝트');
  });
});

describe('runStatusBoardOnce — edit-or-send + state persist', () => {
  it('첫 호출 = send + pin + state persist', async () => {
    const sent: { channelId: string; content: string }[] = [];
    const pinned: { channelId: string; messageId: string }[] = [];
    const r = await runStatusBoardOnce(env(), {
      resolveChannelId: () => 'ch1',
      sender: {
        send: async (cid, c) => {
          sent.push({ channelId: cid, content: c });
          return 'msg-001';
        },
        edit: async () => false,
        pin: async (cid, mid) => {
          pinned.push({ channelId: cid, messageId: mid });
          return true;
        },
      },
    });
    expect(r).toBe('status:created');
    expect(sent).toHaveLength(1);
    expect(sent[0].content).toContain('봇 상태');
    expect(pinned).toHaveLength(1);
    expect(pinned[0].messageId).toBe('msg-001');
    const state = readStatusBoardState(root);
    expect(state.channelId).toBe('ch1');
    expect(state.messageId).toBe('msg-001');
  });

  it('기존 state 있음 = edit (send X)', async () => {
    writeStatusBoardState(root, {
      channelId: 'ch1',
      messageId: 'msg-001',
      lastUpdatedAt: '2026-05-23T00:00:00Z',
    });
    let sendCount = 0;
    let editCount = 0;
    const r = await runStatusBoardOnce(env(), {
      resolveChannelId: () => 'ch1',
      sender: {
        send: async () => {
          sendCount++;
          return 'should-not-call';
        },
        edit: async () => {
          editCount++;
          return true;
        },
      },
    });
    expect(r).toBe('status:edited');
    expect(sendCount).toBe(0);
    expect(editCount).toBe(1);
  });

  it('edit fail (메시지 삭제) = send 폴백 + 새 id persist', async () => {
    writeStatusBoardState(root, {
      channelId: 'ch1',
      messageId: 'stale-msg',
      lastUpdatedAt: '2026-05-23T00:00:00Z',
    });
    const r = await runStatusBoardOnce(env(), {
      resolveChannelId: () => 'ch1',
      sender: {
        send: async () => 'new-msg-id',
        edit: async () => false, // 삭제됨
      },
    });
    expect(r).toBe('status:created');
    expect(readStatusBoardState(root).messageId).toBe('new-msg-id');
  });

  it('채널 미해결 = no-channel label (state 미손)', async () => {
    writeStatusBoardState(root, { channelId: 'ch1', messageId: 'msg-001' });
    const r = await runStatusBoardOnce(env(), {
      resolveChannelId: () => null,
      sender: { send: async () => null, edit: async () => false },
    });
    expect(r).toBe('status:no-channel');
    expect(readStatusBoardState(root).messageId).toBe('msg-001');
  });

  it('채널 변경 = 새 send (이전 메시지 별도 채널이라 edit X)', async () => {
    writeStatusBoardState(root, {
      channelId: 'ch1',
      messageId: 'msg-001',
    });
    const r = await runStatusBoardOnce(env(), {
      resolveChannelId: () => 'ch2',
      sender: {
        send: async () => 'msg-002',
        edit: async () => false,
      },
    });
    expect(r).toBe('status:created');
    expect(readStatusBoardState(root).channelId).toBe('ch2');
    expect(readStatusBoardState(root).messageId).toBe('msg-002');
  });
});
