/** PDF 여백 자르기 — 바이트 알맹이 (TASK-KL-205 P4). */
import type { ToolRunner, ToolSpec } from './types';

interface Backend { crop(data: string, margins: { top: number; right: number; bottom: number; left: number }): Promise<string>; }

export const spec: ToolSpec = { id: 'pdfcrop', ops: { crop: {
  desc: 'Crop every PDF page by explicit point margins (72 points = 1 inch). Returns PDF base64 without rasterizing.',
  in: { data: 'string', top: 'number?', right: 'number?', bottom: 'number?', left: 'number?' }, out: 'string'
} } };

export const run: ToolRunner = async (op, args, deps) => {
  if (op !== 'crop') throw new Error(`pdfcrop 에 「${op}」 는 없습니다`);
  const backend = deps?.pdfCrop as Backend | undefined;
  if (!backend) throw new Error('PDF 자르기 계산기가 없습니다 (deps.pdfCrop)');
  const data = String(args.data ?? '');
  if (!data) throw new Error('PDF data(base64)가 필요합니다');
  const margin = (name: string): number => {
    const value = Number(args[name] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 2000) throw new Error(`${name} 여백이 잘못됐습니다`);
    return value;
  };
  return backend.crop(data, { top: margin('top'), right: margin('right'), bottom: margin('bottom'), left: margin('left') });
};
