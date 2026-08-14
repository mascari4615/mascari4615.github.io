/**
 * lib/graph/sketchy.ts — **손그림 질감** (TASK-KL-238 / 18 excalidraw)
 *
 * excalidraw 가 사랑받는 이유는 기능이 아니라 **말투**다. 자로 잰 상자는 「결정된 것」처럼 보여서
 * 사람이 고치자는 말을 못 꺼낸다. 삐뚤빼뚤한 상자는 「아직 얘기 중」처럼 보인다 —
 * 같은 그림인데 회의가 달라진다. 관계도는 대부분 *아직 얘기 중*인 그림이다.
 *
 * ★ 규율 하나: **흔들림은 씨앗으로 정해진다.** 매번 새로 흔들면 화면을 다시 그릴 때마다 상자가
 *   춤을 춘다(끌 때·확대할 때 그림이 살아 움직이면 어지럽고, 사진으로 남길 수도 없다).
 *   그래서 같은 것을 그리면 **늘 같은 삐뚤빼뚤**이 나온다 — 노드 id 가 그 씨앗이다.
 *
 * 두 번 긋는다. 손으로 그린 선은 한 번에 안 끝나고, 두 겹이 어긋나야 사람 손처럼 보인다.
 * (excalidraw·roughjs 도 같은 방식이다. 그 코드를 가져오지 않고 우리 크기로 다시 지었다 —
 *  우리에게 필요한 건 상자·타원·잇는 선 셋뿐이라 라이브러리 하나를 들일 값이 없다.)
 */
import { pointOnCubic, type Pt } from './canvas-math';

/** 켜져 있나. 화면이 껐다 켰다 한다 — 껐을 때는 예전 그대로 자로 잰 도형이 나온다. */
let on = false;
export const sketchyOn = (): boolean => on;
export const setSketchy = (v: boolean): void => {
  on = v;
};

/** 글자 → 씨앗. 같은 노드는 늘 같은 삐뚤빼뚤을 갖는다(그래서 화면이 안 춤춘다). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 씨앗 하나에서 -1..1 을 뽑는 작은 난수. 라이브러리 없이, 늘 같은 순서로. */
export function rng(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

/** 삐뚤빼뚤의 크기(px). 이보다 크면 「손그림」이 아니라 「망가진 그림」이 된다. */
export const AMP = 1.6;

const fix = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/** 점들을 이어 한 획으로. 끝점은 **거의** 제자리에 둔다 — 상자가 안 닫히면 모양이 무너진다. */
function stroke(points: Pt[], r: () => number, amp: number): string {
  return points
    .map((p, i) => {
      const edge = i === 0 || i === points.length - 1;
      const k = edge ? amp * 0.35 : amp;
      return `${i === 0 ? 'M' : 'L'} ${fix(p.x + r() * k)},${fix(p.y + r() * k)}`;
    })
    .join(' ');
}

/** 한 변을 몇 점으로 나눌지 — 길수록 여러 점. 짧은 변을 촘촘히 흔들면 톱니가 된다. */
const stepsFor = (len: number): number => Math.max(2, Math.min(14, Math.round(len / 22) + 2));

function edgePoints(a: Pt, b: Pt): Pt[] {
  const n = stepsFor(Math.hypot(b.x - a.x, b.y - a.y));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  return out;
}

/** 손으로 그린 네모. 바깥에서 보는 상자 크기는 그대로 — 선 잇는 셈법이 흔들리면 안 된다. */
export function sketchyRect(w: number, h: number, seed: number, amp = AMP): string {
  const r = rng(seed);
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h }
  ];
  const passes: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const parts: string[] = [];
    for (let i = 0; i < 4; i++) parts.push(stroke(edgePoints(corners[i], corners[(i + 1) % 4]), r, amp));
    passes.push(parts.join(' ') + ' Z');
  }
  return passes.join(' ');
}

/** 손으로 그린 동그라미. 두 겹을 서로 다른 데서 시작해 이음매가 안 보이게 한다. */
export function sketchyEllipse(w: number, h: number, seed: number, amp = AMP): string {
  const r = rng(seed);
  const cx = w / 2;
  const cy = h / 2;
  const n = Math.max(16, Math.min(40, Math.round((w + h) / 12)));
  const passes: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const from = pass * 0.35;
    const points: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = from + (i / n) * Math.PI * 2;
      points.push({ x: cx + Math.cos(t) * cx, y: cy + Math.sin(t) * cy });
    }
    passes.push(stroke(points, r, amp) + ' Z');
  }
  return passes.join(' ');
}

/**
 * 손으로 그린 **잇는 선**. 굽은 선(3차 베지에)을 점으로 훑어 흔든다 —
 * 화면(`getTotalLength`)에 안 기대므로 검사도 이 답을 그대로 볼 수 있다.
 */
export function sketchyCubic(g: { p1: Pt; c1: Pt; c2: Pt; p2: Pt }, seed: number, amp = AMP): string {
  const r = rng(seed);
  const dist = Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y);
  const n = Math.max(6, Math.min(48, Math.round(dist / 18)));
  const points: Pt[] = [];
  for (let i = 0; i <= n; i++) points.push(pointOnCubic(g, i / n));
  // 잇는 선은 **한 겹**이다 — 두 겹으로 그으면 화살촉이 둘로 보인다.
  return stroke(points, r, amp);
}
