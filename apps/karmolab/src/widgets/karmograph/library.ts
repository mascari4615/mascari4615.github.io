/**
 * library.ts — 맵 여러 장 (TASK-KL-202 격차 H).
 *
 * 원래 KarmoGraph 은 localStorage 키 하나(`karmograph.graph`)에 그림 한 장만 들고 있었다.
 * 그런데 이 도구의 쓰임새는 「최애 관계도」·「내 세계관」·「이번 덱 전개」처럼 **여러 장**이다 —
 * 한 장뿐이면 새 그림을 그리려면 전에 그린 걸 지워야 한다.
 *
 * 구조:
 *   `karmograph.index`      → { activeId, maps: [{ id, name, updatedAt }] }
 *   `karmograph.map.<id>`   → GraphSpec 한 장
 *
 * 옛 단일 키는 처음 열 때 첫 장으로 옮기고 **스스로 지운다** (마이그레이션은 자기소멸).
 */
import { t } from '../../lib/i18n';


const INDEX_KEY = 'karmograph.index';
const MAP_PREFIX = 'karmograph.map.';
const LEGACY_KEY = 'karmograph.graph';

export interface MapEntry {
  id: string;
  name: string;
  updatedAt: number;
}

export interface LibraryIndex {
  activeId: string;
  maps: MapEntry[];
}

export function mapKey(id: string): string {
  return `${MAP_PREFIX}${id}`;
}

function readIndex(): LibraryIndex | null {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LibraryIndex>;
    if (!Array.isArray(parsed.maps) || parsed.maps.length === 0) return null;
    return {
      activeId: parsed.activeId ?? parsed.maps[0].id,
      maps: parsed.maps.filter((m): m is MapEntry => Boolean(m && m.id)),
    };
  } catch (e) {
    console.error(t('karmograph.parsed.msg'), e);
    return null;
  }
}

/** 지운 판의 id — 「내 목록에 없다」와 「지웠다」를 가르는 유일한 표시. */
const GONE_KEY = 'karmograph.gone';

