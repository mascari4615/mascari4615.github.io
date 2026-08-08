/**
 * 사람이 만든 표 — 공용 원장 (TASK-KL-150, 게임 커스텀/UGC).
 *
 * 왜 있나: 「내 표 만들기」(KL-089)로 표는 만들 수 있었지만 **그 표는 만든 사람 브라우저 안에서
 * 끝났다.** 남에게 주려면 표 전체를 주소에 실어 보내야 했고(길이 수 KB), 받은 사람은 사본을
 * 갖게 되니 원본이 고쳐져도 모르고, 같은 표로 논 사람끼리 겨룰 수도 없었다.
 * 표가 **주소를 갖는 순간** 이 셋이 한꺼번에 풀린다 — 공유·갱신·순위.
 *
 * 표의 모양은 브라우저 쪽(`pack-store.ts`)과 **똑같다**. 새 모양을 만들면 그날부터 갈라진다.
 * 여기서 하는 일은 모양을 바꾸는 게 아니라 **믿을 수 없는 입력을 다듬는 것**이다 —
 * 이 원장은 아무나 글을 보낼 수 있는 자리다.
 *
 * 순위와의 관계: 놀이 기록 원장(`karmolab-plays`)이 이미 「표마다 순위판이 갈린다」를 안다.
 * 그래서 여기서 만든 표 id 를 그대로 `pack:<id>` 로 넘기면 **서버를 안 고치고** 순위판이 생긴다.
 *
 * 저장 = `data/karmolab-packs-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';
import { kstDay } from './karmolab-traces';

const STATE_FILE = 'karmolab-packs-state.json';

/** 한 사람이 하루에 올릴 수 있는 표. 실수로 반복 저장해도 원장이 안 터지게. */
export const PACK_DAILY_LIMIT = 20;

export const PACK_TITLE_MAX = 40;
export const PACK_ITEM_MIN = 4;
export const PACK_ITEM_MAX = 512;
export const PACK_FIELD_MAX = 12;
export const PACK_TEXT_MAX = 60;
/** 표 하나의 전체 크기 상한. 이게 없으면 한 사람이 원장을 통째로 채운다. */
export const PACK_BYTES_MAX = 512 * 1024;

export interface PackField {
  key: string;
  label: string;
  kind: 'number' | 'set' | 'category';
  unit?: string;
}

export type PackItem = { name: string; img?: string } & Record<string, string | string[] | number | undefined>;

export interface SharedPack {
  id: string;
  ownerHandle: string;
  title: string;
  emoji: string;
  fields: PackField[];
  items: PackItem[];
  createdAt: string;
  updatedAt: string;
  /** 몇 번 열렸나 (같은 사람 새로고침은 안 센다). 지어낸 수 0. */
  opens: number;
  /** 어느 표에서 갈라져 나왔나. 남의 표를 이어받아 고치면 여기 남는다. */
  forkOf: string | null;
}

/** 목록에 실어 보내는 요약 — 표 전체(수백 KB)를 목록마다 실어 보내지 않는다. */
export interface PackSummary {
  id: string;
  ownerHandle: string;
  title: string;
  emoji: string;
  items: number;
  fields: number;
  /** 겨룰 수 있는 숫자 칸이 있나 — 없으면 「높은 쪽 고르기」에 못 건다. */
  numberFields: number;
  /** 그림이 붙은 항목 수 — 월드컵처럼 그림이 주인공인 놀이가 이걸 본다. */
  images: number;
  opens: number;
  createdAt: string;
  updatedAt: string;
  forkOf: string | null;
}

interface PacksState {
  version: 1;
  packs: SharedPack[];
}

export class PackError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

function text(raw: unknown, max: number): string {
  // 눈에 안 보이는 글자·줄바꿈·글자 방향을 뒤집는 표식을 지운다 — 한 줄이 목록을 밀어내거나
  // 이름이 거꾸로 보이게 만드는 장난을 막는다.
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029\uFEFF]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * 그림 주소. **`https:` 만** 받는다.
 *
 * `javascript:`·`data:` 를 그대로 두면 그림 자리에 스크립트를 실어 남의 화면에서 돌릴 수 있다.
 * 허용 목록을 굳이 안 두는 이유: 사람이 어디에 그림을 올려 둘지는 우리가 정할 일이 아니다.
 */
