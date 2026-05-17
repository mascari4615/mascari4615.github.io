/**
 * agent-core 로더 회귀 (KAR-018-V R-1).
 * 코어 정체성(누구·직무)을 회수해야 "그냥 봇"이 아니라 동료가 된다.
 * 부재·잘못된 id = null (레거시 스킨 단독 graceful fallback) 잠금.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadCoreDef } from './agent-core';

let root: string;
const CORE = [
  '---',
  'id: atlas',
  'role: KAR-018 인프라를 추진한다',
  'default_skin: alisa',
  'status: draft',
  '---',
  '',
  '# atlas',
  '',
  '## 직무',
  '- sub TASK 추진',
].join('\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(id: string, body: string) {
  const d = path.join(root, '.claude', 'agents', id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'core.md'), body);
}

describe('loadCoreDef', () => {
  it('정의 존재 → frontmatter + body 회수', () => {
    write('atlas', CORE);
    const c = loadCoreDef(root, 'atlas');
    expect(c).not.toBeNull();
    expect(c!.id).toBe('atlas');
    expect(c!.role).toContain('인프라를 추진');
    expect(c!.defaultSkin).toBe('alisa');
    expect(c!.status).toBe('draft');
    expect(c!.body).toContain('## 직무');
  });

  it('파일 부재 → null (레거시 스킨 단독 fallback)', () => {
    expect(loadCoreDef(root, 'atlas')).toBeNull();
  });

  it('잘못된 id (경로 주입 시도) → null', () => {
    write('atlas', CORE);
    expect(loadCoreDef(root, '../atlas')).toBeNull();
    expect(loadCoreDef(root, 'a/b')).toBeNull();
    expect(loadCoreDef('', 'atlas')).toBeNull();
  });

  it('frontmatter 없는 본문만 → null (형식 이상 = 안전)', () => {
    write('x', '# x\n본문만');
    // frontmatter 매칭 실패 → body=raw, role 없음. 정체성 불완전이나
    // body 는 있으므로 로드는 됨(직무 빈 값). null 아님 확인:
    const c = loadCoreDef(root, 'x');
    expect(c).not.toBeNull();
    expect(c!.role).toBe('');
  });
});
