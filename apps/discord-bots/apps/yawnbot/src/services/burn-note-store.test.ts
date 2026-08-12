/**
 * 사라지는 쪽지 곳간 — 「한 번」이 진짜 한 번인가 (TASK-KL-251).
 *
 * 이 도구에서 무너지면 안 되는 것은 셋이다: 두 번째 읽기가 실패해야 하고, 아무도 안 읽어도
 * 언젠가 사라져야 하고, 있는지 없는지가 남에게 새어 나가면 안 된다.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BurnNoteStore, MAX_BODY, TTL_MS } from './burn-note-store';

const tmp = () => path.join(os.tmpdir(), `burn-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

function store(now = () => Date.now()) {
  const p = tmp();
  const s = new BurnNoteStore(p, now);
  return { s, p, clean: () => fs.rmSync(p, { force: true }) };
}

describe('맡기기', () => {
  it('맡기면 주소에 쓸 이름을 준다', () => {
    const { s, clean } = store();
    const got = s.put('AAAA');
    expect('id' in got && got.id.length).toBeGreaterThan(20);
    clean();
  });

  it('이름은 매번 다르다 — 짧거나 뻔하면 남의 쪽지를 찍어 맞힐 수 있다', () => {
    const { s, clean } = store();
    const ids = new Set(Array.from({ length: 50 }, () => (s.put('x') as { id: string }).id));
    expect(ids.size).toBe(50);
    clean();
  });

  it('빈 것은 안 받는다', () => {
    const { s, clean } = store();
    expect(s.put('')).toEqual({ error: 'empty' });
    clean();
  });

  it('너무 큰 것은 안 받는다 — 여기는 파일 보관소가 아니다', () => {
    const { s, clean } = store();
    expect(s.put('x'.repeat(MAX_BODY + 1))).toEqual({ error: 'too-large' });
    clean();
  });
});

describe('읽기가 곧 지우기', () => {
  it('한 번은 열린다', () => {
    const { s, clean } = store();
    const { id } = s.put('비밀덩어리') as { id: string };
    expect(s.take(id)?.body).toBe('비밀덩어리');
    clean();
  });

  it('두 번째는 없다', () => {
    const { s, clean } = store();
    const { id } = s.put('비밀덩어리') as { id: string };
    s.take(id);
    expect(s.take(id)).toBeNull();
    clean();
  });

  it('없는 이름도 그냥 없다 — 「있었다」는 사실조차 새어 나가면 안 된다', () => {
    const { s, clean } = store();
    expect(s.take('없는이름')).toBeNull();
    clean();
  });

  it('꺼낸 뒤에는 곳간에서도 사라진다', () => {
    const { s, clean } = store();
    const { id } = s.put('x') as { id: string };
    expect(s.count).toBe(1);
    s.take(id);
    expect(s.count).toBe(0);
    clean();
  });
});

describe('아무도 안 읽어도 사라진다', () => {
  it('7일이 지나면 없다', () => {
    let now = 1_000_000;
    const { s, clean } = store(() => now);
    const { id } = s.put('x') as { id: string };
    now += TTL_MS + 1;
    expect(s.take(id)).toBeNull();
    clean();
  });

  it('7일 안이면 남아 있다', () => {
    let now = 1_000_000;
    const { s, clean } = store(() => now);
    const { id } = s.put('x') as { id: string };
    now += TTL_MS - 1000;
    expect(s.take(id)?.body).toBe('x');
    clean();
  });

  it('맡길 때마다 낡은 것을 함께 쓸어낸다 — 따로 청소부를 두지 않는다', () => {
    let now = 1_000_000;
    const { s, clean } = store(() => now);
    s.put('old');
    expect(s.count).toBe(1);
    now += TTL_MS + 1;
    const fresh = s.put('new') as { id: string };
    // 새로 맡기는 그 순간 낡은 것이 이미 사라졌다
    expect(s.count).toBe(1);
    expect(s.peek(fresh.id)).toBe(true);
    // 그래서 뒤이은 청소는 더 치울 것이 없다
    expect(s.sweep()).toBe(0);
    clean();
  });
});

describe('다시 켜도 남는다', () => {
  it('파일에 적어 두고 새로 열어도 읽힌다', () => {
    const p = tmp();
    const a = new BurnNoteStore(p);
    const { id } = a.put('살아남을 것') as { id: string };
    const b = new BurnNoteStore(p);
    expect(b.take(id)?.body).toBe('살아남을 것');
    /* 그리고 그 뒤에는 정말 사라져야 한다 — 파일에도 안 남는다. */
    const c = new BurnNoteStore(p);
    expect(c.take(id)).toBeNull();
    fs.rmSync(p, { force: true });
  });

  it('파일이 깨져 있으면 빈 곳간으로 시작한다', () => {
    const p = tmp();
    fs.writeFileSync(p, '{{{망가진', 'utf-8');
    const s = new BurnNoteStore(p);
    expect(s.count).toBe(0);
    fs.rmSync(p, { force: true });
  });
});
