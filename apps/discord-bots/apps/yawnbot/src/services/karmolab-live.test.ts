/**
 * TASK-KL-196 G — 「방금 열린 도구」 시험.
 *
 * 중요한 것: **오래된 것을 「방금」이라고 부르지 않는 것**. 어제 열린 도구를 실황에 올리면
 * 그건 북적임이 아니라 거짓이다. 그리고 새로 적는 것이 없어야 한다 — 이 목록은 이미 적고
 * 있는 「마지막으로 열린 시각」에서만 나온다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabTraceStore } from './karmolab-traces';

let tmp: string;
let file: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl196g-'));
  file = path.join(tmp, 'traces.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const store = (): KarmolabTraceStore => new KarmolabTraceStore(file);

describe('방금 열린 도구', () => {
  it('최근에 열린 것부터 준다', () => {
    const s = store();
    s.recordToolOpen('charcount', 'a', new Date('2026-08-08T01:00:00Z'));
    s.recordToolOpen('passgen', 'b', new Date('2026-08-08T02:00:00Z'));
    const rows = s.recentlyOpened(8, new Date('2026-08-08T02:30:00Z'));
    expect(rows.map((r) => r.toolId)).toEqual(['passgen', 'charcount']);
  });

  it('오래된 것은 안 준다 — 어제 것을 「방금」이라 부르지 않는다', () => {
    const s = store();
    s.recordToolOpen('charcount', 'a', new Date('2026-08-07T01:00:00Z'));
    expect(s.recentlyOpened(8, new Date('2026-08-08T02:00:00Z'))).toEqual([]);
  });

  it('한 도구는 한 번만 나온다 — 사건 기록이 아니라 마지막 시각이다', () => {
    const s = store();
    s.recordToolOpen('charcount', 'a', new Date('2026-08-08T01:00:00Z'));
    s.recordToolOpen('charcount', 'b', new Date('2026-08-08T01:30:00Z'));
    const rows = s.recentlyOpened(8, new Date('2026-08-08T02:00:00Z'));
    expect(rows.length).toBe(1);
    expect(rows[0].at).toBe(new Date('2026-08-08T01:30:00Z').toISOString());
  });

  it('개수는 넘겨받되 터무니없는 값은 잘라 쓴다', () => {
    const s = store();
    for (let i = 0; i < 40; i++) {
      s.recordToolOpen(`tool${i}`, 'a', new Date(`2026-08-08T01:00:00Z`));
    }
    expect(s.recentlyOpened(999, new Date('2026-08-08T02:00:00Z')).length).toBe(30);
    expect(s.recentlyOpened(0, new Date('2026-08-08T02:00:00Z')).length).toBe(1);
  });

  it('아무도 안 열었으면 빈 목록 — 0 을 지어내지 않는다', () => {
    expect(store().recentlyOpened(8, new Date())).toEqual([]);
  });
});
