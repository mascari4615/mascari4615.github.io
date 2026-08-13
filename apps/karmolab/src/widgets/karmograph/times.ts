/**
 * times.ts — **시점에 따라 관계가 변한다** (TASK-KL-271 X2 · 골격).
 *
 * 상관도의 재미는 비대칭이고(X1), 그 다음은 **변화**다. 「1부에서는 소꿉친구였는데 2부에서는
 * 라이벌」 — 이야기는 거기서 생긴다. 지금 판은 **한 시점만** 담을 수 있어서, 그걸 그리려면
 * 판을 통째로 복제해 두 장을 따로 고쳐야 했다(그러면 인물 하나 고칠 때마다 두 번 고친다).
 *
 * 그래서 판은 하나로 두고, **선이 시점마다 다른 얼굴**을 갖게 한다.
 *
 * 설계에서 못 박은 것 셋:
 *  1. **원본이 기본값이다.** 시점에 적어 둔 것이 없으면 선은 원래 모습 그대로 — 시점을 안 쓰는
 *     판(대부분)은 아무것도 안 달라진다. 새 기능이 옛 판을 건드리면 그건 고장이다.
 *  2. **덮어쓰기는 부분이다.** 2부에서 이름만 바뀌었으면 색(종류)은 원본을 따른다. 한 칸 바꾸려고
 *     전부 다시 적게 하면 아무도 안 쓴다.
 *  3. **사라짐도 하나의 상태다.** 「2부에는 아직 안 만난 사이」는 빈 이름이 아니라 **없음**이다 —
 *     빈 이름으로 두면 이름 없는 선이 그려진다.
 */

/** 판에 놓인 시점 하나 — 순서가 곧 시간 순이다. */
export interface TimePoint {
  id: string;
  name: string;
}

/** 어떤 시점에서의 선의 얼굴. 없는 값은 「원본을 따른다」는 뜻이다. */
export interface EdgeAtTime {
  label?: string;
  kind?: string;
  /** 이 시점에는 이 선이 아예 없다. */
  gone?: boolean;
}

export interface TimedEdge {
  label?: string;
  kind: string;
  /** 시점 id → 그 시점의 얼굴. */
  at?: Record<string, EdgeAtTime>;
}

/** 지금 시점에서 이 선을 어떻게 그릴까. `null` = 이 시점에는 없는 선. */
export function edgeAt(edge: TimedEdge, timeId: string): { label: string; kind: string } | null {
  const face = timeId ? edge.at?.[timeId] : undefined;
  if (face?.gone) return null;
  return {
    label: face?.label ?? edge.label ?? '',
    kind: face?.kind ?? edge.kind,
  };
}

/** 이 선이 시점마다 **다른 얼굴**을 갖고 있나 — 그런 선만 시점 이야기를 한다. */
export function isTimed(edge: TimedEdge): boolean {
  return Object.keys(edge.at ?? {}).length > 0;
}

/**
 * 시점을 옮긴다. 끝에서 더 가면 **제자리**다(돌아 나오면 「처음으로 돌아왔나」를 사람이 못 읽는다).
 * 지금 시점을 모르면(빈 값·없는 id) 첫 시점으로 친다.
 */
export function stepTime(times: TimePoint[], nowId: string, dir: 1 | -1): string {
  if (times.length === 0) return '';
  const at = times.findIndex((t) => t.id === nowId);
  const from = at < 0 ? 0 : at;
  const next = Math.min(times.length - 1, Math.max(0, from + dir));
  return times[next].id;
}

/** 새 시점의 이름 — 「2부」처럼 번호를 붙인다(사람이 곧 고쳐 쓴다). */
export function nextTimeName(times: TimePoint[], pattern: (n: number) => string): string {
  return pattern(times.length + 1);
}

/**
 * 시점을 지우면 그 시점에 적어 둔 얼굴도 함께 지운다 — 안 지우면 판에 **아무도 못 보는 자료**가
 * 남고, 나중에 같은 id 가 다시 생기면 옛 얼굴이 되살아난다.
 */
export function forgetTime<T extends TimedEdge>(edges: T[], timeId: string): T[] {
  return edges.map((e) => {
    if (!e.at?.[timeId]) return e;
    const at = { ...e.at };
    delete at[timeId];
    return { ...e, at: Object.keys(at).length > 0 ? at : undefined };
  });
}
