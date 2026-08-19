/** 화면이 부르는 본문 가르기. 정본 알고리즘은 src/chat/markup.ts 와 같다. */
export function chatSegments(text) {
  const raw = text ?? '';
  if (raw === '') return [];
  const out = [];
  const IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let last = 0;
  let m;
  while ((m = IMAGE.exec(raw)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: raw.slice(last, m.index) });
    const src = (m[2] ?? '').trim();
    if (src !== '') out.push({ kind: 'image', src, alt: (m[1] ?? '').trim() });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ kind: 'text', text: raw.slice(last) });
  return out;
}
