/**
 * TASK-KL-098 — 백업 시험.
 *
 * 왜 있나: 실서비스에서 **사본은 쌓이는데 하나도 안 세어지고 있었다.** 만드는 이름과 찾는
 * 모양이 어긋났는데, 로그도 오류도 안 났다 — 「백업 0벌」이라는 숫자만 조용히 틀렸다.
 * 그러면 정작 되돌려야 할 때 아무것도 없다.
 *
 * 그래서 여기서는 **만든 것을 도로 찾을 수 있는가**를 먼저 본다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kl098-backup-'));
  fs.mkdirSync(path.join(tmpRoot, 'data'), { recursive: true });
  // 백업은 패키지 루트 밑의 `data/` 를 본다 — 시험에서는 임시 폴더를 가리키게 한다.
  vi.doMock('../paths', () => ({ PKG_ROOT: tmpRoot }));
});

afterEach(() => {
  vi.resetModules();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function load() {
  return import('./karmolab-backup');
}

function writeState(name: string, body: string): void {
  fs.writeFileSync(path.join(tmpRoot, 'data', name), body, 'utf-8');
}

describe('백업', () => {
  it('만든 사본을 도로 찾는다 — 이 시험이 없어서 0벌로 보였다', async () => {
    const { runBackup, backupInfo } = await load();
    writeState('karmolab-accounts-state.json', '{"a":1}');

    const made = runBackup(new Date('2026-08-07T15:09:27.000Z'));
    expect(made).toBe('20260807-150927-' + made?.split('-')[2]);

    const info = backupInfo();
    expect(info.count).toBe(1);
    expect(info.lastAt).toBe('2026-08-07T15:09:27Z');
  });

  it('내용이 그대로면 새 사본을 안 만든다', async () => {
    const { runBackup, backupInfo } = await load();
    writeState('karmolab-accounts-state.json', '{"a":1}');
    expect(runBackup(new Date('2026-08-07T01:00:00Z'))).not.toBeNull();
    expect(runBackup(new Date('2026-08-07T02:00:00Z'))).toBeNull();
    expect(backupInfo().count).toBe(1);
  });

  it('내용이 바뀌면 새 사본을 만든다', async () => {
    const { runBackup, backupInfo } = await load();
    writeState('karmolab-accounts-state.json', '{"a":1}');
    runBackup(new Date('2026-08-07T01:00:00Z'));
    writeState('karmolab-accounts-state.json', '{"a":2}');
    expect(runBackup(new Date('2026-08-07T02:00:00Z'))).not.toBeNull();
    expect(backupInfo().count).toBe(2);
  });

  it('사본 안에 진짜 내용이 들어 있다 — 빈 폴더만 만들면 되돌릴 수 없다', async () => {
    const { runBackup } = await load();
    writeState('karmolab-traces-state.json', '{"posts":["글"]}');
    const made = runBackup(new Date('2026-08-07T01:00:00Z'))!;
    const copied = fs.readFileSync(
      path.join(tmpRoot, 'data', 'backups', made, 'karmolab-traces-state.json'),
      'utf-8',
    );
    expect(copied).toBe('{"posts":["글"]}');
  });

  it('상태 파일이 하나도 없으면 아무것도 안 만든다', async () => {
    const { runBackup, backupInfo } = await load();
    expect(runBackup()).toBeNull();
    expect(backupInfo()).toEqual({ lastAt: null, count: 0 });
  });

  it('손으로도 바로 뜬다 — 주기를 기다리지 않고 확인할 수 있어야 한다', async () => {
    const { triggerBackupNow } = await load();
    writeState('karmolab-accounts-state.json', '{"a":1}');
    const outcome = triggerBackupNow();
    expect(outcome.made).not.toBeNull();
    expect(outcome.info.count).toBe(1);
  });
});
