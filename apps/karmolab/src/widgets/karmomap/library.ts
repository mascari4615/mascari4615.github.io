/**
 * library.ts — 맵 여러 장 (TASK-KL-202 격차 H).
 *
 * 원래 KarmoMap 은 localStorage 키 하나(`karmomap.graph`)에 그림 한 장만 들고 있었다.
 * 그런데 이 도구의 쓰임새는 「최애 관계도」·「내 세계관」·「이번 덱 전개」처럼 **여러 장**이다 —
 * 한 장뿐이면 새 그림을 그리려면 전에 그린 걸 지워야 한다.
 *
 * 구조:
 *   `karmomap.index`      → { activeId, maps: [{ id, name, updatedAt }] }
 *   `karmomap.map.<id>`   → GraphSpec 한 장
 *
 * 옛 단일 키는 처음 열 때 첫 장으로 옮기고 **스스로 지운다** (마이그레이션은 자기소멸).
 */
import { t } from '../../lib/i18n';


const INDEX_KEY = 'karmomap.index';
const MAP_PREFIX = 'karmomap.map.';
const LEGACY_KEY = 'karmomap.graph';

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
    console.error(t('karmomap.t405'), e);
    return null;
  }
}

function writeIndex(index: LibraryIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error(t('karmomap.t406'), e);
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
      console.error(t('karmomap.t407'), e);
    }
  }
  const index: LibraryIndex = {
    activeId: id,
    maps: [{ id, name: legacy ? t('karmomap.t408') : t('karmomap.t409'), updatedAt: Date.now() }],
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
      console.error(t('karmomap.t410'), e);
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
  try {
    localStorage.removeItem(mapKey(id));
  } catch (e) {
    console.error(t('karmomap.t411'), e);
  }
  if (index.maps.length <= 1) {
    const next: LibraryIndex = { activeId: id, maps: [{ id, name: index.maps[0]?.name ?? t('karmomap.t409'), updatedAt: Date.now() }] };
    writeIndex(next);
    return next;
  }
  const maps = index.maps.filter((m) => m.id !== id);
  const next: LibraryIndex = { activeId: index.activeId === id ? maps[0].id : index.activeId, maps };
  writeIndex(next);
  return next;
}

export function activeName(index: LibraryIndex): string {
  return index.maps.find((m) => m.id === index.activeId)?.name ?? t('karmomap.t412');
}
