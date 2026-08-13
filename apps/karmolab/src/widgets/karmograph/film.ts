/**
 * film.ts — **발표를 영상 한 편으로** (TASK-KL-271 O5).
 *
 * 발표 모드도, 발표 SVG 한 장도 결국 **브라우저에서 눌러야** 돌아간다. 그런데 관계도를 자랑하는
 * 자리는 대개 눌러 볼 수 없는 곳이다 — 디스코드 채널, X 타임라인, 유튜브. 거기에 SVG 를 던지면
 * 아무 일도 일어나지 않는다(첨부 파일 하나). **영상은 저절로 재생된다.**
 *
 * 그래서 장면들을 **저절로 흐르는 한 편**으로 굽는다. 여기서는 그중 **각본**만 순수하게 정한다 —
 * 어느 장을 몇 초 보여 주고, 다음 장까지 몇 초에 걸쳐 옮겨 갈 것인가. 굽는 일(캔버스·녹화)은
 * 부르는 쪽 몫이다. 시간은 눈으로만 확인되는 값이라 더더욱 **글자로 잠가 둘** 필요가 있다.
 *
 * 못 박은 것 셋:
 *  1. **읽을 시간을 준다.** 장마다 같은 초를 주면 글 많은 장은 못 읽고 짧은 장은 지루하다 —
 *     글자 수로 머무는 시간을 정한다(사람이 읽는 속도).
 *  2. **옮겨 가는 것도 이야기다.** 뚝뚝 끊어 붙이면 어디서 어디로 갔는지 모른다 — 사이를 **움직여**
 *     건넌다(Ken Burns). 그래서 각본은 「머무는 시간」과 「건너는 시간」 둘을 갖는다.
 *  3. **길면 아무도 안 본다.** 총 길이에 천장을 두고, 넘치면 **고르게 줄인다**(뒷장을 자르면
 *     이야기가 끝을 잃는다).
 */

export interface FilmScene {
  title: string;
  note?: string;
  /** world 좌표 사각형 — 이 자리를 화면에 채운다. */
  rect: { x: number; y: number; w: number; h: number };
}

export interface FilmShot {
  /** 몇 번째 장인가 */
  scene: number;
  /** 앞 장에서 이 장으로 **건너오는** 시간 (첫 장은 0). */
  moveMs: number;
  /** 이 자리에 **머무는** 시간. */
  holdMs: number;
  /** 영상 시작부터 이 컷이 시작하는 시각(= 건너기 시작). */
  startMs: number;
}

export interface FilmPlan {
  shots: FilmShot[];
  totalMs: number;
}

export interface FilmOptions {
  /** 총 길이 천장 — 넘으면 고르게 줄인다. */
  maxMs?: number;
  /** 한 장에 머무는 최소·최대 시간. */
  minHoldMs?: number;
  maxHoldMs?: number;
  /** 장 사이를 건너는 시간. */
  moveMs?: number;
}

/** 사람이 글을 읽는 속도 — 한글 기준 대략 1자 60ms(소리 내지 않고 읽을 때). */
const PER_CHAR_MS = 60;

/** 이 장에 얼마나 머물 것인가 — **읽을 것이 많으면 오래**. */
export function holdFor(scene: FilmScene, min: number, max: number): number {
  const chars = (scene.title ?? '').length + (scene.note ?? '').length;
  return Math.round(Math.min(max, Math.max(min, 900 + chars * PER_CHAR_MS)));
}

/**
 * 각본을 짠다. 장이 없으면 **빈 각본**이다 — 없는 것을 억지로 한 컷 만들면 검은 화면 영상이 나온다.
 *
 * 천장을 넘으면 머무는 시간만 고르게 줄인다(건너는 시간은 그대로 — 그걸 줄이면 화면이 튄다).
 * 최소 머무름 아래로는 안 내려간다: 그보다 짧으면 글자를 읽기 전에 넘어가 **없는 것과 같다**.
 */
export function filmPlan(scenes: FilmScene[], opts: FilmOptions = {}): FilmPlan {
  const maxMs = opts.maxMs ?? 60_000;
  const minHold = opts.minHoldMs ?? 1_400;
  const maxHold = opts.maxHoldMs ?? 6_000;
  const move = opts.moveMs ?? 900;
  if (scenes.length === 0) return { shots: [], totalMs: 0 };

  let holds = scenes.map((s) => holdFor(s, minHold, maxHold));
  const moves = scenes.map((_, i) => (i === 0 ? 0 : move));
  const moveSum = moves.reduce((a, b) => a + b, 0);
  const holdSum = holds.reduce((a, b) => a + b, 0);
  const room = maxMs - moveSum;
  if (holdSum > room) {
    // 고르게 줄이되 최소 아래로는 안 간다 — 그래서 결과가 천장을 조금 넘을 수 있다(읽히는 쪽이 낫다).
    const ratio = Math.max(0, room) / holdSum;
    holds = holds.map((h) => Math.max(minHold, Math.round(h * ratio)));
  }

  const shots: FilmShot[] = [];
  let at = 0;
  scenes.forEach((_, i) => {
    shots.push({ scene: i, moveMs: moves[i], holdMs: holds[i], startMs: at });
    at += moves[i] + holds[i];
  });
  return { shots, totalMs: at };
}

/** 부드럽게 — 등속으로 움직이면 기계가 미는 것처럼 보인다. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** 두 자리 사이 — 지금 몇 %쯤 왔나. */
export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  const e = ease(t);
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    w: a.w + (b.w - a.w) * e,
    h: a.h + (b.h - a.h) * e,
  };
}

/**
 * 영상의 **지금 이 순간** — 어느 자리를 비추고, 어떤 말을 얹나.
 * 끝을 넘어서면 마지막 장에 멈춘다(검은 화면으로 끝나면 잘린 것처럼 보인다).
 */
export function frameAt(plan: FilmPlan, scenes: FilmScene[], ms: number): {
  rect: Rect; title: string; note: string; scene: number;
} | null {
  if (plan.shots.length === 0) return null;
  let shot = plan.shots[0];
  for (const s of plan.shots) if (ms >= s.startMs) shot = s;
  const prev = shot.scene > 0 ? scenes[shot.scene - 1] : null;
  const now = scenes[shot.scene];
  const into = ms - shot.startMs;
  const rect = prev && shot.moveMs > 0 && into < shot.moveMs
    ? lerpRect(prev.rect, now.rect, into / shot.moveMs)
    : now.rect;
  return { rect, title: now.title, note: now.note ?? '', scene: shot.scene };
}

/**
 * 그림을 화면에 **꽉 채우되 안 찌그러뜨리는** 자리 — 영상은 비율이 정해져 있고(16:9),
 * 장면 자리는 아니다. 비율을 억지로 맞추면 인물이 늘어난다.
 */
export function fitRect(rect: Rect, viewW: number, viewH: number): Rect {
  const want = viewW / viewH;
  const has = rect.w / rect.h;
  if (has > want) {
    const h = rect.w / want;
    return { x: rect.x, y: rect.y - (h - rect.h) / 2, w: rect.w, h };
  }
  const w = rect.h * want;
  return { x: rect.x - (w - rect.w) / 2, y: rect.y, w, h: rect.h };
}

/** 파일 이름 — 판 이름을 쓰되 파일로 못 쓰는 글자는 걷어낸다. 비면 기본 이름. */
export function filmFileName(mapName: string): string {
  const clean = (mapName || '').replace(/[\/:*?"<>|]/g, '').trim().slice(0, 40);
  return `${clean || 'karmograph'}.webm`;
}
