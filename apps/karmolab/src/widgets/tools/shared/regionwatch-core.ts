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

export type Mode = 'match' | 'change' | 'count';

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
