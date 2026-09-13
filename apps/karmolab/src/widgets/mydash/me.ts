/**
 * 패널: 나 (1차, 읽기 전용).
 *
 * 읽는 것 하나. `data/me/summary.json` (schema `me/1`). 생성기는 memo 의
 * `scripts/me/summarize.mjs`. 화면은 그 파일이 담은 관찰만 옮김.
 *
 * 설계 정본은 memo `notes/mydash/docs/나-페이지-설계.md` 3절. 거기서 온 금지 넷.
 * 점수와 등급과 성격 판정 없음, 숫자는 개수와 날짜까지, 빈 칸은 그냥 없음 (진행률 바 금지),
 * 자기소개 입력 폼 없음. 그래서 이 파일에 계산이 거의 없음. 정렬과 셈과 escape 가 전부.
 *
 * 1차는 설계 4절의 지금과 역사 씨앗만. 취향과 지향과 분석 탭 없음. 탭 대신 세로 절 넷.
 * 첫 절이 이맘때인 이유는 설계 2.2 의 비자발적 재회. 목록이 먼저 오면 다시 안 봄.
 *
 * 쓰기 경로 없음. 사건 후보와 시기 후보에 확인 버튼이 없는 것도 그 때문. 확인과 기록은
 * 이벤트 파일이 생기는 다음 라운드 몫.
 */
