/**
 * 되묻기. 오늘 여섯 개를 먼저 답하고 확인
 *
 * 왜 이 모양인가. 근거는 memo/projects/karmolab/reference/학습-수치-장부.md
 *  - 먼저 답하기는 물어본 항목만 g 0.54, 안 물어본 것은 0.04. 그래서 읽기가 아니라 묻기가 기본
 *  - 세션을 6문항으로 묶음. 40시간 과정 완료율 5~10%, 2시간 미만 80~90%
 *  - 분야를 섞음. 끼워 넣기 g 0.42, 변별력만 재면 0.67
 *  - 객관식과 서술을 함께. 기억은 객관식 0.70, 면접에서 필요한 것은 서술 0.48
 *  - AI 채점 없음. 즉시와 지연 피드백 차이가 0.03 이라 사람이 대조해도 값의 대부분을 가져감
 *
 * 재료는 스터디맵 것 그대로. 세트를 고를 때는 얇은 표(recall-pool.json)만 보고,
 * 본문은 고른 칸의 강의 파일만 받음. 강의 전체가 17MB 라 다 못 받음
 */
import { t, loadNamespace } from '../../lib/i18n';

(function () {
type Kind = 'pick' | 'say';
type Verdict = 'hit' | 'half' | 'miss';
type DropWhy = 'known' | 'off' | 'later';

interface Pool {
  v: number;
  tracks: Record<string, string>;
  lessons: Record<string, { t: string; q: number[]; s: string }>;
}

/** 오늘 세트의 한 자리. 본문은 아직 안 받은 상태 */
interface Slot {
  kind: Kind;
  lesson: string;
  part: number;
  quiz?: number;
  track: string;
}

/** 본문까지 받은 문항 */
interface Item extends Slot {
  q: string;
  choices?: string[];
  answer?: number;
  why?: string;
  model?: string;
}

interface LessonBlock { type: string; text?: string }
interface LessonQuiz { q: string; choices: string[]; answer: number; why?: string }
interface LessonPart { id: string; title: string; blocks?: LessonBlock[]; quiz?: LessonQuiz[] }
interface LessonFile { id: string; parts: LessonPart[] }

const SET_SIZE = 6;
const SEEN_KEY = 'karmolab-recall-seen';
const DROP_KEY = 'karmolab-recall-drop';

/** 판정이 다음에 다시 묻는 날을 정함. 하루 안은 g 0.56, 1~6일 뒤는 0.82 */
const AFTER: Record<Verdict, number> = { hit: 10, half: 3, miss: 1 };
const DROP_AFTER: Record<DropWhy, number> = { known: 3650, off: 3650, later: 30 };

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 본문의 굵은 표시만 살림. 그 문장에서 핵심이 어디인지가 대조의 절반 */
const strong = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const today = (): number => Math.floor(Date.now() / 86400000);

interface SeenRow { d: number; v: Verdict | 'drop'; n: number }
const readJson = <T,>(key: string, dflt: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return dflt;
  }
};
const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 못 적어도 이번 판은 끝났다 */
  }
};

/**
 * 오늘 세트 고르기.
 *  1. 다시 물을 날이 된 것 먼저
 *  2. 나머지는 안 본 것에서
 *  3. 같은 갈래가 잇달지 않게 폄. 섞는 것이 값의 일부
 */
