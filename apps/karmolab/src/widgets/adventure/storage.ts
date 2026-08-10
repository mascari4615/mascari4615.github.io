/**
 * 모험 raw 진행 storage — KL-032 결정 8 (세이브/로드 자율 결정).
 *
 * Tauri 환경: Tauri command 'adventure_save_raw' 가 memo/projects/karmolab/raw/adventures/{slug}.json 박음 (ζ 단계).
 * 브라우저: localStorage 임시 (Tauri 미가용 시 fallback).
 *
 * raw = turn 마다 user/assistant message + parsed (선택지 / NPC / scene) + image refs 누적.
 *
 * KL-037: 이미지 (η Vertex Imagen) 는 dataUrl 인라인 X — `adventure_save_image` 가
 * 별 PNG 로 박고 path 만 imageRef 에 박힘. raw JSON 사이즈 폭주 방지 + git diff/push 비용 ↓.
 */
import { t } from '../../lib/i18n';


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

/**
 * KL-037: dataUrl → 별 PNG 파일 박고 session-relative path 반환.
 *
 * Tauri 환경: `adventure_save_image` 호출 → `images/turn-NN-ts.png` write → path return.
 * Tauri 미가용 시 (브라우저): dataUrl 그대로 반환하지만 size limit (~256KB) 초과면 경고 + null.
 */
export async function saveImage(
  slug: string,
  turnIndex: number,
  dataUrl: string,
): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const result = (await invoke('adventure_save_image', {
        payload: {
          sessionSlug: slug,
          turnIndex,
          dataUrl,
        },
      })) as { path?: string };
      if (result?.path) {
        return result.path;
      }
      console.warn(t('adventure.t41'), result);
      return null;
    } catch (err) {
      console.warn(t('adventure.t42'), err);
    }
  }
  // 브라우저 fallback — dataUrl 직접 박지만 size limit 강제 (KL-037 raw JSON 폭주 방지).
  const SIZE_LIMIT = 256 * 1024; // 256KB
  if (dataUrl.length > SIZE_LIMIT) {
    console.warn(
      `[adventure] dataUrl 크기 ${dataUrl.length} > ${SIZE_LIMIT} — 인라인 박지 않음`,
    );
    return null;
  }
  return dataUrl;
}

export async function saveSession(session: AdventureSession): Promise<void> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('adventure_save_raw', { session });
      return;
    } catch (err) {
      // Tauri command 미구현 (ζ 단계 전) — fallback localStorage
      console.warn(t('adventure.t43'), err);
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + session.slug, JSON.stringify(session));
  } catch (err) {
    console.error(t('adventure.t44'), err);
  }
}

export function loadSession(slug: string): AdventureSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + slug);
    if (!raw) return null;
    return JSON.parse(raw) as AdventureSession;
  } catch (err) {
    console.error(t('adventure.t45'), err);
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
      console.warn(t('adventure.t46'), err);
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + slug);
  } catch (err) {
    console.error(t('adventure.t47'), err);
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
    console.error(t('adventure.t48'), err);
  }
  return slugs.sort().reverse();
}
