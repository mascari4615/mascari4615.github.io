/**
 * 같이 쓴 글 원장 (TASK-KL-191 축2).
 *
 * 여기가 틀리면 사고가 조용하다: 늦게 도착한 저장이 앞선 글을 되돌리거나, 빈 칸 하나가
 * 문서를 통째로 지운다. 둘 다 화면에는 「방금 쓴 게 사라졌다」로만 보인다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabCoDocStore, TEXT_MAX, DOCS_MAX } from './karmolab-codocs';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl191-'));
  statePath = path.join(tmpDir, 'codocs.json');
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('같이 쓴 글 원장 (KL-191 축2)', () => {
  it('저장하고 다시 열어도 남는다 — 방을 나가도 글은 산다', () => {
    const first = new KarmolabCoDocStore(statePath);
    first.put('memo:field', '같이 쓴 글');
    const again = new KarmolabCoDocStore(statePath);
    expect(again.get('memo:field')!.text).toBe('같이 쓴 글');
  });

  it('없는 문서는 없다고 한다 — 빈 글을 지어내지 않는다', () => {
    expect(new KarmolabCoDocStore(statePath).get('memo:none')).toBeNull();
  });

  it('낡은 저장이 새 글을 못 덮는다', () => {
    const store = new KarmolabCoDocStore(statePath);
    const v1 = store.put('memo:field', '첫 줄')!;
    const v2 = store.put('memo:field', '첫 줄 · 둘째 줄', v1.version)!;
    expect(v2.version).toBe(2);
    // 판 1 을 보고 쓴 저장이 뒤늦게 도착 — 되돌리면 안 된다
    const late = store.put('memo:field', '첫 줄', v1.version - 1)!;
    expect(late.text).toBe('첫 줄 · 둘째 줄');
    expect(late.version).toBe(2);
  });

  it('빈 글이 쓴 글을 못 덮는다 — 지우려면 지운다고 말해야 한다', () => {
    const store = new KarmolabCoDocStore(statePath);
    store.put('memo:field', '살아 있는 글');
    expect(store.put('memo:field', '   ')!.text).toBe('살아 있는 글');
    expect(store.clear('memo:field')).toBe(true);
    expect(store.get('memo:field')).toBeNull();
  });

  it('너무 긴 글은 안 받는다', () => {
    const store = new KarmolabCoDocStore(statePath);
    expect(store.put('memo:field', 'ㅁ'.repeat(TEXT_MAX + 1))).toBeNull();
    expect(store.get('memo:field')).toBeNull();
  });

  it('문서 이름은 좁게 — 주소에 그대로 들어간다', () => {
    expect(KarmolabCoDocStore.idOf('memo', 'field-1')).toBe('memo:field-1');
    expect(KarmolabCoDocStore.idOf('../etc', 'x')).toBeNull();
    expect(KarmolabCoDocStore.idOf('memo', 'a/b')).toBeNull();
    expect(KarmolabCoDocStore.idOf('', '')).toBeNull();
  });

  it('넘치면 가장 오래 안 만진 것부터 버린다', () => {
    const store = new KarmolabCoDocStore(statePath);
    for (let i = 0; i < DOCS_MAX + 5; i += 1) {
      store.put(`room${i}:field`, `글 ${i}`);
    }
    expect(store.stats().docs).toBe(DOCS_MAX);
    expect(store.get('room0:field')).toBeNull();       // 가장 오래된 것
    expect(store.get(`room${DOCS_MAX + 4}:field`)).not.toBeNull(); // 가장 최근 것
  });
});