function goneIds(): Set<string> {
  try {
    const raw = localStorage.getItem(GONE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** 지웠다고 적어 둔다 — 다른 탭의 목록이 그 판을 되살리지 못하게. */
function markGone(id: string): void {
  try {
    const all = [...goneIds(), id].slice(-50);   // 오래된 것부터 흘려보낸다(무한히 쌓을 값이 아니다)
    localStorage.setItem(GONE_KEY, JSON.stringify(all));
  } catch { /* 칸이 좁으면 포기 — 그때는 목록이 조금 되살아날 뿐이다 */ }
}

/**
 * 목록을 쓴다 — **남이 만든 판을 지우지 않고**.
 *
 * 탭마다 제 기억 속 목록을 통째로 쓰므로, 뒤에 쓴 탭이 앞 탭이 만든 판을 목록에서 **지웠다**
 * (자료는 남고 미아가 된다 — 사람에게는 판이 통째로 사라진 것으로 보인다. 실측 2026-08-14).
 * 그래서 쓰기 직전에 저장소를 다시 읽어, 내가 모르는 판은 **뒤에 붙여 살린다**. 「내가 지운 것」과
 * 「남이 만든 것」은 지운 표시(`karmograph.gone`)로 가른다.
 */
function writeIndex(index: LibraryIndex): void {
  try {
    const gone = goneIds();
    /* ★ 지운 것은 **누구의 기억에도 안 남는다.** 내 목록에서만 빼면, 그 판을 아직 기억하고 있는
       다른 탭이 다음 저장에 도로 살린다(실측 2026-08-14: 지운 판이 돌아왔다). */
    const kept = index.maps.filter((m) => !gone.has(m.id));
    const mine = new Set(kept.map((m) => m.id));
    const theirs = (readIndex()?.maps ?? []).filter((m) => !mine.has(m.id) && !gone.has(m.id));
    const maps = [...kept, ...theirs];
    const merged: LibraryIndex = {
      activeId: maps.some((m) => m.id === index.activeId) ? index.activeId : (maps[0]?.id ?? index.activeId),
      maps: maps.length > 0 ? maps : index.maps,
    };
    localStorage.setItem(INDEX_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error(t('karmograph.writeIndex.msg'), e);
  }
}

/** 겹치지 않는 새 맵 id. 시각 기반이라 지웠다 만들어도 옛 키를 밟지 않는다. */
function newId(taken: Set<string>): string {
  let id = `m${Date.now().toString(36)}`;
  let n = 1;
  while (taken.has(id)) { id = `m${Date.now().toString(36)}${n}`; n += 1; }
  return id;
}

/**
 * 목록을 얻는다. 없으면 만들고, 옛 단일 키가 있으면 그걸 첫 장으로 옮긴다.
 * 어떤 경우에도 **맵이 최소 한 장 있는 상태**로 돌려준다 — 「빈 목록」 분기를 위쪽에서 없애려고.
 */
export function loadLibrary(): LibraryIndex {
  const existing = readIndex();
  if (existing) return existing;

  const taken = new Set<string>();
  const id = newId(taken);
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      localStorage.setItem(mapKey(id), legacy);
      localStorage.removeItem(LEGACY_KEY);   // 마이그레이션은 자기소멸 — 두 곳에 남기지 않는다
    } catch (e) {
      console.error(t('karmograph.legacy.msg'), e);
    }
  }
  const index: LibraryIndex = {
    activeId: id,
    maps: [{ id, name: legacy ? t('karmograph.legacy.msg2') : t('karmograph.legacy.msg3'), updatedAt: Date.now() }],
  };
  writeIndex(index);
  return index;
}

export function setActive(index: LibraryIndex, id: string): LibraryIndex {
  const next = { ...index, activeId: id };
  writeIndex(next);
  return next;
}

export function renameMap(index: LibraryIndex, id: string, name: string): LibraryIndex {
  const next = { ...index, maps: index.maps.map((m) => (m.id === id ? { ...m, name } : m)) };
  writeIndex(next);
  return next;
}

export function touchMap(index: LibraryIndex, id: string): LibraryIndex {
  const next = { ...index, maps: index.maps.map((m) => (m.id === id ? { ...m, updatedAt: Date.now() } : m)) };
  writeIndex(next);
  return next;
}

/** 새 빈 맵. `spec` 을 주면 그 내용으로 시작한다(복제에 쓴다). */
export function addMap(index: LibraryIndex, name: string, specJson?: string): { index: LibraryIndex; id: string } {
  const id = newId(new Set(index.maps.map((m) => m.id)));
  if (specJson) {
    try {
      localStorage.setItem(mapKey(id), specJson);
    } catch (e) {
      console.error(t('karmograph.id.msg'), e);
    }
  }
  const next: LibraryIndex = {
    activeId: id,
    maps: [...index.maps, { id, name, updatedAt: Date.now() }],
  };
  writeIndex(next);
  return { index: next, id };
}

/**
 * 맵을 지운다. 마지막 한 장은 지우지 않고 **비운다** — 목록이 0장이 되는 상태를 만들지 않으려고
 * (0장이면 「어느 맵을 열지」가 다시 특수 케이스가 된다).
 */
export function removeMap(index: LibraryIndex, id: string): LibraryIndex {
  markGone(id);   // 지웠다는 표시가 없으면, 다른 탭의 목록이 이 판을 도로 살린다
  try {
    localStorage.removeItem(mapKey(id));
  } catch (e) {
    console.error(t('karmograph.id.msg2'), e);
  }
  if (index.maps.length <= 1) {
    const next: LibraryIndex = { activeId: id, maps: [{ id, name: index.maps[0]?.name ?? t('karmograph.legacy.msg3'), updatedAt: Date.now() }] };
    writeIndex(next);
    return next;
  }
  const maps = index.maps.filter((m) => m.id !== id);
  const next: LibraryIndex = { activeId: index.activeId === id ? maps[0].id : index.activeId, maps };
  writeIndex(next);
  return next;
}

export function activeName(index: LibraryIndex): string {
  return index.maps.find((m) => m.id === index.activeId)?.name ?? t('karmograph.maps.msg');
}
