/**
 * 내 AI. 구독 살림 한 화면. TASK-KL-248.
 *
 * 남은 할당량, 개발 환경, 에이전트 운영, 공급자 연결을 한곳에 둔다. 그래서 화면은
 * 벤더 목록을 스스로 들고 있지 않고, 백엔드가 돌려주는 카드를 그대로 그린다 . 
 * 새 구독을 붙일 때 고칠 곳이 두 벌로 갈라지지 않게.
 *
 * 계약 하나: **신선도를 숨기지 않는다.** 라이브로 물어본 값과 로컬에 남은
 * 마지막 관측은 칩과 명도로 구분한다. 스냅샷을 라이브처럼 그리면 20% 남았네
 * 하고 들어갔다 벽 친다 (실제로 Codex 스냅샷 20% 옆에서 라이브는 96% 였다).
 *
 * 데스크톱 전용. 토큰과 로컬 로그는 Tauri 백엔드(ai_quota)만 만진다.
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
    live: boolean;
    observed_at: number | null;
    plan: string | null;
    windows: QuotaWindow[];
    counts: QuotaCount[];
    last_rate_limited_at: number | null;
    notes: string[];
  };

  /** 카드 한 장 = 벤더 하나. 목록, 순서, 색은 전부 백엔드가 정한다. */
  type VendorCard = {
    id: string;
    label: string;
    accent: string;
    quota: VendorQuota | null;
    error: string | null;
  };

  /** 라이브 카드만 의미가 있는 주기. 스냅샷은 다시 읽어도 그대로다. */
  const AUTO_REFRESH_MS = 60_000;

  /**
   * 같은 수치를 남음으로 볼지 사용으로 볼지는 사람마다 갈린다. 한쪽으로
   * 고정하면 나머지 한쪽은 매번 100에서 빼야 한다. 선택은 이 컴퓨터에 남는다.
   */
  type MeterMode = 'left' | 'used';
  const METER_MODE_KEY = 'karmolab_myai_meter_mode';

  function readMeterMode(): MeterMode {
    try {
      return localStorage.getItem(METER_MODE_KEY) === 'used' ? 'used' : 'left';
    } catch {
      return 'left';
    }
  }

  let meterMode: MeterMode = readMeterMode();

  function writeMeterMode(mode: MeterMode): void {
    meterMode = mode;
    try {
      localStorage.setItem(METER_MODE_KEY, mode);
    } catch {
      /* 저장 못 해도 이번 세션 동안은 바뀐 대로 본다. */
    }
  }

  type MyAiPanels = {
    claudeEnvironment?: (container: HTMLElement) => void;
  };

  type EnvironmentVendorState = {
    vendor: 'claude' | 'codex' | 'grok';
    status: 'applied' | 'partial' | 'missing' | 'unknown';
    reason: string;
    evidence: string[];
  };

  type EnvironmentFeature = {
    id: string;
    label: string;
    description: string;
    vendors: EnvironmentVendorState[];
  };

  type EnvironmentAudit = { checked_at: number; features: EnvironmentFeature[] };

  const panels = (): MyAiPanels =>
    (window as unknown as { MyAiPanels?: MyAiPanels }).MyAiPanels ?? {};

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const nowSecs = (): number => Math.floor(Date.now() / 1000);

  /** 창 key → 사람이 읽는 라벨. 백엔드가 모르는 창을 보내면 key 를 그대로 쓴다. */
  function windowLabel(key: string): string {
    switch (key) {
      case 'five_hour':
        return t('my-ai.win.five_hour', undefined, '5시간');
      case 'seven_day':
        return t('my-ai.win.seven_day', undefined, '7일');
      case 'seven_day_opus':
        return t('my-ai.win.seven_day_opus', undefined, '7일, Opus');
      case 'seven_day_sonnet':
        return t('my-ai.win.seven_day_sonnet', undefined, '7일, Sonnet');
      case 'one_day':
        return t('my-ai.win.one_day', undefined, '1일');
      case 'primary':
        return t('my-ai.win.primary', undefined, '주 한도');
      case 'secondary':
        return t('my-ai.win.secondary', undefined, '보조 한도');
      default: {
        const m = /^minutes_(\d+)$/.exec(key);
        if (m) return t('my-ai.win.minutes', { n: m[1] }, `${m[1]}분 창`);
        return key;
      }
    }
  }

  /** 백엔드가 주는 안정 코드 → 사용자가 뭘 해야 하는지. */
  function errorText(code: string): string {
    if (code === 'token-expired')
      return t('my-ai.err.token_expired', undefined, '로그인이 만료됐다. 터미널에서 claude 를 한 번 실행하면 갱신된다.');
    if (code === 'no-credentials' || code === 'no-oauth-block' || code === 'bad-credentials')
      return t('my-ai.err.no_credentials', undefined, '로그인 정보를 못 찾았다.');
    if (code === 'not-installed')
      return t('my-ai.err.not_installed', undefined, '이 컴퓨터에 설치돼 있지 않다.');
    if (code === 'no-sessions' || code === 'no-snapshot')
      return t('my-ai.err.no_snapshot', undefined, '최근 사용 기록이 없어 남은 양을 알 수 없다.');
    if (code === 'no-signal' || code === 'no-log')
      return t('my-ai.err.no_signal', undefined, '로그에 할당량 신호가 없다.');
    if (code.startsWith('http-'))
      return t('my-ai.err.http', { code }, `조회 실패 (${code})`);
    return code;
  }

  /** note 코드 → 왜 게이지가 없는지 한 줄. */
  function noteText(code: string): string {
    if (code === 'live-failed')
      return t('my-ai.note.live_failed', undefined, '실시간 조회가 막혀서 로컬에 남은 마지막 기록을 보여준다.');
    if (code === 'no-percent-api')
      return t('my-ai.note.no_percent_api', undefined, 'x.ai 에 잔량 조회 API 가 없어 퍼센트는 못 뽑는다. 아래는 로그에 남은 사실.');
    return code;
  }

  /** 과거 시각 → 3시간 전. 신선도 칩의 전부다. */
  function ago(epoch: number): string {
    const diff = Math.max(0, nowSecs() - epoch);
    if (diff < 90) return t('my-ai.time.just_now', undefined, '방금');
    const mins = Math.round(diff / 60);
    if (mins < 60) return t('my-ai.time.min_ago', { n: mins }, `${mins}분 전`);
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('my-ai.time.hour_ago', { n: hours }, `${hours}시간 전`);
    const days = Math.round(hours / 24);
    return t('my-ai.time.day_ago', { n: days }, `${days}일 전`);
  }

  /** 미래 시각 → 3시간 12분 뒤. 이미 지났으면 곧 리셋. */
  function until(epoch: number): string {
    const diff = epoch - nowSecs();
    if (diff <= 0) return t('my-ai.time.resetting', undefined, '리셋 대기');
    const mins = Math.floor(diff / 60);
    if (mins < 60) return t('my-ai.time.in_min', { n: mins }, `${mins}분 뒤`);
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      const rest = mins % 60;
      return rest > 0
        ? t('my-ai.time.in_hour_min', { h: hours, m: rest }, `${hours}시간 ${rest}분 뒤`)
        : t('my-ai.time.in_hour', { n: hours }, `${hours}시간 뒤`);
    }
    const days = Math.floor(hours / 24);
    return t('my-ai.time.in_day', { n: days }, `${days}일 뒤`);
  }

  /** 미래 시각 → 오늘 14:00. 상대 표현만 두면 몇 시인지 사람이 암산해야 한다. */
  function resetClock(epoch: number): string {
    const at = new Date(epoch * 1000);
    const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    if (dayKey(at) === dayKey(today)) return t('my-ai.time.at_today', { hm }, `오늘 ${hm}`);
    if (dayKey(at) === dayKey(tomorrow)) return t('my-ai.time.at_tomorrow', { hm }, `내일 ${hm}`);
    return t(
      'my-ai.time.at_date',
      { m: at.getMonth() + 1, d: at.getDate(), hm },
      `${at.getMonth() + 1}월 ${at.getDate()}일 ${hm}`
    );
  }

  /** 리셋 표기 = 남은 시간 + 실제 시각. 7일 뒤만으로는 언제 풀리는지 안 잡힌다. */
  function resetHtml(epoch: number): string {
    const full = new Date(epoch * 1000).toLocaleString();
    const text = t(
      'my-ai.time.reset_at',
      { rel: until(epoch), clock: resetClock(epoch) },
      `${until(epoch)}, ${resetClock(epoch)}`
    );
    return `<span class="myai-reset" title="${esc(full)}">${esc(text)}</span>`;
  }

  /** 게이지 색. 아직 여유 / 슬슬 / 곧 벽. 수치를 색으로 한 번 더 말한다. */
  function gaugeTone(percent: number): string {
    if (percent >= 85) return 'danger';
    if (percent >= 60) return 'warn';
    return 'ok';
  }

  function gaugeHtml(w: QuotaWindow): string {
    const label = esc(windowLabel(w.key));
    const reset = w.resets_at ? resetHtml(w.resets_at) : '';
    if (w.used_percent === null || !Number.isFinite(w.used_percent)) {
      return `
        <div class="myai-gauge">
          <div class="myai-gauge-head"><span>${label}</span>${reset}</div>
          <div class="myai-gauge-unknown">${esc(t('my-ai.t10', undefined, '수치 없음'))}</div>
        </div>`;
    }
    const used = Math.round(Math.max(0, Math.min(100, w.used_percent)) * 10) / 10;
    const left = Math.round((100 - used) * 10) / 10;
    const usedText = t('my-ai.t12', { n: used }, `${used}% 사용`);
    const leftText = t('my-ai.t11', { n: left }, `${left}% 남음`);
    // 색은 언제나 얼마나 썼나 기준. 막대가 남은 쪽을 채워도 위험도의 뜻은 그대로다.
    const tone = gaugeTone(used);
    const headline = meterMode === 'used' ? usedText : leftText;
    const footline = meterMode === 'used' ? leftText : usedText;
    const fill = meterMode === 'used' ? used : left;
    return `
      <div class="myai-gauge">
        <div class="myai-gauge-head">
          <span>${label}</span>
          <strong class="myai-left">${esc(headline)}</strong>
        </div>
        <div class="myai-bar" role="img" aria-label="${esc(usedText)}">
          <span class="myai-bar-fill myai-bar-fill--${tone}" style="width:${fill}%"></span>
        </div>
        <div class="myai-gauge-foot">
          <span>${esc(footline)}</span>${reset}
        </div>
      </div>`;
  }

  function countHtml(c: QuotaCount): string {
    const label =
      c.key === 'images'
        ? t('my-ai.count.images', undefined, '이미지 생성 남은 장수')
        : c.key;
    return `
      <div class="myai-count">
        <span class="myai-count-label">${esc(label)}</span>
        <strong class="myai-count-value">${esc(String(c.remaining))}</strong>
      </div>`;
  }

  function cardBodyHtml(data: VendorQuota): string {
    const parts: string[] = [];
    parts.push(...data.notes.map((n) => `<p class="myai-note">${esc(noteText(n))}</p>`));
    parts.push(...data.windows.map(gaugeHtml));
    parts.push(...data.counts.map(countHtml));
    if (data.last_rate_limited_at) {
      parts.push(
        `<p class="myai-wall">${esc(
          t('my-ai.t13', { when: ago(data.last_rate_limited_at) }, `마지막으로 한도에 막힌 때: ${ago(data.last_rate_limited_at)}`)
        )}</p>`
      );
    }
    if (parts.length === 0) {
      parts.push(`<p class="myai-note">${esc(t('my-ai.t14', undefined, '표시할 값이 없다.'))}</p>`);
    }
    return parts.join('');
  }

  function freshnessHtml(data: VendorQuota): string {
    if (data.live) {
      return `<span class="myai-chip myai-chip--live">${esc(t('my-ai.t15', undefined, '라이브'))}</span>`;
    }
    const when = data.observed_at ? ago(data.observed_at) : t('my-ai.t16', undefined, '시점 불명');
    return `<span class="myai-chip myai-chip--stale" title="${esc(
      t('my-ai.t17', undefined, '마지막으로 그 도구를 썼을 때 남아 있던 값이다. 지금 값은 이보다 적을 수 있다.')
    )}">${esc(t('my-ai.t18', { when }, `${when} 관측`))}</span>`;
  }

  function renderCard(card: VendorCard): string {
    const chips: string[] = [];
    if (card.quota) {
      if (card.quota.plan) {
        chips.push(`<span class="myai-chip myai-chip--plan">${esc(card.quota.plan)}</span>`);
      }
      chips.push(freshnessHtml(card.quota));
    }
    const body = card.error
      ? `<p class="myai-error">${esc(errorText(card.error))}</p>`
      : card.quota
        ? cardBodyHtml(card.quota)
        : `<p class="myai-note">${esc(t('my-ai.t19', undefined, '읽는 중...'))}</p>`;

    return `
      <section class="myai-card${card.error ? ' myai-card--error' : ''}" style="--myai-accent:${esc(card.accent)}">
        <header class="myai-card-head">
          <h3 class="myai-vendor">${esc(card.label)}</h3>
          <div class="myai-chips">${chips.join('')}</div>
        </header>
        <div class="myai-card-body${card.quota && !card.quota.live ? ' myai-card-body--stale' : ''}">${body}</div>
      </section>`;
  }

  function buildQuota(container: HTMLElement): void {
    Mdd.injectCSS(
      'my-ai',
      `
      .myai-wrap { display: flex; flex-direction: column; gap: 14px; }
      .myai-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .myai-lede { margin: 0; color: var(--text-secondary); font-size: var(--font-size-sm); flex: 1 1 240px; }
      .myai-actions { display: flex; align-items: center; gap: 8px; }
      /* 남음 ⟷ 사용 = 같은 수치의 다른 표현. 새로고침 옆에 붙여 보기 묶음으로 읽히게. */
      .myai-modes { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-pill); overflow: hidden; }
      .myai-mode { appearance: none; background: transparent; border: 0; color: var(--text-secondary); font-size: var(--font-size-2xs); padding: 4px 11px; cursor: pointer; }
      .myai-mode + .myai-mode { border-left: 1px solid var(--border); }
      .myai-mode--on { background: var(--accent, #a99bf5); color: var(--bg-primary); font-weight: 600; }
      .myai-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; align-items: start; }
      .myai-card { border: 1px solid var(--border); border-left: 4px solid var(--myai-accent); border-radius: var(--radius-md); background: var(--bg-secondary); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
      .myai-card--error { border-left-color: var(--text-tertiary); }
      .myai-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .myai-vendor { margin: 0; font-size: var(--font-size-md); font-weight: 700; letter-spacing: 0.01em; }
      .myai-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .myai-chip { font-size: var(--font-size-2xs); padding: 2px 7px; border-radius: var(--radius-pill); border: 1px solid var(--border); color: var(--text-secondary); white-space: nowrap; }
      .myai-chip--live { border-color: var(--success); color: var(--success); }
      .myai-chip--stale { border-style: dashed; cursor: help; }
      .myai-chip--plan { text-transform: uppercase; letter-spacing: 0.04em; }
      .myai-card-body { display: flex; flex-direction: column; gap: 12px; }
      /* 스냅샷은 라이브와 같은 무게로 보이면 안 된다. 눈에 먼저 들어오는 건 라이브 쪽. */
      .myai-card-body--stale { opacity: 0.82; }
      .myai-gauge { display: flex; flex-direction: column; gap: 5px; }
      .myai-gauge-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--font-size-sm); }
      .myai-left { font-variant-numeric: tabular-nums; }
      .myai-bar { position: relative; height: 8px; border-radius: var(--radius-pill); background: var(--bg-tertiary); overflow: hidden; }
      .myai-bar-fill { position: absolute; inset: 0 auto 0 0; border-radius: var(--radius-pill); transition: width 0.3s ease; }
      .myai-bar-fill--ok { background: var(--success); }
      .myai-bar-fill--warn { background: var(--warning); }
      .myai-bar-fill--danger { background: var(--error); }
      .myai-gauge-foot { display: flex; justify-content: space-between; gap: 8px; font-size: var(--font-size-2xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .myai-gauge-unknown { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
      .myai-reset { font-size: var(--font-size-2xs); color: var(--text-tertiary); white-space: nowrap; }
      .myai-count { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--font-size-sm); }
      .myai-count-value { font-size: var(--font-size-lg); font-variant-numeric: tabular-nums; }
      .myai-note, .myai-wall, .myai-error { margin: 0; font-size: var(--font-size-2xs); color: var(--text-tertiary); line-height: 1.5; }
      .myai-error { color: var(--error); }
      .myai-updated { font-size: var(--font-size-2xs); color: var(--text-tertiary); }
      `
    );

    const wrap = document.createElement('div');
    wrap.className = 'myai-wrap';

    const top = document.createElement('div');
    top.className = 'myai-top';
    const lede = document.createElement('p');
    lede.className = 'myai-lede';
    lede.textContent = t('my-ai.t01', undefined, '구독별 남은 양. 실시간으로 물어보고, 막히면 마지막으로 그 도구를 썼을 때의 값을 보여준다.');

    const actions = document.createElement('div');
    actions.className = 'myai-actions';

    // 보기 전환 = 같은 수치의 다른 표현. 새로고침이 필요 없으니 다시 그리기만 한다.
    const modeGroup = document.createElement('div');
    modeGroup.className = 'myai-modes';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', t('my-ai.mode.group', undefined, '게이지 보기'));
    const modeButtons: Array<{ mode: MeterMode; el: HTMLButtonElement }> = (
      [
        { mode: 'left' as MeterMode, label: t('my-ai.mode.left', undefined, '남음') },
        { mode: 'used' as MeterMode, label: t('my-ai.mode.used', undefined, '사용') }
      ]
    ).map(({ mode, label }) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'myai-mode';
      el.textContent = label;
      modeGroup.appendChild(el);
      return { mode, el };
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'btn btn-secondary btn-sm';
    refreshBtn.textContent = t('my-ai.t02', undefined, '새로고침');
    actions.append(modeGroup, refreshBtn);
    top.append(lede, actions);

    const cards = document.createElement('div');
    cards.className = 'myai-cards';

    const updated = document.createElement('div');
    updated.className = 'myai-updated';

    wrap.append(top, cards, updated);
    container.appendChild(wrap);

    if (!isDesktop()) {
      cards.innerHTML = '';
      const note = document.createElement('p');
      note.className = 'myai-note';
      note.textContent = t('my-ai.t03', undefined, '데스크톱 앱에서만 동작한다. 토큰과 로그가 이 컴퓨터에만 있다.');
      cards.appendChild(note);
      refreshBtn.disabled = true;
      modeGroup.hidden = true;
      return;
    }

    let cards_data: VendorCard[] = [];
    let fatal = '';

    function syncModeButtons(): void {
      for (const { mode, el } of modeButtons) {
        const on = mode === meterMode;
        el.classList.toggle('myai-mode--on', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    function paint(): void {
      syncModeButtons();
      if (fatal) {
        cards.innerHTML = `<p class="myai-error">${esc(errorText(fatal))}</p>`;
        return;
      }
      cards.innerHTML = cards_data.map(renderCard).join('');
    }

    for (const { mode, el } of modeButtons) {
      el.addEventListener('click', () => {
        if (meterMode === mode) return;
        writeMeterMode(mode);
        paint();
      });
    }

    let inFlight = false;

    function refresh(): void {
      if (inFlight) return;
      inFlight = true;
      refreshBtn.disabled = true;
      void invoke<VendorCard[]>('ai_quota_all')
        .then((list) => {
          cards_data = list;
          fatal = '';
        })
        .catch((e: unknown) => {
          fatal = e instanceof Error ? e.message : String(e);
        })
        .finally(() => {
          inFlight = false;
          refreshBtn.disabled = false;
          paint();
          updated.textContent = t('my-ai.t04', undefined, '방금 읽음');
        });
    }

    refreshBtn.addEventListener('click', refresh);
    paint();
    refresh();

    // 자동 갱신은 **보이는 동안만** 돈다. 숨은 탭에서 60초마다 깨우면 배터리만
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

    // 핫리로드로 위젯이 갈아 끼워질 때 타이머, 리스너가 쌓이면 안 된다
    // (blog CLAUDE.md § KarmoLab 화면 작업).
    Toolbox.onDispose?.(() => {
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  function buildEnvironment(container: HTMLElement): void {
    Mdd.injectCSS('my-ai-environment', `
      .myai-environment-audit { margin-bottom: 28px; }
      .myai-env-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:12px; }
      .myai-env-head h3, .myai-connections h3 { margin:0 0 5px; }
      .myai-env-head p { margin:0; color:var(--text-secondary); font-size:var(--font-size-sm); }
      .myai-env-head > span { color:var(--text-tertiary); font-size:var(--font-size-xs); white-space:nowrap; }
      .myai-env-scroll { overflow-x:auto; }
      .myai-env-table { width:100%; border-collapse:collapse; min-width:680px; }
      .myai-env-table th, .myai-env-table td { padding:11px 12px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
      .myai-env-table thead th { color:var(--text-secondary); font-size:var(--font-size-xs); }
      .myai-env-table tbody th { width:24%; }
      .myai-env-table strong, .myai-env-table small { display:block; }
      .myai-env-table small { margin-top:4px; color:var(--text-tertiary); font-size:var(--font-size-2xs); line-height:1.35; }
      .myai-env-state { display:inline-block; border:1px solid var(--border); border-radius:var(--radius-pill); padding:2px 7px; font-size:var(--font-size-2xs); }
      .myai-env-state--applied { color:var(--success); border-color:var(--success); }
      .myai-env-state--partial { color:var(--warning); border-color:var(--warning); }
      .myai-env-state--missing { color:var(--error); border-color:var(--error); }
      .myai-environment-controls { border-top:1px solid var(--border); padding-top:24px; }
      .myai-connection-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; margin:16px 0; }
      .myai-connection-card { border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; background:var(--bg-tertiary); }
      .myai-connection-card strong, .myai-connection-card small { display:block; }
      .myai-connection-card small { color:var(--text-tertiary); margin-top:5px; }
    `);
    const audit = document.createElement('section');
    audit.className = 'myai-environment-audit';
    audit.textContent = t('my-ai.environment_loading', undefined, '환경을 검사하는 중...');
    const controls = document.createElement('section');
    controls.className = 'myai-environment-controls';
    container.append(audit, controls);

    void invoke<EnvironmentAudit>('ai_environment_audit')
      .then((result) => {
        const vendors = ['claude', 'codex', 'grok'] as const;
        const statusLabel = (status: EnvironmentVendorState['status']): string => {
          if (status === 'applied') return t('my-ai.status.applied', undefined, '적용');
          if (status === 'partial') return t('my-ai.status.partial', undefined, '일부');
          if (status === 'missing') return t('my-ai.status.missing', undefined, '미적용');
          return t('my-ai.status.unknown', undefined, '확인 필요');
        };
        const rows = result.features.map((feature) => {
          const cells = vendors.map((vendor) => {
            const found = feature.vendors.find((item) => item.vendor === vendor);
            if (!found) return '<td>. </td>';
            const evidence = found.evidence.map(esc).join('\n');
            return `<td>
              <span class="myai-env-state myai-env-state--${found.status}">${esc(statusLabel(found.status))}</span>
              <small title="${evidence}">${esc(found.reason)}</small>
            </td>`;
          }).join('');
          return `<tr><th scope="row"><strong>${esc(feature.label)}</strong><small>${esc(feature.description)}</small></th>${cells}</tr>`;
        }).join('');
        audit.innerHTML = `
          <div class="myai-env-head">
            <div><h3>${esc(t('my-ai.environment_title', undefined, 'AI 개발환경'))}</h3>
            <p>${esc(t('my-ai.environment_desc', undefined, '제품 지원과 로컬 배선을 구분해 검사한 결과다. 계정, 클라우드에서만 알 수 있는 값은 확인 필요로 남긴다. 상태에 마우스를 올리면 근거 경로를 볼 수 있다.'))}</p></div>
            <span>${esc(ago(result.checked_at))}</span>
          </div>
          <div class="myai-env-scroll"><table class="myai-env-table">
            <thead><tr><th>${esc(t('my-ai.environment_feature', undefined, '기능'))}</th><th>Claude</th><th>Codex</th><th>Grok</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
      })
      .catch((error: unknown) => {
        audit.textContent = error instanceof Error ? error.message : String(error);
      });

    void loadNamespace('claude-env').then(() => {
      const render = panels().claudeEnvironment;
      if (!render) {
        controls.textContent = t('my-ai.panel_missing', undefined, '환경 설정 패널을 불러오지 못했다.');
        return;
      }
      render(controls);
    });
  }

  function buildConnections(container: HTMLElement): void {
    container.textContent = t('my-ai.loading_connections', undefined, '공급자 연결을 읽는 중...');
    void Promise.all([
      Toolbox.ensureScript?.('root/gemini') ?? Promise.resolve(),
      loadNamespace('gemini')
    ]).then(() => {
      if (typeof Gemini === 'undefined') {
        container.textContent = t('my-ai.connections_unavailable', undefined, '공급자 연결 설정을 불러오지 못했다.');
        return;
      }
      const geminiReady = Boolean(Gemini.getApiKey());
      const vertexReady = Boolean(Gemini.getVertexApiKey());
      const state = (ready: boolean): string => ready
        ? t('my-ai.connection.ready', undefined, '연결됨')
        : t('my-ai.connection.missing', undefined, '설정 필요');
      container.innerHTML = `
        <section class="myai-connections">
          <h3>${esc(t('my-ai.connections_title', undefined, '공유 AI 연결 상태'))}</h3>
          <p class="myai-note">${esc(t('my-ai.connections_desc', undefined, '여러 위젯이 함께 쓰는 API 키는 환경 설정에서 관리한다. 여기서는 연결 여부만 보여준다.'))}</p>
          <div class="myai-connection-grid">
            <div class="myai-connection-card"><strong>Gemini AI Studio</strong><span class="myai-env-state myai-env-state--${geminiReady ? 'applied' : 'missing'}">${esc(state(geminiReady))}</span><small>${esc(t('my-ai.connection.gemini_consumers', undefined, '채팅, 텍스트, 이미지 기능에서 공유'))}</small></div>
            <div class="myai-connection-card"><strong>Google Vertex AI</strong><span class="myai-env-state myai-env-state--${vertexReady ? 'applied' : 'missing'}">${esc(state(vertexReady))}</span><small>${esc(t('my-ai.connection.vertex_consumers', undefined, 'Vertex 텍스트, 이미지 기능에서 공유'))}</small></div>
          </div>
          <button type="button" class="btn btn-primary" data-open-api-settings>${esc(t('my-ai.connection.manage', undefined, '환경 설정에서 API 관리'))}</button>
        </section>`;
      container.querySelector<HTMLButtonElement>('[data-open-api-settings]')?.addEventListener('click', () => {
        Toolbox.switchPage('settings');
        window.setTimeout(() => { Toolbox.switchTab?.('settings-display'); }, 150);
      });
    }).catch((error: unknown) => {
      container.textContent = error instanceof Error ? error.message : String(error);
    });
  }

  Toolbox.register({
    id: 'my-ai',
    title: t('widgets.my-ai.title', undefined, '내 AI'),
    category: 'ai',
    desktopOnly: true,
    desc: t('widgets-desc.my-ai.desc', undefined, '내가 쓰는 AI의 구독, 환경, 연결 상태를 한곳에서'),
    layout: 'form',
    icon: '<path d="M4 19a8 8 0 1116 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 19l4.5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    tabs: [
      {
        id: 'quota-main',
        label: t('my-ai.tab.panel', undefined, '현황'),
        build: function (container: HTMLElement): void {
          void loadNamespace('my-ai').then(function () {
            buildQuota(container);
          });
        }
      },
      {
        id: 'my-ai-environment',
        label: t('my-ai.tab.environment', undefined, '환경'),
        build: buildEnvironment
      },
      {
        id: 'my-ai-connections',
        label: t('my-ai.tab.connections', undefined, '연결'),
        build: buildConnections
      }
    ]
  });
})();
