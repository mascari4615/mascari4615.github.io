/**
 * AI 구독 할당량 위젯 — TASK-KL-248.
 *
 * Claude / Codex / Grok 세 구독의 남은 할당량을 한 화면에. 지금까지는 각 CLI
 * 안에서 따로 물어보거나, 벽을 친 뒤에야 알았다.
 *
 * 이 위젯의 계약 하나: **신선도를 숨기지 않는다.** 벤더마다 잡히는 것이 다르다.
 *   Claude — usage API 라이브 (`live`)
 *   Codex  — 마지막 세션에 박힌 스냅샷 (관측 시각 표시)
 *   Grok   — 로그의 이미지 잔량 + 마지막 429 (퍼센트 게이지 자체가 없다)
 * 스냅샷을 라이브처럼 그리면 「20% 남았네」 하고 들어갔다 벽 친다. 그래서
 * 스냅샷 카드는 항상 「N시간 전 관측」 칩을 달고 게이지를 흐리게 그린다.
 *
 * 데스크톱 전용 — 토큰·로컬 로그는 Tauri 백엔드(ai_quota.rs)만 만진다.
 */
import { isDesktop, invoke } from '../tauri-bridge';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  'use strict';

  type QuotaWindow = {
    key: string;
    used_percent: number | null;
    resets_at: number | null;
  };

  type QuotaCount = {
    key: string;
    remaining: number;
  };

  type VendorQuota = {
    vendor: string;
    live: boolean;
    observed_at: number | null;
    plan: string | null;
    windows: QuotaWindow[];
    counts: QuotaCount[];
    last_rate_limited_at: number | null;
    notes: string[];
  };

  type VendorSpec = {
    id: 'claude' | 'codex' | 'grok';
    label: string;
    command: string;
    accent: string;
  };

  /** 카드 순서 = 내가 실제로 기대는 순서 (주력 → 보조 → 곁가지). */
  const VENDORS: ReadonlyArray<VendorSpec> = [
    { id: 'claude', label: 'Claude', command: 'ai_quota_claude', accent: '#d97757' },
    { id: 'codex', label: 'Codex', command: 'ai_quota_codex', accent: '#10a37f' },
    { id: 'grok', label: 'Grok', command: 'ai_quota_grok', accent: '#8b8b8b' }
  ];

  /** 라이브 카드만 의미가 있는 주기 — 스냅샷은 다시 읽어도 그대로다. */
  const AUTO_REFRESH_MS = 60_000;

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const nowSecs = (): number => Math.floor(Date.now() / 1000);

  /** 창 key → 사람이 읽는 라벨. 백엔드가 모르는 창을 보내면 key 를 그대로 쓴다. */
  function windowLabel(key: string): string {
    switch (key) {
      case 'five_hour':
        return t('quota.win.five_hour', undefined, '5시간');
      case 'seven_day':
        return t('quota.win.seven_day', undefined, '7일');
      case 'seven_day_opus':
        return t('quota.win.seven_day_opus', undefined, '7일 · Opus');
      case 'seven_day_sonnet':
        return t('quota.win.seven_day_sonnet', undefined, '7일 · Sonnet');
      case 'one_day':
        return t('quota.win.one_day', undefined, '1일');
      case 'primary':
        return t('quota.win.primary', undefined, '주 한도');
      case 'secondary':
        return t('quota.win.secondary', undefined, '보조 한도');
      default: {
        const m = /^minutes_(\d+)$/.exec(key);
        if (m) return t('quota.win.minutes', { n: m[1] }, `${m[1]}분 창`);
        return key;
      }
    }
  }

  /** 백엔드가 주는 안정 코드 → 사용자가 뭘 해야 하는지. */
  function errorText(code: string): string {
    if (code === 'token-expired')
      return t('quota.err.token_expired', undefined, '로그인이 만료됐다 — 터미널에서 claude 를 한 번 실행하면 갱신된다.');
    if (code === 'no-credentials' || code === 'no-oauth-block' || code === 'bad-credentials')
      return t('quota.err.no_credentials', undefined, '로그인 정보를 못 찾았다.');
    if (code === 'not-installed')
      return t('quota.err.not_installed', undefined, '이 컴퓨터에 설치돼 있지 않다.');
    if (code === 'no-sessions' || code === 'no-snapshot')
      return t('quota.err.no_snapshot', undefined, '최근 사용 기록이 없어 남은 양을 알 수 없다.');
    if (code === 'no-signal' || code === 'no-log')
      return t('quota.err.no_signal', undefined, '로그에 할당량 신호가 없다.');
    if (code.startsWith('http-'))
      return t('quota.err.http', { code }, `조회 실패 (${code})`);
    return code;
  }

  /** note 코드 → 왜 게이지가 없는지 한 줄. */
  function noteText(code: string): string {
    if (code === 'no-percent-api')
      return t('quota.note.no_percent_api', undefined, 'x.ai 에 잔량 조회 API 가 없어 퍼센트는 못 뽑는다 — 아래는 로그에 남은 사실.');
    return code;
  }

  /** 과거 시각 → 「3시간 전」. 신선도 칩의 전부다. */
  function ago(epoch: number): string {
    const diff = Math.max(0, nowSecs() - epoch);
    if (diff < 90) return t('quota.time.just_now', undefined, '방금');
    const mins = Math.round(diff / 60);
    if (mins < 60) return t('quota.time.min_ago', { n: mins }, `${mins}분 전`);
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('quota.time.hour_ago', { n: hours }, `${hours}시간 전`);
    const days = Math.round(hours / 24);
    return t('quota.time.day_ago', { n: days }, `${days}일 전`);
  }

  /** 미래 시각 → 「3시간 12분 뒤」. 이미 지났으면 곧 리셋. */
  function until(epoch: number): string {
    const diff = epoch - nowSecs();
    if (diff <= 0) return t('quota.time.resetting', undefined, '리셋 대기');
    const mins = Math.floor(diff / 60);
    if (mins < 60) return t('quota.time.in_min', { n: mins }, `${mins}분 뒤`);
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      const rest = mins % 60;
      return rest > 0
        ? t('quota.time.in_hour_min', { h: hours, m: rest }, `${hours}시간 ${rest}분 뒤`)
        : t('quota.time.in_hour', { n: hours }, `${hours}시간 뒤`);
    }
    const days = Math.floor(hours / 24);
    return t('quota.time.in_day', { n: days }, `${days}일 뒤`);
  }

  /** 게이지 색 — 아직 여유 / 슬슬 / 곧 벽. 수치를 색으로 한 번 더 말한다. */
  function gaugeTone(percent: number): string {
    if (percent >= 85) return 'danger';
    if (percent >= 60) return 'warn';
    return 'ok';
  }

  function gaugeHtml(w: QuotaWindow): string {
    const label = esc(windowLabel(w.key));
    const reset = w.resets_at ? `<span class="quota-reset">${esc(until(w.resets_at))}</span>` : '';
    if (w.used_percent === null || !Number.isFinite(w.used_percent)) {
      return `
        <div class="quota-gauge">
          <div class="quota-gauge-head"><span>${label}</span>${reset}</div>
          <div class="quota-gauge-unknown">${esc(t('quota.t10', undefined, '수치 없음'))}</div>
        </div>`;
    }
    const used = Math.max(0, Math.min(100, w.used_percent));
    const left = Math.round((100 - used) * 10) / 10;
    return `
      <div class="quota-gauge">
        <div class="quota-gauge-head">
          <span>${label}</span>
          <strong class="quota-left">${esc(t('quota.t11', { n: left }, `${left}% 남음`))}</strong>
        </div>
        <div class="quota-bar" role="img" aria-label="${esc(t('quota.t12', { n: used }, `${used}% 사용`))}">
          <span class="quota-bar-fill quota-bar-fill--${gaugeTone(used)}" style="width:${used}%"></span>
        </div>
        <div class="quota-gauge-foot">
          <span>${esc(t('quota.t12', { n: used }, `${used}% 사용`))}</span>${reset}
        </div>
      </div>`;
  }

  function countHtml(c: QuotaCount): string {
    const label =
      c.key === 'images'
        ? t('quota.count.images', undefined, '이미지 생성 남은 장수')
        : c.key;
    return `
      <div class="quota-count">
        <span class="quota-count-label">${esc(label)}</span>
        <strong class="quota-count-value">${esc(String(c.remaining))}</strong>
      </div>`;
  }

  function cardBodyHtml(spec: VendorSpec, data: VendorQuota): string {
    const parts: string[] = [];
    parts.push(...data.notes.map((n) => `<p class="quota-note">${esc(noteText(n))}</p>`));
    parts.push(...data.windows.map(gaugeHtml));
    parts.push(...data.counts.map(countHtml));
    if (data.last_rate_limited_at) {
      parts.push(
        `<p class="quota-wall">${esc(
          t('quota.t13', { when: ago(data.last_rate_limited_at) }, `마지막으로 한도에 막힌 때: ${ago(data.last_rate_limited_at)}`)
        )}</p>`
      );
    }
    if (parts.length === 0) {
      parts.push(`<p class="quota-note">${esc(t('quota.t14', undefined, '표시할 값이 없다.'))}</p>`);
    }
    void spec;
    return parts.join('');
  }

  function freshnessHtml(data: VendorQuota): string {
    if (data.live) {
      return `<span class="quota-chip quota-chip--live">${esc(t('quota.t15', undefined, '라이브'))}</span>`;
    }
    const when = data.observed_at ? ago(data.observed_at) : t('quota.t16', undefined, '시점 불명');
    return `<span class="quota-chip quota-chip--stale" title="${esc(
      t('quota.t17', undefined, '마지막으로 그 도구를 썼을 때 남아 있던 값이다. 지금 값은 이보다 적을 수 있다.')
    )}">${esc(t('quota.t18', { when }, `${when} 관측`))}</span>`;
  }

  function renderCard(spec: VendorSpec, state: { data?: VendorQuota; error?: string }): string {
    const chips: string[] = [];
    if (state.data) {
      if (state.data.plan) {
        chips.push(`<span class="quota-chip quota-chip--plan">${esc(state.data.plan)}</span>`);
      }
      chips.push(freshnessHtml(state.data));
    }
    const body = state.error
      ? `<p class="quota-error">${esc(errorText(state.error))}</p>`
      : state.data
        ? cardBodyHtml(spec, state.data)
        : `<p class="quota-note">${esc(t('quota.t19', undefined, '읽는 중…'))}</p>`;

    return `
      <section class="quota-card${state.error ? ' quota-card--error' : ''}" style="--quota-accent:${spec.accent}">
        <header class="quota-card-head">
          <h3 class="quota-vendor">${esc(spec.label)}</h3>
          <div class="quota-chips">${chips.join('')}</div>
        </header>
        <div class="quota-card-body${state.data && !state.data.live ? ' quota-card-body--stale' : ''}">${body}</div>
      </section>`;
  }

  function build(container: HTMLElement): void {
    Mdd.injectCSS(
      'quota',
      `
      .quota-wrap { display: flex; flex-direction: column; gap: 14px; }
      .quota-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .quota-lede { margin: 0; color: var(--text-secondary); font-size: var(--font-size-sm); }
      .quota-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
      .quota-card { border: 1px solid var(--border); border-left: 4px solid var(--quota-accent); border-radius: var(--radius-md); background: var(--bg-secondary); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
      .quota-card--error { border-left-color: var(--text-tertiary); }
      .quota-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .quota-vendor { margin: 0; font-size: var(--font-size-md); font-weight: 700; letter-spacing: 0.01em; }
      .quota-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .quota-chip { font-size: var(--font-size-2xs); padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); white-space: nowrap; }
      .quota-chip--live { border-color: var(--success); color: var(--success); }
      .quota-chip--stale { border-style: dashed; cursor: help; }
      .quota-chip--plan { text-transform: uppercase; letter-spacing: 0.04em; }
      .quota-card-body { display: flex; flex-direction: column; gap: 12px; }
      /* 스냅샷은 라이브와 같은 무게로 보이면 안 된다 — 눈에 먼저 들어오는 건 라이브 쪽. */
      .quota-card-body--stale { opacity: 0.82; }
      .quota-gauge { display: flex; flex-direction: column; gap: 5px; }
      .quota-gauge-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--font-size-sm); }
      .quota-left { font-variant-numeric: tabular-nums; }
      .quota-bar { position: relative; height: 8px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; }
      .quota-bar-fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; transition: width 0.3s ease; }
      .quota-bar-fill--ok { background: var(--success); }
      .quota-bar-fill--warn { background: var(--warning); }
      .quota-bar-fill--danger { background: var(--error); }
      .quota-gauge-foot { display: flex; justify-content: space-between; gap: 8px; font-size: var(--font-size-2xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .quota-gauge-unknown { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
      .quota-reset { font-size: var(--font-size-2xs); color: var(--text-tertiary); white-space: nowrap; }
      .quota-count { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--font-size-sm); }
      .quota-count-value { font-size: var(--font-size-lg); font-variant-numeric: tabular-nums; }
      .quota-note, .quota-wall, .quota-error { margin: 0; font-size: var(--font-size-2xs); color: var(--text-tertiary); line-height: 1.5; }
      .quota-error { color: var(--error); }
      .quota-updated { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
      `
    );

    const wrap = document.createElement('div');
    wrap.className = 'quota-wrap';

    const top = document.createElement('div');
    top.className = 'quota-top';
    const lede = document.createElement('p');
    lede.className = 'quota-lede';
    lede.textContent = t('quota.t01', undefined, '구독 세 개의 남은 할당량. Claude 만 실시간이고, 나머지는 마지막으로 그 도구를 썼을 때의 값이다.');
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'btn btn-secondary btn-sm';
    refreshBtn.textContent = t('quota.t02', undefined, '새로고침');
    top.append(lede, refreshBtn);

    const cards = document.createElement('div');
    cards.className = 'quota-cards';

    const updated = document.createElement('div');
    updated.className = 'quota-updated';

    wrap.append(top, cards, updated);
    container.appendChild(wrap);

    if (!isDesktop()) {
      cards.innerHTML = '';
      const note = document.createElement('p');
      note.className = 'quota-note';
      note.textContent = t('quota.t03', undefined, '데스크톱 앱에서만 동작한다 — 토큰과 로그가 이 컴퓨터에만 있다.');
      cards.appendChild(note);
      refreshBtn.disabled = true;
      return;
    }

    const states = new Map<string, { data?: VendorQuota; error?: string }>();

    function paint(): void {
      cards.innerHTML = VENDORS.map((v) => renderCard(v, states.get(v.id) ?? {})).join('');
    }

    let inFlight = false;

    function refresh(): void {
      if (inFlight) return;
      inFlight = true;
      refreshBtn.disabled = true;
      // 카드 단위 격리 — 하나가 죽어도 나머지는 그린다.
      void Promise.all(
        VENDORS.map((v) =>
          invoke<VendorQuota>(v.command)
            .then((data) => states.set(v.id, { data }))
            .catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              states.set(v.id, { error: msg });
            })
        )
      ).then(() => {
        inFlight = false;
        refreshBtn.disabled = false;
        paint();
        updated.textContent = t('quota.t04', { when: ago(nowSecs()) }, '방금 읽음');
      });
    }

    refreshBtn.addEventListener('click', refresh);
    paint();
    refresh();

    // 자동 갱신은 **보이는 동안만** 돈다 — 숨은 탭에서 60초마다 깨우면 배터리만
    // 태운다(audit:hidden-tab). 돌아오면 곧바로 한 번 읽고 다시 건다: 숨어 있던
    // 사이에 5시간 창이 리셋됐을 수 있어 낡은 숫자를 그대로 보여주면 안 된다.
    let timer = 0;
    function startTimer(): void {
      if (timer) return;
      timer = window.setInterval(refresh, AUTO_REFRESH_MS);
    }
    function stopTimer(): void {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    }
    function onVisibility(): void {
      if (document.hidden) {
        stopTimer();
        return;
      }
      refresh();
      startTimer();
    }
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) startTimer();

    // 핫리로드로 위젯이 갈아 끼워질 때 타이머·리스너가 쌓이면 안 된다
    // (blog CLAUDE.md § KarmoLab 화면 작업).
    Toolbox.onDispose?.(() => {
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  Toolbox.register({
    id: 'quota',
    title: t('widgets.quota.title', undefined, '할당량'),
    category: 'tool',
    desktopOnly: true,
    desc: t('widgets-desc.quota.desc', undefined, 'Claude · Codex · Grok 구독의 남은 할당량을 한 화면에'),
    layout: 'form',
    icon: '<path d="M4 19a8 8 0 1116 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 19l4.5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    tabs: [
      {
        id: 'quota-main',
        label: t('quota.tab.panel', undefined, '할당량'),
        build: function (container: HTMLElement): void {
          void loadNamespace('quota').then(function () {
            build(container);
          });
        }
      }
    ]
  });
})();
