/**
 * links.ts — 설명 속 [[이름]] 연결 (TASK-KL-202 격차 Q).
 *
 * 세계관은 관계선만으로 안 끝난다. 「욘의 마도서는 [[저주]] 받았다」처럼 **글 안에서** 다른 것을
 * 가리키는 일이 훨씬 잦다. Obsidian 이 증명한 두 가지를 가져온다:
 *
 * - **가리키는 것 / 나를 가리키는 것**(backlinks) — 양쪽을 다 보여야 그물이 보인다.
 * - **그냥 이름만 나온 곳**(unlinked mentions) — 이름이 적혀 있는데 이어지지 않은 자리를
 *   찾아 「이어 볼래?」로 권한다. 사람이 링크 문법을 안 써도 그물이 자란다.
 */

export interface NodeLike {
  id: string;
  label: string;
  doc?: string;
}

const LINK_RE = /\[\[([^\]]+)\]\]/g;

/** 글 안의 [[이름]] 을 전부 뽑는다(중복 제거, 순서 유지). */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(LINK_RE)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 이 노드의 설명이 가리키는 것들. 이름이 맞는 노드가 없으면 `node`가 null 이다(= 만들 자리). */
export function outgoingLinks(node: NodeLike, all: NodeLike[]): { name: string; node: NodeLike | null }[] {
  return extractLinks(node.doc ?? '').map((name) => ({
    name,
    node: all.find((n) => n.id !== node.id && n.label === name) ?? null,
  }));
}

/** 이 노드를 [[ ]] 로 가리키는 노드들. */
export function backlinks(node: NodeLike, all: NodeLike[]): NodeLike[] {
  if (!node.label) return [];
  return all.filter((n) => n.id !== node.id && extractLinks(n.doc ?? '').includes(node.label));
}

/**
 * 이름만 적혀 있고 이어지지 않은 곳. `[[이름]]` 안에 든 것은 제외한다 —
 * 이미 이어진 것을 「안 이어졌다」고 다시 권하면 목록이 쓸모없어진다.
 */
export function unlinkedMentions(node: NodeLike, all: NodeLike[]): NodeLike[] {
  const name = node.label?.trim();
  if (!name || name.length < 2) return [];   // 한 글자는 아무 데나 걸린다
  return all.filter((n) => {
    if (n.id === node.id) return false;
    const doc = n.doc ?? '';
    if (!doc.includes(name)) return false;
    if (extractLinks(doc).includes(name)) return false;
    return true;
  });
}

/** 글 안에서 처음 나오는 `이름` 을 `[[이름]]` 으로 감싼다. 이미 감싸진 것은 건드리지 않는다. */
export function linkFirstMention(doc: string, name: string): string {
  const already = new Set(extractLinks(doc));
  if (already.has(name)) return doc;
  const idx = doc.indexOf(name);
  if (idx < 0) return doc;
  return doc.slice(0, idx) + `[[${name}]]` + doc.slice(idx + name.length);
}
