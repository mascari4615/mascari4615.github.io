/**
 * notes-library.ts — 공용 글은 **맵보다 오래 산다** (TASK-KL-202 노트 1급 객체 9회차).
 *
 * 지금까지 공용 글은 한 맵 안에서만 나눠 쓸 수 있었다. 그런데 「이 세계의 마법 규칙」 같은 글은
 * 인물 관계도·사건 연표·세력도 **여러 맵에 똑같이 필요하다**. 맵마다 복붙하면 그 순간 갈라진다
 * (Heptabase 가 「보드는 카드를 소유하지 않는다」로 푼 문제).
 *
 * 그래서 집을 하나 더 둔다:
 *
 * - **라이브러리(`karmomap.notes`)** = 사람에게 붙는 글 창고. **정본.**
 * - **맵 안(`spec.notes`)** = 그 맵이 쓰는 글의 사본. 맵 하나만 JSON 으로 내보내도 글이 따라가고,
 *   주소로 공유한 그림이 남의 브라우저에서도 글까지 보이게 하려면 이 사본이 꼭 있어야 한다.
 *
 * 두 집이 갈리지 않게 하는 규칙은 **하나**다: *쓸 때는 둘 다*(`mirrorToLibrary`),
 * *읽을 때는 라이브러리가 이긴다*(`refreshFromLibrary`, 맵을 열 때 한 번).
 */
import type { GraphSpec, GraphNote } from '../../lib/graph/spec';
import { notesOf } from '../../lib/graph/notes';

const LIB_KEY = 'karmomap.notes';

/** 라이브러리에 든 글 + 「어느 맵에서 왔나」 (목록에서 고를 때의 단서). */
export interface LibraryNote extends GraphNote {
  /** 마지막으로 이 글을 저장한 맵 이름. 같은 제목이 여럿일 때 사람이 구분하는 유일한 실마리. */
  from?: string;
  /** 마지막 저장 시각(ms). 최근 것부터 보여 준다. */
  at?: number;
}

export function loadLibrary(): LibraryNote[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LibraryNote[]) : [];
  } catch {
    return []; // 깨진 칸 하나 때문에 맵이 안 열리면 안 된다 — 라이브러리는 있으면 좋은 것이다.
  }
}

function writeLibrary(list: LibraryNote[]): void {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
  } catch {
    // 저장 칸이 찼을 때 **맵 저장이 우선**이다. 라이브러리는 조용히 포기한다.
  }
}

/** 이 맵의 공용 글을 라이브러리에 반영한다(맵을 저장할 때마다). */
export function mirrorToLibrary(spec: GraphSpec, mapName: string): void {
  const notes = notesOf(spec);
  if (notes.length === 0) return;
  const lib = loadLibrary();
  const byId = new Map(lib.map((n) => [n.id, n]));
  for (const n of notes) {
    byId.set(n.id, { ...n, from: mapName, at: Date.now() });
  }
  writeLibrary([...byId.values()]);
}

/**
 * 맵을 열 때 — 라이브러리에 더 최신 글이 있으면 그것으로 맞춘다.
 * 다른 맵에서 고친 글이 이 맵에도 반영되는 유일한 지점이다. 바뀐 글 수를 돌려준다.
 */
export function refreshFromLibrary(spec: GraphSpec): number {
  const lib = loadLibrary();
  if (lib.length === 0) return 0;
  const byId = new Map(lib.map((n) => [n.id, n]));
  let changed = 0;
  for (const n of notesOf(spec)) {
    const fresh = byId.get(n.id);
    if (!fresh || fresh.text === n.text) continue;
    n.text = fresh.text;
    n.title = fresh.title ?? n.title;
    changed += 1;
  }
  return changed;
}

/** 아직 이 맵에 없는 라이브러리 글들 — 「다른 맵의 글 가져오기」 목록. */
export function foreignNotes(spec: GraphSpec): LibraryNote[] {
  const here = new Set(notesOf(spec).map((n) => n.id));
  return loadLibrary()
    .filter((n) => !here.has(n.id))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** 라이브러리의 글을 이 맵으로 데려온다. **id 를 그대로 쓴다** — 그래야 같은 글로 남는다. */
export function adoptNote(spec: GraphSpec, noteId: string): GraphNote | null {
  const found = loadLibrary().find((n) => n.id === noteId);
  if (!found) return null;
  const note: GraphNote = { id: found.id, title: found.title, text: found.text };
  notesOf(spec).push(note);
  return note;
}
