/**
 * 멍 — 작품 규약 (TASK-KL-247)
 *
 * 이 위젯은 **도구가 아니라 창문**이다. 켜 두고 아무것도 안 하는 것이 정상 사용이다.
 * 그래서 화면 한 장을 여러 작품이 돌려 쓴다 — 껍데기(캔버스·손잡이·저장·전체화면·멈춤)는
 * 한 번만 짓고, 작품은 이 규약만 지키면 파일 하나씩 늘어난다.
 *
 * 규약이 요구하는 것은 셋뿐이다:
 *   ① `params` — 손잡이 목록. 껍데기가 알아서 슬라이더·고르개를 그리고 저장한다.
 *   ② `bg(p)`  — 바탕색. 전체화면·PNG 저장도 같은 색을 써야 이질감이 없다.
 *   ③ `frame(s)` — 한 장 그리기. **시각(`s.time`)의 함수로만** 그린다.
 *
 * ③ 이 규약의 핵심이다. 「지난 프레임에 조금 더한다」로 그리면 멈췄다 켰을 때·창 크기가
 * 바뀔 때·다른 작품에 갔다 왔을 때 그림이 어긋난다. 시각의 함수면 그런 상태가 아예 없다 —
 * 되감기도 이어붙이기도 공짜다.
 */

/** 손잡이 한 개. 라벨은 코드가 아니라 말 묶음(`meong.param.<key>`)에서 온다. */
export interface ParamSpec {
  key: string;
  kind: 'range' | 'choice';
  /** kind==='range' */
  min?: number;
  max?: number;
  step?: number;
  /** kind==='choice' — 값 목록. 라벨은 `meong.choice.<key>.<value>` */
  choices?: string[];
  def: number | string;
}

export type ParamValues = Record<string, number | string>;

/** 한 장 그릴 때 작품에게 주어지는 것 전부. */
export interface Stage {
  ctx: CanvasRenderingContext2D;
  /** CSS 픽셀 기준 크기 (ctx 는 이미 dpr 로 맞춰져 있다 — 작품은 dpr 을 몰라도 된다) */
  w: number;
  h: number;
  dpr: number;
  /** 초. 멈춰 있는 동안은 안 흐른다. */
  time: number;
  params: ParamValues;
  /** 0..1 — 같은 seed 면 같은 그림 */
  seed: number;
}

export interface Piece {
  id: string;
  params: ParamSpec[];
  bg(p: ParamValues): string;
  frame(s: Stage): void;
  /**
   * 처음 열 때 어느 시각부터 시작할지 (초). 안 주면 0.
   * 시각의 함수로 그리는 작품은 t=0 이 「가장 볼 만한 장면」이라는 보장이 없다 — 실제로
   * 무한 로고는 t=0 이 하필 벽지 구간이었다. 첫인상은 한 번뿐이라 작품이 직접 고른다.
   */
  startTime?(w: number, h: number, params: ParamValues): number;
}

/** 작품 기본값 — 껍데기가 저장본과 합칠 때 쓴다. */
export function defaults(piece: Piece): ParamValues {
  const out: ParamValues = {};
  for (const p of piece.params) out[p.key] = p.def;
  return out;
}

/** 저장본을 그대로 믿지 않는다 — 범위 밖 숫자·없어진 선택지가 들어오면 그리다 죽는다. */
export function sanitize(piece: Piece, raw: unknown): ParamValues {
  const out = defaults(piece);
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const p of piece.params) {
    const v = src[p.key];
    if (p.kind === 'range') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[p.key] = Math.min(p.max ?? 1, Math.max(p.min ?? 0, n));
    } else if (p.kind === 'choice') {
      if (typeof v === 'string' && (p.choices ?? []).includes(v)) out[p.key] = v;
    }
  }
  return out;
}

/** 0..1 로 부드럽게 (양 끝에서 기울기 0 — 튀어나오는 느낌이 안 난다) */
export function smooth01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** 씨앗에서 뽑는 되풀이 가능한 난수 (같은 씨앗 = 같은 그림) */
export function hash01(a: number, b: number): number {
  let x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  x -= Math.floor(x);
  return x;
}
