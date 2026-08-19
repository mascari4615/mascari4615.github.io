/**
 * 채팅 본문을 글과 그림으로 가른다.
 *
 * 리스가 중간 에셋을 그리는 것과 같다. 화면이 아니라 여기서 가른다 —
 * 창 스크립트가 제멋대로 자르면 시험이 그 길을 못 밟는다.
 */

export type ChatSegment =
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string; alt: string };

const IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function chatSegments(text: string): ChatSegment[] {
  const raw = text ?? '';
  if (raw === '') return [];
  const out: ChatSegment[] = [];
  let last = 0;
  IMAGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE.exec(raw)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: raw.slice(last, m.index) });
    const src = (m[2] ?? '').trim();
    if (src !== '') out.push({ kind: 'image', src, alt: (m[1] ?? '').trim() });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ kind: 'text', text: raw.slice(last) });
  return out;
}
