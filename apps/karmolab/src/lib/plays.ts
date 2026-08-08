/**
 * 놀이 기록 이음매 (TASK-KL-148) — 한 판이 끝나면 부르는 자리.
 *
 * 왜 있나: 놀이마다 저장을 따로 짜면 여섯 벌이 그날부터 갈라진다(어떤 놀이는 최고를 덮어쓰고,
 * 어떤 놀이는 새로고침에 증발했다). 「한 판이 끝났다」를 말하는 곳은 여기 하나다.
 *
 * **fail-open 이 제일 중요한 성질이다.** 로그인을 안 했든, 서버가 죽었든, 느리든 —
 * 이 파일은 놀이를 절대 막지 않는다. 실패하면 이 브라우저의 최고만 들고 조용히 돌아간다.
 * 놀이 여섯의 생사를 노트북 한 대에 걸지 않는다.
 *
 * 「크면 좋은가 작으면 좋은가」를 왜 여기서도 말하나: 그건 **놀이 자체의 성질**이다
 * (반응속도는 작을수록 빠르다). 서버도 같은 표를 들고 있지만 그건 복사본이 아니라 **경계**다 —
 * 순위는 브라우저가 보내온 말을 믿고 매길 수 없다.
 */
const API_BASE = 'https://yawnbot.mascari4615.com';
const LOCAL_KEY = 'karmolab_play_best';
const TIMEOUT_MS = 4000;

export interface PlaySpec {
  /** 서버 표(`PLAY_GAMES`)에 있는 id. */
  game: string;
  /**
   * 순위판이 표마다 갈리는 놀이는 그 표 이름 (`pokemon` · `pack:내표`).
   *
   * 왜: 포켓몬 10연승과 롤 10연승은 같은 기록이 아니다. 한 순위판에 섞으면 쉬운 표를 고른
   * 사람이 1등이 된다. 사람이 만든 표(UGC)도 같은 자리로 들어온다.
   */
  variant?: string | null;
  /** `low` = 작을수록 좋다. */
  better: 'high' | 'low';
  unit: string;
  /** 화면에 보일 소수 자리. */
  decimals?: number;
}

/** 서버가 돌려주는 한 판의 결말. 못 받으면 통째로 null 이다. */
export interface PlayOutcome {
  score: number;
  best: number;
  previousBest: number | null;
  improved: boolean;
  todayBest: number;
  yesterdayBest: number | null;
  rank: number;
  total: number;
  todayRank: number;
  todayTotal: number;
  plays: number;
}

export interface PlayResult {
  /** 이 브라우저의 역대 최고 (서버와 무관하게 늘 있다). */
  localBest: number;
  /** 이 판으로 이 브라우저 최고를 깼나. */
  localImproved: boolean;
  /** 이 브라우저가 기억하는 어제의 최고. 서버가 있으면 서버 쪽이 우선한다. */
  localYesterday: number | null;
  /** 로그인 + 서버가 살아 있을 때만. 순위는 여기서만 나온다. */
  server: PlayOutcome | null;
}

interface LocalRecord {
  score: number;
  at: string;
  /** `YYYY-MM-DD`(KST) → 그날 최고. 최근 며칠만. */
  days: Record<string, number>;
}

/** 오늘(KST). 서버와 같은 모양으로 — 여기서 갈리면 「어제의 나」가 하루씩 어긋난다. */
function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function readLocal(): Record<string, LocalRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {}; // 사생활 모드 · 깨진 값 — 없는 셈 친다
  }
}

function writeLocal(all: Record<string, LocalRecord>): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {
    /* 못 남겨도 이번 판 화면은 맞다 */
  }
}

/** 이 브라우저 안에서 이 순위판을 가리키는 이름. 표가 갈리면 표마다 따로 센다. */
function localKey(spec: PlaySpec): string {
  return spec.variant ? `${spec.game}::${spec.variant}` : spec.game;
}

export function betterThan(spec: PlaySpec, next: number, prev: number): boolean {
  return spec.better === 'low' ? next < prev : next > prev;
}

export function formatScore(spec: PlaySpec, value: number): string {
  return `${value.toFixed(spec.decimals ?? 0)}${spec.unit}`;
}

/** 이 브라우저가 기억하는 최고. 놀이를 열 때 바로 보여 주려고 따로 뺐다. */
export function localBest(spec: PlaySpec): number | null {
  const record = readLocal()[localKey(spec)];
  return record ? record.score : null;
}

