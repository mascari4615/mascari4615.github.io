/**
 * 도구 흐름 원장 (TASK-KL-181).
 *
 * 여기가 틀리면 남에게 준 흐름이 조용히 달라지거나, 지운 계정과 함께 남의 흐름이 사라진다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabFlowStore, STEP_MAX } from './karmolab-flows';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl181-'));
  statePath = path.join(tmpDir, 'flows.json');
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const steps = [{ toolId: 'pdfmerge' }, { toolId: 'pdfsqueeze', note: '용량 줄이기' }];

describe('흐름 원장 (KL-181)', () => {
  it('만들고 다시 열어도 남는다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: '문서 정리', steps })!;
    expect(flow.steps).toHaveLength(2);
    expect(new KarmolabFlowStore(statePath).get(flow.id)?.title).toBe('문서 정리');
  });

  it('빈 흐름·이름 없는 흐름은 안 만든다', () => {
    const store = new KarmolabFlowStore(statePath);
    expect(store.create('karmo', { title: '이름만', steps: [] })).toBeNull();
    expect(store.create('karmo', { title: '', steps })).toBeNull();
  });

  it('이상한 도구 id 는 버리고, 단계는 8개까지만 담는다', () => {
    const store = new KarmolabFlowStore(statePath);
    const many = Array.from({ length: 12 }, (_, i) => ({ toolId: `tool${i}` }));
    const flow = store.create('karmo', { title: '많이', steps: [...many, { toolId: '<script>' }] })!;
    expect(flow.steps).toHaveLength(STEP_MAX);
    expect(JSON.stringify(flow)).not.toContain('script');
  });

  it('남의 흐름은 못 고치고 못 지운다 — 담아서 자기 것으로 만든 뒤 고친다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: '내 것', steps })!;
    expect(store.update(flow.id, 'ring', { title: '뺏기' })).toBeNull();
    expect(store.remove(flow.id, 'ring')).toBe(false);

    const forked = store.fork(flow.id, 'ring')!;
    expect(forked.ownerHandle).toBe('ring');
    expect(forked.forkedFrom).toBe(flow.id);
    expect(forked.id).not.toBe(flow.id);
    // 원본은 그대로다
    expect(store.get(flow.id)?.title).toBe('내 것');
  });

  it('돈 횟수는 실측만 — 부를 때마다 하나씩', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps })!;
    expect(flow.runs).toBe(0);
    expect(store.noteRun(flow.id)).toBe(1);
    expect(store.noteRun(flow.id)).toBe(2);
    expect(store.noteRun('없는id')).toBe(0);
  });

  it('계정을 지워도 흐름은 남는다 — 남이 담아 간 것이 안 죽게 주인만 지운다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps })!;
    expect(store.orphanOwner('karmo')).toBe(1);
    expect(store.get(flow.id)?.ownerHandle).toBeNull();
    expect(store.get(flow.id)?.steps).toHaveLength(2);
  });

  it('공개 목록은 많이 돈 것이 앞', () => {
    const store = new KarmolabFlowStore(statePath);
    const a = store.create('karmo', { title: 'a', steps })!;
    const b = store.create('karmo', { title: 'b', steps })!;
    store.noteRun(b.id);
    store.noteRun(b.id);
    store.noteRun(a.id);
    expect(store.list().map((f) => f.title)).toEqual(['b', 'a']);
  });
});
