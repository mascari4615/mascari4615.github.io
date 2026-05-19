/**
 * TASK frontmatter `discord_thread` 영속 매핑 검증 (TASK-KAR-018-THR).
 *
 * 핵심 잠금: 봇 재기동(in-memory Map 소실) 시뮬 = write → *새* read 가
 * 같은 thread id 반환 → router 가 (b) 단계에서 즉시 short-circuit →
 * 중복 스레드 생성 0 (KAR-018-LT D2 churn fix). 순수(parse/upsert)
 * 전수 + IO round-trip. FS 격리 tmpdir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseThreadLink,
  upsertThreadLink,
  findTaskFile,
  readTaskThreadLink,
  writeTaskThreadLink,
} from './task-thread-link';

describe('parseThreadLink (순수)', () => {
  it('frontmatter discord_thread 값 추출', () => {
    const c = '---\nid: TASK-KAR-018-THR\ndiscord_thread: 1381\n---\n본문';
    expect(parseThreadLink(c)).toBe('1381');
  });
  it('따옴표/공백 제거', () => {
    expect(
      parseThreadLink('---\ndiscord_thread: "1381"  \n---\n'),
    ).toBe('1381');
  });
  it('키/frontmatter 없음 = null', () => {
    expect(parseThreadLink('---\nid: TASK-X\n---\n')).toBeNull();
    expect(parseThreadLink('frontmatter 없는 평문')).toBeNull();
  });
});

describe('upsertThreadLink (순수·결정적)', () => {
  it('키 없으면 frontmatter 끝에 추가 (본문 보존)', () => {
    const c = '---\nid: TASK-KAR-018-THR\nstatus: ready\n---\n\n## 목표\n내용';
    const out = upsertThreadLink(c, '1381');
    expect(out).toContain('discord_thread: 1381');
    expect(out).toContain('## 목표\n내용'); // 본문 무손실
    expect(parseThreadLink(out)).toBe('1381');
  });
  it('기존 키 있으면 교체 (중복 라인 X)', () => {
    const c = '---\nid: T\ndiscord_thread: 111\n---\nbody';
    const out = upsertThreadLink(c, '999');
    expect(out.match(/discord_thread:/g)?.length).toBe(1);
    expect(parseThreadLink(out)).toBe('999');
  });
  it('동일 값 = 무변경 (write 회피)', () => {
    const c = '---\nid: T\ndiscord_thread: 111\n---\nbody';
    expect(upsertThreadLink(c, '111')).toBe(c);
  });
  it('frontmatter 없으면 원본 그대로 (날조 X)', () => {
    const c = 'frontmatter 없는 파일';
    expect(upsertThreadLink(c, '1')).toBe(c);
  });
  it('CRLF 줄끝 보존', () => {
    const c = '---\r\nid: T\r\n---\r\nbody';
    const out = upsertThreadLink(c, '7');
    expect(out).toContain('discord_thread: 7');
    expect(out.includes('\r\n')).toBe(true);
  });
});

describe('find/read/write (IO · tmpdir)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrlink-'));
    fs.mkdirSync(path.join(root, 'tasks'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function writeTask(name: string, body: string) {
    fs.writeFileSync(path.join(root, 'tasks', name), body, 'utf-8');
  }

  it('파일명 prefix 로 KAR TASK 파일 발견', () => {
    writeTask(
      'TASK-KAR-018-THR-task별-스레드.md',
      '---\nid: TASK-KAR-018-THR\n---\nbody',
    );
    const abs = findTaskFile(root, 'TASK-KAR-018-THR');
    expect(abs).toContain('TASK-KAR-018-THR-task별-스레드.md');
  });

  it('파일명 비표준 → frontmatter id 폴백', () => {
    writeTask('weird-name.md', '---\nid: TASK-KAR-019\nstatus: seed\n---\nx');
    expect(findTaskFile(root, 'TASK-KAR-019')).toContain('weird-name.md');
  });

  it('제안 id(pXXX)·미존재 = null (write no-op)', () => {
    expect(findTaskFile(root, 'p42c94051')).toBeNull();
    expect(writeTaskThreadLink(root, 'p42c94051', '1')).toBe(false);
    expect(readTaskThreadLink(root, 'TASK-KAR-999')).toBeNull();
  });

  it('재기동 시뮬: write → 새 read 가 같은 id (중복생성 0 근거)', () => {
    writeTask(
      'TASK-KAR-018-THR-x.md',
      '---\nid: TASK-KAR-018-THR\nstatus: ready\n---\n\n## 목표\n원문 보존',
    );
    // 1차 봇 lifetime: 스레드 생성 후 기록
    expect(writeTaskThreadLink(root, 'TASK-KAR-018-THR', '1381000')).toBe(
      true,
    );
    // 재기동(Map 소실) — 디스크 기록만 남음 → (b) 단계 hit
    expect(readTaskThreadLink(root, 'TASK-KAR-018-THR')).toBe('1381000');
    // 본문 무손실 확인
    expect(
      fs.readFileSync(path.join(root, 'tasks', 'TASK-KAR-018-THR-x.md'), 'utf-8'),
    ).toContain('## 목표\n원문 보존');
  });

  it('write 멱등 (동일 id 재기록 = true·무변경)', () => {
    writeTask('TASK-KAR-020-a.md', '---\nid: TASK-KAR-020\n---\nb');
    writeTaskThreadLink(root, 'TASK-KAR-020', '42');
    const after1 = fs.readFileSync(
      path.join(root, 'tasks', 'TASK-KAR-020-a.md'),
      'utf-8',
    );
    expect(writeTaskThreadLink(root, 'TASK-KAR-020', '42')).toBe(true);
    expect(
      fs.readFileSync(
        path.join(root, 'tasks', 'TASK-KAR-020-a.md'),
        'utf-8',
      ),
    ).toBe(after1);
  });
});
