/**
 * TASK-KL-195 — 자랑 카드 유입 원장 시험.
 *
 * 여기서 중요한 것: **0 을 늘어놓지 않는 것**과 날이 바뀌면 다른 줄이 되는 것.
 * 아무 일 없던 날에 0 을 채워 넣으면 표가 0 으로 덮여 진짜 움직인 날이 안 보인다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabBragStore, kstDay } from './karmolab-brag';

let file: string;
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl195-'));
  file = path.join(tmp, 'brag.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const at = (day: string): Date => new Date(`${day}T03:00:00.000Z`);

describe('자랑 유입 셈', () => {
  it('펼쳐 본 수와 넘어온 수를 따로 센다', () => {
    const store = new KarmolabBragStore(file);
    store.view(at('2026-08-08'));
    store.view(at('2026-08-08'));
    store.click(at('2026-08-08'));
    expect(store.total()).toEqual({ views: 2, clicks: 1 });
  });

  it('날이 다르면 줄이 갈린다', () => {
    const store = new KarmolabBragStore(file);
    store.view(at('2026-08-07'));
    store.view(at('2026-08-08'));
    const recent = store.recent(14, at('2026-08-08'));
    expect(recent.map((r) => r.day)).toEqual(['2026-08-08', '2026-08-07']);
  });

  it('아무 일 없던 날은 줄 자체가 없다', () => {
    const store = new KarmolabBragStore(file);
    store.view(at('2026-08-01'));
    store.view(at('2026-08-08'));
    expect(store.recent(14, at('2026-08-08')).length).toBe(2);
  });

  it('파일로 이어진다 — 서버가 재시작해도 수가 안 사라진다', () => {
    new KarmolabBragStore(file).view(at('2026-08-08'));
    expect(new KarmolabBragStore(file).total().views).toBe(1);
  });

  it('오래된 날은 버린다 (90일)', () => {
    const store = new KarmolabBragStore(file);
    for (let i = 0; i < 95; i++) {
      const day = new Date(Date.UTC(2026, 0, 1) + i * 86400e3).toISOString().slice(0, 10);
      store.view(at(day));
    }
    expect(store.recent(200).length).toBe(90);
  });

  it('KST 자정 직후는 이미 다음 날이다', () => {
    expect(kstDay(new Date('2026-08-08T15:30:00.000Z'))).toBe('2026-08-09');
  });
});
