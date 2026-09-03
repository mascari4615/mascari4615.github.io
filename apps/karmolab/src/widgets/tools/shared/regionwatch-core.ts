/**
 * 화면 영역 지켜보기의 알맹이. 화면 없이 도는 순수 계산만
 *
 * - 닮은 정도, 줄인 크기, 판정 상태 기계(같아지면/달라지면, 숫자 카운트다운), 숫자 읽기 전처리
 * - `document`, `window` 금지. `scripts/test-regionwatch.mjs` 가 Node 에서 그대로 호출
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Mode = 'match' | 'change' | 'count' | 'trend';

/** 두 RGBA 그림의 닮은 정도. 1 이 같음, 0 이 정반대 */
export function similarity(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i + 2 < n; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    cnt += 3;
  }
  return cnt ? 1 - sum / (cnt * 255) : 0;
}

/** 긴 변을 `max` 로 맞춘 줄인 크기. 비율 유지, 최소 1 */
export function smallSize(r: Rect, max = 40): [number, number] {
  const k = max / Math.max(1, r.w, r.h);
  return [Math.max(1, Math.round(r.w * k)), Math.max(1, Math.round(r.h * k))];
}

export interface EdgeState {
  wasHit: boolean;
  firedAt: number;
}

export interface EdgeCfg {
  mode: 'match' | 'change';
  /** 0.5 ~ 0.99 */
  threshold: number;
  /** 다시 무장까지 초 */
  rearm: number;
}

export interface EdgeResult {
  hit: boolean;
  fire: boolean;
  state: EdgeState;
}

/**
 * 같아지면/달라지면 판정. 조건에 **들어가는 순간**만 한 번 울림.
 * 조건에서 빠지면 다시 무장. `rearm` 초 안에는 다시 들어가도 침묵
 */
export function decideEdge(st: EdgeState, sim: number, cfg: EdgeCfg, now: number): EdgeResult {
  const hit = cfg.mode === 'match' ? sim >= cfg.threshold : sim < cfg.threshold;
  if (!hit) return { hit, fire: false, state: { wasHit: false, firedAt: st.firedAt } };
  if (st.wasHit) return { hit, fire: false, state: st };
  const cool = now - st.firedAt < cfg.rearm * 1000;
  return { hit, fire: !cool, state: { wasHit: true, firedAt: cool ? st.firedAt : now } };
}

/**
 * 읽은 글자에서 남은 초. "12" -> 12, "1:05" -> 65, "12s" -> 12, "0" -> 0.
 * 숫자가 없으면 null (준비된 상태, 또는 못 읽음)
 */
export function parseSeconds(text: string): number | null {
  const s = text.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/\s+/g, '');
  const mmss = s.match(/(\d{1,2}):(\d{2})/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const num = s.match(/\d+(?:\.\d+)?/);
  if (!num) return null;
  const v = Math.floor(Number(num[0]));
  return Number.isFinite(v) ? v : null;
}

export interface CountState {
  /** 직전 읽은 값. null 은 숫자 없음 */
  last: number | null;
  /** 문턱 아래로 읽힌 연속 횟수. 오독 한 번으로 안 울리게 */
  streak: number;
  firedAt: number;
  /** 이번 카운트다운에서 이미 울렸나. 숫자가 사라지면 풀림 */
  done: boolean;
}

export interface CountCfg {
  /** 남은 초가 이 값 이하가 되면 */
  lead: number;
  rearm: number;
  /** 연속으로 몇 번 읽혀야 믿나. 기본 2 */
  confirm?: number;
}

export interface CountResult {
  fire: boolean;
  state: CountState;
}

/**
 * 숫자 카운트다운 판정. 남은 초가 `lead` 이하로 **처음** 내려오면 한 번 울림.
 * 숫자가 안 보이면(준비됨) 다음 카운트다운을 위해 풀림.
 * 오독 대비로 `confirm` 번 연속 문턱 아래일 때만. 값이 커지면(새 카운트다운) 도 풀림
 */
export function decideCount(st: CountState, secs: number | null, cfg: CountCfg, now: number): CountResult {
  const need = Math.max(1, cfg.confirm ?? 2);
  if (secs === null) return { fire: false, state: { last: null, streak: 0, firedAt: st.firedAt, done: false } };
  const restarted = st.last !== null && secs > st.last + 2;
  const done = restarted ? false : st.done;
  if (secs > cfg.lead) return { fire: false, state: { last: secs, streak: 0, firedAt: st.firedAt, done } };
  const streak = restarted ? 1 : st.streak + 1;
  if (done || streak < need) return { fire: false, state: { last: secs, streak, firedAt: st.firedAt, done } };
  const cool = now - st.firedAt < cfg.rearm * 1000;
  return { fire: !cool, state: { last: secs, streak, firedAt: cool ? st.firedAt : now, done: true } };
}

/**
 * 숫자 읽기 전처리. 회색으로 만들고, 어두운 바탕이면 뒤집고, 평균으로 이진화.
 * 글자 인식기는 흰 바탕에 검은 글자에 제일 강함. 제자리에서 변경
 */
