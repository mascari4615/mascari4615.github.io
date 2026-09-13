/**
 * 패널: 나 (1차, 읽기 전용).
 *
 * 읽는 것 하나. `data/me/summary.json` (schema `me/1`). 생성기는 memo 의
 * `scripts/me/summarize.mjs`. 화면은 그 파일이 담은 관찰만 옮김.
 *
 * 설계 정본은 memo `notes/mydash/docs/나-페이지-설계.md` 3절. 거기서 온 금지 넷.
 * 점수와 등급과 성격 판정 없음, 숫자는 개수와 날짜까지, 빈 칸은 그냥 없음 (진행률 바 금지),
 * 자기소개 입력 폼 없음. 그래서 이 파일에 계산이 거의 없음. 정렬과 셈과 escape 가 전부.
 * 없는 값은 0 이 아니라 null. 출처 줄도 실제로 있는 조각만 잇고, 셋 다 없으면 절을 안 그림.
 *
 * 1차는 설계 4절의 지금과 역사 씨앗만. 취향과 지향과 분석 탭 없음. 탭 대신 세로 절 넷.
 * 첫 절이 이맘때인 이유는 설계 2.2 의 비자발적 재회. 목록이 먼저 오면 다시 안 봄.
 * 같은 이유로 이 패널이 `widgets-lazy-meta.ts` 의 첫 패널이고, 셸이 처음 여는 탭.
 *
 * 설계 2.2 의 통제 셋은 저장소 쓰기 없이 화면에서만 함.
 * - 접힌 채로 열기. 흔적은 `details` 라 출처 칩과 시각만 먼저 보이고 본문은 사람이 폄
 * - 숨기기. 흔적 하나와 시기 창 하나를 각각 감춤. 자리는 localStorage `karmolab.mydash.me.hide`
 *   (이 브라우저에만 남음, 저장 막힌 판에서는 이번 화면까지만)
 * - 되돌리기. 숨긴 수를 절 아래에 적고 한 번에 되돌림
 *
 * 저장소 쓰기 경로 없음. 사건 후보와 시기 후보에 확인 버튼이 없는 것도 그 때문. 확인과 기록은
 * 이벤트 파일이 생기는 다음 라운드 몫.
 */
