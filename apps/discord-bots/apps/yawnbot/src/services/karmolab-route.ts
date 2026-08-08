/**
 * 말로 부리기 (TASK-KL-196 E) — 「하려는 일」을 적으면 도구를 고른다.
 *
 * 왜 있나: 도구가 160개인데 사람들이 여는 건 늘 같은 열몇 개다. 병목은 만드는 것이 아니라
 * **닿는 것**이다. 찾는 칸은 이름으로만 찾으므로 「사진에서 글자 빼줘」는 0건이 나온다 —
 * 그 도구가 있는데도.
 *
 * 왜 낱말표를 안 쓰나: 「배경 지우기 → bgremove」 같은 표를 손으로 적으면 **반드시 샌다**.
 * 사람이 쓰는 말은 표보다 넓고, 도구가 늘 때마다 그 표도 같이 늘려야 한다(그리고 안 는다).
 *
 * 왜 서버인가: 브라우저 쪽 AI 는 **각자의 열쇠**를 요구한다(`toolbox_vertex_api_key`).
 * 그러면 열쇠를 넣은 사람만 쓰는 기능이 되는데, 이건 처음 온 사람에게 제일 필요한 것이다.
 *
 * 아끼는 방법 셋 (노트북 한 대가 서버다):
 *  1. **이름으로 찾아지면 여기까지 안 온다** — 화면이 0건일 때만 부른다.
 *  2. 같은 물음은 **한 번만** 묻는다(답 캐시).
 *  3. 사람마다 초·일 단위 상한.
 *
 * 도구 목록의 정본은 **사이트**다(`data/tools-seo.json`). 여기서 한 벌 더 적으면 도구가 늘 때
 * 서버도 같이 고쳐야 하고, 안 고치면 새 도구는 영영 안 골린다.
 */
export interface RouteCatalogEntry {
  id: string;
  title: string;
  lead: string;
}

export interface RoutePick {
  toolId: string;
  why: string;
}

/** 도구 목록을 어디서 길어 오나. 사이트가 정본. */
const CATALOG_URL = 'https://blog.mascari4615.com/apps/karmolab/data/tools-seo.json';

/** 목록은 배포될 때만 바뀐다 — 한 시간이면 충분하고, 그 사이 새 도구가 하나 늦게 걸릴 뿐이다. */
const CATALOG_TTL_MS = 60 * 60 * 1000;

/** 물음 하나의 최대 길이. 이보다 길면 물음이 아니라 붙여넣기다. */
export const MAX_QUERY = 120;

/** 답 캐시 최대 개수. 넘으면 오래된 것부터 버린다(노트북 메모리). */
const ANSWER_CACHE_MAX = 500;

/** 한 사람이 이만큼 자주는 못 묻는다. */
export const MIN_GAP_MS = 3000;
export const DAILY_LIMIT = 60;

let catalog: { at: number; items: RouteCatalogEntry[] } | null = null;

/**
 * 도구 목록. 못 받아 오면 **빈 배열** — 그러면 이 기능은 조용히 없는 셈이 된다
 * (찾는 칸은 지금까지처럼 그대로 돈다).
 */
