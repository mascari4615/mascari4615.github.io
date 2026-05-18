// agent-thread-store 전수검증 (TASK-KAR-018-THR). 순수 파서 +
// FS 격리(tmpdir) IO. Discord 무관.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  prefixOfTaskId,
  normalizeTaskId,
  parseThreadValue,
  readThreadFromFrontmatter,
  upsertThreadInFrontmatter,
  parseFrontmatterId,
  findTaskFile,
  readTaskThreadId,
  writeTaskThreadId,
} from './agent-thread-store';

describe('prefixOfTaskId / normalizeTaskId (순수)', () => {
  it('prefix 추출', () => {
    expect(prefixOfTaskId('TASK-KAR-018-THR')).toBe('KAR');
    expect(prefixOfTaskId('TASK-KL-071')).toBe('KL');
    expect(prefixOfTaskId('not-a-task')).toBeNull();
  });
  it('id 정규화 — TASK- 접두/대소문자 흡수', () => {
    expect(normalizeTaskId('TASK-KAR-018-THR')).toBe('KAR-018-THR');
    expect(normalizeTaskId(' kar-018-thr ')).toBe('KAR-018-THR');
  });
});

describe('parseThreadValue (순수 — id 또는 url)', () => {
  it('생 snowflake', () => {
    expect(parseThreadValue('1234567890')).toBe('1234567890');
  });
  it('discord url 끝 id', () => {
    expect(
      parseThreadValue('https://discord.com/channels/111/9876543210'),
    ).toBe('9876543210');
  });
  it('따옴표/공백 흡수, 비숫자=null', () => {
    expect(parseThreadValue('  "555555"  ')).toBe('555555');
    expect(parseThreadValue('')).toBeNull();
    expect(parseThreadValue(null)).toBeNull();
    expect(parseThreadValue('none')).toBeNull();
  });
});

describe('frontmatter read/upsert (순수·결정적)', () => {
  const base = `---\nid: TASK-KAR-018-THR\nstatus: seed\n---\n\n## 본문\n`;

  it('discord_thread 없으면 null, 있으면 추출', () => {
    expect(readThreadFromFrontmatter(base)).toBeNull();
    expect(
      readThreadFromFrontmatter(
        `---\nid: x\ndiscord_thread: 42424242\n---\n`,
      ),
    ).toBe('42424242');
  });

  it('upsert — 없으면 닫는 --- 직전 삽입(멱등 read 라운드트립)', () => {
    const out = upsertThreadInFrontmatter(base, '700700700');
    expect(out).not.toBeNull();
    expect(readThreadFromFrontmatter(out as string)).toBe('700700700');
    expect(out).toContain('## 본문'); // 본문 보존
  });

  it('upsert — 기존 줄 교체(중복 안 늘림)', () => {
    const withOld = `---\nid: x\ndiscord_thread: 11111\n---\n본문`;
    const out = upsertThreadInFrontmatter(withOld, '22222') as string;
    expect(readThreadFromFrontmatter(out)).toBe('22222');
    expect(out.match(/discord_thread:/g)?.length).toBe(1);
  });

  it('frontmatter 블록 없으면 null (미손상 — write skip 신호)', () => {
    expect(upsertThreadInFrontmatter('no frontmatter here', '1')).toBeNull();
  });

  it('parseFrontmatterId — 따옴표 흡수', () => {
    expect(parseFrontmatterId(base)).toBe('TASK-KAR-018-THR');
    expect(parseFrontmatterId(`---\nid: "WM-9"\n---`)).toBe('WM-9');
  });
});

describe('findTaskFile / read / write (IO — tmpdir)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'thr-'));
  });

  function writeTask(rel: string, fm: string): void {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `---\n${fm}\n---\n\n## 본문\n`, 'utf-8');
  }

  it('KAR → tasks/ 폴더, frontmatter id 정확 일치 (서브 오매치 방지)', () => {
    writeTask('tasks/TASK-KAR-018-slug.md', 'id: TASK-KAR-018');
    writeTask('tasks/TASK-KAR-018-THR-slug.md', 'id: TASK-KAR-018-THR');
    const f = findTaskFile(root, 'TASK-KAR-018-THR');
    expect(f && path.basename(f)).toBe('TASK-KAR-018-THR-slug.md');
    const parent = findTaskFile(root, 'TASK-KAR-018');
    expect(parent && path.basename(parent)).toBe('TASK-KAR-018-slug.md');
  });

  it('WM → wm/tasks/ 폴더 (DOMAIN_MAP 정본 재사용)', () => {
    writeTask('wm/tasks/TASK-WM-200-x.md', 'id: TASK-WM-200');
    expect(findTaskFile(root, 'TASK-WM-200')).toContain(
      path.join('wm', 'tasks'),
    );
  });

  it('없으면 null (견고)', () => {
    expect(findTaskFile(root, 'TASK-KAR-999')).toBeNull();
    expect(readTaskThreadId(root, 'TASK-KAR-999')).toBeNull();
    expect(writeTaskThreadId(root, 'TASK-KAR-999', '1')).toBe(false);
  });

  it('write-back → read 라운드트립 + 멱등', () => {
    writeTask('tasks/TASK-KAR-018-THR-s.md', 'id: TASK-KAR-018-THR');
    expect(readTaskThreadId(root, 'TASK-KAR-018-THR')).toBeNull();
    expect(writeTaskThreadId(root, 'TASK-KAR-018-THR', '900900900')).toBe(
      true,
    );
    expect(readTaskThreadId(root, 'TASK-KAR-018-THR')).toBe('900900900');
    // 멱등: 동일 값 재기록 = true, 파일 1줄 유지
    expect(writeTaskThreadId(root, 'TASK-KAR-018-THR', '900900900')).toBe(
      true,
    );
    const c = fs.readFileSync(
      path.join(root, 'tasks/TASK-KAR-018-THR-s.md'),
      'utf-8',
    );
    expect(c.match(/discord_thread:/g)?.length).toBe(1);
  });
});
