/**
 * times.ts. **시점에 따라 관계가 변한다** (TASK-KL-271 X2, 골격).
 *
 * 상관도의 재미는 비대칭이고(X1), 그 다음은 **변화**다. 1부에서는 소꿉친구였는데 2부에서는
 * 라이벌. 이야기는 거기서 생긴다. 지금 판은 **한 시점만** 담을 수 있어서, 그걸 그리려면
 * 판을 통째로 복제해 두 장을 따로 고쳐야 했다(그러면 인물 하나 고칠 때마다 두 번 고친다).
 *
 * 그래서 판은 하나로 두고, **선이 시점마다 다른 얼굴**을 갖게 한다.
 *
 * 설계에서 못 박은 것 셋:
 *  1. **원본이 기본값이다.** 시점에 적어 둔 것이 없으면 선은 원래 모습 그대로. 시점을 안 쓰는
 *     판(대부분)은 아무것도 안 달라진다. 새 기능이 옛 판을 건드리면 그건 고장이다.
 *  2. **덮어쓰기는 부분이다.** 2부에서 이름만 바뀌었으면 색(종류)은 원본을 따른다. 한 칸 바꾸려고
 *     전부 다시 적게 하면 아무도 안 쓴다.
 *  3. **사라짐도 하나의 상태다.** 2부에는 아직 안 만난 사이는 빈 이름이 아니라 **없음**이다 . 
 *     빈 이름으로 두면 이름 없는 선이 그려진다.
 */

/** 판에 놓인 시점 하나. 순서가 곧 시간 순이다. */
export interface TimePoint {
  id: string;
  name: string;
}

/** 어떤 시점에서의 선의 얼굴. 없는 값은 원본을 따른다는 뜻이다. */
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

/** 이 선이 시점마다 **다른 얼굴**을 갖고 있나. 그런 선만 시점 이야기를 한다. */
export function isTimed(edge: TimedEdge): boolean {
  return Object.keys(edge.at ?? {}).length > 0;
}

/**
 * 시점을 옮긴다. 끝에서 더 가면 **제자리**다(돌아 나오면 처음으로 돌아왔나를 사람이 못 읽는다).
 * 지금 시점을 모르면(빈 값, 없는 id) 첫 시점으로 친다.
 */
export function stepTime(times: TimePoint[], nowId: string, dir: 1 | -1): string {
  if (times.length === 0) return '';
  const at = times.findIndex((t) => t.id === nowId);
  const from = at < 0 ? 0 : at;
  const next = Math.min(times.length - 1, Math.max(0, from + dir));
  return times[next].id;
}

/** 새 시점의 이름. 2부처럼 번호를 붙인다(사람이 곧 고쳐 쓴다). */
export function nextTimeName(times: TimePoint[], pattern: (n: number) => string): string {
  return pattern(times.length + 1);
}

/**
 * 시점을 지우면 그 시점에 적어 둔 얼굴도 함께 지운다. 안 지우면 판에 **아무도 못 보는 자료**가
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


/**
 * 이 시점의 얼굴을 고쳐 넣는다. **비어 있으면 자리째 지운다.**
 *
 * 이름을 비우면 원래대로가 사람이 기대하는 동작인데, 그때 빈 껍데기(`{ }`)를 남기면
 * 선마다 시점 자리가 조용히 쌓이고 이 선은 시점 이야기를 한다는 표시(`isTimed`)가 거짓이 된다.
 */
export function setFace<T extends TimedEdge>(edge: T, timeId: string, face: EdgeAtTime): T {
  if (!timeId) return edge;
  const clean: EdgeAtTime = {};
  if (face.label?.trim()) clean.label = face.label.trim();
  if (face.kind) clean.kind = face.kind;
  if (face.gone) clean.gone = true;
  const at = { ...(edge.at ?? {}) };
  if (Object.keys(clean).length === 0) delete at[timeId];
  else at[timeId] = clean;
  return { ...edge, at: Object.keys(at).length > 0 ? at : undefined };
}


/**
 * 지금 시점에서 **실제로 있는 선들**. 없는 선은 빼고, 이름, 색은 그 시점의 것으로 바꾼 사본을 준다.
 *
 * 왜 필요한가: 판은 그릴 때 렌즈로 얼굴을 갈아 끼우지만, **판을 읽어 세는 곳**(범례, 관계망, 무리)은
 * 원본을 그대로 봤다. 그러면 2부를 보고 있는데 범례는 1부 것이 된다. 화면과 설명이 어긋나는
 * 것은 둘 중 하나가 틀린 것보다 나쁘다(어느 쪽을 믿을지 사람이 못 정한다).
 */
export function resolveEdges<T extends TimedEdge>(edges: T[], timeId: string): T[] {
  if (!timeId) return edges;
  const out: T[] = [];
  for (const e of edges) {
    const face = edgeAt(e, timeId);
    if (!face) continue;
    out.push(face.label === (e.label ?? '') && face.kind === e.kind
      ? e : { ...e, label: face.label, kind: face.kind });
  }
  return out;
}