export async function loadCatalog(now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<RouteCatalogEntry[]> {
  if (catalog && now - catalog.at < CATALOG_TTL_MS) return catalog.items;
  try {
    const response = await fetchImpl(CATALOG_URL);
    if (!response.ok) return catalog?.items ?? [];
    const body = (await response.json()) as { tools?: Record<string, { lead?: string; description?: string }> };
    const items: RouteCatalogEntry[] = Object.entries(body.tools ?? {}).map(([id, meta]) => ({
      id,
      title: id,
      lead: String(meta.lead || meta.description || '').slice(0, 120),
    }));
    if (items.length) catalog = { at: now, items };
    return catalog?.items ?? [];
  } catch {
    // 낡은 목록이라도 있으면 그것을 쓴다 — 없는 것보다 낫다(도구는 잘 안 사라진다).
    return catalog?.items ?? [];
  }
}

/** 시험에서 목록을 갈아 끼우는 자리. 운영 코드에서는 안 쓴다. */
export function setCatalogForTest(items: RouteCatalogEntry[] | null, at = Date.now()): void {
  catalog = items ? { at, items } : null;
}

/**
 * 물음 정규화 — 캐시 열쇠. 띄어쓰기·대소문자·물음표 차이로 같은 물음을 두 번 묻지 않는다.
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?？!！.。]+$/, '');
}

/**
 * 모델에게 줄 말. **도구 id 만 고르게 한다** — 문장을 지어내게 하면 그 문장이 곧 우리 화면의
 * 말이 되고, 우리가 안 쓴 말이 사이트에 뜬다.
 * 「없다」를 고를 수 있게 한다 — 억지로 하나를 고르게 하면 엉뚱한 도구로 보낸다.
 */
export function buildPrompt(question: string, items: RouteCatalogEntry[]): string {
  const list = items.map((item) => `${item.id}: ${item.lead}`).join('\n');
  return [
    '너는 도구 사이트의 안내다. 사람이 "하려는 일"을 적으면 아래 목록에서 **가장 알맞은 도구 하나**를 고른다.',
    '',
    '규칙:',
    '- 목록에 있는 id 만 고른다. 없으면 none 이라고 답한다.',
    '- 애매하면 none. 엉뚱한 도구로 보내는 것이 안 보내는 것보다 나쁘다.',
    '- 이유는 한국어 한 줄(30자 이내). 도구가 그 일을 어떻게 해 주는지만 적는다.',
    '- 출력은 JSON 한 줄: {"toolId":"<id 또는 none>","why":"<한 줄>"}',
    '',
    '도구 목록:',
    list,
    '',
    `하려는 일: ${question}`,
  ].join('\n');
}

/**
 * 모델 답에서 고른 도구를 꺼낸다. **목록에 없는 id 는 버린다** — 모델이 그럴듯한 이름을
 * 지어내는 일이 있고, 그대로 열면 「없는 화면」으로 떨어진다.
 */
export function parsePick(raw: string, items: RouteCatalogEntry[]): RoutePick | null {
  const text = String(raw || '');
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  let parsed: { toolId?: unknown; why?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const toolId = typeof parsed.toolId === 'string' ? parsed.toolId.trim() : '';
  if (!toolId || toolId === 'none') return null;
  if (!items.some((item) => item.id === toolId)) return null;
  const why = typeof parsed.why === 'string' ? parsed.why.trim().slice(0, 60) : '';
  return { toolId, why };
}

/** 답 캐시 + 사람별 상한. 서버가 살아 있는 동안만 산다(껐다 켜면 처음부터 — 그래도 된다). */
export class RouteMemory {
  private answers = new Map<string, RoutePick | null>();
  private seen = new Map<string, { last: number; day: string; count: number }>();

  get(query: string): { hit: boolean; pick: RoutePick | null } {
    const key = normalizeQuery(query);
    return this.answers.has(key) ? { hit: true, pick: this.answers.get(key) ?? null } : { hit: false, pick: null };
  }

  /** 「없다」도 기억한다 — 안 그러면 답 없는 물음이 매번 모델을 부른다. */
  put(query: string, pick: RoutePick | null): void {
    const key = normalizeQuery(query);
    this.answers.set(key, pick);
    while (this.answers.size > ANSWER_CACHE_MAX) {
      const oldest = this.answers.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.answers.delete(oldest);
    }
  }

  /** 물어도 되나. 상한은 **캐시에 없을 때만** 센다 — 아낀 물음까지 세면 아낀 보람이 없다. */
  allow(who: string, now = Date.now()): boolean {
    const day = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
    const row = this.seen.get(who);
    if (!row || row.day !== day) {
      this.seen.set(who, { last: now, day, count: 1 });
      return true;
    }
    if (now - row.last < MIN_GAP_MS) return false;
    if (row.count >= DAILY_LIMIT) return false;
    row.last = now;
    row.count += 1;
    return true;
  }
}
