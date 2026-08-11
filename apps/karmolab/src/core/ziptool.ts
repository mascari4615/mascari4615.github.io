/**
 * ZIP 만들기·살펴보기·꺼내기 — 알맹이 (TASK-KL-205 P4)
 *
 * ZIP 구현은 환경이 준다. 브라우저는 기존 vendor JSZip, Node MCP는 npm jszip을 쓰되
 * 파일 계약은 양쪽 모두 base64 문자열이다. File·Blob을 코어에 들이지 않는다.
 */
import type { ToolRunner, ToolSpec } from './types';

interface ZipBackend {
  create(files: Array<{ name: string; data: string }>, level: number): Promise<string>;
  list(data: string): Promise<Array<{ name: string; size: number }>>;
  extract(data: string, name: string): Promise<string>;
}

export const spec: ToolSpec = {
  id: 'ziptool',
  ops: {
    create: {
      desc: 'Create a ZIP from a JSON array of {name,data} where data is base64. Returns ZIP bytes as base64.',
      in: { files: 'string', level: 'number?' },
      out: 'string'
    },
    list: {
      desc: 'List files in a base64-encoded ZIP without extracting them.',
      in: { data: 'string' },
      out: 'string'
    },
    extract: {
      desc: 'Extract one named file from a base64-encoded ZIP. Returns the file bytes as base64.',
      in: { data: 'string', name: 'string' },
      out: 'string'
    }
  }
};

function backendOf(deps?: Record<string, unknown>): ZipBackend {
  const backend = deps?.zip as ZipBackend | undefined;
  if (!backend) throw new Error('ZIP 계산기가 없습니다 (deps.zip)');
  return backend;
}

function filesOf(raw: unknown): Array<{ name: string; data: string }> {
  let value: unknown;
  try {
    value = JSON.parse(String(raw ?? ''));
  } catch {
    throw new Error('files는 [{"name":"a.txt","data":"base64"}] JSON이어야 합니다');
  }
  if (!Array.isArray(value) || value.length === 0) throw new Error('묶을 파일이 없습니다');
  return value.map((entry, index) => {
    const file = entry as { name?: unknown; data?: unknown };
    const name = String(file.name ?? '').trim();
    const data = String(file.data ?? '');
    if (!name || !data) throw new Error(`${index + 1}번째 파일의 name 또는 data가 비었습니다`);
    if (name.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
      throw new Error(`안전하지 않은 파일 이름입니다: ${name}`);
    }
    return { name, data };
  });
}

export const run: ToolRunner = async (op, args, deps) => {
  const backend = backendOf(deps);
  if (op === 'create') {
    const level = Math.max(0, Math.min(9, Math.round(Number(args.level ?? 6))));
    return backend.create(filesOf(args.files), level);
  }
  const data = String(args.data ?? '');
  if (!data) throw new Error('ZIP data(base64)가 필요합니다');
  if (op === 'list') return JSON.stringify(await backend.list(data));
  if (op === 'extract') {
    const name = String(args.name ?? '').trim();
    if (!name) throw new Error('꺼낼 파일 이름이 필요합니다');
    return backend.extract(data, name);
  }
  throw new Error(`ziptool 에 「${op}」 는 없습니다`);
};
