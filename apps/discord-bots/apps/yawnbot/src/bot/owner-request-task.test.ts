import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DOMAIN_TASK,
  nextTaskSeq,
  slugify,
  buildOwnerRequestTask,
} from './owner-request-task';

describe('DOMAIN_TASK — 도메인 → prefix/dir/machine', () => {
  it('각 도메인 매핑', () => {
    expect(DOMAIN_TASK.WM).toEqual({ prefix: 'WM', dir: 'wm/tasks', machine: 'cloud-wm' });
    expect(DOMAIN_TASK.KL.dir).toBe('projects/karmolab/tasks');
    expect(DOMAIN_TASK.YB.dir).toBe('projects/yawnbot/tasks');
    expect(DOMAIN_TASK.general.prefix).toBe('KAR'); // 폴백
  });
});

describe('slugify', () => {
  it('한글·영숫자 보존, 나머지 - / 40자 cap', () => {
    expect(slugify('마도서 UI 고치기')).toBe('마도서-ui-고치기');
    expect(slugify('  !!@@  ')).toBe('request'); // 빈 → 기본
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe('nextTaskSeq', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oreq-task-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('빈/부재 디렉토리 = 1', () => {
    expect(nextTaskSeq(dir, DOMAIN_TASK.WM)).toBe(1);
  });
  it('기존 최대 seq + 1', () => {
    fs.mkdirSync(path.join(dir, 'wm/tasks'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'wm/tasks/TASK-WM-005-x.md'), '');
    fs.writeFileSync(path.join(dir, 'wm/tasks/TASK-WM-012-y.md'), '');
    fs.writeFileSync(path.join(dir, 'wm/tasks/TASK-WM-003-z.md'), '');
    expect(nextTaskSeq(dir, DOMAIN_TASK.WM)).toBe(13);
  });
});

describe('buildOwnerRequestTask', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oreq-build-'));
    fs.mkdirSync(path.join(dir, 'wm/tasks'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('WM 요청 → TASK-WM-NNN seed (발화 인용 + machine + 경로)', () => {
    fs.writeFileSync(path.join(dir, 'wm/tasks/TASK-WM-191-x.md'), '');
    const task = buildOwnerRequestTask(dir, 'WM', '마도서 UI 고쳐줘', 'oreq-20260607-abc123');
    expect(task).not.toBeNull();
    expect(task!.id).toBe('TASK-WM-192');
    expect(task!.relPath).toContain('wm/tasks/TASK-WM-192');
    expect(task!.content).toContain('status: seed');
    expect(task!.content).toContain('machine: cloud-wm');
    // 품질게이트: 발화 인용 필수
    expect(task!.content).toContain('> 사용자 발화: "마도서 UI 고쳐줘"');
    expect(task!.content).toContain('담당 에이전트 = wm-scout');
  });

  it('general → KAR 폴백 디렉토리', () => {
    const task = buildOwnerRequestTask(dir, 'general', '뭔가 해줘', 'oreq-1');
    expect(task!.id).toContain('TASK-KAR-');
    expect(task!.relPath).toContain('tasks/TASK-KAR-');
  });

  it('따옴표 = 작은따옴표로 치환 (frontmatter 안전)', () => {
    const task = buildOwnerRequestTask(dir, 'WM', '이거 "중요"해', 'oreq-2');
    expect(task!.content).toContain("이거 '중요'해");
  });
});
