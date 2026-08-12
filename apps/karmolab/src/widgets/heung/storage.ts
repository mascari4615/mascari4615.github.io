import { normalizeProject, projectJson, type StudioProject } from './model';
import type { StudioAssetRuntime } from './audio-engine';

const PROJECT_KEY = 'karmolab_heung_project_v1';
/** 이름을 「흥」으로 바꾸기 전 열쇠. 남의 곡을 잃게 할 수는 없다 — 한 번 옮기고 옛 것을 지운다. */
const LEGACY_PROJECT_KEY = 'karmolab_karmo_studio_project_v1';

function migrateLegacy(): void {
  try {
    if (localStorage.getItem(PROJECT_KEY) !== null) return;
    const old = localStorage.getItem(LEGACY_PROJECT_KEY);
    if (old === null) return;
    localStorage.setItem(PROJECT_KEY, old);
    localStorage.removeItem(LEGACY_PROJECT_KEY);
  } catch (_) { /* 저장소가 막혀 있으면 그냥 새로 시작한다 */ }
}
const DB_NAME = 'heung-v1';
const STORE_NAME = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open audio storage'));
  });
}

async function dbSet(id: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(bytes, id);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function dbGet(id: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  const result = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close(); return result;
}

export function saveProject(project: StudioProject): void {
  const compact = { ...project, assets: project.assets.map(({ dataUrl: _dataUrl, ...asset }) => asset), updatedAt: new Date().toISOString() };
  localStorage.setItem(PROJECT_KEY, projectJson(compact, false));
}

export function loadProject(): StudioProject | null {
  migrateLegacy();
  const raw = localStorage.getItem(PROJECT_KEY);
  if (!raw) return null;
  try { return normalizeProject(JSON.parse(raw)); } catch (_) { return null; }
}

export async function addAsset(file: Blob, asset: StudioAssetRuntime): Promise<void> {
  await dbSet(asset.id, await file.arrayBuffer());
}

export async function hydrateAssets(project: StudioProject, context: BaseAudioContext): Promise<Map<string, StudioAssetRuntime>> {
  const map = new Map<string, StudioAssetRuntime>();
  for (const asset of project.assets) {
    let bytes: ArrayBuffer | undefined;
    if (asset.dataUrl) bytes = await (await fetch(asset.dataUrl)).arrayBuffer();
    else { try { bytes = await dbGet(asset.id); } catch (_) { bytes = undefined; } }
    const runtime: StudioAssetRuntime = { ...asset };
    if (bytes) {
      try { runtime.buffer = await context.decodeAudioData(bytes.slice(0)); } catch (_) { /* keep missing asset visible */ }
    }
    map.set(asset.id, runtime);
  }
  return map;
}

function bytesToDataUrl(bytes: ArrayBuffer, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
}

export async function portableProject(project: StudioProject): Promise<string> {
  const assets = [];
  for (const asset of project.assets) {
    let dataUrl = asset.dataUrl;
    if (!dataUrl) {
      try { const bytes = await dbGet(asset.id); if (bytes) dataUrl = await bytesToDataUrl(bytes, asset.type); } catch (_) { /* exported as missing */ }
    }
    assets.push({ ...asset, dataUrl });
  }
  return projectJson({ ...project, assets }, true);
}

export async function importPortable(json: string): Promise<StudioProject> {
  const project = normalizeProject(JSON.parse(json));
  for (const asset of project.assets) {
    if (!asset.dataUrl) continue;
    const bytes = await (await fetch(asset.dataUrl)).arrayBuffer();
    try { await dbSet(asset.id, bytes); } catch (_) { /* session can still use embedded data */ }
  }
  saveProject(project); return project;
}