function imageUrl(raw: unknown): string | undefined {
  const value = text(raw, 500);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 아무나 보내는 몸통을 표 모양으로 다듬는다.
 *
 * **버리지 않고 다듬는다** — 칸 하나가 이상하다고 표 전체를 거절하면, 스프레드시트에서
 * 긁어 온 사람은 뭐가 문제인지 영영 모른다. 다만 표가 성립 자체를 못 하면(항목이 넷 미만 등)
 * 그때는 이유를 달아 거절한다.
 */
export function sanitizePack(raw: unknown): { title: string; emoji: string; fields: PackField[]; items: PackItem[] } {
  const body = (raw ?? {}) as Record<string, unknown>;
  const size = Buffer.byteLength(JSON.stringify(body ?? {}), 'utf-8');
  if (size > PACK_BYTES_MAX) throw new PackError('too_big', { max: PACK_BYTES_MAX, size });

  const title = text(body.title, PACK_TITLE_MAX);
  if (!title) throw new PackError('bad_title', { max: PACK_TITLE_MAX });
  // 이모지는 한두 글자면 된다. 없으면 주사위 — 목록에서 빈자리가 안 생기게.
  const emoji = text(body.emoji, 4) || '🎲';

  const rawFields = Array.isArray(body.fields) ? body.fields : [];
  const fields: PackField[] = [];
  const seenKeys = new Set<string>();
  for (const one of rawFields.slice(0, PACK_FIELD_MAX)) {
    const field = (one ?? {}) as Record<string, unknown>;
    const key = text(field.key, 24).replace(/[^A-Za-z0-9_]/g, '');
    const label = text(field.label, PACK_TEXT_MAX);
    const kind = field.kind === 'number' || field.kind === 'set' ? field.kind : 'category';
    if (!key || !label || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const unit = text(field.unit, 12);
    fields.push({ key, label, kind, ...(unit ? { unit } : {}) });
  }
  if (!fields.length) throw new PackError('no_fields');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: PackItem[] = [];
  const seenNames = new Set<string>();
  for (const one of rawItems.slice(0, PACK_ITEM_MAX)) {
    const source = (one ?? {}) as Record<string, unknown>;
    const name = text(source.name, PACK_TEXT_MAX);
    if (!name || seenNames.has(name)) continue; // 같은 이름 둘은 놀이가 못 가른다
    seenNames.add(name);
    const item: PackItem = { name };
    const img = imageUrl(source.img);
    if (img) item.img = img;
    for (const field of fields) {
      const value = source[field.key];
      if (value === undefined || value === null) continue;
      if (field.kind === 'number') {
        const num = Number(value);
        if (Number.isFinite(num)) item[field.key] = num;
      } else if (field.kind === 'set') {
        const list = (Array.isArray(value) ? value : String(value).split(/[,·]/))
          .map((v) => text(v, PACK_TEXT_MAX))
          .filter(Boolean)
          .slice(0, 16);
        if (list.length) item[field.key] = list;
      } else {
        const one2 = text(value, PACK_TEXT_MAX);
        if (one2) item[field.key] = one2;
      }
    }
    items.push(item);
  }
  if (items.length < PACK_ITEM_MIN) throw new PackError('too_few_items', { min: PACK_ITEM_MIN });

  return { title, emoji, fields, items };
}

export function summarize(pack: SharedPack): PackSummary {
  return {
    id: pack.id,
    ownerHandle: pack.ownerHandle,
    title: pack.title,
    emoji: pack.emoji,
    items: pack.items.length,
    fields: pack.fields.length,
    numberFields: pack.fields.filter((f) => f.kind === 'number').length,
    images: pack.items.filter((i) => typeof i.img === 'string' && i.img).length,
    opens: pack.opens,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    forkOf: pack.forkOf,
  };
}

/** 표 주소로 쓸 짧은 이름. 사람이 입으로 읽을 일이 있어서 헷갈리는 글자는 뺀다. */
function newId(): string {
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function isValidPackId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9]{4,16}$/.test(raw);
}

export class KarmolabPackStore {
  private state: PacksState;
  /** `<주소열쇠>:<표>` → 마지막으로 센 시각. 메모리에만 (재시작하면 한 번 더 세도 무해). */
  private readonly recentOpens = new Map<string, number>();

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): PacksState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<PacksState>;
        return { version: 1, packs: Array.isArray(parsed.packs) ? parsed.packs : [] };
      }
    } catch (error) {
      console.error('[karmolab-packs] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return { version: 1, packs: [] };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (error) {
      console.error('[karmolab-packs] 상태 저장 실패:', error);
    }
  }

  get(id: unknown): SharedPack | null {
    if (!isValidPackId(id)) return null;
    return this.state.packs.find((p) => p.id === id) ?? null;
  }

  /** 표를 올린다. 모양이 안 되면 `PackError` 를 던진다(부르는 쪽이 400 으로 옮긴다). */
  create(handle: string, raw: unknown, forkOf: string | null = null, now: Date = new Date()): SharedPack {
    const today = kstDay(now);
    const mine = this.state.packs.filter((p) => p.ownerHandle === handle && kstDay(new Date(p.createdAt)) === today);
    if (mine.length >= PACK_DAILY_LIMIT) throw new PackError('daily_limit', { limit: PACK_DAILY_LIMIT });

    const clean = sanitizePack(raw);
    // 이어받기는 **있는 표**에서만 갈라진다 — 없는 주소를 적어 족보를 지어내지 못하게.
    const parent = forkOf && this.get(forkOf) ? forkOf : null;
    const pack: SharedPack = {
      id: newId(),
      ownerHandle: handle,
      ...clean,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      opens: 0,
      forkOf: parent,
    };
    this.state.packs.push(pack);
    this.save();
    return pack;
  }

  /** 고친다 — 주인만. 남의 표는 고치는 게 아니라 **이어받는다**(fork). */
  update(handle: string, id: string, raw: unknown, now: Date = new Date()): SharedPack {
    const pack = this.get(id);
    if (!pack) throw new PackError('not_found');
    if (pack.ownerHandle !== handle) throw new PackError('not_owner');
    const clean = sanitizePack(raw);
    Object.assign(pack, clean, { updatedAt: now.toISOString() });
    this.save();
    return pack;
  }

  /** 내린다 — 주인만. 순위 기록은 안 지운다(그 사람들이 실제로 논 것이다). */
  remove(handle: string, id: string, isAdmin = false): boolean {
    const pack = this.get(id);
    if (!pack) return false;
    if (pack.ownerHandle !== handle && !isAdmin) throw new PackError('not_owner');
    this.state.packs = this.state.packs.filter((p) => p.id !== pack.id);
    this.save();
    return true;
  }

  /**
   * 열렸다고 센다. 같은 사람이 새로고침한 건 30분 안에는 안 센다 —
   * 「몇 번 열렸나」가 새로고침 횟수면 그 수는 아무 말도 안 하는 수가 된다.
   */
  noteOpen(id: string, visitorKey: string, now: Date = new Date()): boolean {
    const pack = this.get(id);
    if (!pack) return false;
    const key = `${visitorKey}:${id}`;
    const last = this.recentOpens.get(key) ?? 0;
    if (now.getTime() - last < 30 * 60 * 1000) return false;
    this.recentOpens.set(key, now.getTime());
    pack.opens += 1;
    this.save();
    return true;
  }

  /**
   * 목록.
   *
   * `popular` 는 **연 횟수**로 세운다(만든 사람이 아무리 자랑해도 안 열리면 안 오른다).
   * `needsNumber`/`needsImage` 는 놀이가 「내가 걸 수 있는 표」만 달라고 할 때 쓴다 —
   * 못 거는 표가 목록에 서면 눌러 보고서야 안 된다는 걸 알게 된다.
   */
  list(options: {
    sort?: 'popular' | 'new';
    owner?: string;
    needsNumber?: boolean;
    needsImage?: boolean;
    limit?: number;
    query?: string;
  } = {}): PackSummary[] {
    const limit = Math.min(100, Math.max(1, options.limit ?? 30));
    const needle = (options.query ?? '').trim().toLowerCase();
    let rows = this.state.packs.slice();
    if (options.owner) rows = rows.filter((p) => p.ownerHandle === options.owner);
    if (options.needsNumber) rows = rows.filter((p) => p.fields.some((f) => f.kind === 'number'));
    if (options.needsImage) rows = rows.filter((p) => p.items.filter((i) => i.img).length >= PACK_ITEM_MIN);
    if (needle) rows = rows.filter((p) => p.title.toLowerCase().includes(needle));
    rows.sort((a, b) =>
      options.sort === 'new' || options.owner
        ? b.createdAt.localeCompare(a.createdAt)
        : b.opens - a.opens || b.createdAt.localeCompare(a.createdAt),
    );
    return rows.slice(0, limit).map(summarize);
  }

  stats(): { packs: number; makers: number; items: number } {
    return {
      packs: this.state.packs.length,
      makers: new Set(this.state.packs.map((p) => p.ownerHandle)).size,
      items: this.state.packs.reduce((sum, p) => sum + p.items.length, 0),
    };
  }
}

let singleton: KarmolabPackStore | null = null;

export function getKarmolabPackStore(): KarmolabPackStore {
  if (!singleton) singleton = new KarmolabPackStore();
  return singleton;
}
