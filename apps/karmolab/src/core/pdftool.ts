/** PDF 페이지 편집 — 바이트 알맹이 (TASK-KL-205 P4). */
import type { ToolRunner, ToolSpec } from './types';

interface PdfBackend {
  merge(files: string[]): Promise<string>;
  pages(data: string): Promise<number>;
  extract(data: string, pages: number[]): Promise<string>;
  rotate(data: string, pages: number[], degrees: number): Promise<string>;
}

export const spec: ToolSpec = {
  id: 'pdftool',
  ops: {
    merge: {
      desc: 'Merge base64-encoded PDFs in order. Input files is a JSON string array; output is PDF base64.',
      in: { files: 'string' }, out: 'string'
    },
    pages: {
      desc: 'Count pages in a base64-encoded PDF without uploading it.',
      in: { data: 'string' }, out: 'number'
    },
    extract: {
      desc: 'Extract selected 1-based pages from a base64 PDF. pages accepts ranges such as 1-3,5.',
      in: { data: 'string', pages: 'string' }, out: 'string'
    },
    rotate: {
      desc: 'Rotate selected 1-based PDF pages by 90, 180, or 270 degrees. Returns PDF base64.',
      in: { data: 'string', pages: 'string', degrees: 'number' }, out: 'string'
    }
  }
};

function backendOf(deps?: Record<string, unknown>): PdfBackend {
  const backend = deps?.pdf as PdfBackend | undefined;
  if (!backend) throw new Error('PDF 계산기가 없습니다 (deps.pdf)');
  return backend;
}

export function parsePages(raw: string): number[] {
  const out = new Set<number>();
  for (const token of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) throw new Error(`페이지 범위를 읽을 수 없습니다: ${token}`);
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from < 1 || to < from || to - from > 10000) throw new Error(`잘못된 페이지 범위입니다: ${token}`);
    for (let page = from; page <= to; page++) out.add(page);
  }
  if (!out.size) throw new Error('페이지가 필요합니다 (예: 1-3,5)');
  return [...out];
}

export const run: ToolRunner = async (op, args, deps) => {
  const backend = backendOf(deps);
  if (op === 'merge') {
    let files: unknown;
    try { files = JSON.parse(String(args.files ?? '')); } catch { throw new Error('files는 base64 문자열 JSON 배열이어야 합니다'); }
    if (!Array.isArray(files) || files.length < 2 || files.some((file) => typeof file !== 'string' || !file)) {
      throw new Error('합칠 PDF base64가 두 개 이상 필요합니다');
    }
    return backend.merge(files);
  }
  const data = String(args.data ?? '');
  if (!data) throw new Error('PDF data(base64)가 필요합니다');
  if (op === 'pages') return backend.pages(data);
  const pages = parsePages(String(args.pages ?? ''));
  if (op === 'extract') return backend.extract(data, pages);
  if (op === 'rotate') {
    const degrees = Number(args.degrees);
    if (![90, 180, 270].includes(degrees)) throw new Error('회전은 90, 180, 270도만 가능합니다');
    return backend.rotate(data, pages, degrees);
  }
  throw new Error(`pdftool 에 「${op}」 는 없습니다`);
};
