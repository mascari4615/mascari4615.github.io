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

/**
 * 글 안에 **다른 공용 글을 끼워 넣는다** — `{{note:<id>}}` (TiddlyWiki 의 transclusion).
 *
 * 「이 세계의 마법 규칙」을 세 인물 설명 안에 각각 *실어* 두고 싶을 때, 복붙하면 갈라진다.
 * 끼운 자리는 사본이 아니라 **창**이라 원본을 고치면 실린 곳이 전부 바뀐다.
 *
 * 끼운 글이 또 다른 글을 끼울 수 있으므로 **자기 자신으로 돌아오는 고리**를 막아야 한다
 * (안 막으면 화면이 멈춘다). 이미 편 글은 두 번 펴지 않고 「(고리)」로 남긴다.
 */
const EMBED_RE = /\{\{note:([^}]+)\}\}/g;

/**
 * 글 안의 **덩이 표식** — 줄 끝에 `^이름` (Obsidian 블록 참조와 같은 문법).
 * 「이 글 전체」가 아니라 「이 글의 그 대목」만 실어야 할 때가 많다 — 세계관 규칙 열 줄 중 한 줄처럼.
 */
const BLOCK_MARK = /\s*\^([\w가-힣-]+)\s*$/;

export interface NoteBlock {
  id: string;
  text: string;
}

/** 글을 덩이로 쪼갠다(빈 줄 기준). 표식이 붙은 덩이만 돌려준다 — 표식 없는 덩이는 가리킬 이름이 없다. */
export function noteBlocks(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  const NL_SPLIT = new RegExp(String.fromCharCode(92) + 'n{2,}');
  const LINE_SPLIT = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');
  for (const para of text.split(NL_SPLIT)) {
    const lines = para.split(LINE_SPLIT);
    const last = lines[lines.length - 1] ?? '';
    const m = BLOCK_MARK.exec(last);
    if (!m) continue;
    lines[lines.length - 1] = last.replace(BLOCK_MARK, '');
    out.push({ id: m[1], text: lines.join(String.fromCharCode(10)).trim() });
  }
  return out;
}

/** 글에서 표식을 걷어 낸 모습 — 읽는 사람에게 `^규칙1` 같은 표식까지 보일 이유는 없다. */
export function stripBlockMarks(text: string): string {
  const LINE_SPLIT = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');
  return text.split(LINE_SPLIT).map((line) => line.replace(BLOCK_MARK, '')).join(String.fromCharCode(10));
}

export function expandNoteText(spec: GraphSpec, text: string, seen: Set<string> = new Set()): string {
  return text.replace(EMBED_RE, (_m, rawRef: string) => {
    // `{{note:<글id>#<덩이>}}` — `#` 뒤가 있으면 **그 대목만** 싣는다.
    const [rawId, block] = rawRef.trim().split('#');
    const id = rawId.trim();
    const key = block ? `${id}#${block}` : id;
    if (seen.has(key) || seen.has(id)) return '(고리)';
    const note = notesOf(spec).find((n) => n.id === id);
    if (!note) return '(없는 글)';
    if (block) {
      const hit = noteBlocks(note.text).find((b) => b.id === block.trim());
      if (!hit) return '(없는 대목)';
      return expandNoteText(spec, hit.text, new Set([...seen, key]));
    }
    return stripBlockMarks(expandNoteText(spec, note.text, new Set([...seen, id])));
  });
}

/** 화면에 보일 글 — 참조를 풀고, 그 안에 끼워 넣은 글까지 편다. */
export function displayDoc(spec: GraphSpec, h: DocHolder): string {
  const own = h.docRef ? new Set([h.docRef]) : new Set<string>();
  return expandNoteText(spec, resolveDoc(spec, h), own);
}

/** 이 공용 글을 몇 자리가 가리키나 (노드 + 선). */
export function noteUsers(spec: GraphSpec, noteId: string): number {
  const n = spec.nodes.filter((x) => x.docRef === noteId).length;
  const e = spec.edges.filter((x) => x.docRef === noteId).length;
  return n + e;
}

/**
 * 공용 글을 없앤다. **쓰던 자리를 빈칸으로 만들면 안 된다** — 글이 통째로 증발한 것처럼 보이고,
 * 그게 이런 도구에서 가장 무서운 사고다. 그래서 기본은 「자리마다 사본으로 남기고」 없애는 것이고,
 * 글 자체를 지우려는 경우(`keepCopies = false`)만 빈칸이 된다.
 */
export function deleteNote(spec: GraphSpec, noteId: string, keepCopies = true): void {
  const text = (notesOf(spec).find((n) => n.id === noteId)?.text ?? '').trim();
  for (const h of [...spec.nodes, ...spec.edges] as DocHolder[]) {
    if (h.docRef !== noteId) continue;
    h.docRef = undefined;
    h.doc = keepCopies ? text || undefined : undefined;
  }
  spec.notes = notesOf(spec).filter((n) => n.id !== noteId);
}

/** 아무도 안 가리키는 공용 글을 치운다. 지운 개수를 돌려준다. */
export function pruneNotes(spec: GraphSpec): number {
  const keep = notesOf(spec).filter((n) => noteUsers(spec, n.id) > 0);
  const dropped = notesOf(spec).length - keep.length;
  spec.notes = keep;
  return dropped;
}
