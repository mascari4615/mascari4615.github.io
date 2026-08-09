/**
 * notes.ts — 글을 한 곳에 두고 여러 자리에서 참조한다 (TASK-KL-202 노트 1급 객체).
 *
 * 지금까지 설명글(`doc`)은 **노드 안에 갇혀** 있었다. 그래서 같은 설정 하나를
 * 두 인물에게 붙이려면 복붙해야 했고, 복붙한 순간 둘은 갈라진다(한쪽만 고쳐진다).
 * Altium 의 draftsman 이 노트를 **목록**으로 두고 콜아웃이 그것을 *참조*하게 만든 이유가
 * 이것이다 — 글을 고치면 그것을 가리키는 모든 자리가 함께 바뀐다.
 *
 * 데이터 모양: `spec.notes[]` 가 글의 집이고, 노드·선은 `docRef` 로 그 집을 가리킨다.
 * `doc`(제자리 글)은 그대로 남는다 — 대부분의 글은 한 자리에서만 쓰이므로 공용으로
 * 승격시킬 이유가 없다. **`docRef` 가 있으면 그쪽이 이긴다.**
 */
import type { GraphSpec, GraphNote } from './spec';

/** 글을 가질 수 있는 것 — 노드도 선도 같은 취급. */
export interface DocHolder {
  doc?: string;
  docRef?: string;
}

export function notesOf(spec: GraphSpec): GraphNote[] {
  if (!spec.notes) spec.notes = [];
  return spec.notes;
}

/** 화면에 보일 글. 참조가 있으면 공용 글, 없으면 제자리 글. */
export function resolveDoc(spec: GraphSpec, h: DocHolder): string {
  if (h.docRef) return notesOf(spec).find((n) => n.id === h.docRef)?.text ?? '';
  return h.doc ?? '';
}

/** 글이 하나라도 있나 (카드 모서리 📄 판정). */
export function hasDoc(spec: GraphSpec, h: DocHolder): boolean {
  return resolveDoc(spec, h).trim().length > 0;
}

/** 타자 친 글을 올바른 자리에 쓴다 — 참조 중이면 **공용 글이 바뀐다**(가리키는 모든 자리가 함께). */
export function setDocText(spec: GraphSpec, h: DocHolder, text: string): void {
  const t = text.trim();
  if (h.docRef) {
    const note = notesOf(spec).find((n) => n.id === h.docRef);
    if (note) {
      note.text = t;
      return;
    }
    h.docRef = undefined; // 집이 사라졌으면 제자리 글로 강등
  }
  h.doc = t || undefined;
}

const newId = (): string => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * 제자리 글을 **공용 글로 승격**한다. 이 자리에는 참조만 남는다.
 * 제목이 비면 글 첫 줄을 잘라 쓴다 — 목록에서 고를 때 필요한 것은 제목이지 본문이 아니다.
 */
export function shareDoc(spec: GraphSpec, h: DocHolder, title?: string): string {
  if (h.docRef) return h.docRef;
  const text = (h.doc ?? '').trim();
  const head = (title ?? text.split('\n')[0] ?? '').trim().slice(0, 40) || '메모';
  const note: GraphNote = { id: newId(), title: head, text };
  notesOf(spec).push(note);
  h.doc = undefined;
  h.docRef = note.id;
  return note.id;
}

/** 이미 있는 공용 글을 이 자리에 붙인다(제자리 글은 밀려난다). */
export function useNote(spec: GraphSpec, h: DocHolder, noteId: string): void {
  if (!notesOf(spec).some((n) => n.id === noteId)) return;
  h.doc = undefined;
  h.docRef = noteId;
}

/** 참조를 끊는다 — 지금 보이던 글을 **사본으로 떼어** 제자리에 남긴다(빈 칸이 되면 놀란다). */
export function unlinkNote(spec: GraphSpec, h: DocHolder): void {
  const text = resolveDoc(spec, h);
  h.docRef = undefined;
  h.doc = text.trim() || undefined;
}

/** 이 공용 글을 몇 자리가 가리키나 (노드 + 선). */
export function noteUsers(spec: GraphSpec, noteId: string): number {
  const n = spec.nodes.filter((x) => x.docRef === noteId).length;
  const e = spec.edges.filter((x) => x.docRef === noteId).length;
  return n + e;
}

/** 아무도 안 가리키는 공용 글을 치운다. 지운 개수를 돌려준다. */
export function pruneNotes(spec: GraphSpec): number {
  const keep = notesOf(spec).filter((n) => noteUsers(spec, n.id) > 0);
  const dropped = notesOf(spec).length - keep.length;
  spec.notes = keep;
  return dropped;
}
