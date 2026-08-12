/**
 * 「본」 — 찍어내는 부품 (TASK-KL-254 · 1단계)
 *
 * 이 파일이 이 도구의 알맹이다. **손으로 그리지 않고 숫자를 돌려 모양을 얻는다.**
 * 버튼 하나를 만들 때 붓을 잡는 대신 손잡이를 돌린다 — 모서리 둥글기, 테두리 두께, 색,
 * 결의 각도, 도드라짐. 돌릴 때마다 다른 버튼이 나오고, 조합만 바꾸면 백 장이 나온다.
 * 참고한 곳(freegameui.net)이 에셋 2,209 장을 뽑은 방법도 이것이다.
 *
 * 규칙 하나: **부품은 숫자를 받아 도형을 돌려줄 뿐이다.** 화면도 파일도 모른다.
 * 그래서 화면 없이 검사할 수 있고, 나중에 서버에서 무더기로 뽑을 때도 그대로 쓰인다.
 */

import type { Node, Paint } from './model';

/** 손잡이 한 벌. 부품마다 쓰는 것만 골라 본다. */
export interface Knobs {
  w: number;
  h: number;
  /** 모서리 둥글기(px) */
  radius: number;
  /** 테두리 두께(px). 0 = 없음 */
  border: number;
  /** 바탕 색 */
  fill: string;
  /** 바탕을 결로 채울 때 끝 색. 없으면 단색 */
  fillTo?: string;
  /** 결의 각도(도). 0 = 왼→오른쪽, 90 = 위→아래 */
  angle: number;
  /** 테두리 색 */
  borderColor: string;
  /** 도드라짐 0..1 — 위쪽에 옅은 빛, 아래쪽에 그늘을 넣는 정도 */
  bevel: number;
  /** 안쪽 여백(px) — 패널의 속틀, 게이지의 막대가 이만큼 물러난다 */
  padding: number;
  /** 채운 정도 0..1 — 게이지에서만 쓴다 */
  value: number;
}

export const defaultKnobs = (): Knobs => ({
  w: 192, h: 64, radius: 12, border: 2, fill: '#3b4a6b', fillTo: '#22304a', angle: 90,
  borderColor: '#8fa6d8', bevel: 0.35, padding: 8, value: 0.6
});

const paintOf = (k: Knobs): Paint =>
  k.fillTo ? { kind: 'linear', from: k.fill, to: k.fillTo, angle: k.angle } : { kind: 'solid', color: k.fill };

/** 위쪽 빛 · 아래쪽 그늘. 도드라짐이 0 이면 아예 안 만든다(빈 도형을 남기지 않는다). */
function bevelNodes(k: Knobs): Node[] {
  if (k.bevel <= 0) return [];
  const inset = Math.max(1, k.border);
  const r = Math.max(0, k.radius - inset);
  const lip = Math.max(2, k.h * 0.18);
  return [
    { kind: 'rect', x: inset, y: inset, w: k.w - inset * 2, h: lip, radius: r,
      fill: { kind: 'linear', from: '#ffffff', to: '#ffffff', angle: 90, opacity: 1 }, opacity: 0.28 * k.bevel },
    { kind: 'rect', x: inset, y: k.h - inset - lip, w: k.w - inset * 2, h: lip, radius: r,
      fill: { kind: 'solid', color: '#000000' }, opacity: 0.32 * k.bevel }
  ];
}

const shell = (k: Knobs): Node => ({
  kind: 'rect', x: 0, y: 0, w: k.w, h: k.h, radius: k.radius,
  fill: paintOf(k),
  stroke: k.border > 0 ? { paint: { kind: 'solid', color: k.borderColor }, width: k.border, align: 'inside' } : undefined
});

/** 누르는 것. 겉틀 + 도드라짐. */
export const button = (k: Knobs): Node => ({ kind: 'group', children: [shell(k), ...bevelNodes(k)] });

/** 무엇을 담는 것. 겉틀 + 한 겹 안쪽 틀 — 창·상자에 쓴다. */
export const panel = (k: Knobs): Node => {
  const p = Math.max(0, k.padding);
  return {
    kind: 'group',
    children: [
      shell(k),
      ...bevelNodes(k),
      { kind: 'rect', x: p, y: p, w: Math.max(0, k.w - p * 2), h: Math.max(0, k.h - p * 2),
        radius: Math.max(0, k.radius - p * 0.6),
        fill: { kind: 'solid', color: '#000000', opacity: 1 }, opacity: 0.22,
        stroke: k.border > 0 ? { paint: { kind: 'solid', color: k.borderColor }, width: 1, align: 'inside' } : undefined }
    ]
  };
};

/** 차오르는 것. 홈 + 채운 막대. `value` 가 0 이면 막대를 아예 안 만든다. */
export const gauge = (k: Knobs): Node => {
  const p = Math.max(0, k.padding);
  const innerW = Math.max(0, k.w - p * 2);
  const innerH = Math.max(0, k.h - p * 2);
  const filled = Math.max(0, Math.min(1, k.value)) * innerW;
  const innerR = Math.max(0, k.radius - p * 0.6);
  const children: Node[] = [
    shell(k),
    { kind: 'rect', x: p, y: p, w: innerW, h: innerH, radius: innerR, fill: { kind: 'solid', color: '#000000' }, opacity: 0.45 }
  ];
  if (filled > 0) {
    children.push({
      kind: 'rect', x: p, y: p, w: filled, h: innerH, radius: innerR,
      fill: { kind: 'linear', from: k.borderColor, to: k.fill, angle: 90 }
    });
    children.push(...bevelNodes({ ...k, w: filled + p * 2, h: k.h }));
  }
  return { kind: 'group', children };
};

export const PARTS = { button, panel, gauge } as const;
export type PartName = keyof typeof PARTS;

/**
 * 한 설정에서 **변형 여러 장**. 손잡이 하나를 골라 처음~끝을 고르게 나눠 돌린다.
 * 백 장을 손으로 만들면 백 번 노동이고, 여기서는 한 번이다.
 */
export function variants(part: PartName, base: Knobs, knob: keyof Knobs, from: number, to: number, count: number): Node[] {
  if (count < 1) return [];
  const out: Node[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push(PARTS[part]({ ...base, [knob]: from + (to - from) * t }));
  }
  return out;
}
