/**
 * 논문 재료 — OpenAlex (TASK-KL-253)
 *
 * 원래 여기 쓰려던 곳은 Semantic Scholar 였는데, **키 없이는 429** 다(2026-08-12 실측:
 * 우리 서버에서 쳐도 마찬가지). 문서가 아니라 응답으로 확인해서 다행이지, 그대로 지었으면
 * 화면이 빈 채로 배포됐을 것이다.
 *
 * OpenAlex 는 키 없이 200 이고 `Access-Control-Allow-Origin: *` 이며, 무엇보다
 * **참고문헌 목록을 그대로 준다** — 「이 논문이 무엇 위에 서 있나」를 그리려면 그게 필요하다.
 *
 * 예의 하나: 요청에 연락처를 실어 보낸다(`mailto`). 그쪽이 문서로 부탁하는 것이고,
 * 그래야 한도가 넉넉한 줄에 선다.
 */

const BASE = 'https://api.openalex.org';
const POLITE = 'mailto=mascari4615@gmail.com';

export interface Paper {
  /** `W2626778328` 같은 짧은 이름 */
  id: string;
  title: string;
  year: number;
  /** 몇 번 인용됐나 — 그림에서 **크기**가 된다 */
  cited: number;
  authors: string[];
  /** 이 논문이 딛고 선 것들 (짧은 이름) */
  refs: string[];
  /** 열어 볼 수 있는 주소 (없을 수 있다) */
  url: string;
}

interface RawWork {
  id?: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  referenced_works?: string[] | null;
  authorships?: Array<{ author?: { display_name?: string } }> | null;
  doi?: string | null;
  primary_location?: { landing_page_url?: string | null } | null;
}

/** `https://openalex.org/W123` → `W123`. 우리는 짧은 이름만 들고 다닌다. */
export function shortId(url: string): string {
  const m = /([WwAaIiSsCcPpFf]\d+)\s*$/.exec(url || '');
  return m ? m[1] : String(url || '');
}

const FIELDS = 'id,title,display_name,publication_year,cited_by_count,referenced_works,authorships,doi,primary_location';

export function toPaper(r: RawWork): Paper | null {
  const id = shortId(r.id || '');
  const title = (r.title || r.display_name || '').trim();
  if (!id || !title) return null;
  return {
    id,
    title: title.slice(0, 300),
    year: Number(r.publication_year) || 0,
    cited: Number(r.cited_by_count) || 0,
    authors: (r.authorships || [])
      .map((a) => a.author?.display_name || '')
      .filter(Boolean)
      .slice(0, 8),
    refs: (r.referenced_works || []).map(shortId).filter(Boolean),
    url: r.doi ? `https://doi.org/${String(r.doi).replace(/^https?:\/\/doi\.org\//, '')}` : r.primary_location?.landing_page_url || ''
  };
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}${POLITE}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 제목·낱말로 찾는다. 인용 많은 순 — 처음 보는 분야에서는 그게 곧 「어디서 시작하나」다. */
export async function search(query: string, limit = 10): Promise<Paper[]> {
  const q = query.trim();
  if (!q) return [];
  const d = await get<{ results?: RawWork[] }>(
    `/works?search=${encodeURIComponent(q)}&per-page=${limit}&sort=cited_by_count:desc&select=${FIELDS}`
  );
  if (!d?.results) return [];
  const out: Paper[] = [];
  for (const r of d.results) {
    const p = toPaper(r);
    if (p) out.push(p);
  }
  return out;
}

/** 여러 편을 한 번에. **한 번의 요청으로** 가져온다 — 스무 편을 스무 번 부르면 곧 막힌다. */
export async function fetchMany(ids: string[]): Promise<Paper[]> {
  const list = ids.filter(Boolean).slice(0, 50);
  if (!list.length) return [];
  const d = await get<{ results?: RawWork[] }>(
    `/works?filter=openalex_id:${list.join('|')}&per-page=${list.length}&select=${FIELDS}`
  );
  if (!d?.results) return [];
  const out: Paper[] = [];
  for (const r of d.results) {
    const p = toPaper(r);
    if (p) out.push(p);
  }
  return out;
}

