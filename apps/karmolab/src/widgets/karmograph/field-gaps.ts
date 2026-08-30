/**
 * field-gaps.ts. **아직 안 적은 칸**을 찾아 준다 (TASK-KL-271 L6).
 *
 * 카드는 태어날 때 그 종류의 빈 칸을 갖고 나온다(출신, 첫 등장...). 그래서 판이 커질수록
 * **적다 만 칸**이 조용히 쌓인다. 어디가 비었는지는 카드를 하나씩 눌러 봐야만 안다.
 * 무엇을 더 채워야 하나는 세계관을 짓는 사람이 가장 자주 하는 질문인데, 도구가 답을 안 했다.
 *
 * 관계망 칸은 이미 **이어질 법한데 안 이어진 사이**(구조적 공백)를 말해 준다. 이건 그 짝 . 
 * **적힐 법한데 안 적힌 칸**이다.
 *
 * 여기서는 **무슨 말을 할지**만 정한다(말은 부르는 쪽이 번역해 끼운다). 세는 규칙이 눈에 안 보이는
 * 셈이라 순수 함수로 둔다. 화면에 섞이면 이 수가 맞나를 검사로 못 묻는다.
 *
 * 규칙:
 *  - **빈 값 = 안 적은 것.** 칸 이름만 있고 값이 비었으면(공백만 있어도) 안 적은 것이다.
 *  - **종류별로 센다.** 인물의 출신과 장소의 출신은 다른 이야기다.
 *  - **한 장짜리 종류는 재촉하지 않는다.** 방금 만든 카드 하나를 두고 1장이 안 적었어요는 잔소리다.
 *  - **다 빈 칸이 먼저.** 아무도 안 적었어요는 7장 중 2장보다 놀랍고, 대개 그 칸이 쓸모없다는 신호다.
 *  - 많아야 셋. 넉 줄부터는 아무도 안 읽는다(도움말이 그랬다).
 */

export interface FieldGap {
  /** 어느 종류의 카드인가 (종류 id). */
  kind: string;
  /** 칸 이름. 사람이 적은 그대로. */
  field: string;
  /** 안 적은 카드 수 */
  missing: number;
  /** 그 종류의 카드 수 */
  total: number;
  /** 아무도 안 적었나 (missing === total) */
  none: boolean;
}

/** 많아야 셋. */
export const GAP_MAX = 3;
/** 이보다 적은 종류는 재촉하지 않는다. */
const MIN_CARDS = 2;

/**
 * 안 적은 칸 찾기.
 *
 * @param nodes 지금 판의 카드들(거른 뒤를 넘기면 보이는 것 중에서 찾는다)
 */
export function fieldGaps(
  nodes: { kind: string; fields?: Record<string, string> }[],
  max = GAP_MAX,
): FieldGap[] {
  /** 종류 → 카드 수 */
  const total = new Map<string, number>();
  /**
   * 종류 → (칸 이름 → 안 적은 수). **두 겹 지도**로 든다. 종류+칸을 한 글자열로 이으면
   * 칸 이름에 든 띄어쓰기(첫 등장, 한 줄 소개) 때문에 되읽을 때 갈라지는 자리를 못 찾는다.
   */
  const missing = new Map<string, Map<string, number>>();
  /** 그 칸이 그 종류에 실제로 있는지. 없는 칸을 안 적었다고 하면 안 된다. */
  const seen = new Map<string, Set<string>>();

  for (const n of nodes) {
    total.set(n.kind, (total.get(n.kind) ?? 0) + 1);
    for (const [field, value] of Object.entries(n.fields ?? {})) {
      if (!seen.has(n.kind)) seen.set(n.kind, new Set());
      seen.get(n.kind)?.add(field);
      if (String(value ?? '').trim()) continue;
      if (!missing.has(n.kind)) missing.set(n.kind, new Map());
      const box = missing.get(n.kind);
      if (box) box.set(field, (box.get(field) ?? 0) + 1);
    }
  }

  const out: FieldGap[] = [];
  for (const [kind, fields] of seen) {
    const t = total.get(kind) ?? 0;
    if (t < MIN_CARDS) continue;
    for (const field of fields) {
      const m = missing.get(kind)?.get(field) ?? 0;
      if (m === 0) continue;
      out.push({ kind, field, missing: m, total: t, none: m === t });
    }
  }
  // 다 빈 칸 먼저 → 많이 빈 것 → 이름순(같은 판은 두 번 봐도 같은 순서여야 한다)
  out.sort((a, b) =>
    Number(b.none) - Number(a.none)
    || b.missing - a.missing
    || a.field.localeCompare(b.field)
    || a.kind.localeCompare(b.kind));
  return out.slice(0, max);
}
