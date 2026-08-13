/**
 * table-view.ts — **같은 자료를 표로** (TASK-KL-271 L4, Notion 뷰 계보).
 *
 * 판은 「누가 누구와 어떻게 이어졌나」를 잘 보여 주는데, 「**빠진 것 없이 훑기**」에는 나쁘다 —
 * 카드가 흩어져 있어서 눈이 순서를 못 잡는다. 「인물 스물넷을 이름순으로 한 번 훑고 싶다」
 * 「출신이 안 적힌 사람만 모아 보고 싶다」는 표가 하는 일이고, 그건 판이 못 하는 일이다.
 *
 * 판을 대신하려는 게 아니라 **같은 자료의 다른 렌즈**다 — 그래서 고르면 그 카드가 판에서도 골라진다.
 *
 * 여기서는 **무엇을 어떤 순서로 늘어놓나**만 정한다(칸·단추는 부르는 쪽).
 * 정렬은 눈으로 못 재는 셈이라 순수 함수로 둔다 — 「같은 판을 두 번 열면 같은 순서」를 검사로 잠근다.
 */

export interface TableRow {
  id: string;
  label: string;
  kind: string;
  /** 칸 이름 → 값. 없으면 빈 문자열(표에서는 「빈 칸」도 한 줄의 정보다). */
  cells: Record<string, string>;
}

export interface TableSort {
  /** '' = 이름, 'kind' = 종류, 그 밖 = 칸 이름. */
  by: string;
  dir: 'up' | 'down';
}

/**
 * 이 판에서 실제로 쓰인 **칸 이름**들 — 열이 된다.
 * 아무도 안 적은 칸도 열로 세운다(비어 있다는 것이 곧 보여 줄 것이다 — 그게 이 렌즈의 쓸모다).
 */
export function tableColumns(nodes: { fields?: Record<string, string> }[], max = 6): string[] {
  const seen = new Map<string, number>();
  for (const n of nodes) {
    for (const k of Object.keys(n.fields ?? {})) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()]
    // 많이 쓰인 칸이 앞 열. 같으면 이름순 — 두 번 열어도 같은 표여야 한다.
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([k]) => k);
}

/** 카드 → 표의 줄. 열에 없는 칸은 안 담는다(표가 옆으로 새는 것을 막는다). */
export function tableRows(
  nodes: { id: string; label: string; kind: string; fields?: Record<string, string> }[],
  columns: string[],
): TableRow[] {
  return nodes.map((n) => {
    const cells: Record<string, string> = {};
    for (const c of columns) cells[c] = String((n.fields ?? {})[c] ?? '');
    return { id: n.id, label: n.label, kind: n.kind, cells };
  });
}

/**
 * 줄 세우기.
 *
 * ★ **빈 칸은 언제나 뒤로 간다** — 오름차순이든 내림차순이든. 빈 칸이 위로 올라오면 표를 연
 *   목적(적힌 것을 훑기)이 첫 화면에서 깨진다. 「안 적은 것만 보고 싶다」는 내림차순이 아니라
 *   거르기가 할 일이다.
 * 같은 값이면 이름순, 이름도 같으면 id 순 — 두 번 열어도 같은 표여야 한다.
 */
export function sortRows(rows: TableRow[], sort: TableSort, kindLabel: (id: string) => string): TableRow[] {
  const key = (r: TableRow): string => {
    if (sort.by === '') return r.label;
    if (sort.by === 'kind') return kindLabel(r.kind);
    return r.cells[sort.by] ?? '';
  };
  const sign = sort.dir === 'down' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka && kb) return 1;
    if (ka && !kb) return -1;
    return (ka.localeCompare(kb) * sign) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}

/** 같은 열을 다시 누르면 방향이 뒤집히고, 다른 열을 누르면 오름차순으로 시작한다. */
export function nextSort(now: TableSort, clicked: string): TableSort {
  if (now.by !== clicked) return { by: clicked, dir: 'up' };
  return { by: clicked, dir: now.dir === 'up' ? 'down' : 'up' };
}
