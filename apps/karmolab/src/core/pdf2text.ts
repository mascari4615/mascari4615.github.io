/** PDF 글자 추출 — 좌표 복원은 backend가 맡고 코어는 바이트 계약만 소유한다. */
import type { ToolRunner, ToolSpec } from './types';

interface PdfTextBackend { extract(data: string, maxPages?: number): Promise<string>; }

export interface PdfTextItem { str?: string; transform?: number[]; }

export function rebuildTextItems(items: PdfTextItem[]): string {
  const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];
  for (const item of items) {
    const text = item.str ?? '';
    if (!text) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const line = lines.find((candidate) => Math.abs(candidate.y - y) < 2.5);
    if (line) line.parts.push({ x, text });
    else lines.push({ y, parts: [{ x, text }] });
  }
  lines.sort((a, b) => b.y - a.y);
  const gaps = lines.slice(1).map((line, index) => lines[index].y - line.y).sort((a, b) => a - b);
  const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const out: string[] = [];
  let previousY: number | undefined;
  for (const line of lines) {
    if (previousY !== undefined && typical > 0 && previousY - line.y > typical * 1.6) out.push('');
    const text = line.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join('').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
    previousY = line.y;
  }
  return out.join('\n');
}

export const spec: ToolSpec = {
  id: 'pdf2text',
  ops: {
    extract: {
      desc: 'Extract text from a base64-encoded PDF locally. Pages are separated and text never leaves the machine.',
      in: { data: 'string', maxPages: 'number?' }, out: 'string'
    }
  }
};

export const run: ToolRunner = async (op, args, deps) => {
  if (op !== 'extract') throw new Error(`pdf2text 에 「${op}」 는 없습니다`);
  const backend = deps?.pdfText as PdfTextBackend | undefined;
  if (!backend) throw new Error('PDF 글자 계산기가 없습니다 (deps.pdfText)');
  const data = String(args.data ?? '');
  if (!data) throw new Error('PDF data(base64)가 필요합니다');
  const maxPages = Math.max(1, Math.min(1000, Math.round(Number(args.maxPages ?? 100))));
  return backend.extract(data, maxPages);
};
