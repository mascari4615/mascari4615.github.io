/** PDF 쪽 번호 — 기본 라틴 글꼴로 숫자·ASCII 표기만 보장한다. */
import type { ToolRunner, ToolSpec } from './types';

interface Backend { number(data: string, options: Record<string, unknown>): Promise<string>; }

export const spec: ToolSpec = { id: 'pdfpagenum', ops: { add: {
  desc: 'Add page numbers to a base64 PDF. prefix/suffix must be ASCII; returns PDF base64.',
  in: { data: 'string', startPage: 'number?', startNumber: 'number?', position: 'string?', prefix: 'string?', suffix: 'string?' }, out: 'string'
} } };

export const run: ToolRunner = async (op, args, deps) => {
  if (op !== 'add') throw new Error(`pdfpagenum 에 「${op}」 는 없습니다`);
  const backend = deps?.pdfPageNumber as Backend | undefined;
  if (!backend) throw new Error('PDF 쪽 번호 계산기가 없습니다 (deps.pdfPageNumber)');
  const data = String(args.data ?? '');
  if (!data) throw new Error('PDF data(base64)가 필요합니다');
  const prefix = String(args.prefix ?? '');
  const suffix = String(args.suffix ?? '');
  if (/[^\x20-\x7e]/.test(prefix + suffix)) throw new Error('MCP 쪽 번호의 prefix/suffix는 ASCII만 지원합니다');
  return backend.number(data, {
    startPage: Math.max(1, Math.round(Number(args.startPage ?? 1))),
    startNumber: Math.round(Number(args.startNumber ?? 1)),
    position: ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right'].includes(String(args.position))
      ? String(args.position) : 'bottom-center', prefix, suffix
  });
};
