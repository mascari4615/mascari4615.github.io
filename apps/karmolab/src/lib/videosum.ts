/**
 * 영상 줄이기. 자막에서 **목차**를 뽑는다 (TASK-KL-238 / 39 summarize.tech)
 *
 * summarize.tech 가 실제로 주는 것은 요약문이 아니라 **시간이 붙은 목차**다. 사람이 30분짜리
 * 영상 앞에서 알고 싶은 것은 줄거리가 아니라 내가 볼 데가 몇 분인가이기 때문이다.
 * 그건 큰 모델이 없어도 된다. 자막에는 이미 **시간과 말**이 다 들어 있다.
 *
 * ★ 규율은 `askpapers` 와 같다: **말을 지어내지 않는다.** 각 칸의 이름표는 그 구간에서 실제로
 *   나온 문장이다. 지어낸 제목은 그럴듯해서 더 위험하다. 사람은 그걸 믿고 그 구간을 건너뛴다.
 *
 * 안 하는 것: 유튜브에서 자막을 **긁어 오는 일**. 그쪽은 키, CORS 로 막혀 있고, 우회하면 그날부터
 * 남의 규칙을 어기며 사는 도구가 된다. 자막 파일은 `youtubedl` 이 이미 가져온다. 여기로 넘기면 된다.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** `00:01:02,500`, `00:01:02.500`, `01:02.500` → 초. 못 읽으면 NaN. */
export function parseTime(s: string): number {
  const m = String(s ?? '').trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

/** SRT, VTT 를 모두 받는다 (번호, 머리말, 자리 지정은 버린다). */
export function parseCues(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = String(text ?? '')
    .replace(/\r/g, '')
    .replace(/^WEBVTT.*?\n/s, '')
    .split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, z] = lines[at].split('-->');
    const start = parseTime(a);
    const end = parseTime(z);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    cues.push({ start, end, text: lines.slice(at + 1).join('\n').trim() });
  }
  return cues;
}

/** `3725` → `1:02:05`. 목차는 **눌러서 그 자리로 가는 것**이라 사람이 읽는 모양이어야 한다. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

/** 자막 → 그냥 글. 줄바꿈, 중복 줄(노래방식 자막)을 걷어 읽을 수 있게 만든다. */
export function plainText(cues: Cue[]): string {
  const out: string[] = [];
  for (const c of cues) {
    const line = c.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (line === '') continue;
    if (out.length > 0 && (out[out.length - 1] === line || line.startsWith(out[out.length - 1]))) {
      out[out.length - 1] = line; // 한 글자씩 늘어나는 자동 자막은 마지막 것만 남긴다
      continue;
    }
    out.push(line);
  }
  return out.join(' ');
}

export interface Chapter {
  start: number;
  end: number;
  /** 그 구간에서 실제로 나온 문장. **지어내지 않는다.** */
  label: string;
  cues: Cue[];
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'that', 'this', 'it', 'you', 'we',
  'so', 'but', 'for', 'on', 'with', 'as', 'be', 'not', 'have', 'has', 'do', 'does', 'just', 'like',
  'okay', 'right', 'yeah', 'um', 'uh', 'gonna', 'really',
  '그리고', '그래서', '근데', '이제', '저는', '우리', '거기', '그거', '이거', '있는', '하는', '해서'
]);

const words = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length > 1 && !STOP.has(w));

/**
 * 구간 나누기. 목표 길이(기본 5분)마다 한 칸. **말이 끊긴 자리**(3초 넘게 빈 곳)를 우선해서
 * 자른다. 시계로만 자르면 문장 한가운데가 잘려 이름표가 반쪽이 된다.
 */
export function chapters(cues: Cue[], targetSec = 300): Chapter[] {
  if (cues.length === 0) return [];
  const total = cues[cues.length - 1].end - cues[0].start;
  const size = total <= targetSec ? Math.max(60, total / 3) : targetSec;
  const out: Chapter[] = [];
  let bucket: Cue[] = [];
  let from = cues[0].start;
  let prevEnd = cues[0].start;
  /* 자를지는 **다음 줄을 담기 전에** 정한다. 담고 나서 재면 마지막 줄이 늘 앞 칸에 붙어,
     6분짜리가 한 칸으로 나온다(실측 2026-08-14. 첫 판이 그랬다). */
  for (const cue of cues) {
    const long = cue.start - from >= size;
    const gap = cue.start - prevEnd >= 3;
    if (bucket.length > 0 && ((long && gap) || cue.start - from >= size * 1.6)) {
      out.push({ start: from, end: prevEnd, label: labelOf(bucket), cues: bucket });
      bucket = [];
      from = cue.start;
    }
    bucket.push(cue);
    prevEnd = cue.end;
  }
  if (bucket.length > 0) out.push({ start: from, end: prevEnd, label: labelOf(bucket), cues: bucket });
  return out;
}

/**
 * 칸의 이름표 = 그 구간에서 **가장 그 구간다운 문장**. 자주 나온 낱말을 많이 담은 문장을 고른다.
 * 너무 짧은 맞장구(네, right)는 이름표가 될 수 없다.
 */
export function labelOf(cues: Cue[]): string {
  const freq = new Map<string, number>();
  for (const c of cues) for (const w of words(c.text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  let best = '';
  let bestScore = -1;
  for (const c of cues) {
    const line = c.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const w = words(line);
    if (w.length < 3) continue;
    const uniq = new Set(w);
    let score = 0;
    for (const word of uniq) score += freq.get(word) ?? 0;
    score /= Math.sqrt(w.length); // 긴 문장이 낱말 수만으로 이기지 않게
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best.slice(0, 120);
}

export interface Outline {
  /** 자막이 덮는 길이(초) */
  duration: number;
  chapters: Chapter[];
  /** 글자 수. 읽으면 몇 분을 사람이 가늠하게 */
  chars: number;
}

export function outline(cues: Cue[], targetSec = 300): Outline | null {
  if (cues.length === 0) return null;
  return {
    duration: cues[cues.length - 1].end - cues[0].start,
    chapters: chapters(cues, targetSec),
    chars: plainText(cues).length
  };
}
