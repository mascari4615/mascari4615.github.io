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
import { isDesktop, invoke } from '../../tauri-bridge';
import { addCopyButtons, highlightCode, mountDemos } from '../../lib/doc-view';

(function () {
type Kind = 'pick' | 'say';
type Verdict = 'hit' | 'half' | 'miss';
type DropWhy = 'known' | 'off' | 'later';

interface Pool {
  v: number;
  tracks: Record<string, string>;
  lessons: Record<string, { t: string; n: string; q: number[][]; s: string; p: string[] }>;
}

/** 오늘 세트의 한 자리. 본문은 아직 안 받은 상태 */
interface Slot {
  kind: Kind;
  lesson: string;
  part: number;
  quiz?: number;
  track: string;
  /** 어느 칸 몇째 장인지. 이게 없으면 문항이 홀로 못 선다 */
  lessonTitle: string;
  partName: string;
}

/** 본문까지 받은 문항. blocks 는 답한 뒤 펼쳐 읽을 그 장 전체 */
interface Item extends Slot {
  q: string;
  choices?: string[];
  answer?: number;
  why?: string;
  model?: string;
  partTitle?: string;
  blocks?: LessonBlock[];
}

interface LessonBlock {
  type: 'p' | 'h' | 'code' | 'note' | 'try' | 'demo';
  text?: string;
  lang?: string;
  label?: string;
  kind?: string;
  height?: string;
  controls?: unknown[];
}
interface LessonQuiz { q: string; choices: string[]; answer: number; why?: string }
interface LessonPart { id: string; title: string; blocks?: LessonBlock[]; quiz?: LessonQuiz[] }
interface LessonFile { id: string; parts: LessonPart[] }

const SET_SIZE = 6;
const SEEN_KEY = 'karmolab-recall-seen';
const DROP_KEY = 'karmolab-recall-drop';

const DROP_AFTER: Record<DropWhy, number> = { known: 3650, off: 3650, later: 30 };

/* 간격은 사람마다 문항마다 다르게 벌어짐. 고정표로 두면 백 번 맞힌 것도 늘 열흘 뒤에 또 물음.
   FSRS 계열이 같은 유지에 복습을 20~30% 줄인다는 값이 여기서 나옴 (학습 수치 장부).
   여기 것은 그 축소판. 자료는 판정 하나뿐이라 쉬움 계수와 간격만 굴림 */
const EASE0 = 2.3;
const EASE_MIN = 1.3;
const EASE_MAX = 2.8;
const CAP = 180;
const FIRST_OK = 3;

/** 다음 간격과 쉬움 계수. 하루 안은 g 0.56, 1~6일 뒤는 0.82 라 최소가 1 */
function nextGap(prev: { i?: number; e?: number } | undefined, v: Verdict): { i: number; e: number } {
  const e0 = prev?.e ?? EASE0;
  const i0 = prev?.i ?? 0;
  const clamp = (x: number): number => Math.min(EASE_MAX, Math.max(EASE_MIN, Number(x.toFixed(2))));
  if (v === 'miss') return { i: 1, e: clamp(e0 - 0.2) };
  if (v === 'half') return { i: Math.max(2, Math.round(i0 * 0.4)), e: clamp(e0 - 0.15) };
  const e = clamp(e0 + 0.05);
  return { i: Math.min(CAP, i0 ? Math.max(FIRST_OK, Math.round(i0 * e)) : FIRST_OK), e };
}

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 본문의 굵은 표시만 살림. 그 문장에서 핵심이 어디인지가 대조의 절반 */
const strong = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const today = (): number => Math.floor(Date.now() / 86400000);

/** d 마지막 날, v 마지막 판정, n 다시 물을 날, i 그때 쓴 간격, e 쉬움 계수 */
interface SeenRow { d: number; v: Verdict | 'drop'; n: number; i?: number; e?: number }
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
    meta.q.forEach((slots, part) => {
      const where = { track: meta.t, lessonTitle: meta.n, partName: meta.p?.[part] || '' };
      if (meta.s[part] === '1') all.push({ kind: 'say', lesson, part, ...where });
      /* 자리 번호 그대로. 문맥에 묶여 뺀 것이 있어 0부터 세면 어긋난다 */
      for (const k of slots) all.push({ kind: 'pick', lesson, part, quiz: k, ...where });
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

  /* 밀린 날이 많은 것부터, 같으면 못 한 것부터. 어제 못 한 것이 오늘 맨 앞에 와야 함 */
  const rank: Record<string, number> = { miss: 0, half: 1, hit: 2, drop: 3 };
  due.sort((a, b) => {
    const ra = seen[keyOf(a)];
    const rb = seen[keyOf(b)];
    return ra.n - rb.n || (rank[ra.v] ?? 9) - (rank[rb.v] ?? 9);
  });

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
    const rest = { partTitle: part.title, blocks: part.blocks || [] };
    if (s.kind === 'pick') {
      const quiz = (part.quiz || [])[s.quiz ?? 0];
      if (!quiz) continue;
      out.push({ ...s, ...rest, q: quiz.q, choices: quiz.choices, answer: quiz.answer, why: quiz.why });
    } else {
      const first = (part.blocks || []).find((b) => b.type === 'p');
      if (!first?.text) continue;
      out.push({ ...s, ...rest, q: part.title, model: first.text });
    }
  }
  return out;
}

/**
 * 답한 뒤에 읽는 그 장 본문. 블록 다섯 종이 전부 (p, h, code, note, try, demo).
 * 코드 강조와 실행 예제는 문서 위젯과 같은 공용 모듈이 맡음
 */
function lessonHtml(blocks: LessonBlock[] | undefined): string {
  return (blocks || [])
    .map((blk) => {
      if (blk.type === 'h') return `<h4>${esc(blk.text)}</h4>`;
      if (blk.type === 'code') {
        const lang = /^[\w-]+$/.test(blk.lang || '') ? (blk.lang as string) : 'text';
        return `<div class="rc-code">${blk.label ? `<div class="rc-code-label">${esc(blk.label)}</div>` : ''}<pre><code class="language-${esc(lang)}">${esc(blk.text)}</code></pre></div>`;
      }
      if (blk.type === 'demo') {
        const kind = blk.kind === 'js' || blk.kind === 'shader' ? blk.kind : 'html';
        const h = /^\d{2,4}px$/.test(blk.height || '') ? blk.height : '';
        const ctl = blk.controls?.length ? ` data-demo-controls="${esc(JSON.stringify(blk.controls))}"` : '';
        return `<div class="rc-demo">${blk.label ? `<div class="rc-code-label">${esc(blk.label)}</div>` : ''}<div data-demo="${kind}"${h ? ` data-demo-height="${esc(h)}"` : ''}${ctl}>${esc(blk.text)}</div></div>`;
      }
      if (blk.type === 'note' || blk.type === 'try') {
        const tag = blk.type === 'try'
          ? t('recall.read.try', undefined, '직접 해보기')
          : t('recall.read.note', undefined, '기억할 것');
        return `<div class="rc-callout${blk.type === 'try' ? ' is-try' : ''}"><span class="rc-callout-tag">${esc(tag)}</span>${strong(blk.text || '')}</div>`;
      }
      return `<p>${strong(blk.text || '')}</p>`;
    })
    .join('');
}

/** 펼친 본문에 실행기와 강조를 붙임. 붙이지 않으면 예제가 그냥 글자로 남는다 */
function wireLesson(root: HTMLElement): void {
  addCopyButtons(root, t('recall.read.copy', undefined, '복사'), t('recall.read.copied', undefined, '복사됨'));
  mountDemos(root, {
    run: t('recall.read.run', undefined, '다시 그리기'),
    reset: t('recall.read.reset', undefined, '되돌리기'),
    code: t('recall.read.code', undefined, '예제 코드'),
    result: t('recall.read.result', undefined, '실행 결과'),
  });
  void highlightCode(root);
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
  /** 한 판의 기록. mine 과 tail 은 내보낼 때 쓰는 원문이라 지우지 않음 */
  const log: {
    q: string;
    v: Verdict | 'drop';
    after: number;
    kind: Kind;
    track: string;
    mine?: string;
    model?: string;
    tail?: string;
  }[] = [];
  let mine = '';
  let tail = '';

  const keyOf = (s: Slot): string => `${s.lesson}#${s.part}${s.kind === 'pick' ? `q${s.quiz}` : 's'}`;
  const el = (): HTMLElement => container.querySelector('.rc-wrap') as HTMLElement;

  /* 어느 칸 몇째 장인지. 문항 다수가 제 칸 제목을 전제함
     (실측: 「1.1 에서 파일을 합치고 도메인을 나눈 이유는?」 은 HTTP 버전 칸 안에서만 성립).
     답이 아니라 문맥이라 먼저 답하기를 안 깬다 */
  function where(it: Item): string {
    /* 서술은 장 제목이 곧 질문이라 그 줄을 빼야 두 번 안 나온다 */
    const raw = it.kind === 'say' ? [it.lessonTitle] : [it.lessonTitle, it.partName];
    const parts = raw.filter(Boolean).map(esc);
    return parts.length ? `<p class="rc-where">${parts.join(' <span>·</span> ')}</p>` : '';
  }

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
          ${where(it)}
          <h2 class="rc-q">${esc(it.q)}</h2>
          <div class="rc-picks">${(it.choices || [])
            .map((c, k) => `<button type="button" class="rc-pick" data-pick="${k}">${esc(c)}</button>`)
            .join('')}</div>
          <div class="rc-why" data-rc="why" hidden></div>
          <div class="rc-row">
            <button type="button" class="rc-go" data-rc="next" hidden>${esc(t('recall.next', undefined, '다음'))}</button>
            <button type="button" class="rc-skip" data-rc="read" hidden>${esc(t('recall.read.go', undefined, '이 장 읽기'))}</button>
            <button type="button" class="rc-skip" data-rc="drop">${esc(t('recall.drop', undefined, '이건 안 배울래'))}</button>
          </div>
        </div>`;
      return;
    }
    el().innerHTML = `${head}
      <div class="rc-card">
        <span class="rc-tag">${esc(t('recall.kind.say', undefined, '설명'))}, ${esc(pool.tracks[it.track] || '')}</span>
        ${where(it)}
        <h2 class="rc-q">${esc(it.q)}</h2>
        <p class="rc-hint">${esc(t('recall.say.hint2', undefined, '이 제목이 가리키는 것이 무엇이고 왜 그런지, 아는 사람에게 말하듯 두세 줄'))}</p>
        <textarea class="rc-input" data-rc="answer" rows="5" placeholder="${esc(t('recall.say.ph', undefined, '여기에 답을 쓴다'))}"></textarea>
        <div class="rc-row">
          <button type="button" class="rc-go" data-rc="check">${esc(t('recall.say.check', undefined, '확인'))}</button>
          <button type="button" class="rc-skip" data-rc="dunno">${esc(t('recall.say.dunno', undefined, '모르겠다'))}</button>
          <button type="button" class="rc-skip" data-rc="drop">${esc(t('recall.drop', undefined, '이건 안 배울래'))}</button>
        </div>
      </div>`;
    el().querySelector<HTMLTextAreaElement>('[data-rc="answer"]')?.focus();
  }

  function paintCompare(): void {
    const it = items[at];
    el().innerHTML = `${strip()}
      <div class="rc-card">
        <span class="rc-tag">${esc(t('recall.compare', undefined, '대조'))}</span>
        ${where(it)}
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
        <div class="rc-tail" data-rc="tailbox" hidden></div>
        <p class="rc-hint">${esc(t('recall.verdict.ask', undefined, '격차를 직접 고른다. 이 판정이 다음에 언제 다시 물을지를 정한다.'))}</p>
        <div class="rc-row">
          <button type="button" class="rc-vd" data-vd="hit">${esc(t('recall.verdict.hit', undefined, '답했다'))}</button>
          <button type="button" class="rc-vd is-half" data-vd="half">${esc(t('recall.verdict.half', undefined, '반쯤'))}</button>
          <button type="button" class="rc-vd is-miss" data-vd="miss">${esc(t('recall.verdict.miss', undefined, '못 했다'))}</button>
          <button type="button" class="rc-skip" data-rc="read">${esc(t('recall.read.go', undefined, '이 장 읽기'))}</button>
          ${isDesktop() && mine.trim() ? `<button type="button" class="rc-skip" data-rc="tail">${esc(t('recall.tail.go', undefined, '꼬리질문'))}</button>` : ''}
        </div>
      </div>`;
  }

  /** 본문은 답한 뒤에만 편다. 먼저 읽으면 되묻기가 아니라 그냥 읽기가 됨 */
  function toggleRead(btn: HTMLButtonElement): void {
    const open = el().querySelector<HTMLElement>('.rc-read');
    if (open) {
      open.remove();
      btn.textContent = t('recall.read.go', undefined, '이 장 읽기');
      return;
    }
    const it = items[at];
    const card = el().querySelector<HTMLElement>('.rc-card');
    if (!card) return;
    card.insertAdjacentHTML(
      'beforeend',
      `<article class="rc-read"><h3>${esc(it.partTitle || it.q)}</h3>${lessonHtml(it.blocks)}</article>`,
    );
    const root = el().querySelector<HTMLElement>('.rc-read');
    if (root) wireLesson(root);
    btn.textContent = t('recall.read.close', undefined, '본문 접기');
  }

  /* 꼬리질문은 데스크톱에서만. career 폴더를 읽어야 하고 그건 로컬에만 있음.
     AI 는 묻기만 함. 등급은 사람이 매김 (판정 버튼이 그 자리) */
  async function askTail(): Promise<void> {
    const box = el().querySelector<HTMLElement>('[data-rc="tailbox"]');
    const btn = el().querySelector<HTMLButtonElement>('[data-rc="tail"]');
    if (!box) return;
    box.hidden = false;
    box.textContent = t('recall.tail.wait', undefined, '꼬리질문을 만드는 중');
    if (btn) btn.disabled = true;
    try {
      const got = await invoke<string>('recall_followup', {
        payload: { question: items[at].q, mine, source: items[at].model || '' },
      });
      tail = String(got || '').trim();
      box.innerHTML = `<span class="rc-pane-l">${esc(t('recall.tail.tag', undefined, '꼬리질문'))}</span><div>${strong(tail)}</div>`;
    } catch (err) {
      box.textContent = `${t('recall.tail.fail', undefined, '꼬리질문 실패')}. ${String(err).slice(0, 160)}`;
      if (btn) btn.disabled = false;
    }
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
      .map((r) => `<div class="rc-sched"><span class="rc-when">${r.after >= 365 ? esc(t('recall.when.never', undefined, '한참 뒤')) : esc(t('recall.when.days', { n: r.after }, '{n}일 뒤'))}</span><span>${esc(r.q)}</span></div>`)
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
        <div class="rc-row">
          <button type="button" class="rc-go" data-rc="again">${esc(t('recall.again', undefined, '한 번 더'))}</button>
          <button type="button" class="rc-skip" data-rc="export">${esc(
            isDesktop()
              ? t('recall.export.file', undefined, '측정 기록으로 남기기')
              : t('recall.export.copy', undefined, '측정 기록 복사'),
          )}</button>
          <span class="rc-note" data-rc="note"></span>
        </div>
      </div>`;
  }

  /** 판정 하나를 기록하고 다음 날을 잡음. 빼기는 계수를 안 건드림 */
  /**
   * 한 번 끝낸 것을 측정 기록으로. career/log/baseline 의 형식을 따름.
   * 답 원문을 손대지 않음. 오타까지 그대로 두는 것이 그 폴더의 규칙
   */
  function toMarkdown(): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const name: Record<string, string> = { hit: '답했다', half: '반쯤', miss: '못 했다', drop: '뺐다' };
    const out: string[] = [`# 되묻기 측정 원본 (${ymd})`, '', '> 수정 금지. 답 원문 그대로 (오타 포함).', ''];
    log.forEach((r, k) => {
      out.push(`## ${k + 1}. ${r.q}`, '');
      out.push(`- 갈래 ${r.track} · ${r.kind === 'say' ? '설명' : '기억'} · 판정 ${name[r.v]} · 다음 ${r.after}일 뒤`, '');
      if (r.mine?.trim()) out.push('**내 답**', '', r.mine.trim().split('\n').map((l) => `> ${l}`).join('\n'), '');
      else if (r.kind === 'say') out.push('**내 답**', '', '> 모르겠다를 눌렀다', '');
      if (r.model?.trim()) out.push('**근거**', '', r.model.trim().split('\n').map((l) => `> ${l}`).join('\n'), '');
      if (r.tail?.trim()) out.push('**꼬리질문**', '', r.tail.trim(), '');
    });
    return `${out.join('\n')}\n`;
  }

  async function exportLog(): Promise<void> {
    const note = el().querySelector<HTMLElement>('[data-rc="note"]');
    const say = (s: string): void => { if (note) note.textContent = s; };
    const md = toMarkdown();
    if (isDesktop()) {
      try {
        const path = await invoke<string>('recall_save_baseline', { payload: { markdown: md } });
        say(t('recall.export.saved', { path: String(path) }, '{path} 에 남겼다'));
      } catch (err) {
        say(`${t('recall.export.fail', undefined, '못 남겼다')}. ${String(err).slice(0, 160)}`);
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(md);
      say(t('recall.export.copied', undefined, '복사했다. career/log/baseline 에 붙이면 된다'));
    } catch {
      /* 브라우저가 클립보드를 막는 자리가 있음. 그때 글을 안 보여 주면 한 판이 통째로 날아감 */
      say(t('recall.export.manual', undefined, '복사가 막혔다. 아래 글을 직접 고르면 된다'));
      const card = el().querySelector<HTMLElement>('.rc-card');
      if (card && !card.querySelector('.rc-out')) {
        const box = document.createElement('textarea');
        box.className = 'rc-input rc-out';
        box.rows = 12;
        box.readOnly = true;
        box.value = md;
        card.appendChild(box);
        box.focus();
        box.select();
      }
    }
  }

  function record(v: Verdict | 'drop', after?: number): void {
    const it = items[at];
    const key = keyOf(it);
    const prev = seen[key];
    if (v === 'drop') seen[key] = { ...prev, d: today(), v, n: today() + (after ?? 30) };
    else {
      const g = nextGap(prev, v);
      after = g.i;
      seen[key] = { d: today(), v, n: today() + g.i, i: g.i, e: g.e };
    }
    writeJson(SEEN_KEY, seen);
    log.push({
      q: it.q,
      v,
      after: after ?? 30,
      kind: it.kind,
      track: pool.tracks[it.track] || it.track,
      mine: it.kind === 'say' ? mine : undefined,
      model: it.model,
      tail,
    });
    mine = '';
    tail = '';
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
      mine = kind === 'dunno' ? '' : box?.value || '';
      paintCompare();
      return;
    }
    if (kind === 'tail') { void askTail(); return; }
    if (kind === 'read') { toggleRead(rc as HTMLButtonElement); return; }
    if (kind === 'export') { void exportLog(); return; }
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
      el().querySelectorAll<HTMLElement>('[data-rc="next"], [data-rc="read"]').forEach((b) => {
        b.hidden = false;
      });
      const v: Verdict = right ? 'hit' : 'miss';
      const key = keyOf(it);
      const g = nextGap(seen[key], v);
      seen[key] = { d: today(), v, n: today() + g.i, i: g.i, e: g.e };
      writeJson(SEEN_KEY, seen);
      log.push({
        q: it.q,
        v,
        after: g.i,
        kind: it.kind,
        track: pool.tracks[it.track] || it.track,
        mine: it.choices?.[k],
        model: it.choices?.[it.answer ?? 0],
      });
      return;
    }

    const vd = target.closest('[data-vd]') as HTMLElement | null;
    if (vd) {
      record(vd.dataset.vd as Verdict);
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

  /**
   * 검색으로 특정 장에 바로 들어오는 길. ⌘K 가 이 계약을 부름.
   * 여기서는 판정을 안 받음. 찾아서 읽으러 온 사람에게 문제를 먼저 내밀지 않음
   */
  async function openLesson(lessonId: string, partId?: string): Promise<void> {
    el().innerHTML = `<p class="rc-loading">${esc(t('recall.loading', undefined, '오늘 것을 고르는 중'))}</p>`;
    const file = await fetch(`/apps/karmolab/data/lessons/ko/${lessonId}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LessonFile>) : null))
      .catch(() => null);
    const parts = file?.parts || [];
    const part = (partId && parts.find((p) => p.id === partId)) || parts[0];
    if (!part) {
      el().innerHTML = `<p class="rc-loading">${esc(t('recall.failed', undefined, '문항을 못 불러왔다. 새로고침해 보라.'))}</p>`;
      return;
    }
    const track = pool.tracks[pool.lessons[lessonId]?.t] || '';
    el().innerHTML = `
      <div class="rc-card">
        <span class="rc-tag">${esc(track)}</span>
        <h2 class="rc-q">${esc(part.title)}</h2>
        <div class="rc-row"><button type="button" class="rc-go" data-rc="begin">${esc(t('recall.read.back', undefined, '오늘 되묻기로'))}</button></div>
        <article class="rc-read">${lessonHtml(part.blocks)}</article>
      </div>`;
    const root = el().querySelector<HTMLElement>('.rc-read');
    if (root) wireLesson(root);
    sessionStorage.removeItem('karmolab-recall-open-lesson');
    sessionStorage.removeItem('karmolab-recall-open-part');
  }
  (window as unknown as { KarmoRecallOpen?: (id: string, partId?: string) => void }).KarmoRecallOpen = (
    id,
    partId,
  ) => {
    void openLesson(id, partId);
  };

  const waiting = sessionStorage.getItem('karmolab-recall-open-lesson');
  if (waiting) {
    void openLesson(waiting, sessionStorage.getItem('karmolab-recall-open-part') || undefined);
    return;
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
.rc-n { font-size: var(--font-size-3xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rc-dots { display: flex; gap: 4px; flex: 1; }
.rc-dot { height: 3px; flex: 1; background: var(--border); border-radius: var(--radius-sm); }
.rc-dot.is-done { background: var(--accent); }
.rc-dot.is-now { background: var(--text-secondary); }

.rc-card { display: flex; flex-direction: column; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-secondary); }
.rc-card.rc-open { background: var(--accent-subtle); border-color: var(--accent); }
.rc-tag { font-size: var(--font-size-3xs); letter-spacing: .08em; color: var(--accent-ink); font-weight: 700; }
.rc-title { font-size: 28px; font-weight: 700; line-height: 1.25; margin: 0; letter-spacing: -0.02em; }
.rc-q { font-size: var(--font-size-lg); font-weight: 700; line-height: 1.4; margin: 0; }
.rc-lede, .rc-hint { font-size: var(--font-size-2xs); color: var(--text-secondary); margin: 0; line-height: 1.75; }
.rc-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.rc-go, .rc-skip, .rc-vd { font: inherit; font-size: var(--font-size-xs); cursor: pointer; padding: 10px 18px; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); }
.rc-go { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.rc-skip:hover, .rc-vd:hover { border-color: var(--accent); color: var(--accent-ink); }
.rc-skip[data-rc="drop"] { margin-left: auto; border-color: transparent; color: var(--text-tertiary); }
.rc-skip[data-rc="drop"]:hover { border-color: var(--border); color: var(--text-secondary); }

.rc-picks { display: flex; flex-direction: column; gap: 8px; }
.rc-pick { font: inherit; font-size: var(--font-size-xs); text-align: left; cursor: pointer; padding: 13px 16px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); }
.rc-pick:hover { border-color: var(--accent); }
.rc-pick.is-done { cursor: default; }
.rc-pick.is-right { border-color: var(--success); color: var(--success); background: var(--success-subtle, var(--bg-tertiary)); font-weight: 600; }
.rc-pick.is-wrong { border-color: var(--secondary); color: var(--secondary); }
.rc-pick.is-dim { opacity: .5; }
.rc-why { font-size: var(--font-size-2xs); color: var(--text-secondary); line-height: 1.75; padding: 12px 14px; border-radius: var(--radius-lg); background: var(--bg-tertiary); border-left: 2px solid var(--border-hover); }

.rc-input { width: 100%; font: inherit; font-size: var(--font-size-xs); line-height: 1.8; resize: vertical; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; }
.rc-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.rc-cmp { display: grid; gap: 16px; }
@media (min-width: 720px) { .rc-cmp { grid-template-columns: 1fr 1fr; } }
.rc-pane { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-pane-l { font-size: var(--font-size-3xs); letter-spacing: .06em; color: var(--text-tertiary); }
.rc-pane-b { background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; font-size: var(--font-size-xs); line-height: 1.8; min-height: 112px; white-space: pre-wrap; }
.rc-pane.is-src .rc-pane-b { border-left: 2px solid var(--accent); }
.rc-pane-b i { font-style: normal; color: var(--text-tertiary); }
.rc-pane-b b { color: var(--accent-ink); }

.rc-where { font-size: var(--font-size-2xs); color: var(--text-tertiary); margin: 0; }
.rc-where span { opacity: .5; }
.rc-read { border-top: 1px solid var(--border); padding-top: 20px; margin-top: 4px; display: flex; flex-direction: column; gap: 14px; }
.rc-read h3 { font-size: var(--font-size-sm); font-weight: 700; margin: 0; }
.rc-read h4 { font-size: var(--font-size-xs); font-weight: 700; margin: 8px 0 0; }
.rc-read p { font-size: var(--font-size-xs); line-height: 1.85; margin: 0; max-width: 68ch; color: var(--text-primary); }
.rc-read b { color: var(--accent-ink); }
.rc-callout { border-left: 2px solid var(--border-hover); background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 14px 16px; font-size: var(--font-size-xs); line-height: 1.8; display: flex; flex-direction: column; gap: 6px; }
.rc-callout.is-try { border-left-color: var(--accent); }
.rc-callout-tag { font-size: var(--font-size-3xs); letter-spacing: .06em; color: var(--text-tertiary); }
.rc-code-label { font-size: var(--font-size-3xs); color: var(--text-tertiary); margin-bottom: 6px; }
.rc-code pre { margin: 0; overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 14px; background: var(--bg-tertiary); font-size: var(--font-size-2xs); line-height: 1.7; }
.rc-tail { display: flex; flex-direction: column; gap: 8px; font-size: var(--font-size-xs); line-height: 1.8; color: var(--text-primary); padding: 14px 16px; border-radius: var(--radius-lg); background: var(--bg-tertiary); border-left: 2px solid var(--accent); white-space: pre-wrap; }
.rc-note { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
.rc-chip { font-size: var(--font-size-2xs); padding: 6px 13px; border-radius: var(--radius-pill); border: 1px solid var(--border); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.rc-chip.is-hit { border-color: var(--accent); color: var(--accent-ink); }
.rc-chip.is-half { border-color: var(--secondary); color: var(--secondary); }
.rc-chip.is-miss { border-color: var(--text-tertiary); }
.rc-scheds { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 14px; }
.rc-sched { display: flex; gap: 12px; align-items: baseline; font-size: var(--font-size-2xs); color: var(--text-secondary); }
.rc-when { font-size: var(--font-size-2xs); color: var(--text-tertiary); min-width: 64px; font-variant-numeric: tabular-nums; }
@media (max-width: 599px) { .rc-card { padding: 16px; } .rc-title { font-size: var(--font-size-lg); } .rc-q { font-size: var(--font-size-md); } }
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