async function postPlay(spec: PlaySpec, score: number): Promise<PlayOutcome | null> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/kl/play`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: spec.game, score, variant: spec.variant ?? null }),
      signal: control.signal,
    });
    if (!res.ok) return null; // 401(로그인 안 함) 도 여기로 — 놀이는 그대로 된다
    const body = (await res.json()) as { counted?: boolean; outcome?: PlayOutcome };
    return body.counted && body.outcome ? body.outcome : null;
  } catch {
    return null; // 서버가 죽었거나 느리다
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 한 판이 끝났다.
 *
 * 이 브라우저 기록은 **먼저, 반드시** 적는다 — 서버를 기다리다 실패하면 그 판이 통째로
 * 사라지기 때문이다. 서버는 그 다음에 조용히 시도한다.
 */
export async function submitPlay(spec: PlaySpec, score: number): Promise<PlayResult> {
  const all = readLocal();
  const day = kstDay();
  const key = localKey(spec);
  const before = all[key];
  const localImproved = !before || betterThan(spec, score, before.score);

  const days = { ...(before?.days ?? {}) };
  if (days[day] === undefined || betterThan(spec, score, days[day])) days[day] = score;
  const keep = Object.keys(days).sort().slice(-30);
  const trimmed: Record<string, number> = {};
  for (const kept of keep) trimmed[kept] = days[kept];

  all[key] = {
    score: localImproved ? score : before.score,
    at: localImproved ? new Date().toISOString() : before.at,
    days: trimmed,
  };
  writeLocal(all);

  return {
    localBest: all[key].score,
    localImproved,
    localYesterday: trimmed[dayBefore(day)] ?? null,
    server: await postPlay(spec, score),
  };
}

/**
 * 한 판 끝난 자리에 붙이는 한 줄 — 최고 · 순위 · 어제의 나.
 *
 * 없는 것은 **아예 안 적는다**. 「순위 -」·「어제 0」 같은 빈칸이 늘어서면 화면이 죽어 보인다.
 */
export function renderPlayResult(slot: HTMLElement, spec: PlaySpec, result: PlayResult): void {
  const parts: string[] = [];
  const server = result.server;
  const best = server ? server.best : result.localBest;
  const yesterday = server ? server.yesterdayBest : result.localYesterday;
  const improved = server ? server.improved : result.localImproved;

  parts.push(`${improved ? '🏆 신기록' : '최고'} ${formatScore(spec, best)}`);
  if (server && server.total > 1) parts.push(`${server.rank}위 / ${server.total}명`);
  if (yesterday !== null && yesterday !== undefined) {
    const delta = spec.better === 'low' ? yesterday - best : best - yesterday;
    parts.push(`어제 ${formatScore(spec, yesterday)}${delta > 0 ? ' ↑' : delta < 0 ? ' ↓' : ''}`);
  }
  if (!server) parts.push('이 브라우저에만 저장됨');

  slot.hidden = false;
  slot.style.cssText =
    'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center;' +
    'font-size:var(--font-size-xs);color:var(--text-secondary);';
  slot.innerHTML = parts
    .map(
      (text) =>
        `<span style="padding:3px 9px;border-radius:100px;background:var(--bg-tertiary);border:1px solid var(--border);">${text}</span>`,
    )
    .join('');
}

interface BoardResponse {
  entries?: Array<{ rank: number; handle: string; score: number }>;
  /** 내 자리 — 순위 밖이어도 온다. 핸들이 같이 오므로 순위판에서 내 줄을 집을 수 있다. */
  me?: { handle: string; rank: number; best: number } | null;
  signedIn?: boolean;
}

/**
 * 순위판을 붙인다. 서버에 못 닿거나 아직 아무도 안 놀았으면 **아무것도 안 붙인다** —
 * 빈 표가 덩그러니 있는 것보다 없는 게 낫다.
 */
export function mountPlayBoard(slot: HTMLElement, spec: PlaySpec, period: 'day' | 'all' = 'all'): void {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  const variantParam = spec.variant ? `&variant=${encodeURIComponent(spec.variant)}` : '';
  fetch(`${API_BASE}/kl/play/board?game=${encodeURIComponent(spec.game)}&period=${period}&limit=10${variantParam}`, {
    credentials: 'include',
    signal: control.signal,
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: BoardResponse | null) => {
      clearTimeout(timer);
      if (!body || !slot.isConnected) return;
      const entries = body.entries ?? [];
      if (!entries.length) return;

      const mine = body.me;
      const rows = entries
        .map((e) => {
          const isMe = mine ? e.handle === mine.handle : false;
          /* 얼굴을 붙인다 (TASK-KL-151 ⑩) — 「북적북적」은 숫자가 아니라 **사람**에서 온다.
             핸들 글자만 늘어서면 순위판이 로그 파일처럼 읽힌다.
             그림이 없는 계정도 있다: 그때는 그 자리가 비고(alt 빈 글자) 이름만 남는다. */
          const face =
            `<img src="${API_BASE}/kl/u/${encodeURIComponent(e.handle)}/avatar" alt="" loading="lazy" ` +
            `style="width:20px;height:20px;border-radius:50%;object-fit:cover;background:var(--bg-tertiary);flex:0 0 auto">`;
          return (
            `<li style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;align-items:center;` +
            `${isMe ? 'font-weight:700;color:var(--accent);' : ''}">` +
            `<span style="display:flex;align-items:center;gap:7px;min-width:0">` +
            `<span style="opacity:.7">${e.rank}.</span>${face}` +
            `<a href="/karmolab/u/${encodeURIComponent(e.handle)}/" style="color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.handle)}</a>` +
            `</span>` +
            `<span style="flex:0 0 auto">${formatScore(spec, e.score)}</span></li>`
          );
        })
        .join('');

      const footer =
        body.signedIn === false
          ? `<div style="margin-top:8px;color:var(--text-tertiary);">로그인하면 내 기록도 여기 오른다</div>`
          : mine
            ? `<div style="margin-top:8px;color:var(--text-tertiary);">내 기록 ${formatScore(spec, mine.best)} · ${mine.rank}위</div>`
            : '';

      slot.hidden = false;
      slot.innerHTML =
        `<div style="width:100%;max-width:420px;margin:0 auto;font-size:var(--font-size-xs);color:var(--text-secondary);">` +
        `<div style="font-weight:700;color:var(--text-primary);margin-bottom:6px;">순위판</div>` +
        `<ol style="list-style:none;margin:0;padding:0;">${rows}</ol>${footer}</div>`;

      /* 그림이 없는 계정도 있다(디스코드 아바타가 없거나 씨앗 계정). 깨진 그림 표시가 뜨면
         순위판이 고장 난 것처럼 보인다 — 조용히 자리만 비운다. */
      slot.querySelectorAll('img').forEach((img) => {
        img.addEventListener('error', () => {
          (img as HTMLImageElement).style.visibility = 'hidden';
        });
      });
    })
    .catch(() => {
      clearTimeout(timer);
      /* 서버가 없으면 순위판만 없다 */
    });
}

function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
