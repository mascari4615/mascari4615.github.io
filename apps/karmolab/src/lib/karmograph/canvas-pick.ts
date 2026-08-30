/**
 * lib/karmograph/canvas-pick.ts. **겹쳐 있는 선 중에서 고르기** (TASK-KL-202 C-3-c).
 *
 * 같은 두 카드 사이에 선이 여럿이거나 선들이 한 자리를 지나가면, 누르는 자리에 선이 두세 개 겹친다.
 * 그때 위에 있는 선만 계속 잡히면 **아래 선은 영영 못 고른다**. 지울 수도, 이름을 고칠 수도 없다.
 * 그래서 Shift+클릭은 같은 자리에서 **다음 선**이다(포토샵, 일러스트레이터의 겹친 개체 순환과 같은 몸짓).
 *
 * 규칙 하나가 중요하다: 마지막 선 다음은 **처음으로 돌아온다.** 끝에서 멈추면 사람은 그것이 끝인지
 * 고장인지 모른다.
 */

/**
 * 같은 자리에 겹친 것들 중 다음 것. 지금 고른 것이 그 자리에 없으면 맨 위(첫 번째)를 준다.
 */
export function nextOverlapping(idsUnderCursor: string[], currentId: string | null): string | null {
  const ids = idsUnderCursor.filter((v, i) => v && idsUnderCursor.indexOf(v) === i);
  if (ids.length === 0) return null;
  const at = currentId ? ids.indexOf(currentId) : -1;
  if (at < 0) return ids[0];
  return ids[(at + 1) % ids.length];
}

/* ── 아래 둘은 canvas.ts 상한(1900줄)에서 밀려나 이사 왔다 (KL-271).
   둘 다 지금 화면의 어디를 다루는 작은 일이라 본체가 알 필요가 없다. ── */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 그 자리에 겹쳐 있는 **선들**. 위에서부터. 선은 가늘어서 겹치기 쉬우므로 하나만 보면 안 된다. */
export function edgeIdsAtPoint(clientX: number, clientY: number): string[] {
  return document.elementsFromPoint(clientX, clientY)
    .filter((el) => el.classList?.contains('ck-edge-hit'))
    .map((el) => (el as SVGElement).dataset.edgeId ?? '')
    .filter(Boolean);
}

/** 끌고 다니는 **임시 선**. 선 뽑기와 선 끝 다시 잇기가 같은 모양을 쓴다(다르면 다른 기능처럼 보인다). */
export function spawnTempEdge(layer: SVGGElement, color: string): SVGPathElement {
  const temp = document.createElementNS(SVG_NS, 'path');
  temp.setAttribute('class', 'ck-edge ck-link-temp');
  temp.setAttribute('fill', 'none');
  temp.setAttribute('stroke', color);
  temp.setAttribute('stroke-width', '2');
  layer.appendChild(temp);
  return temp;
}
