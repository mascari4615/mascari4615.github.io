/**
 * 모험 raw 진행 storage — KL-032 결정 8 (세이브/로드 자율 결정).
 *
 * Tauri 환경: Tauri command 'adventure_save_raw' 가 memo/projects/karmolab/raw/adventures/{slug}.json 박음 (ζ 단계).
 * 브라우저: localStorage 임시 (Tauri 미가용 시 fallback).
 *
 * raw = turn 마다 user/assistant message + parsed (선택지 / NPC / scene) + image refs 누적.
 */

export interface AdventureTurnRecord {
  ts: string;
  userText: string;
  assistantText: string;
  parsed?: {
    narrative: string;
    choices: string[];
    npcSlugs: string[];
    sceneTitles: string[];
    ended: boolean;
  };
  imageRefs?: string[];
  providerId?: string;
  modelId?: string;
}

export interface AdventureSession {
  slug: string;
  startedAt: string;
  castSlugs: string[];
  turns: AdventureTurnRecord[];
}

const STORAGE_KEY_PREFIX = 'kl_adventure_session_';

type TauriInvoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

function getTauriInvoke(): TauriInvoke | null {
  const t = (globalThis as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } }).__TAURI__;
  return t?.core?.invoke ?? null;
}

export function newSessionSlug(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `adv-${yyyy}${mm}${dd}-${hh}${mi}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createSession(castSlugs: string[]): AdventureSession {
  return {
    slug: newSessionSlug(),
    startedAt: new Date().toISOString(),
    castSlugs: castSlugs.slice(),
    turns: [],
  };
}

export async function saveSession(session: AdventureSession): Promise<void> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('adventure_save_raw', { session });
      return;
    } catch (err) {
      // Tauri command 미구현 (ζ 단계 전) — fallback localStorage
      console.warn('[adventure] adventure_save_raw 미가용, localStorage fallback', err);
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + session.slug, JSON.stringify(session));
  } catch (err) {
    console.error('[adventure] localStorage 저장 실패', err);
  }
}

export function loadSession(slug: string): AdventureSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + slug);
    if (!raw) return null;
    return JSON.parse(raw) as AdventureSession;
  } catch (err) {
    console.error('[adventure] localStorage 로드 실패', err);
    return null;
  }
}

export async function deleteSession(slug: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('adventure_delete_raw', { slug });
      return;
    } catch (err) {
      console.warn('[adventure] adventure_delete_raw 미가용, localStorage fallback', err);
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + slug);
  } catch (err) {
    console.error('[adventure] localStorage 삭제 실패', err);
  }
}

export function listLocalSessionSlugs(): string[] {
  const slugs: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        slugs.push(key.slice(STORAGE_KEY_PREFIX.length));
      }
    }
  } catch (err) {
    console.error('[adventure] localStorage 목록 실패', err);
  }
  return slugs.sort().reverse();
}
