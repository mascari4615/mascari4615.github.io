/**
 * JSON 을 **나무로 펴는** 알맹이 (TASK-KL-286)
 *
 * JSON Crack 은 붙여넣은 것을 그래프로, JSON Hero 는 컬럼, 나무로 보여 준다. 둘의 공통점은
 * 글자 덩어리를 **구조로** 바꿔 준다는 것이다. 사람이 JSON 을 여는 이유의 태반이
 * 여기 뭐가 들어 있나이지 글자를 읽고 싶다가 아니다.
 *
 * 그리는 것은 화면이 하고, 여기서는 **펴는 일만** 한다(그래야 브라우저 없이 잴 수 있다).
 * 나무는 줄의 목록으로 편다. 깊이, 열쇠, 갈래, 미리보기. 접기는 화면이 이 목록을 걸러 그린다.
 */

export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface JsonRow {
  /** 몇 겹 안인가 (뿌리는 0) */
  depth: number;
  /** 이 자리의 이름. 물체면 열쇠, 목록이면 번호, 뿌리면 빈 문자열 */
  key: string;
  kind: JsonKind;
  /** 한 줄 미리보기. 잎이면 값, 가지면 { 3 }, [ 12 ] */
  preview: string;
  /** 가지인가 (접을 수 있는가) */
  branch: boolean;
  /** 자식 수 (잎이면 0) */
  count: number;
  /** 뿌리부터의 길이. 눌러서 복사할 때 쓴다 (`a.b[0].c`) */
  path: string;
}

const kindOf = (v: unknown): JsonKind => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'object') return 'object';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'string';
};

/** 값 한 줄. 긴 글은 자른다. 잘랐다는 표시를 남겨야 원래 이만큼인가로 안 읽힌다. */
function short(v: unknown, max = 60): string {
  if (typeof v === 'string') {
    const s = v.length > max ? v.slice(0, max) + '...' : v;
    return `"${s}"`;
  }
  return String(v);
}

/**
 * 나무로 편다.
 *
 * `limit` 은 **줄 수 상한**이다. 만 줄짜리 JSON 을 다 그리면 화면이 멎는다 . 
 * 넘으면 그 자리에서 멈추고, 부르는 쪽이 여기까지만 폈다고 말해 준다.
 */
export function flatten(value: unknown, limit = 500): { rows: JsonRow[]; cut: boolean } {
  const rows: JsonRow[] = [];
  let cut = false;

  const walk = (v: unknown, depth: number, key: string, path: string): void => {
    if (rows.length >= limit) {
      cut = true;
      return;
    }
    const kind = kindOf(v);
    const branch = kind === 'object' || kind === 'array';
    if (!branch) {
      rows.push({ depth, key, kind, preview: short(v), branch: false, count: 0, path });
      return;
    }
    const entries: Array<[string, unknown]> = Array.isArray(v)
      ? (v as unknown[]).map((x, i) => [String(i), x])
      : Object.entries(v as Record<string, unknown>);
    rows.push({
      depth,
      key,
      kind,
      preview: kind === 'array' ? `[ ${entries.length} ]` : `{ ${entries.length} }`,
      branch: true,
      count: entries.length,
      path
    });
    for (const [k, child] of entries) {
      /* 목록 자리는 `a[0]`, 물체 열쇠는 `a.b`. 그대로 복사해 코드에 붙일 수 있게 */
      const next = Array.isArray(v) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
      walk(child, depth + 1, k, next);
      if (rows.length >= limit) {
        cut = true;
        return;
      }
    }
  };

  walk(value, 0, '', '');
  return { rows, cut };
}

/**
 * 무엇이 몇 개인지. 이 안에 뭐가 들어 있나의 한 줄 답.
 * (JSON Hero 가 값의 갈래를 짚어 주는 자리를 우리 식으로 줄인 것.)
 */
export function tally(rows: JsonRow[]): Record<JsonKind, number> {
  const out: Record<JsonKind, number> = { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 };
  for (const r of rows) out[r.kind] += 1;
  return out;
}

/** 가장 깊은 곳이 몇 겹인가. 이거 얼마나 중첩됐나를 먼저 묻는 사람이 많다. */
export function deepest(rows: JsonRow[]): number {
  return rows.reduce((m, r) => (r.depth > m ? r.depth : m), 0);
}
