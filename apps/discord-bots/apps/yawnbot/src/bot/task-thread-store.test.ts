// TASK↔스레드 영속 store 전수검증 (KAR-018-THR). FS 격리 tmpdir.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  findTaskFile,
  readTaskThread,
  writeTaskThread,
  parseThreadRef,
  taskFolderForId,
} from './task-thread-store';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrstore-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function writeTask(folder: string, file: string, fm: string[]) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, file),
    ['---', ...fm, '---', '', '## 목표', '', '본문'].join('\n'),
    'utf-8',
  );
  return path.join(dir, file);
}

describe('parseThreadRef (순수)', () => {
  it('raw snowflake', () => {
    expect(parseThreadRef('1234567890')).toBe('1234567890');
  });
  it('discord url → thread id', () => {
    expect(
      parseThreadRef('https://discord.com/channels/111/2223334445'),
    ).toBe('2223334445');
  });
  it('빈/잡값 = null', () => {
    expect(parseThreadRef('')).toBeNull();
    expect(parseThreadRef('abc')).toBeNull();
    expect(parseThreadRef(undefined)).toBeNull();
  });
});

describe('taskFolderForId — prefix → 폴더', () => {
  it('KAR → tasks, KL → projects/karmolab/tasks', () => {
    expect(taskFolderForId(root, 'TASK-KAR-018-THR')).toBe(
      path.join(root, 'tasks'),
    );
    expect(taskFolderForId(root, 'TASK-KL-071')).toBe(
      path.join(root, 'projects/karmolab/tasks'),
    );
  });
  it('비-TASK(pXXX 제안) / 미지 prefix = null (파일영속 미적용)', () => {
    expect(taskFolderForId(root, 'p42c94051')).toBeNull();
    expect(taskFolderForId(root, 'TASK-ZZZ-1')).toBeNull();
    expect(taskFolderForId('', 'TASK-KAR-1')).toBeNull();
  });
});

describe('findTaskFile — frontmatter id 정확매칭', () => {
  it('파일명 prefix 무관, id: 로 찾음', () => {
    writeTask('tasks', 'TASK-KAR-018-THR-아무이름.md', [
      'id: TASK-KAR-018-THR',
      'status: seed',
    ]);
    const f = findTaskFile(root, 'TASK-KAR-018-THR');
    expect(f).not.toBeNull();
    expect(fs.readFileSync(f!, 'utf-8')).toContain('id: TASK-KAR-018-THR');
  });
  it('부분일치(접두 충돌) 오매칭 X — id 정확매칭', () => {
    writeTask('tasks', 'TASK-KAR-018.md', ['id: TASK-KAR-018']);
    writeTask('tasks', 'TASK-KAR-018-THR-x.md', ['id: TASK-KAR-018-THR']);
    expect(findTaskFile(root, 'TASK-KAR-018')).toContain('TASK-KAR-018.md');
    expect(findTaskFile(root, 'TASK-KAR-018-THR')).toContain(
      'TASK-KAR-018-THR-x.md',
    );
  });
  it('없으면 null', () => {
    expect(findTaskFile(root, 'TASK-KAR-999')).toBeNull();
  });
});

describe('read/writeTaskThread — frontmatter 영속 (멱등)', () => {
  it('기록 없으면 read=null, write 후 read=id (삽입)', () => {
    writeTask('tasks', 'TASK-KAR-018-THR-x.md', ['id: TASK-KAR-018-THR']);
    expect(readTaskThread(root, 'TASK-KAR-018-THR')).toBeNull();
    expect(writeTaskThread(root, 'TASK-KAR-018-THR', '999000111222')).toBe(
      true,
    );
    expect(readTaskThread(root, 'TASK-KAR-018-THR')).toBe('999000111222');
    // frontmatter 안에 삽입(본문 오염 X)
    const src = fs.readFileSync(
      findTaskFile(root, 'TASK-KAR-018-THR')!,
      'utf-8',
    );
    expect(src.indexOf('discord_thread:')).toBeLessThan(src.indexOf('---', 4));
    expect(src).toContain('## 목표'); // 본문 보존
  });

  it('기존 값 교체 (멱등 — 중복 라인 0)', () => {
    writeTask('tasks', 'TASK-KAR-1-x.md', [
      'id: TASK-KAR-1',
      'discord_thread: 111',
    ]);
    expect(writeTaskThread(root, 'TASK-KAR-1', '222333444555')).toBe(true);
    const src = fs.readFileSync(findTaskFile(root, 'TASK-KAR-1')!, 'utf-8');
    expect((src.match(/discord_thread:/g) || []).length).toBe(1);
    expect(readTaskThread(root, 'TASK-KAR-1')).toBe('222333444555');
    // 같은 값 재기록 = 멱등 true, 변화 0
    const before = fs.readFileSync(findTaskFile(root, 'TASK-KAR-1')!, 'utf-8');
    expect(writeTaskThread(root, 'TASK-KAR-1', '222333444555')).toBe(true);
    expect(fs.readFileSync(findTaskFile(root, 'TASK-KAR-1')!, 'utf-8')).toBe(
      before,
    );
  });

  it('url 기록도 read 로 정규화', () => {
    writeTask('tasks', 'TASK-KAR-2-x.md', [
      'id: TASK-KAR-2',
      'discord_thread: https://discord.com/channels/1/789789789',
    ]);
    expect(readTaskThread(root, 'TASK-KAR-2')).toBe('789789789');
  });

  it('TASK 파일/폴더 없으면 write=false (날조 X)', () => {
    expect(writeTaskThread(root, 'TASK-KAR-404', '123456')).toBe(false);
    expect(writeTaskThread(root, 'p42c94051', '123456')).toBe(false);
  });
});