import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx, DashRepoInfo } from './kit';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type TraceSource = 'kakao' | 'bookmark' | 'commit';
  type Trace = { at?: string; source?: string; text?: string; ref?: string };
  type OnThisDay = { window?: string; from?: string; to?: string; traces?: Trace[] };
  type Area = { area?: string; last30?: number; prev30?: number };
  type EventCand = {
    date?: string;
    kind?: string;
    title?: string;
    detail?: string;
    traceRefs?: unknown[];
  };
  type EraCand = { from?: string; to?: string; signal?: string };
  type Sources = {
    kakao?: { from?: string; to?: string; count?: number };
    bookmarks?: { count?: number };
    commits?: { from?: string; to?: string; count?: number };
  };
  type MeData = {
    sources?: Sources;
    onThisDay?: OnThisDay[];
    recentAreas?: Area[];
    eventCandidates?: EventCand[];
    eraCandidates?: EraCand[];
    hourHistogram?: { byMonth?: Record<string, number[]> };
  };
  type MeFile = { schema?: string; generatedAt?: string; data?: MeData };

  /** 이 화면이 들고 있는 상태 전부. 저장소로 안 나감 */
  type View = {
    /** 숨긴 흔적과 시기. localStorage 에 그대로 남는 열쇠 목록 */
    hidden: Set<string>;
    /** 지금 그린 사건 후보 수. 더 보기가 5씩 올림 */
    events: number;
    /** 지금 그린 시기 후보 수 */
    eras: number;
    repo: DashRepoInfo | null;
  };

  const DATA_PATH = 'data/me/summary.json';
  /** 이 화면이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않고 다시 배포하라고 적음 */
  const SCHEMA_MAJOR = 1;
  /** 카톡 자료 시작. `sources.kakao.from` 이 비었을 때만 쓰는 값 */
  const KAKAO_START_FALLBACK = '2025-06';
  /** 숨긴 것을 적어 두는 자리. 이 브라우저 밖으로 안 나감 */
  const HIDE_KEY = 'karmolab.mydash.me.hide';
  /** 후보를 한 번에 몇 건씩. 설계 8.2 한 번에 하나씩 */
  const EVENT_PAGE = 5;
  const ERA_PAGE = 3;

  const STYLE_ID = 'mydash-me-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색과 둥글기와 글자 크기는 전부 스킨 토큰. 여기서 직접 정하는 것은 칸 나눔과 여백과
       손가락 표적뿐 */
    el.textContent = [
      '.me{--me-tap:44px;display:flex;flex-direction:column;gap:var(--space-lg)}',
      '.me-sec{display:flex;flex-direction:column;gap:var(--space-sm)}',
      /* 이맘때 카드 셋. 폰은 한 줄에 하나, 넓어지면 셋 */
      '.me-cards{display:grid;grid-template-columns:1fr;gap:var(--space-sm)}',
      '@media(min-width:720px){.me-cards{grid-template-columns:repeat(3,1fr)}}',
      '.me-card{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding:var(--space-sm);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.me-card-head{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center}',
      '.me-card-head b{color:var(--text-primary)}',
      '.me-card-head span{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      /* 손가락 최소 44px. 버튼은 킷 것을 쓰고 높이만 벌림 */
      '.me .btn{min-height:var(--me-tap)}',
      /* 흔적은 접힌 채로 열림 (설계 2.2). 접힌 줄에 보이는 것은 출처 칩과 시각과 숨기기뿐 */
      '.me-trace{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding-top:var(--space-xs);border-top:1px solid var(--border)}',
      '.me-trace>summary{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;',
      'min-height:var(--me-tap);cursor:pointer;list-style:none;',
      'font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.me-trace>summary::-webkit-details-marker{display:none}',
      /* 줄 안의 출처 칩은 누르는 것이 아니라 표식. 킷 크기 그대로 */
      '.me .me-trace>summary .tool-chip,.me .me-cand-top .tool-chip{pointer-events:none}',
      '.me-trace-text{color:var(--text-secondary);word-break:break-word}',
      /* 근거 자리. 원본으로 내려가는 실마리라 지우지 말 것 (설계 2.1 근거 없는 숫자 금지) */
      '.me-ref{font-size:var(--font-size-3xs);color:var(--text-tertiary);word-break:break-all}',
      '.me-ref a{color:var(--text-secondary)}',
      /* 영역 표. 세 칸 고정, 숫자는 자릿수 맞춤 */
      '.me-rows{display:flex;flex-direction:column;gap:var(--space-xs)}',
      '.me-row{display:grid;grid-template-columns:1fr auto auto;gap:var(--space-sm);',
      'align-items:baseline;font-size:var(--font-size-2xs)}',
      '.me-row em{font-style:normal;color:var(--text-secondary);overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.me-row i{font-style:normal;font-variant-numeric:tabular-nums;color:var(--text-primary);',
      'min-width:var(--space-xl);text-align:right}',
      '.me-row.is-head em,.me-row.is-head i{color:var(--text-tertiary);',
      'font-size:var(--font-size-3xs)}',
      /* 후보 목록. 날짜와 갈래가 먼저, 관찰문이 그 아래 */
      '.me-cand{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding:var(--space-sm);border-radius:var(--radius-md);background:var(--bg-secondary)}',
      '.me-cand-top{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;',
      'font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.me-cand b{color:var(--text-primary);word-break:break-word}',
      '.me-cand .me-detail{color:var(--text-secondary);word-break:break-word;',
      'font-size:var(--font-size-2xs)}',
      '.me-foot{font-size:var(--font-size-3xs);color:var(--text-tertiary);line-height:1.7}',
    ].join('');
    document.head.appendChild(el);
  }

  function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  /**
   * 개수 그대로. 천 단위만 끊음. 자리 표기는 기기 지역과 무관하게 고정.
   * 없는 값은 **null**. 0 으로 채우면 없는 사실을 만든다 (설계 3절 빈 칸은 그냥 없음).
   */
  function numOr(v: unknown): string | null {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function schemaMajor(schema: unknown): number | null {
    if (typeof schema !== 'string') return null;
    const at = schema.lastIndexOf('/');
    const n = parseInt(at < 0 ? schema : schema.slice(at + 1), 10);
    return isFinite(n) ? n : null;
  }

  function bakedAgo(iso: unknown): string {
    const at = Date.parse(text(iso));
    if (!isFinite(at)) return '';
    const d = Math.floor((Date.now() - at) / 86400000);
    if (d <= 0) return t('mydash.me.baked.today', undefined, '오늘 구움');
    if (d === 1) return t('mydash.me.baked.yesterday', undefined, '어제 구움');
    return t('mydash.me.baked.days', { n: d }, '{n}일 전에 구움');
  }

  /** ISO 를 월일과 시각으로. 원문이 이미 +09:00 이라 다시 셈하지 않음 */
  function stamp(iso: unknown): string {
    const s = text(iso);
    if (s.length < 16) return s.slice(0, 10);
    return s.slice(5, 10) + ' ' + s.slice(11, 16);
  }

  function day(iso: unknown): string {
    return text(iso).slice(0, 10);
  }

  function srcLabel(key: string): string {
    /* 아는 갈래 셋만 옮긴 말이 있음. 새 갈래는 값 그대로 */
    const known: Record<TraceSource, string> = { kakao: '카톡', bookmark: '북마크', commit: '커밋' };
    return t('mydash.me.src.' + key, undefined, known[key as TraceSource] || key);
  }

  function kindLabel(key: string): string {
    if (key === 'new-dir') return t('mydash.me.kind.newDir', undefined, '새 폴더');
    if (key === 'burst') return t('mydash.me.kind.burst', undefined, '몰림');
    if (key === 'gap-end') return t('mydash.me.kind.gapEnd', undefined, '공백 뒤 첫 커밋');
    return key;
  }

  function noneLine(): string {
    return '<div class="tool-hint">' + esc(t('mydash.me.none', undefined, '자료 없음')) + '</div>';
  }

  function secHead(label: string): string {
    return '<div class="tool-sublabel">' + esc(label) + '</div>';
  }

  function btnHtml(act: string, id: string, label: string): string {
    return (
      '<button type="button" class="btn btn-ghost" data-act="' + esc(act) + '"' +
      (id ? ' data-id="' + esc(id) + '"' : '') + '>' + esc(label) + '</button>'
    );
  }

  /* 숨김. 이 브라우저에만 남는다 ------------------------------------ */

  function readHidden(): Set<string> {
    try {
      const raw = window.localStorage.getItem(HIDE_KEY);
      const v: unknown = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      return new Set(list);
    } catch {
      /* 저장이 막힌 판 (비공개 창, 차단). 숨긴 것 없이 그린다 */
      return new Set();
    }
  }

  function writeHidden(set: Set<string>): void {
    try {
      window.localStorage.setItem(HIDE_KEY, JSON.stringify(Array.from(set)));
    } catch {
      /* 못 적어도 이번 화면에서는 숨겨진 채로 남는다 */
    }
  }

  /** 흔적 하나를 가리키는 열쇠. ref 가 있으면 그것, 없으면 갈래와 시각 */
  function traceKey(tr: Trace): string {
    const ref = text(tr.ref);
    return 't:' + (ref || text(tr.source) + '@' + text(tr.at));
  }

  /** 시기 창 하나를 가리키는 열쇠 */
  function winKey(w: OnThisDay): string {
    return 'w:' + (text(w.window) || day(w.from) + '~' + day(w.to));
  }

  /* 근거 링크 ------------------------------------------------------- */

  /**
   * 흔적 ref 를 GitHub 주소로 변환. 못 만들면 null, 화면에는 글자로만 표시.
   *
   * 두 꼴만 안다. 커밋은 `memo@b053dca`, 파일은 `life/raw/.../2025-09.md#2025-09-06T13:52`.
   * 뒤 조각(`#`)은 GitHub 에 없는 자리라 떼고 blob 주소로. 북마크 ref 도 저장소 안 파일이라
   * 같은 길로 간다 (`data/bookmarks/summary.json#<id>`). 파일 꼴이 아닌 맨 id 는 글자 그대로.
   */
  function refUrl(info: DashRepoInfo | null, ref: string): string | null {
    const owner = info ? text(info.owner) : '';
    const repo = info ? text(info.repo) : '';
    if (!owner || !repo || !ref) return null;
    const base =
      'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    const commit = /^([A-Za-z0-9._-]+)@([0-9a-fA-F]{7,40})$/.exec(ref);
    if (commit) return safeLinkUrl(base + '/commit/' + commit[2]);
    const path = ref.split('#')[0];
    if (!/^[^/#?][^#?]*\/[^/#?]+\.[A-Za-z0-9]+$/.test(path)) return null;
    const branch = (info ? text(info.branch) : '') || 'main';
    const enc = path.split('/').map(encodeURIComponent).join('/');
    return safeLinkUrl(base + '/blob/' + encodeURIComponent(branch) + '/' + enc);
  }

  function refLink(info: DashRepoInfo | null, ref: string): string {
    const url = refUrl(info, ref);
    if (!url) return esc(ref);
    return (
      '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(ref) + '</a>'
    );
  }

  /* 절 1. 이맘때 */

  function traceHtml(tr: Trace, info: DashRepoInfo | null): string {
    const src = srcLabel(text(tr.source));
    const when = stamp(tr.at);
    const body = text(tr.text);
    const ref = text(tr.ref);
    return (
      '<details class="me-trace">' +
      '<summary><span class="tool-chip">' + esc(src) + '</span>' +
      (when ? '<span>' + esc(when) + '</span>' : '') +
      btnHtml('hide', traceKey(tr), t('mydash.me.hideCard', undefined, '이 카드 다시 안 보기')) +
      '</summary>' +
      (body ? '<div class="me-trace-text">' + esc(body) + '</div>' : '') +
      (ref ? '<div class="me-ref">' + refLink(info, ref) + '</div>' : '') +
      '</details>'
    );
  }

  function windowHtml(w: OnThisDay, kakaoFrom: string, view: View): string {
    const all = Array.isArray(w.traces) ? w.traces : [];
    const traces = all.filter((tr) => !view.hidden.has(traceKey(tr)));
    const from = day(w.from);
    const to = day(w.to);
    const range = from && to ? t('mydash.me.range', { from, to }, '{from} ~ {to}') : '';
    /* 자료가 없는 창은 그냥 없음 한 줄. 채워진 척하는 자리 표시 금지 */
    let body: string;
    if (traces.length) body = traces.map((tr) => traceHtml(tr, view.repo)).join('');
    else if (all.length)
      body =
        '<div class="tool-hint">' +
        esc(t('mydash.me.allHidden', undefined, '이 시기 흔적을 모두 숨겼습니다')) +
        '</div>';
    else
      body =
        '<div class="tool-hint">' +
        esc(
          t('mydash.me.empty', { from: kakaoFrom }, '이 시기 자료 없음 (카톡 기록은 {from} 부터)')
        ) +
        '</div>';
    return (
      '<div class="me-card"><div class="me-card-head"><b>' + esc(text(w.window)) + '</b>' +
      (range ? '<span>' + esc(range) + '</span>' : '') +
      btnHtml('hide', winKey(w), t('mydash.me.hideWindow', undefined, '이 시기 숨기기')) +
      '</div>' + body + '</div>'
    );
  }

  function onThisDayHtml(data: MeData, view: View): string {
    const list = (Array.isArray(data.onThisDay) ? data.onThisDay : []).filter(
      (w) => !view.hidden.has(winKey(w))
    );
    const kakaoFrom =
      day((data.sources && data.sources.kakao && data.sources.kakao.from) || '').slice(0, 7) ||
      KAKAO_START_FALLBACK;
    const hiddenLine = view.hidden.size
      ? '<div class="tool-hint">' +
        esc(t('mydash.me.hidden', { n: view.hidden.size }, '숨긴 것 {n}개')) + ' ' +
        btnHtml('unhide', '', t('mydash.me.unhide', undefined, '다시 보기')) +
        '</div>'
      : '';
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.onThisDay', undefined, '이맘때')) +
      (list.length
        ? '<div class="me-cards">' + list.map((w) => windowHtml(w, kakaoFrom, view)).join('') +
          '</div>'
        : noneLine()) +
      hiddenLine +
      '</div>'
    );
  }

  /* 절 2. 최근 움직임. 화살표와 판정 없이 두 수만 나란히 */

  function recentHtml(data: MeData): string {
    const list = Array.isArray(data.recentAreas) ? data.recentAreas : [];
    const head =
      '<div class="me-row is-head"><em>' +
      esc(t('mydash.me.recent.area', undefined, '영역')) + '</em><i>' +
      esc(t('mydash.me.recent.last30', undefined, '최근 30일')) + '</i><i>' +
      esc(t('mydash.me.recent.prev30', undefined, '그 전 30일')) + '</i></div>';
    /* 못 읽은 수는 빈 칸. 0 으로 채우면 안 한 것과 구분이 안 된다 */
    const rows = list
      .map(
        (a) =>
          '<div class="me-row"><em>' + esc(text(a.area)) + '</em><i>' +
          esc(numOr(a.last30) || '') + '</i><i>' + esc(numOr(a.prev30) || '') + '</i></div>'
      )
      .join('');
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.recent', undefined, '최근 움직임')) +
      (list.length ? '<div class="me-rows">' + head + rows + '</div>' : noneLine()) +
      '</div>'
    );
  }

  /* 절 3. 사건 후보와 시기 후보 */

  /** 날짜 내림차순. 같은 날은 제목순이라 다시 그려도 차례가 안 흔들림 */
  function byDateDesc(a: EventCand, b: EventCand): number {
    const x = day(a.date);
    const y = day(b.date);
    if (x !== y) return x < y ? 1 : -1;
    return text(a.title) < text(b.title) ? -1 : 1;
  }

  function eventHtml(e: EventCand, info: DashRepoInfo | null): string {
    const refs = (Array.isArray(e.traceRefs) ? e.traceRefs : [])
      .map((r) => text(r))
      .filter((r) => r !== '');
    const detail = text(e.detail);
    return (
      '<div class="me-cand">' +
      '<div class="me-cand-top"><span>' + esc(day(e.date)) + '</span>' +
      '<span class="tool-chip">' + esc(kindLabel(text(e.kind))) + '</span>' +
      '<span>' + esc(t('mydash.me.cand.refs', { n: refs.length }, '근거 {n}')) + '</span></div>' +
      '<b>' + esc(text(e.title)) + '</b>' +
      (detail ? '<span class="me-detail">' + esc(detail) + '</span>' : '') +
      /* 근거는 개수로 끝내지 않고 원본까지 (설계 2.1). 링크가 안 되는 꼴은 글자로 */
      (refs.length
        ? '<div class="me-ref">' + refs.map((r) => refLink(info, r)).join(' ') + '</div>'
        : '') +
      '</div>'
    );
  }

  function eraHtml(e: EraCand): string {
    const from = day(e.from);
    const to = day(e.to);
    const range = from && to ? t('mydash.me.range', { from, to }, '{from} ~ {to}') : '';
    return (
      '<div class="me-cand">' +
      (range ? '<div class="me-cand-top"><span>' + esc(range) + '</span></div>' : '') +
      '<span class="me-detail">' + esc(text(e.signal)) + '</span></div>'
    );
  }

  /** 남은 수를 적은 더 보기. 남은 것이 없으면 버튼 자체가 없음 */
  function moreHtml(act: string, left: number): string {
    if (left <= 0) return '';
    return (
      '<div class="tool-actions tight">' +
      btnHtml(act, '', t('mydash.me.more', { n: left }, '더 보기 ({n}건 남음)')) +
      '</div>'
    );
  }

  /** 목록이 아예 없는 판과 비어 있는 판은 다르다. 없으면 셈을 안 적는다 */
  function candHead(list: unknown, key: string, withCount: string, plain: string): string {
    return Array.isArray(list)
      ? esc(t('mydash.me.cand.' + key, { n: list.length }, withCount))
      : esc(t('mydash.me.cand.' + key + 'Plain', undefined, plain));
  }

  function candidatesHtml(data: MeData, view: View): string {
    const events = (Array.isArray(data.eventCandidates) ? data.eventCandidates.slice() : []).sort(
      byDateDesc
    );
    const eras = Array.isArray(data.eraCandidates) ? data.eraCandidates : [];
    /* 설계 8.2 한 번에 하나씩. 40건을 한 화면에 쏟지 않는다 */
    const shownEvents = events.slice(0, view.events);
    const shownEras = eras.slice(0, view.eras);
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.cand', undefined, '사건 후보와 시기 후보')) +
      '<div class="tool-hint">' +
      esc(t('mydash.me.cand.hint', undefined, '자동 추출. 확인과 기록은 다음 단계')) +
      '</div>' +
      '<div class="tool-sublabel">' +
      candHead(data.eventCandidates, 'events', '사건 후보 {n}건', '사건 후보') +
      '</div>' +
      (events.length
        ? '<div class="me-rows">' + shownEvents.map((e) => eventHtml(e, view.repo)).join('') +
          '</div>' + moreHtml('more-events', events.length - shownEvents.length)
        : noneLine()) +
      '<div class="tool-sublabel">' +
      candHead(data.eraCandidates, 'eras', '시기 후보 {n}건', '시기 후보') +
      '</div>' +
      (eras.length
        ? '<div class="me-rows">' + shownEras.map(eraHtml).join('') + '</div>' +
          moreHtml('more-eras', eras.length - shownEras.length)
        : noneLine())
    ) + '</div>';
  }

  /* 절 4. 출처 */

  /**
   * 있는 조각만 잇는다. 개수를 못 읽은 소스는 줄에서 통째로 빠짐.
   * 창(from, to)이 반쪽이면 개수만 적는다. `카톡 0건 ( ~ )` 같은 없는 사실을 만들지 않기.
   */
  function sourceParts(data: MeData, withRange: boolean): string[] {
    const s = data.sources || {};
    const k = s.kakao || {};
    const b = s.bookmarks || {};
    const c = s.commits || {};
    const out: string[] = [];
    const kn = numOr(k.count);
    if (kn !== null) {
      const from = day(k.from);
      const to = day(k.to);
      out.push(
        withRange && from && to
          ? t('mydash.me.sources.kakaoRange', { n: kn, from, to }, '카톡 {n}건 ({from} ~ {to})')
          : t('mydash.me.sources.kakao', { n: kn }, '카톡 {n}건')
      );
    }
    const bn = numOr(b.count);
    if (bn !== null) out.push(t('mydash.me.sources.bookmarks', { n: bn }, '북마크 {n}건'));
    const cn = numOr(c.count);
    if (cn !== null) {
      const from = day(c.from);
      const to = day(c.to);
      out.push(
        withRange && from && to
          ? t('mydash.me.sources.commitsRange', { n: cn, from, to }, '커밋 {n}건 ({from} ~ {to})')
          : t('mydash.me.sources.commits', { n: cn }, '커밋 {n}건')
      );
    }
    return out;
  }

  function sourcesHtml(raw: MeFile, data: MeData): string {
    const parts = sourceParts(data, true);
    /* 셋 다 없으면 절 자체가 없다 */
    if (!parts.length) return '';
    const baked = bakedAgo(raw.generatedAt);
    if (baked) parts.push(baked);
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.sources', undefined, '출처')) +
      '<div class="me-foot">' + esc(parts.join(', ')) + '</div>' +
      '</div>'
    );
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    /* 옮긴 말이 안 와도 그림. 아래 모든 t 호출에 한국어 원본이 딸려 있음 */
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo, status } = ctx;
    root.innerHTML =
      '<div class="me"><div class="tool-status">' +
      esc(t('mydash.me.loading', undefined, '저장소에서 받는 중...')) +
      '</div></div>';

    const raw = await repo.readJson<MeFile>(DATA_PATH);

    const major = schemaMajor(raw.schema);
    if (major !== null && major !== SCHEMA_MAJOR) {
      root.innerHTML =
        '<div class="me"><div class="tool-status error">' +
        esc(
          t(
            'mydash.me.schemaBad',
            { schema: text(raw.schema) },
            '모르는 판입니다 ({schema}). 대시보드를 다시 배포하세요'
          )
        ) +
        '</div></div>';
      return;
    }

    const data = raw.data || {};
    /* 머리말 줄도 있는 조각만. 못 읽은 소스 자리에 0 을 적지 않는다 */
    const head = sourceParts(data, false);
    const baked = bakedAgo(raw.generatedAt);
    if (baked) head.push(baked);
    status(head.join(', '));

    const view: View = {
      hidden: readHidden(),
      events: EVENT_PAGE,
      eras: ERA_PAGE,
      repo: ctx.repoInfo || null,
    };

    const wrap = document.createElement('div');
    wrap.className = 'me';
    /* 차례가 곧 설계. 이맘때가 화면 최상단 (설계 4절 지금 탭) */
    wrap.innerHTML =
      '<div data-sec="recall"></div><div data-sec="recent"></div>' +
      '<div data-sec="cand"></div><div data-sec="sources"></div>';
    const sec = (name: string): HTMLElement =>
      wrap.querySelector('[data-sec="' + name + '"]') as HTMLElement;
    const drawRecall = (): void => {
      sec('recall').innerHTML = onThisDayHtml(data, view);
    };
    const drawCand = (): void => {
      sec('cand').innerHTML = candidatesHtml(data, view);
    };
    drawRecall();
    sec('recent').innerHTML = recentHtml(data);
    drawCand();
    sec('sources').innerHTML = sourcesHtml(raw, data);

    /* 누름은 한 자리에서 받는다. 절을 다시 그려도 이 listener 는 그대로 (wrap 에 붙음) */
    wrap.addEventListener('click', (ev: Event) => {
      const from = ev.target as Element | null;
      const el = from && from.closest ? from.closest('[data-act]') : null;
      if (!el) return;
      /* 숨기기 버튼은 summary 안에 있음. 막지 않으면 누를 때마다 본문이 펼쳐진다 */
      ev.preventDefault();
      const act = el.getAttribute('data-act');
      if (act === 'hide') {
        const id = el.getAttribute('data-id') || '';
        if (id) {
          view.hidden.add(id);
          writeHidden(view.hidden);
        }
        drawRecall();
        return;
      }
      if (act === 'unhide') {
        view.hidden.clear();
        writeHidden(view.hidden);
        drawRecall();
        return;
      }
      if (act === 'more-events') {
        view.events += EVENT_PAGE;
        drawCand();
        return;
      }
      if (act === 'more-eras') {
        view.eras += ERA_PAGE;
        drawCand();
      }
    });

    root.textContent = '';
    root.appendChild(wrap);
  }

  dashRegistry().register({
    id: 'me',
    get title() {
      return t('mydash.me.title', undefined, '나');
    },
    access: 'read',
    paths: [DATA_PATH],
    render,
  });
})();

export {};
