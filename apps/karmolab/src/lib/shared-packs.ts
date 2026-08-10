/**
 * 남과 나누는 표 — 브라우저 쪽 이음매 (TASK-KL-150).
 *
 * 지금까지 표는 이 브라우저 안에서 끝났다. 남에게 주려면 표 전체를 주소에 실어야 했고(수 KB),
 * 받은 사람은 **사본**을 가지니 원본이 고쳐져도 모르고, 같은 표로 논 사람끼리 겨룰 수도 없었다.
 *
 * 여기서 하는 일은 그 표에 **주소를 붙이는 것**뿐이다. 나머지는 전부 그대로 둔다 —
 * 표의 모양도, 놀이가 표를 읽는 법도(`pack-store`). 새 모양을 만들면 그날부터 갈라진다.
 *
 * **fail-open**: 서버가 죽거나 로그인을 안 했으면 이 파일의 모든 함수가 조용히 `null` 을
 * 돌려주고, 화면은 지금까지와 똑같이 이 브라우저 표만 쓴다.
 */
import { loadPacks, putPack, type Pack, type PackField, type PackItem } from '../widgets/pack-store';
import { t, loadNamespace } from './i18n';

/* 이 파일은 위젯이 아니라 **셸·라이브러리**다 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 이 파일을 읽으므로 document 가 있을 때만 부른다. */
if (typeof document !== 'undefined') void loadNamespace('sharedpacks');

const API_BASE = 'https://yawnbot.mascari4615.com';
const TIMEOUT_MS = 6000;

export interface SharedPackSummary {
  id: string;
  ownerHandle: string;
  title: string;
  emoji: string;
  items: number;
  fields: number;
  /** 겨룰 수 있는 숫자 칸 수 — 0 이면 「높은 쪽 고르기」에 못 건다. */
  numberFields: number;
  /** 그림이 붙은 항목 수 — 월드컵처럼 그림이 주인공인 놀이가 본다. */
  images: number;
  opens: number;
  createdAt: string;
  updatedAt: string;
  forkOf: string | null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      signal: control.signal,
      ...init,
    });
    if (!res.ok) {
      // 실패해도 **왜인지**는 화면이 말할 수 있어야 한다 — 몸통에 이유가 실려 온다.
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return body ? ({ ...body, ok: false } as unknown as T) : null;
    }
    return (await res.json()) as T;
  } catch {
    return null; // 서버가 죽었거나 느리다 — 이 브라우저 표로 그냥 논다
  } finally {
    clearTimeout(timer);
  }
}

/** 남들이 올린 표 목록. 못 받으면 null (화면은 그 칸만 안 그린다). */
export function listShared(options: {
  sort?: 'popular' | 'new';
  mine?: boolean;
  needs?: 'number' | 'image';
  q?: string;
  limit?: number;
} = {}): Promise<{ packs: SharedPackSummary[]; signedIn: boolean; total: { packs: number; makers: number; items: number } } | null> {
  const params = new URLSearchParams();
  if (options.sort) params.set('sort', options.sort);
  if (options.mine) params.set('mine', '1');
  if (options.needs) params.set('needs', options.needs);
  if (options.q) params.set('q', options.q);
  if (options.limit) params.set('limit', String(options.limit));
  return call(`/kl/packs?${params.toString()}`);
}

/**
 * 표 하나를 통째로 받아 **이 브라우저로 들인다**.
 *
 * 왜 들이나: 놀이들은 이미 이 브라우저의 표를 읽어 판을 짠다(`pack-store`). 서버 표만 다른
 * 길로 읽게 하면 놀이마다 두 갈래가 생긴다. 대신 **서버 주소를 같이 적어 둔다** —
 * 순위판은 그 주소로 갈리므로, 같은 표로 논 사람끼리 한 순위판에서 만난다.
 */
export async function adoptShared(id: string): Promise<Pack | null> {
  const got = await call<{ pack?: { id: string; ownerHandle: string; title: string; emoji: string; fields: PackField[]; items: PackItem[] } }>(
    `/kl/packs/${encodeURIComponent(id)}`,
  );
  if (!got || !got.pack || !Array.isArray(got.pack.items)) return null;
  const pack: Pack = {
    id: 'p' + Date.now().toString(36),
    title: got.pack.title,
    emoji: got.pack.emoji,
    fields: got.pack.fields,
    items: got.pack.items,
    sharedId: got.pack.id,
    sharedBy: got.pack.ownerHandle,
  };
  return putPack(pack) ? pack : null;
}

export interface UploadResult {
  /** 올라간 표의 서버 주소. */
  id?: string;
  /** 안 됐으면 이유 — 화면이 사람 말로 옮긴다. */
  error?: string;
  detail?: Record<string, unknown>;
}