import { dashRegistry, esc } from './kit';
import type { DashPanelCtx } from './kit';
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

  const DATA_PATH = 'data/me/summary.json';
  /** 이 화면이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않고 다시 배포하라고 적음 */
  const SCHEMA_MAJOR = 1;
  /** 카톡 자료 시작. `sources.kakao.from` 이 비었을 때만 쓰는 값 */
  const KAKAO_START_FALLBACK = '2025-06';

  const STYLE_ID = 'mydash-me-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색과 둥글기와 글자 크기는 전부 스킨 토큰. 여기서 직접 정하는 것은 칸 나눔과 여백뿐 */
    el.textContent = [
      '.me{display:flex;flex-direction:column;gap:var(--space-lg)}',
      '.me-sec{display:flex;flex-direction:column;gap:var(--space-sm)}',
      /* 이맘때 카드 셋. 폰은 한 줄에 하나, 넓어지면 셋 */
      '.me-cards{display:grid;grid-template-columns:1fr;gap:var(--space-sm)}',
      '@media(min-width:720px){.me-cards{grid-template-columns:repeat(3,1fr)}}',
      '.me-card{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding:var(--space-sm);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.me-card-head{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:baseline}',
      '.me-card-head b{color:var(--text-primary)}',
      '.me-card-head span{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.me-trace{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding-top:var(--space-xs);border-top:1px solid var(--border)}',
      '.me-trace-top{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;',
      'font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      /* 줄 안의 출처 칩은 누르는 것이 아니라 표식. 킷 크기 그대로 */
      '.me .me-trace-top .tool-chip,.me .me-cand-top .tool-chip{pointer-events:none}',
      '.me-trace-text{color:var(--text-secondary);word-break:break-word}',
      /* 근거 자리. 원본으로 내려가는 실마리라 지우지 말 것 (설계 2.1 근거 없는 숫자 금지) */
      '.me-ref{font-size:var(--font-size-3xs);color:var(--text-tertiary);word-break:break-all}',
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

  /** 개수 그대로. 천 단위만 끊음. 자리 표기는 기기 지역과 무관하게 고정 */
  function num(v: unknown): string {
    const n = typeof v === 'number' && isFinite(v) ? Math.round(v) : 0;
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  /* 절 1. 이맘때 */

  function traceHtml(tr: Trace): string {
    const src = srcLabel(text(tr.source));
    const when = stamp(tr.at);
    const body = text(tr.text);
    const ref = text(tr.ref);
    return (
      '<div class="me-trace">' +
      '<div class="me-trace-top"><span class="tool-chip">' + esc(src) + '</span>' +
      '<span>' + esc(when) + '</span></div>' +
      (body ? '<div class="me-trace-text">' + esc(body) + '</div>' : '') +
      (ref ? '<div class="me-ref">' + esc(ref) + '</div>' : '') +
      '</div>'
    );
  }

  function windowHtml(w: OnThisDay, kakaoFrom: string): string {
    const traces = Array.isArray(w.traces) ? w.traces : [];
    const range = t('mydash.me.range', { from: day(w.from), to: day(w.to) }, '{from} ~ {to}');
    /* 자료가 없는 창은 그냥 없음 한 줄. 채워진 척하는 자리 표시 금지 */
    const body = traces.length
      ? traces.map(traceHtml).join('')
      : '<div class="tool-hint">' +
        esc(
          t('mydash.me.empty', { from: kakaoFrom }, '이 시기 자료 없음 (카톡 기록은 {from} 부터)')
        ) +
        '</div>';
    return (
      '<div class="me-card"><div class="me-card-head"><b>' + esc(text(w.window)) + '</b>' +
      '<span>' + esc(range) + '</span></div>' + body + '</div>'
    );
  }

  function onThisDayHtml(data: MeData): string {
    const list = Array.isArray(data.onThisDay) ? data.onThisDay : [];
    const kakaoFrom =
      day((data.sources && data.sources.kakao && data.sources.kakao.from) || '').slice(0, 7) ||
      KAKAO_START_FALLBACK;
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.onThisDay', undefined, '이맘때')) +
      (list.length
        ? '<div class="me-cards">' + list.map((w) => windowHtml(w, kakaoFrom)).join('') + '</div>'
        : noneLine()) +
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
    const rows = list
      .map(
        (a) =>
          '<div class="me-row"><em>' + esc(text(a.area)) + '</em><i>' + esc(num(a.last30)) +
          '</i><i>' + esc(num(a.prev30)) + '</i></div>'
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

  function eventHtml(e: EventCand): string {
    const refs = Array.isArray(e.traceRefs) ? e.traceRefs.length : 0;
    const detail = text(e.detail);
    return (
      '<div class="me-cand">' +
      '<div class="me-cand-top"><span>' + esc(day(e.date)) + '</span>' +
      '<span class="tool-chip">' + esc(kindLabel(text(e.kind))) + '</span>' +
      '<span>' + esc(t('mydash.me.cand.refs', { n: refs }, '근거 {n}')) + '</span></div>' +
      '<b>' + esc(text(e.title)) + '</b>' +
      (detail ? '<span class="me-detail">' + esc(detail) + '</span>' : '') +
      '</div>'
    );
  }

  function eraHtml(e: EraCand): string {
    const range = t('mydash.me.range', { from: day(e.from), to: day(e.to) }, '{from} ~ {to}');
    return (
      '<div class="me-cand"><div class="me-cand-top"><span>' + esc(range) + '</span></div>' +
      '<span class="me-detail">' + esc(text(e.signal)) + '</span></div>'
    );
  }

  function candidatesHtml(data: MeData): string {
    const events = (Array.isArray(data.eventCandidates) ? data.eventCandidates.slice() : []).sort(
      byDateDesc
    );
    const eras = Array.isArray(data.eraCandidates) ? data.eraCandidates : [];
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.cand', undefined, '사건 후보와 시기 후보')) +
      '<div class="tool-hint">' +
      esc(t('mydash.me.cand.hint', undefined, '자동 추출. 확인과 기록은 다음 단계')) +
      '</div>' +
      '<div class="tool-sublabel">' +
      esc(t('mydash.me.cand.events', { n: events.length }, '사건 후보 {n}건')) +
      '</div>' +
      (events.length
        ? '<div class="me-rows">' + events.map(eventHtml).join('') + '</div>'
        : noneLine()) +
      '<div class="tool-sublabel">' +
      esc(t('mydash.me.cand.eras', { n: eras.length }, '시기 후보 {n}건')) +
      '</div>' +
      (eras.length ? '<div class="me-rows">' + eras.map(eraHtml).join('') + '</div>' : noneLine()) +
      '</div>'
    );
  }

  /* 절 4. 출처 */

  function sourcesHtml(raw: MeFile, data: MeData): string {
    const s = data.sources || {};
    const k = s.kakao || {};
    const b = s.bookmarks || {};
    const c = s.commits || {};
    const line = t(
      'mydash.me.sources.line',
      {
        kakao: num(k.count),
        kFrom: day(k.from),
        kTo: day(k.to),
        bookmarks: num(b.count),
        commits: num(c.count),
        cFrom: day(c.from),
        cTo: day(c.to),
      },
      '카톡 {kakao}건 ({kFrom} ~ {kTo}), 북마크 {bookmarks}건, 커밋 {commits}건 ({cFrom} ~ {cTo})'
    );
    const baked = bakedAgo(raw.generatedAt);
    return (
      '<div class="me-sec">' +
      secHead(t('mydash.me.sec.sources', undefined, '출처')) +
      '<div class="me-foot">' + esc(baked ? line + ', ' + baked : line) + '</div>' +
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
    const s = data.sources || {};
    status(
      t(
        'mydash.me.status',
        {
          kakao: num(s.kakao && s.kakao.count),
          bookmarks: num(s.bookmarks && s.bookmarks.count),
          commits: num(s.commits && s.commits.count),
          when: bakedAgo(raw.generatedAt),
        },
        '카톡 {kakao}, 북마크 {bookmarks}, 커밋 {commits}, {when}'
      )
    );

    const wrap = document.createElement('div');
    wrap.className = 'me';
    /* 차례가 곧 설계. 이맘때가 화면 최상단 (설계 4절 지금 탭) */
    wrap.innerHTML =
      onThisDayHtml(data) + recentHtml(data) + candidatesHtml(data) + sourcesHtml(raw, data);
    root.textContent = '';
    root.appendChild(wrap);
  }

  dashRegistry().register({
    id: 'me',
    title: '나',
    access: 'read',
    paths: [DATA_PATH],
    render,
  });
})();

export {};
