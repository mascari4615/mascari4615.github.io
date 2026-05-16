/**
 * proposal-adapter 행동 테스트 (KAR-018-W slice-2).
 * tracer-bullet: 발굴→parse→route→dispatch / parse-fail 폐기 / no-dispatch /
 * inboxDispatch 인박스 기록(canon 무변경). FS 격리 tmpdir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runProducerOnce,
  inboxDispatch,
  proposalsPath,
  type ProposalProducerDeps,
} from './proposal-adapter';

const envJson = JSON.stringify({
  kind: 'env',
  payload: { id: 'P1', summary: 's', targetFiles: ['a'], source: 'self-task' },
});

let root: string;
let notes: string[];
function baseEnv() {
  return { MEMO_REPO_PATH: root } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  notes = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('runProducerOnce — 발굴 → route → dispatch', () => {
  it('정상 발굴 → 타겟 반환 + dispatch 호출', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const deps: ProposalProducerDeps = {
      env: baseEnv(),
      discover: async () => envJson,
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    };
    expect(await runProducerOnce(deps)).toBe('self-improve');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('파싱 실패 → parse-fail (폐기, dispatch 호출 X)', async () => {
    const fn = vi.fn();
    const r = await runProducerOnce({
      env: baseEnv(),
      discover: async () => '쓰레기 출력',
      dispatch: { 'self-improve': fn },
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('parse-fail');
    expect(fn).not.toHaveBeenCalled();
  });

  it('타겟 미배선 → no-dispatch (graceful)', async () => {
    expect(
      await runProducerOnce({
        env: baseEnv(),
        discover: async () => envJson,
        dispatch: {},
        notify: (m) => notes.push(m),
      }),
    ).toBe('no-dispatch');
  });

  it('discover 예외 → discover-error', async () => {
    expect(
      await runProducerOnce({
        env: baseEnv(),
        discover: async () => {
          throw new Error('boom');
        },
        dispatch: {},
        notify: (m) => notes.push(m),
      }),
    ).toBe('discover-error');
  });
});

describe('inboxDispatch — 보수 materialization (canon 무변경)', () => {
  it('모든 타겟 → proposals.jsonl 인박스 기록', async () => {
    const env = baseEnv();
    const r = await runProducerOnce({
      env,
      discover: async () => envJson,
      dispatch: inboxDispatch(env),
      notify: (m) => notes.push(m),
    });
    expect(r).toBe('self-improve');
    const line = fs.readFileSync(proposalsPath(env), 'utf-8').trim();
    const e = JSON.parse(line);
    expect(e.target).toBe('self-improve');
    expect(e.kind).toBe('env');
    expect(e.envelope.payload.id).toBe('P1');
  });
});
