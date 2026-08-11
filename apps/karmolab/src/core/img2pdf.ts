/** PNG/JPEG 여러 장을 PDF로 — 입력은 JSON 배열의 base64 바이트다. */
import type { ToolRunner, ToolSpec } from './types';

interface Backend { create(images: Array<{ data: string; type?: string }>, page: string): Promise<string>; }

export const spec: ToolSpec = { id: 'img2pdf', ops: { create: {
  desc: 'Combine base64 PNG/JPEG images into a PDF. images is JSON [{data,type}], page is fit or a4.',
  in: { images: 'string', page: 'string?' }, out: 'string'
} } };

export const run: ToolRunner = async (op, args, deps) => {
  if (op !== 'create') throw new Error(`img2pdf 에 「${op}」 는 없습니다`);
  const backend = deps?.imagePdf as Backend | undefined;
  if (!backend) throw new Error('이미지 PDF 계산기가 없습니다 (deps.imagePdf)');
  let images: unknown;
  try { images = JSON.parse(String(args.images ?? '')); } catch { throw new Error('images는 JSON 배열이어야 합니다'); }
  if (!Array.isArray(images) || !images.length) throw new Error('이미지가 필요합니다');
  const normalized = images.map((item, index) => {
    const image = item as { data?: unknown; type?: unknown };
    const data = String(image.data ?? '');
    const type = String(image.type ?? '').toLowerCase();
    if (!data) throw new Error(`${index + 1}번째 이미지 data가 비었습니다`);
    if (type && !['png', 'jpg', 'jpeg'].includes(type)) throw new Error(`${index + 1}번째 이미지 형식을 지원하지 않습니다`);
    return { data, type };
  });
  return backend.create(normalized, String(args.page ?? 'fit') === 'a4' ? 'a4' : 'fit');
};
