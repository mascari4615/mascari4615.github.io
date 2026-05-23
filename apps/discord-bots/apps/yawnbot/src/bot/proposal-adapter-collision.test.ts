/**
 * materializeTaskProposal ID-collision race fix 회귀.
 *
 * 발단: TASK-KAR-119 race (legit pulse-dashboard + surgery dup 같은 ID, slug
 * 다름 → filename-only nextTaskId 통과해 같은 frontmatter id 박힘). fix =
 * frontmatter id scan + wx atomic write + 5-retry exclude tried IDs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { materializeTaskProposal } from './proposal-adapter';

let root: string;
function env() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}
function writePreExisting(folder: string, file: string, id: string) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, file),
    `---\nid: ${id}\nstatus: seed\n---\n## body\n`,
    'utf-8',
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'matzz-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ }
});

describe('materializeTaskProposal — race-safe ID 할당', () => {
  it('legit-119 다른 slug 존재 시 새 발의는 KAR-120 박음 (filename-only fallback 회귀)', () => {
    // legit: 다른 slug, 같은 prefix-NNN 패턴 존재
    writePreExisting('tasks', 'TASK-KAR-119-legit-pulse.md', 'TASK-KAR-119');
    const abs = materializeTaskProposal(env(), {
      title: '신규 발의',
      body: 'body',
      domain: 'kar',
    });
    expect(abs).not.toBeNull();
    const filename = path.basename(abs!);
    expect(filename.startsWith('TASK-KAR-120-')).toBe(true);
  });

  it('legit-119 가 *다른 slug + filename 만 다름* 일 때도 ID 충돌 미발생 (frontmatter id scan)', () => {
    // edge: 누군가 filename 을 잘못 슬러그해 TASK-KAR-119 가 아닌 X 박혔는데
    // 본문 id 만 TASK-KAR-119 인 케이스 (사람 손편집 사고). filename-only scan
    // 이면 119 미발견 → race 가 119 박음 = corruption. frontmatter scan = 차단.
    writePreExisting('tasks', 'TASK-OTHER-slug-by-mistake.md', 'TASK-KAR-119');
    const abs = materializeTaskProposal(env(), {
      title: '신규',
      body: 'body',
      domain: 'kar',
    });
    expect(abs).not.toBeNull();
    const fm = fs.readFileSync(abs!, 'utf-8').match(/^id:\s*(\S+)/m);
    // 새 id 가 119 보다 커야 (collision 회피)
    const newNum = Number(fm![1].replace('TASK-KAR-', ''));
    expect(newNum).toBeGreaterThan(119);
  });

  it('frontmatter id scan 이 기존 119+120 다 발견 → 새 발의 = 121+', () => {
    // 119, 120 둘 다 존재 = 같은 prefix 다른 slug. nextTaskId 가 frontmatter
    // 까지 scan → max=120 발견 → next=121 박음.
    writePreExisting('tasks', 'TASK-KAR-119-legit.md', 'TASK-KAR-119');
    writePreExisting('tasks', 'TASK-KAR-120-other.md', 'TASK-KAR-120');
    const abs = materializeTaskProposal(env(), {
      title: 'x',
      body: 'body',
      domain: 'kar',
    });
    expect(abs).not.toBeNull();
    const fm = fs.readFileSync(abs!, 'utf-8').match(/^id:\s*(\S+)/m);
    const newNum = Number(fm![1].replace('TASK-KAR-', ''));
    expect(newNum).toBeGreaterThanOrEqual(121);
  });
});
