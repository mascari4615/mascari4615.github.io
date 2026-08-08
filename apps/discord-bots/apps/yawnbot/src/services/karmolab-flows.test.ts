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

/** 흐름 자국 (TASK-KL-182 F5) — 어디서 막히나. */
describe('흐름 자국 (KL-182 F5)', () => {
  const steps3 = [{ toolId: 'a' }, { toolId: 'b' }, { toolId: 'c' }];

  it('자국이 없으면 요약도 없다 — 모르는 것을 아는 척하지 않는다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps: steps3 })!;
    expect(store.trailSummary(flow.id)).toBeNull();
  });

  it('가장 자주 멈추는 단계를 짚는다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps: steps3 })!;
    store.noteTrail(flow.id, { reached: 2, finished: false, seconds: 30 });
    store.noteTrail(flow.id, { reached: 2, finished: false, seconds: 40 });
    store.noteTrail(flow.id, { reached: 3, finished: true, seconds: 90 });

    const summary = store.trailSummary(flow.id)!;
    expect(summary).toMatchObject({ runs: 3, finished: 1, stuckStep: 2 });
    expect(summary.medianSeconds).toBe(40);
  });

  it('단계 수를 넘는 값은 잘린다 · 자국은 20판까지', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps: steps3 })!;
    expect(store.noteTrail(flow.id, { reached: 99, finished: true })[0].reached).toBe(3);
    for (let i = 0; i < 30; i += 1) store.noteTrail(flow.id, { reached: 1, finished: false });
    expect(store.get(flow.id)!.trails).toHaveLength(20);
  });
});

/** 예약 알림 (TASK-KL-183 B) — 서버는 알리기만 한다. */
describe('흐름 예약 (KL-183 B)', () => {
  const steps = [{ toolId: 'a' }, { toolId: 'b' }];

  it('주인만 예약을 걸고 끌 수 있다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps })!;
    expect(store.setReminder(flow.id, 'ring', { weekday: 1, hour: 9 })).toBeNull();
    expect(store.setReminder(flow.id, 'karmo', { weekday: 1, hour: 9 })!.reminder).toMatchObject({ weekday: 1, hour: 9 });
    expect(store.setReminder(flow.id, 'karmo', { on: false })!.reminder).toBeUndefined();
  });

  it('그 요일 그 시각이 지나야 알린다 · 같은 주에 두 번 안 알린다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: 'x', steps })!;
    store.setReminder(flow.id, 'karmo', { weekday: 1, hour: 10 });

    expect(store.dueReminders('2026-W32', 1, 9)).toEqual([]);   // 아직 이르다
    expect(store.dueReminders('2026-W32', 2, 11)).toEqual([]);  // 다른 요일
    expect(store.dueReminders('2026-W32', 1, 11)).toHaveLength(1);

    store.markReminded(flow.id, '2026-W32');
    expect(store.dueReminders('2026-W32', 1, 11)).toEqual([]);
    expect(store.dueReminders('2026-W33', 1, 11)).toHaveLength(1);
  });

  it('건너뛸 조건은 아는 것만 받는다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', {
      title: 'x',
      steps: [{ toolId: 'a', skipWhen: 'small' }, { toolId: 'b', skipWhen: '장난' }],
    })!;
    expect(flow.steps[0].skipWhen).toBe('small');
    expect(flow.steps[1].skipWhen).toBeUndefined();
  });
});

describe('스스로 이어감 (KL-191 축1)', () => {
  it('주인만 켜고 끌 수 있다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: '문서 정리', steps })!;
    expect(store.setAuto(flow.id, 'ring', true)).toBeNull();
    expect(store.setAuto(flow.id, 'karmo', true)!.auto).toBe(true);
    expect(store.setAuto(flow.id, 'karmo', false)!.auto).toBeUndefined();
  });

  it('단계가 하나뿐이면 못 켠다 — 이어갈 다음이 없다', () => {
    const store = new KarmolabFlowStore(statePath);
    const flow = store.create('karmo', { title: '한 단계', steps: [{ toolId: 'pdfcrop' }] })!;
    expect(store.setAuto(flow.id, 'karmo', true)).toBeNull();
    expect(store.get(flow.id)!.auto).toBeUndefined();
  });

  it('껐다 켠 것이 다시 열어도 남는다', () => {
    const first = new KarmolabFlowStore(statePath);
    const flow = first.create('karmo', { title: '문서 정리', steps })!;
    first.setAuto(flow.id, 'karmo', true);
    expect(new KarmolabFlowStore(statePath).get(flow.id)!.auto).toBe(true);
  });
});
