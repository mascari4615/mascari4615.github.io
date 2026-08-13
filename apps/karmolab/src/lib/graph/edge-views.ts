/**
 * edge-views.ts — **양쪽이 서로를 어떻게 보는가**를 선 위 어디에 놓을지 (TASK-KL-271 X1).
 *
 * 관계도의 재미는 **비대칭**이다. 「욘은 링을 동생처럼 여기고, 링은 욘을 원망한다」 —
 * 한 선에 마음이 둘 얹히는 순간 그림이 이야기가 된다. 그 두 마음을 적는 칸(`viewFrom`/`viewTo`)은
 * 진작 있었는데 **화면에 그린 적이 없었다**: 선을 골라 옆 패널을 열어야만 보였다.
 * 적어 둔 사람만 아는 이야기는 판에 없는 것과 같다.
 *
 * 어디에 놓을지는 눈으로 못 재는 셈이라 여기 순수 함수로 뺀다 — 화면에 섞이면
 * 「이 자리가 맞나」를 검사로 못 묻는다.
 *
 * 자리 규칙:
 *  - **자기 쪽에 붙는다.** 출발이 보는 마음은 출발 가까이, 도착이 보는 마음은 도착 가까이.
 *    가운데는 관계 이름(`label`)의 자리다 — 셋이 가운데로 모이면 서로를 덮는다.
 *  - 한쪽만 적혔으면 그 한쪽만. 「빈 마음」을 자리만 잡아 두면 안 적은 것이 적은 것처럼 보인다.
 *  - 관계 이름이 가운데를 비워 뒀으면(이름 없음) 두 마음을 **조금 더 벌린다** — 덮을 것이 없으니
 *    가장자리로 밀 이유도 없고, 너무 붙으면 어느 쪽 마음인지 헷갈린다.
 */

import { buildEdgeLabel } from './canvas-edge';
import type { Pt } from './canvas-math';

/** 선 위 비율(0 = 출발, 1 = 도착) 위에 놓일 마음 한 조각. */
export interface ViewChip {
  /** 누구의 마음인가 — 검사와 읽어 주는 이름에 쓴다. */
  side: 'from' | 'to';
  text: string;
  /** 선 위 자리. `buildEdgeLabel` 의 `at` 과 같은 좌표계. */
  at: number;
  /** 선에서 위아래로 비킨 픽셀 — 짧은 선에서 이름표와 안 겹치게. */
  dy: number;
}

/** 이보다 짧으면 선 위에 셋을 나란히 못 놓는다(실측: 카드 두 장이 붙어 있는 견본). */
export const SHORT_EDGE = 170;
/** 비켜 앉는 높이 — 이름표 판(19px)보다 커야 안 겹친다. */
const OFFSET = 22;

/** 관계 이름이 가운데를 차지했을 때의 두 마음 자리. */
const TIGHT = { from: 0.2, to: 0.8 };
/** 가운데가 비었을 때 — 조금 안쪽으로. */
const LOOSE = { from: 0.28, to: 0.72 };

/**
 * 이 선에 마음 조각을 몇 개, 어디에 그릴까.
 * 아무것도 안 적혔으면 빈 배열 — 그리지 않는다.
 */
export function edgeViewChips(edge: {
  viewFrom?: string;
  viewTo?: string;
  label?: string;
}, length = Infinity): ViewChip[] {
  const from = (edge.viewFrom ?? '').trim();
  const to = (edge.viewTo ?? '').trim();
  if (!from && !to) return [];
  const hasName = Boolean((edge.label ?? '').trim());
  // 짧은 선에서는 **가로로 못 피한다** — 그래서 위아래로 피한다. 출발의 마음은 위, 도착의 마음은
  // 아래. 긴 선에서는 제 쪽 끝으로 걸어가 앉고, 이름표가 가운데를 쥐고 있으면 조금 더 바깥으로.
  const short = length < SHORT_EDGE;
  const pos = hasName ? TIGHT : LOOSE;
  const out: ViewChip[] = [];
  if (from) out.push({ side: 'from', text: from, at: short ? 0.5 : pos.from, dy: short ? -OFFSET : -OFFSET / 2 });
  if (to) out.push({ side: 'to', text: to, at: short ? 0.5 : pos.to, dy: short ? OFFSET : OFFSET / 2 });
  return out;
}

/**
 * 두 마음이 **다른가**. 같은 말을 양쪽에 적어 두면 비대칭이 아니라 그냥 한 관계다 —
 * 그럴 때는 화살표를 양쪽으로 그려 봐야 알려 주는 게 없다.
 */
export function isAsymmetric(edge: { viewFrom?: string; viewTo?: string }): boolean {
  const from = (edge.viewFrom ?? '').trim();
  const to = (edge.viewTo ?? '').trim();
  return Boolean(from) && Boolean(to) && from !== to;
}


/**
 * 마음 조각들을 실제 SVG 로 (TASK-KL-271 X1).
 *
 * 관계 이름과 **다른 옷**을 입힌다 — 이름은 둘 사이의 사실이고 이건 한쪽의 시선이라,
 * 같은 판·같은 글자로 그리면 셋 다 사실처럼 읽힌다. 끌 수 없게 두는 것도 같은 이유다:
 * 자리가 곧 「누구의 마음인가」라서, 옮기면 뜻이 바뀐다.
 */
export function buildEdgeViewLabels(
  edge: { id: string; viewFrom?: string; viewTo?: string; label?: string },
  geom: { p1: Pt; c1: Pt; c2: Pt; p2: Pt } | null,
  skin: { color: string; plateFill: string; textColor: string },
): SVGGElement[] {
  const out: SVGGElement[] = [];
  if (!geom) return out;   // 아직 자리를 못 잡은 선 — 그릴 데가 없다
  const len = Math.hypot(geom.p2.x - geom.p1.x, geom.p2.y - geom.p1.y);
  for (const chip of edgeViewChips(edge, len)) {
    const el = buildEdgeLabel(`${edge.id}:view:${chip.side}`, chip.text, geom, {
      at: chip.at,
      dy: chip.dy,
      color: skin.color,
      plateFill: skin.plateFill,
      textColor: skin.textColor,
      draggable: false,
    });
    if (!el) continue;
    el.classList.add('ck-edge-view');
    el.dataset.viewSide = chip.side;
    out.push(el);
  }
  return out;
}