export function binarize(data: Uint8ClampedArray): { inverted: boolean; threshold: number } {
  const n = data.length >> 2;
  if (!n) return { inverted: false, threshold: 128 };
  const lum = new Uint8Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const l = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
    lum[i] = l;
    sum += l;
  }
  const mean = sum / n;
  const inverted = mean < 128;
  /* 밝은 쪽과 어두운 쪽의 평균 사이. 단순한 두 덩이 문턱 */
  let lo = 0;
  let loN = 0;
  let hi = 0;
  let hiN = 0;
  for (let i = 0; i < n; i++) {
    if (lum[i] < mean) {
      lo += lum[i];
      loN++;
    } else {
      hi += lum[i];
      hiN++;
    }
  }
  const threshold = loN && hiN ? (lo / loN + hi / hiN) / 2 : mean;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const ink = inverted ? lum[i] >= threshold : lum[i] < threshold;
    const v = ink ? 0 : 255;
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
    data[j + 3] = 255;
  }
  return { inverted, threshold };
}

/* ── 추세 기록 ─────────────────────────────────────────────── */

/**
 * 읽은 글자에서 숫자 하나. 쉼표와 공백 무시, 소수점 허용, % 와 단위 접미 무시.
 * "1,204,588" -> 1204588, "42.7%" -> 42.7, "12s" -> 12. 숫자가 없으면 null
 */
export function parseNumber(text: string): number | null {
  const s = text.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/[,\s]/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : null;
}

export interface Sample {
  /** 초 단위 시각 */
  t: number;
  v: number;
}

/** 창 안 표본의 최소제곱 기울기 (초당). 표본 3개 미만이거나 시각이 전부 같으면 null */
export function slopePerSec(samples: Sample[], windowSec: number, now: number): number | null {
  const from = now - windowSec;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of samples) {
    if (p.t < from) continue;
    n++;
    sx += p.t;
    sy += p.v;
    sxx += p.t * p.t;
    sxy += p.t * p.v;
  }
  if (n < 3) return null;
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-9) return null;
  return (n * sxy - sx * sy) / d;
}

/** 목표까지 남은 초. 기울기가 없거나 반대 방향이면 null, 이미 지났으면 0 */
export function secondsToTarget(current: number, target: number, slope: number | null): number | null {
  const gap = target - current;
  if (gap === 0) return 0;
  if (slope === null || slope === 0) return null;
  if (Math.sign(gap) !== Math.sign(slope)) return gap * slope < 0 && Math.abs(gap) < Math.abs(slope) ? 0 : null;
  return gap / slope;
}

export interface GateState {
  /** 채택한 최근 값들 (최대 5)  */
  recent: number[];
  /** 튀는 값이 이어진 횟수 */
  pendingCount: number;
  pendingValue: number | null;
}

export interface GateResult {
  accepted: number | null;
  state: GateState;
}

/**
 * 오독 거르기. 최근 채택값 중앙값에서 `ratio` 넘게 튀면 보류.
 * 같은 쪽으로 `confirm` 번 이어지면 진짜 변화로 보고 채택. 값이 없으면 상태 유지
 */
export function gateReading(st: GateState, value: number | null, ratio = 0.3, confirm = 2): GateResult {
  if (value === null) return { accepted: null, state: st };
  const recent = st.recent;
  if (recent.length < 3) return { accepted: value, state: { recent: [...recent, value].slice(-5), pendingCount: 0, pendingValue: null } };
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const base = Math.max(1, Math.abs(median));
  const jump = Math.abs(value - median) / base;
  if (jump <= ratio) return { accepted: value, state: { recent: [...recent, value].slice(-5), pendingCount: 0, pendingValue: null } };
  const same = st.pendingValue !== null && Math.abs(value - st.pendingValue) / Math.max(1, Math.abs(st.pendingValue)) <= ratio;
  const count = same ? st.pendingCount + 1 : 1;
  if (count >= confirm) return { accepted: value, state: { recent: [value], pendingCount: 0, pendingValue: null } };
  return { accepted: null, state: { recent, pendingCount: count, pendingValue: value } };
}

/**
 * 표본 접기. `olderThanSec` 보다 오래된 표본은 `bucketSec` 단위로 하나(마지막 값)만 유지.
 * 1시간 넘게 돌아도 배열이 1초 표본으로 끝없이 자라지 않게
 */
export function foldSamples(samples: Sample[], now: number, olderThanSec = 3600, bucketSec = 10): Sample[] {
  const cut = now - olderThanSec;
  const out: Sample[] = [];
  let lastBucket = Number.NEGATIVE_INFINITY;
  for (const p of samples) {
    if (p.t >= cut) {
      out.push(p);
      continue;
    }
    const b = Math.floor(p.t / bucketSec);
    if (b === lastBucket) out[out.length - 1] = p;
    else {
      out.push(p);
      lastBucket = b;
    }
  }
  return out;
}

/** 값이 `idleSec` 동안 안 바뀌었나. 표본이 없으면 false */
export function isIdle(samples: Sample[], now: number, idleSec: number): boolean {
  if (!samples.length) return false;
  const last = samples[samples.length - 1];
  if (now - last.t > idleSec) return true;
  for (let i = samples.length - 1; i >= 0; i--) {
    const p = samples[i];
    if (p.v !== last.v) return now - p.t >= idleSec;
    if (now - p.t >= idleSec) return true;
  }
  return false;
}

/** 초를 "1시간 5분", "12분", "40초" 로 */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}초`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