/** 이 브라우저의 표를 서버에 올린다. 로그인 안 했으면 `not_signed_in`. */
export async function uploadPack(pack: Pack, forkOf?: string | null): Promise<UploadResult> {
  const body = await call<Record<string, unknown>>('/kl/packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: pack.title,
      emoji: pack.emoji,
      fields: pack.fields,
      items: pack.items,
      ...(forkOf ? { forkOf } : {}),
    }),
  });
  if (!body) return { error: 'offline' };
  if (body.ok === false || body.error) {
    const { error, ok, ...detail } = body as Record<string, unknown>;
    return { error: String(error ?? 'unknown'), detail: detail as Record<string, unknown> };
  }
  const made = body.pack as { id?: string } | undefined;
  return made && made.id ? { id: made.id } : { error: 'unknown' };
}

/** 이미 올린 표를 고친다(주인만). */
export async function updateShared(sharedId: string, pack: Pack): Promise<UploadResult> {
  const body = await call<Record<string, unknown>>(`/kl/packs/${encodeURIComponent(sharedId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: pack.title, emoji: pack.emoji, fields: pack.fields, items: pack.items }),
  });
  if (!body) return { error: 'offline' };
  if (body.ok === false || body.error) return { error: String(body.error ?? 'unknown') };
  return { id: sharedId };
}

/**
 * 이 표로 놀 때 **순위판을 가르는 이름**.
 *
 * 서버 주소가 있으면 그것 — 그래야 같은 표로 논 사람끼리 한 판에서 만난다.
 * 없으면 이 브라우저 안의 이름(혼자만의 기록).
 */
export function variantFor(pack: { id: string; sharedId?: string }): string {
  return `pack:${pack.sharedId ?? pack.id}`;
}

/** 안 된 이유를 사람 말로. 코드만 보여 주면 아무도 못 고친다. */
export function packErrorText(error: string, detail?: Record<string, unknown>): string {
  switch (error) {
    case 'not_signed_in':
      return t('sharedpacks.t01');
    case 'too_few_items':
      return t('sharedpacks.tooFew', { n: Number(detail?.min ?? 4) });
    case 'no_fields':
      return t('sharedpacks.t02');
    case 'bad_title':
      return t('sharedpacks.t03');
    case 'too_big':
      return t('sharedpacks.t04');
    case 'daily_limit':
      return t('sharedpacks.dailyLimit', { n: Number(detail?.limit ?? 20) });
    case 'not_owner':
      return t('sharedpacks.t05');
    case 'offline':
      return t('sharedpacks.t06');
    default:
      return t('sharedpacks.t07');
  }
}

/* ── 로그인 전에 만든 표를 잃지 않는다 (TASK-KL-151 ⑦) ──────────────────────
 *
 * 「올리려면 로그인하세요」로 끝내면 대부분 거기서 나간다. 붙여넣고 다듬어 만든 표를
 * 두고 로그인 왕복을 다녀오라는 뜻이기 때문이다.
 *
 * 그래서 **올리려던 사실을 적어 두고** 로그인으로 보낸다. 돌아오면 그 표가 저절로 올라간다.
 * 표 자체는 이미 이 브라우저에 있으니 여기 적는 것은 「어느 표였나」 하나뿐이다.
 */
const PENDING_KEY = 'karmolab_pack_upload_pending';

function readPending(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writePending(list: string[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* 못 적으면 로그인 뒤 손으로 한 번 더 누르면 된다 */
  }
}

/** 로그인하고 오면 올릴 표로 적어 둔다. */
export function queueUpload(localPackId: string): void {
  const list = readPending();
  if (list.indexOf(localPackId) < 0) list.push(localPackId);
  writePending(list);
}

/**
 * 적어 둔 표들을 올린다 — 로그인한 뒤 한 번 부른다.
 *
 * 실패한 것은 **줄에서 안 뺀다**(서버가 잠깐 죽었을 수 있다). 다만 표가 이 브라우저에서
 * 사라졌으면 그 줄은 지운다 — 영영 못 올릴 것을 계속 들고 있을 이유가 없다.
 *
 * @returns 실제로 올라간 표들.
 */
export async function flushQueuedUploads(): Promise<Pack[]> {
  const list = readPending();
  if (!list.length) return [];
  const done: Pack[] = [];
  const left: string[] = [];
  for (const id of list) {
    const pack = loadPacks().filter((p) => p.id === id)[0];
    if (!pack) continue; // 표가 사라졌다 — 줄에서 뺀다
    if (pack.sharedId) continue; // 이미 올라가 있다
    const res = await uploadPack(pack);
    if (res.id) {
      putPack({ ...pack, sharedId: res.id });
      done.push(pack);
    } else if (res.error === 'offline') {
      left.push(id); // 서버가 잠깐 없었을 뿐이다 — 다음에 다시
    }
  }
  writePending(left);
  return done;
}
