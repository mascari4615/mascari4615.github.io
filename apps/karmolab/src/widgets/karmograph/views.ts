/**
 * views.ts — **보기를 이름 붙여 저장** (TASK-KL-271 O2, Kumu 계보).
 *
 * 한 판은 여러 얼굴을 가진다. 「1부 시점」 「적대 관계만」 「인물만」 — 볼 때마다 거르기를 다시
 * 맞추는 것은 **매번 같은 일을 손으로 하는 것**이고, 그러다 보면 결국 아무도 안 거른다.
 * Kumu 가 스토리텔링 맵으로 파는 자리가 이것이다: 같은 자료의 **여러 관점을 저장해 두고 넘긴다.**
 *
 * 여기서는 **무엇을 저장하고 어떻게 되살리나**만 정한다(칸·단추는 부르는 쪽).
 * 저장하는 것 = 「무엇을 보이게 하느냐」 뿐이다 — 카메라(어디를 보고 있나)는 넣지 않는다:
 * 판을 고치면 자리는 곧 달라지는데, 그때 옛 카메라로 끌려가면 「내가 보던 데가 아니다」가 된다.
 */

/** 저장된 보기 — 거르기 상태를 **글로 적을 수 있는 꼴**로만 담는다(Set 은 그대로 못 적는다). */
export interface SavedView {
  id: string;
  name: string;
  /** 화면에서 **뺀** 카드 종류 (거르기와 같은 뜻: 여기 있으면 안 보인다). */
  offNodeKinds: string[];
  offEdgeKinds: string[];
  offTags: string[];
  hideOrphans: boolean;
  minDegree: number;
  fieldName: string;
  fieldValue: string;
  /** 「고른 것 둘레 N다리만」 — 빈 문자열이면 전부 보기. */
  focus: string;
}

export interface LiveFilter {
  nodeKinds: Set<string>;
  edgeKinds: Set<string>;
  tags: Set<string>;
  hideOrphans: boolean;
  minDegree: number;
  fieldName: string;
  fieldValue: string;
}

/** 지금 화면 상태 → 저장할 꼴. */
export function captureView(name: string, filter: LiveFilter, focus: string, id: string): SavedView {
  return {
    id,
    name: name.trim(),
    offNodeKinds: [...filter.nodeKinds].sort(),
    offEdgeKinds: [...filter.edgeKinds].sort(),
    offTags: [...filter.tags].sort(),
    hideOrphans: filter.hideOrphans,
    minDegree: filter.minDegree,
    fieldName: filter.fieldName,
    fieldValue: filter.fieldValue,
    focus,
  };
}

/**
 * 저장한 꼴 → 지금 화면 상태. **빌려 온 것을 제자리에서 고친다**(거르기 칸이 같은 객체를 쥐고 있다).
 * 옛 저장본에 없는 값은 「안 거른 상태」로 되살린다 — 없는 값을 참으로 읽으면 카드가 말없이 사라진다.
 */
export function applyView(view: SavedView, filter: LiveFilter): string {
  filter.nodeKinds.clear();
  for (const k of view.offNodeKinds ?? []) filter.nodeKinds.add(k);
  filter.edgeKinds.clear();
  for (const k of view.offEdgeKinds ?? []) filter.edgeKinds.add(k);
  filter.tags.clear();
  for (const k of view.offTags ?? []) filter.tags.add(k);
  filter.hideOrphans = Boolean(view.hideOrphans);
  filter.minDegree = Number(view.minDegree) || 0;
  filter.fieldName = view.fieldName ?? '';
  filter.fieldValue = view.fieldValue ?? '';
  return view.focus ?? '';
}

/**
 * 이름이 겹치면 **덮어쓴다**(같은 이름 둘은 고를 때 구분이 안 된다).
 * 새 이름이면 뒤에 붙인다 — 만든 순서가 곧 사람이 기억하는 순서다.
 */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const at = views.findIndex((v) => v.name === view.name);
  if (at < 0) return [...views, view];
  const out = [...views];
  out[at] = { ...view, id: views[at].id };
  return out;
}

/** 이름이 비면 저장하지 않는다 — 「이름 없는 보기」는 목록에서 고를 수가 없다. */
export function isNameUsable(name: string): boolean {
  return name.trim().length > 0;
}