/* ── 지도로 만들기 ────────────────────────────────────────────────────── */

export interface MapNode {
  paper: Paper;
  /** 가운데 논문인가 */
  root: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaperMap {
  nodes: MapNode[];
  edges: Array<{ from: string; to: string }>;
}

/**
 * 논문 한 편과 그 바닥들을 **자리 잡은 지도**로.
 *
 * 두 가지가 규칙의 전부다:
 *   - **크기 = 인용 수.** 어느 것이 이 분야의 바닥인지가 한눈에 보인다(그게 먼저 읽을 것).
 *   - **가로 자리 = 연도.** 왼쪽이 옛것 — 「이 흐름이 어디서 왔나」가 자리로 읽힌다.
 * 목록으로는 둘 다 안 보인다. 그래서 지도다.
 */
export function buildMap(root: Paper, refs: Paper[], opts?: { width?: number; rowGap?: number }): PaperMap {
  const width = opts?.width ?? 1200;
  const rowGap = opts?.rowGap ?? 150;
  const nodes: MapNode[] = [];
  const edges: Array<{ from: string; to: string }> = [];

  /* 인용 수는 몇 배씩 벌어진다(28 과 60,000 이 한 화면에 있다) — 그대로 크기에 쓰면
     하나만 거대해지고 나머지는 점이 된다. 그래서 자릿수로 눌러 담는다. */
  const sizeOf = (cited: number): { w: number; h: number } => {
    const k = Math.log10(Math.max(1, cited) + 1) / 5; // 0 ~ 1 남짓
    return { w: Math.round(150 + k * 190), h: Math.round(60 + k * 46) };
  };

  const rootSize = sizeOf(Math.max(root.cited, 1));
  nodes.push({
    paper: root,
    root: true,
    x: Math.round(width / 2 - rootSize.w / 2),
    y: 0,
    w: rootSize.w,
    h: rootSize.h
  });

  const sorted = [...refs].sort((a, b) => (a.year || 0) - (b.year || 0) || a.cited - b.cited);
  const years = sorted.map((p) => p.year || 0).filter(Boolean);
  const minY = years.length ? Math.min(...years) : 0;
  const maxY = years.length ? Math.max(...years) : 0;
  const span = Math.max(1, maxY - minY);

  /* 같은 해가 여럿이면 겹친다 — 줄을 내려 쌓는다(가로 자리는 연도가 정하므로 못 옮긴다). */
  const rowOf = new Map<number, number>();
  sorted.forEach((p) => {
    const s = sizeOf(p.cited);
    const t = p.year ? (p.year - minY) / span : 0.5;
    const x = Math.round(40 + t * (width - 80 - s.w));
    const key = Math.round(x / 160);
    const row = rowOf.get(key) ?? 0;
    rowOf.set(key, row + 1);
    nodes.push({ paper: p, root: false, x, y: 220 + row * rowGap, w: s.w, h: s.h });
    edges.push({ from: root.id, to: p.id });
  });

  return { nodes, edges };
}

/** KarmoGraph 가 읽는 모양(JSON Canvas)으로. 새 그리기 엔진을 만들지 않는다. */
export function toCanvas(map: PaperMap): {
  nodes: Array<{ id: string; type: string; text: string; x: number; y: number; width: number; height: number; color?: string }>;
  edges: Array<{ id: string; fromNode: string; toNode: string }>;
} {
  return {
    nodes: map.nodes.map((n) => ({
      id: n.paper.id,
      type: 'text',
      text:
        `**${n.paper.title}**\n\n` +
        `${n.paper.year || '?'} · 인용 ${n.paper.cited.toLocaleString()}` +
        (n.paper.authors.length ? `\n${n.paper.authors.slice(0, 3).join(', ')}` : '') +
        (n.paper.url ? `\n\n${n.paper.url}` : ''),
      x: n.x,
      y: n.y,
      width: n.w,
      height: n.h,
      ...(n.root ? { color: '4' } : {})
    })),
    edges: map.edges.map((e, i) => ({ id: `e${i}`, fromNode: e.from, toNode: e.to }))
  };
}