function buildSet(pool: Pool, seen: Record<string, SeenRow>, dropped: Record<string, number>): Slot[] {
  const all: Slot[] = [];
  for (const [lesson, meta] of Object.entries(pool.lessons)) {
    if (dropped[lesson] && dropped[lesson] > today()) continue;
    meta.q.forEach((n, part) => {
      if (meta.s[part] === '1') all.push({ kind: 'say', lesson, part, track: meta.t });
      for (let k = 0; k < n; k += 1) all.push({ kind: 'pick', lesson, part, quiz: k, track: meta.t });
    });
  }

  const keyOf = (s: Slot): string => `${s.lesson}#${s.part}${s.kind === 'pick' ? `q${s.quiz}` : 's'}`;
  const day = today();
  const due: Slot[] = [];
  const fresh: Slot[] = [];
  for (const s of all) {
    const row = seen[keyOf(s)];
    if (!row) fresh.push(s);
    else if (row.n <= day) due.push(s);
  }

  /* 안 본 것은 매번 다른 데서 뽑음. 같은 순서면 앞쪽 갈래만 계속 나옴 */
  for (let i = fresh.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }

  /* 기억과 설명을 번갈아. 그냥 뽑으면 객관식 5,189 대 서술 1,754 라 객관식만 나옴.
     섞는 이유는 재는 것이 다름. 기억은 객관식 g 0.70, 면접에서 필요한 것은 서술 */
  const pool2 = due.concat(fresh);
  const lane: Record<Kind, Slot[]> = { pick: [], say: [] };
  for (const s of pool2) lane[s.kind].push(s);

  const picked: Slot[] = [];
  const used = new Set<string>();
  const take = (kind: Kind): boolean => {
    const found = lane[kind].find((s) => !used.has(s.lesson));
    if (!found) return false;
    used.add(found.lesson);
    picked.push(found);
    lane[kind] = lane[kind].filter((s) => s !== found);
    return true;
  };
  let want: Kind = 'say';
  while (picked.length < SET_SIZE) {
    const other: Kind = want === 'say' ? 'pick' : 'say';
    if (!take(want) && !take(other)) break;
    want = other;
  }
  /* 갈래가 잇달면 한 칸 뒤로 밀기 */
  for (let i = 1; i < picked.length; i += 1) {
    if (picked[i].track !== picked[i - 1].track) continue;
    const j = picked.findIndex((p, k) => k > i && p.track !== picked[i - 1].track);
    if (j > 0) [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

/** 고른 칸의 강의만 받음 */
async function fill(slots: Slot[], pool: Pool): Promise<Item[]> {
  const cache = new Map<string, LessonFile | null>();
  const out: Item[] = [];
  for (const s of slots) {
    if (!cache.has(s.lesson)) {
      const got = await fetch(`/apps/karmolab/data/lessons/ko/${s.lesson}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<LessonFile>) : null))
        .catch(() => null);
      cache.set(s.lesson, got);
    }
    const lesson = cache.get(s.lesson);
    const part = lesson?.parts?.[s.part];
    if (!part) continue;
    if (s.kind === 'pick') {
      const quiz = (part.quiz || [])[s.quiz ?? 0];
      if (!quiz) continue;
      out.push({ ...s, q: quiz.q, choices: quiz.choices, answer: quiz.answer, why: quiz.why });
    } else {
      const first = (part.blocks || []).find((b) => b.type === 'p');
      if (!first?.text) continue;
      out.push({ ...s, q: part.title, model: first.text });
    }
  }
  return out;
}

function mount(container: HTMLElement): void {
  injectStyles();
  container.innerHTML = `<div class="rc-wrap"><p class="rc-loading">${esc(t('recall.loading', undefined, '오늘 것을 고르는 중'))}</p></div>`;

  fetch('/apps/karmolab/data/recall-pool.json')
    .then((r) => (r.ok ? (r.json() as Promise<Pool>) : null))
    .then((pool) => {
      if (!pool) throw new Error('pool');
      run(container, pool);
    })
    .catch(() => {
      container.innerHTML = `<div class="rc-wrap"><p class="rc-loading">${esc(t('recall.failed', undefined, '문항을 못 불러왔다. 새로고침해 보라.'))}</p></div>`;
    });
}

function run(container: HTMLElement, pool: Pool): void {
  const seen = readJson<Record<string, SeenRow>>(SEEN_KEY, {});
  const dropped = readJson<Record<string, number>>(DROP_KEY, {});
  let items: Item[] = [];
  let at = 0;
  const log: { q: string; v: Verdict | 'drop'; after: number }[] = [];

  const keyOf = (s: Slot): string => `${s.lesson}#${s.part}${s.kind === 'pick' ? `q${s.quiz}` : 's'}`;
  const el = (): HTMLElement => container.querySelector('.rc-wrap') as HTMLElement;

  function strip(): string {
    const dots = items
      .map((_, k) => `<span class="rc-dot${k < at ? ' is-done' : k === at ? ' is-now' : ''}"></span>`)
      .join('');
    return `<div class="rc-strip"><span class="rc-n">${at >= items.length ? esc(t('recall.done.tag', undefined, '오늘 끝')) : `${at + 1} / ${items.length}`}</span><span class="rc-dots">${dots}</span></div>`;
  }

  function paintStart(): void {
    el().innerHTML = `
      <div class="rc-card rc-open">
        <span class="rc-tag">${esc(t('recall.tag', undefined, '되묻기'))}</span>
        <h2 class="rc-title">${esc(t('recall.start.head', { n: items.length }, '오늘 {n}개. 먼저 답하고 확인한다.'))}</h2>
        <p class="rc-lede">${esc(t('recall.start.sub', undefined, '고를 것은 없다. 오늘 물어야 할 것은 이미 정해져 있다. 밀린 것부터, 서로 다른 분야를 섞어서.'))}</p>
        <div class="rc-row"><button type="button" class="rc-go" data-rc="begin">${esc(t('recall.start.go', undefined, '시작'))}</button></div>
      </div>`;
  }

  function paintItem(): void {
    if (at >= items.length) return paintEnd();
    const it = items[at];
    const head = `${strip()}`;
    if (it.kind === 'pick') {
      el().innerHTML = `${head}
        <div class="rc-card">
          <span class="rc-tag">${esc(t('recall.kind.pick', undefined, '기억'))}, ${esc(pool.tracks[it.track] || '')}</span>
          <h2 class="rc-q">${esc(it.q)}</h2>
          <div class="rc-picks">${(it.choices || [])
            .map((c, k) => `<button type="button" class="rc-pick" data-pick="${k}">${esc(c)}</button>`)
            .join('')}</div>
          <div class="rc-why" data-rc="why" hidden></div>
          <div class="rc-row">
            <button type="button" class="rc-go" data-rc="next" hidden>${esc(t('recall.next', undefined, '다음'))}</button>
            <button type="button" class="rc-skip" data-rc="drop">${esc(t('recall.drop', undefined, '이건 안 배울래'))}</button>
          </div>
        </div>`;
      return;
    }
    el().innerHTML = `${head}
      <div class="rc-card">
        <span class="rc-tag">${esc(t('recall.kind.say', undefined, '설명'))}, ${esc(pool.tracks[it.track] || '')}</span>
        <h2 class="rc-q">${esc(it.q)}</h2>
        <p class="rc-hint">${esc(t('recall.say.hint', undefined, '왜 그런지 말하듯 두세 줄'))}</p>
        <textarea class="rc-input" data-rc="answer" rows="5" placeholder="${esc(t('recall.say.ph', undefined, '여기에 답을 쓴다'))}"></textarea>
        <div class="rc-row">
          <button type="button" class="rc-go" data-rc="check">${esc(t('recall.say.check', undefined, '확인'))}</button>
          <button type="button" class="rc-skip" data-rc="dunno">${esc(t('recall.say.dunno', undefined, '모르겠다'))}</button>
          <button type="button" class="rc-skip" data-rc="drop">${esc(t('recall.drop', undefined, '이건 안 배울래'))}</button>
        </div>
      </div>`;
    el().querySelector<HTMLTextAreaElement>('[data-rc="answer"]')?.focus();
  }

  function paintCompare(mine: string): void {
    const it = items[at];
    el().innerHTML = `${strip()}
      <div class="rc-card">
        <span class="rc-tag">${esc(t('recall.compare', undefined, '대조'))}</span>
        <h2 class="rc-q">${esc(it.q)}</h2>
        <div class="rc-cmp">
          <div class="rc-pane">
            <span class="rc-pane-l">${esc(t('recall.mine', undefined, '내 답'))}</span>
            <div class="rc-pane-b">${mine.trim() ? esc(mine.trim()) : `<i>${esc(t('recall.empty', undefined, '모르겠다를 눌렀다'))}</i>`}</div>
          </div>
          <div class="rc-pane is-src">
            <span class="rc-pane-l">${esc(t('recall.src', undefined, '근거'))}</span>
            <div class="rc-pane-b">${strong(it.model || '')}</div>
          </div>
        </div>
        <p class="rc-hint">${esc(t('recall.verdict.ask', undefined, '격차를 직접 고른다. 이 판정이 다음에 언제 다시 물을지를 정한다.'))}</p>
        <div class="rc-row">
          <button type="button" class="rc-vd" data-vd="hit">${esc(t('recall.verdict.hit', undefined, '답했다'))}</button>
          <button type="button" class="rc-vd is-half" data-vd="half">${esc(t('recall.verdict.half', undefined, '반쯤'))}</button>
          <button type="button" class="rc-vd is-miss" data-vd="miss">${esc(t('recall.verdict.miss', undefined, '못 했다'))}</button>
        </div>
      </div>`;
  }

  function paintDrop(): void {
    el().innerHTML = `${strip()}
      <div class="rc-card">
        <span class="rc-tag">${esc(t('recall.drop.tag', undefined, '빼기'))}</span>
        <h2 class="rc-q">${esc(items[at].q)}</h2>
        <p class="rc-hint">${esc(t('recall.drop.ask', undefined, '왜 뺄지에 따라 다시 나올지가 갈린다.'))}</p>
        <div class="rc-picks">
          <button type="button" class="rc-pick" data-drop="known">${esc(t('recall.drop.known', undefined, '이미 안다'))}</button>
          <button type="button" class="rc-pick" data-drop="off">${esc(t('recall.drop.off', undefined, '내 방향이 아니다. 이 칸을 빼라'))}</button>
          <button type="button" class="rc-pick" data-drop="later">${esc(t('recall.drop.later', undefined, '지금은 아니다. 나중에'))}</button>
        </div>
      </div>`;
  }

  function paintEnd(): void {
    const c: Record<string, number> = { hit: 0, half: 0, miss: 0, drop: 0 };
    log.forEach((r) => { c[r.v] += 1; });
    const rows = log
      .map((r) => `<div class="rc-sched"><span class="rc-when">${r.after >= 365 ? esc(t('recall.when.never', undefined, '아주 뒤')) : esc(t('recall.when.days', { n: r.after }, '{n}일 뒤'))}</span><span>${esc(r.q)}</span></div>`)
      .join('');
    el().innerHTML = `${strip()}
      <div class="rc-card">
        <span class="rc-tag">${esc(t('recall.done.tag', undefined, '오늘 끝'))}</span>
        <h2 class="rc-title">${esc(t('recall.done.head', undefined, '측정 1회가 남았다'))}</h2>
        <div class="rc-row">
          <span class="rc-chip is-hit">${esc(t('recall.verdict.hit', undefined, '답했다'))} ${c.hit}</span>
          <span class="rc-chip is-half">${esc(t('recall.verdict.half', undefined, '반쯤'))} ${c.half}</span>
          <span class="rc-chip is-miss">${esc(t('recall.verdict.miss', undefined, '못 했다'))} ${c.miss}</span>
          ${c.drop ? `<span class="rc-chip">${esc(t('recall.drop.tag', undefined, '빼기'))} ${c.drop}</span>` : ''}
        </div>
        <div class="rc-scheds">${rows}</div>
        <div class="rc-row"><button type="button" class="rc-go" data-rc="again">${esc(t('recall.again', undefined, '한 판 더'))}</button></div>
      </div>`;
  }

  function record(v: Verdict | 'drop', after: number): void {
    const it = items[at];
    seen[keyOf(it)] = { d: today(), v, n: today() + after };
    writeJson(SEEN_KEY, seen);
    log.push({ q: it.q, v, after });
    at += 1;
    paintItem();
  }

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const rc = target.closest('[data-rc]') as HTMLElement | null;
    const kind = rc?.dataset.rc;

    if (kind === 'begin' || kind === 'again') {
      at = 0;
      log.length = 0;
      void start();
      return;
    }
    if (kind === 'drop') { paintDrop(); return; }
    if (kind === 'check' || kind === 'dunno') {
      const box = el().querySelector<HTMLTextAreaElement>('[data-rc="answer"]');
      paintCompare(kind === 'dunno' ? '' : box?.value || '');
      return;
    }
    if (kind === 'next') { at += 1; paintItem(); return; }

    const pick = target.closest('[data-pick]') as HTMLElement | null;
    if (pick && !pick.classList.contains('is-done')) {
      const it = items[at];
      const k = Number(pick.dataset.pick);
      const right = k === it.answer;
      el().querySelectorAll('.rc-pick').forEach((b, idx) => {
        b.classList.add('is-done');
        if (idx === it.answer) b.classList.add('is-right');
        else if (idx === k) b.classList.add('is-wrong');
        else b.classList.add('is-dim');
      });
      const why = el().querySelector<HTMLElement>('[data-rc="why"]');
      if (why) {
        why.innerHTML = `<b>${esc(right ? t('recall.right', undefined, '맞음') : t('recall.wrong', undefined, '틀림'))}.</b> ${esc(it.why || '')}`;
        why.hidden = false;
      }
      const next = el().querySelector<HTMLElement>('[data-rc="next"]');
      if (next) next.hidden = false;
      const v: Verdict = right ? 'hit' : 'miss';
      seen[keyOf(it)] = { d: today(), v, n: today() + AFTER[v] };
      writeJson(SEEN_KEY, seen);
      log.push({ q: it.q, v, after: AFTER[v] });
      return;
    }

    const vd = target.closest('[data-vd]') as HTMLElement | null;
    if (vd) {
      const v = vd.dataset.vd as Verdict;
      record(v, AFTER[v]);
      return;
    }

    const drop = target.closest('[data-drop]') as HTMLElement | null;
    if (drop) {
      const why = drop.dataset.drop as DropWhy;
      /* 방향이 아니다는 그 칸을 통째로 뺌. 나머지는 이 문항만 뒤로 밀기 */
      if (why === 'off') {
        dropped[items[at].lesson] = today() + DROP_AFTER.off;
        writeJson(DROP_KEY, dropped);
      }
      record('drop', DROP_AFTER[why]);
    }
  });

  async function start(): Promise<void> {
    el().innerHTML = `<p class="rc-loading">${esc(t('recall.loading', undefined, '오늘 것을 고르는 중'))}</p>`;
    const slots = buildSet(pool, seen, dropped);
    items = await fill(slots, pool);
    if (!items.length) {
      el().innerHTML = `<p class="rc-loading">${esc(t('recall.none', undefined, '오늘 물을 것이 없다. 내일 다시.'))}</p>`;
      return;
    }
    at = 0;
    paintItem();
  }

  items = [];
  paintStart();
  /* 시작 화면에 개수를 적으려면 세트를 먼저 골라야 함. 본문은 아직 안 받음 */
  const preview = buildSet(pool, seen, dropped);
  items = preview.map((s) => ({ ...s, q: '' }));
  paintStart();
  items = [];
}

function injectStyles(): void {
  if (document.getElementById('recall-widget-styles')) return;
  const style = document.createElement('style');
  style.id = 'recall-widget-styles';
  style.textContent = `
.rc-wrap { max-width: 720px; display: flex; flex-direction: column; gap: 16px; }
.rc-loading { color: var(--text-tertiary); font-size: var(--font-size-2xs); }
.rc-strip { display: flex; align-items: center; gap: 12px; }
.rc-n { font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rc-dots { display: flex; gap: 4px; flex: 1; }
.rc-dot { height: 3px; flex: 1; background: var(--border); border-radius: 2px; }
.rc-dot.is-done { background: var(--accent); }
.rc-dot.is-now { background: var(--text-secondary); }

.rc-card { display: flex; flex-direction: column; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-secondary); }
.rc-card.rc-open { background: var(--accent-subtle); border-color: var(--accent); }
.rc-tag { font-size: 11px; letter-spacing: .08em; color: var(--accent); font-weight: 700; }
.rc-title { font-size: 28px; font-weight: 700; line-height: 1.25; margin: 0; letter-spacing: -0.02em; }
.rc-q { font-size: 22px; font-weight: 700; line-height: 1.4; margin: 0; }
.rc-lede, .rc-hint { font-size: var(--font-size-2xs); color: var(--text-secondary); margin: 0; line-height: 1.75; }
.rc-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.rc-go, .rc-skip, .rc-vd { font: inherit; font-size: 14px; cursor: pointer; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); }
.rc-go { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.rc-skip:hover, .rc-vd:hover { border-color: var(--accent); color: var(--accent); }
.rc-skip[data-rc="drop"] { margin-left: auto; border-color: transparent; color: var(--text-tertiary); }
.rc-skip[data-rc="drop"]:hover { border-color: var(--border); color: var(--text-secondary); }

.rc-picks { display: flex; flex-direction: column; gap: 8px; }
.rc-pick { font: inherit; font-size: 14px; text-align: left; cursor: pointer; padding: 13px 16px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); }
.rc-pick:hover { border-color: var(--accent); }
.rc-pick.is-done { cursor: default; }
.rc-pick.is-right { border-color: var(--success); color: var(--success); background: var(--success-subtle, var(--bg-tertiary)); font-weight: 600; }
.rc-pick.is-wrong { border-color: var(--danger, var(--secondary)); color: var(--danger, var(--secondary)); }
.rc-pick.is-dim { opacity: .5; }
.rc-why { font-size: 13px; color: var(--text-secondary); line-height: 1.75; padding: 12px 14px; border-radius: var(--radius-lg); background: var(--bg-tertiary); border-left: 2px solid var(--border-hover); }

.rc-input { width: 100%; font: inherit; font-size: 15px; line-height: 1.8; resize: vertical; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; }
.rc-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.rc-cmp { display: grid; gap: 16px; }
@media (min-width: 720px) { .rc-cmp { grid-template-columns: 1fr 1fr; } }
.rc-pane { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-pane-l { font-size: 11px; letter-spacing: .06em; color: var(--text-tertiary); }
.rc-pane-b { background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; font-size: 14px; line-height: 1.8; min-height: 112px; white-space: pre-wrap; }
.rc-pane.is-src .rc-pane-b { border-left: 2px solid var(--accent); }
.rc-pane-b i { font-style: normal; color: var(--text-tertiary); }
.rc-pane-b b { color: var(--accent); }

.rc-chip { font-size: 12px; padding: 6px 13px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.rc-chip.is-hit { border-color: var(--accent); color: var(--accent); }
.rc-chip.is-half { border-color: var(--secondary); color: var(--secondary); }
.rc-chip.is-miss { border-color: var(--text-tertiary); }
.rc-scheds { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 14px; }
.rc-sched { display: flex; gap: 12px; align-items: baseline; font-size: 13px; color: var(--text-secondary); }
.rc-when { font-size: 12px; color: var(--text-tertiary); min-width: 64px; font-variant-numeric: tabular-nums; }
@media (max-width: 599px) { .rc-card { padding: 16px; } .rc-title { font-size: 22px; } .rc-q { font-size: 19px; } }
`;
  document.head.appendChild(style);
}

Toolbox.register({
  ...Toolbox.getLazyWidgetPublicMeta!('recall'),
  tabs: [
    {
      id: 'recall',
      label: t('recall.tab', undefined, '되묻기'),
      build: function (container: HTMLElement): void {
        void loadNamespace('recall').then(function () {
          mount(container);
        });
      },
    },
  ],
});
})();
