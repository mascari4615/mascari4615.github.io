/**
 * 광장 (TASK-KL-098) — 이 사이트의 숫자를 **전부 공개하는 자리**.
 *
 * 왜 있나 (사용자: "사이트에 대한 통계 등을 투명하게 공개"): 보통 사이트는 방문 수를 주인만
 * 본다. 그러면 오는 사람 입장에서 이곳은 늘 텅 빈 곳이다 — 옆에 누가 있는지 알 방법이 없으니까.
 * 숫자를 열어 두면 두 가지가 동시에 된다: 오는 사람은 「사람이 있구나」를 알고, 만든 쪽은
 * 「보여줄 수 있는 수」만 세게 된다. 감추면 부풀리게 된다.
 *
 * 세 가지 규칙:
 *  ① **지어낸 수는 한 개도 없다.** 전부 서버가 실제로 센 값이다.
 *  ② **아직 0인 칸은 자리 자체를 안 만든다.** 0이 늘어선 화면은 「비었다」가 아니라 「죽었다」로 읽힌다.
 *  ③ **무엇을 안 세는지도 같이 적는다.** 공개는 「좋은 수만 보여주기」가 아니다.
 *
 * 서버(집 노트북)에 못 닿으면 광장만 조용히 닫힌다. 도구는 그대로 돈다.
 */
import { t, loadNamespace, locale } from '../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    interface ToolStat {
        toolId: string;
        total: number;
        recent: number;
    }
    interface Pulse {
        toolsUsed: number;
        opensTotal: number;
        opensToday: number;
    }
    interface Visits {
        total: number;
        today: number;
        peopleToday: number;
        online?: number;
        recentDays: { day: string; visits: number; people: number }[];
        kinds?: {
            total: Record<string, number>;
            today: Record<string, number>;
        };
    }
    interface Recap {
        from: string;
        to: string;
        visits: { now: number; before: number };
        people: { now: number; before: number };
        toolOpens: { now: number; before: number };
        topTools: { toolId: string; opens: number }[];
        newTools: string[];
        posts: number;
        replies: number;
        topPost: { id: string; title: string | null; text: string; votes: number } | null;
    }
    interface Board {
        id: string;
        label: string;
        count: number;
        lastAt: string | null;
    }

    /** 순위표에 한 번에 몇 개까지. 나머지는 눌러서 편다 — 160개를 그냥 쏟으면 아무도 안 읽는다. */
    const TOP_N = 12;

    Mdd.injectCSS('plaza', `
        .plaza-wrap { display:flex; flex-direction:column; gap:26px; }
        .plaza-lead { margin:0; font-size:var(--font-size-sm); color:var(--text-secondary); line-height:1.6; }

        .plaza-big { display:flex; gap:12px; flex-wrap:wrap; }
        .plaza-big-item { flex:1 1 150px; padding:16px 18px; border:1px solid var(--border);
            border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .plaza-big-item strong { display:block; font-size:28px; font-weight:700; color:var(--accent);
            font-variant-numeric:tabular-nums; line-height:1.15; }
        .plaza-big-item span { display:block; margin-top:4px; font-size:var(--font-size-xs); color:var(--text-secondary); }
        .plaza-big-item em { display:block; margin-top:2px; font-size:11px; color:var(--text-tertiary);
            font-style:normal; }

        .plaza-leaders { width:100%; border-collapse:collapse; font-size:var(--font-size-xs); }
        .plaza-leaders th, .plaza-leaders td { padding:7px 10px; border-bottom:1px solid var(--border); text-align:left; }
        .plaza-leaders th { color:var(--text-secondary); font-weight:600; }
        .plaza-leaders td:first-child { width:28px; color:var(--text-tertiary); }
        .plaza-leaders td:not(:first-child):not(:nth-child(2)), .plaza-leaders th:not(:first-child):not(:nth-child(2)) { text-align:right; }
        .plaza-section h3 { margin:0 0 4px; font-size:var(--font-size-md); color:var(--text-primary); }
        .plaza-section-note { margin:0 0 12px; font-size:11px; color:var(--text-tertiary); }

        /* 방금 있었던 일 (TASK-KL-151 ③) — 숫자만 있는 광장은 「사람이 있다」까지만 말한다. */
        .plaza-feed { list-style:none; margin:0 0 6px; padding:0; }
        .plaza-feed li { padding:5px 0; font-size:var(--font-size-sm); color:var(--text-secondary);
            border-bottom:1px solid var(--border); }
        .plaza-feed li:last-child { border-bottom:0; }
        .plaza-feed b { color:var(--text-primary); }
        .plaza-dim { color:var(--text-tertiary); font-size:11px; }
        .plaza-sub { margin:14px 0 4px; font-size:var(--font-size-sm); color:var(--text-primary); }

        /* 14일 막대 — 빈 날도 자리를 지켜야 「요즘 조용하다」가 보인다. */
        .plaza-spark { display:flex; align-items:flex-end; gap:4px; height:64px;
            padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); }
        .plaza-spark-bar { flex:1; min-width:6px; border-radius:3px 3px 0 0; background:var(--bg-tertiary);
            position:relative; }
        .plaza-spark-bar i { position:absolute; left:0; right:0; bottom:0; border-radius:3px 3px 0 0;
            background:var(--accent); display:block; }
        .plaza-spark-bar[data-today="1"] i { background:var(--text-primary); }
        .plaza-spark-axis { display:flex; justify-content:space-between; margin-top:5px;
            font-size:10px; color:var(--text-tertiary); }

        .plaza-tools { display:flex; flex-direction:column; gap:6px; }
        .plaza-tool { display:flex; align-items:center; gap:10px; }
        .plaza-tool-rank { flex:0 0 22px; text-align:right; font-size:11px; color:var(--text-tertiary);
            font-variant-numeric:tabular-nums; }
        .plaza-tool-name { flex:0 0 34%; font-size:var(--font-size-xs); color:var(--text-primary);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:none; }
        .plaza-tool-name:hover { color:var(--accent); }
        .plaza-tool-bar { flex:1; height:8px; border-radius:4px; background:var(--bg-tertiary); overflow:hidden; }
        .plaza-tool-bar i { display:block; height:100%; background:var(--accent); }
        .plaza-tool-count { flex:0 0 84px; text-align:right; font-size:var(--font-size-xs);
            color:var(--text-secondary); font-variant-numeric:tabular-nums; }
        .plaza-more { margin-top:10px; padding:6px 14px; border:1px solid var(--border); border-radius:999px;
            background:transparent; color:var(--text-secondary); font:inherit; font-size:var(--font-size-xs);
            cursor:pointer; }
        .plaza-more:hover { border-color:var(--accent); color:var(--text-primary); }

        .plaza-rows { border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); overflow:hidden; }
        .plaza-row { display:flex; align-items:center; gap:12px; padding:10px 14px;
            border-top:1px solid var(--border); font-size:var(--font-size-xs); }
        .plaza-row:first-child { border-top:0; }
        .plaza-row-name { flex:1; color:var(--text-primary); }
        .plaza-row-value { color:var(--text-secondary); font-variant-numeric:tabular-nums; }

        .plaza-open { border:1px solid var(--border); border-radius:var(--radius-lg);
            background:var(--bg-secondary); padding:14px 16px; }
        .plaza-open h4 { margin:0 0 8px; font-size:var(--font-size-sm); color:var(--text-primary); }
        .plaza-open ul { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:5px; }
        .plaza-open li { font-size:var(--font-size-xs); color:var(--text-secondary); line-height:1.55; }

        /* 지금 보고 있는 사람 — 유일하게 「지금」을 말하는 줄이라 눈에 띄어야 한다. */
        .plaza-online { display:inline-flex; align-items:center; gap:8px; align-self:flex-start;
            padding:7px 14px; border:1px solid var(--border); border-radius:999px;
            background:var(--bg-secondary); font-size:var(--font-size-xs); color:var(--text-secondary); }
        .plaza-online b { color:var(--text-primary); }
        .plaza-online-dot { width:8px; height:8px; border-radius:50%; background:#4ade80; flex:0 0 auto;
            box-shadow:0 0 0 3px rgba(74,222,128,.18); animation:plaza-blink 2.4s ease-in-out infinite; }
        @keyframes plaza-blink { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        @media (prefers-reduced-motion: reduce) { .plaza-online-dot { animation:none; } }

        .plaza-kind-bar { flex:0 0 90px; height:6px; border-radius:3px; background:var(--bg-tertiary);
            overflow:hidden; }
        .plaza-kind-bar i { display:block; height:100%; background:var(--accent); }
        .plaza-kind-bar i[data-kind="search"] { background:var(--text-tertiary); }
        .plaza-kind-bar i[data-kind="ai"] { background:#a78bfa; }
        .plaza-kind-bar i[data-kind="unknown"] { background:var(--bg-hover); }
        .plaza-row-today { color:var(--text-tertiary); font-size:10px; margin-left:4px; }
        .plaza-caveat { margin-top:8px; line-height:1.6; }

        .plaza-up { color:#4ade80; font-weight:700; }
        .plaza-down { color:#f87171; font-weight:700; }
        .plaza-flat { color:var(--text-tertiary); }

        .plaza-note { font-size:var(--font-size-xs); color:var(--text-secondary); }
    `);

    function escapeHtml(value: unknown): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function num(value: unknown): string {
        return Number(value || 0).toLocaleString(locale());
    }

    /** 도구 id → 사람이 읽는 이름. 모르면 id 그대로 (지어내지 않는다). */
    function toolTitle(toolId: string): string | null {
        const meta = (window.KARMOLAB_LAZY_META ?? []).find((m) => m.id === toolId);
        return meta?.title ?? null;
    }
    /** 이름을 아는 것만. 모르는 id 를 그대로 내보내면 내부 사정이 새어 나온 것처럼 보인다. */
    function namedTools(ids: string[]): string[] {
        return ids.map((id) => toolTitle(id)).filter((t): t is string => Boolean(t));
    }

    /**
     * 명예의 전당 (TASK-KL-156 D4).
     *
     * 여기 뜨는 사람은 **본인이 프로필과 발자국을 열어 둔 사람뿐**이다 — 가린 사람은 서버가
     * 애초에 안 보낸다. 아무도 없으면 이 자리는 통째로 안 그려진다(빈 순위표는 초라할 뿐이다).
     */
    type Leader = { handle: string; displayName: string; streak: number; activeDays: number };

    function renderLeaders(leaders: Leader[] | null): string {
        if (!leaders || leaders.length === 0) return '';
        const rows = leaders
            .map(
                (row, index) =>
                    `<tr><td>${index + 1}</td>` +
                    `<td><a href="/karmolab/u/?h=${encodeURIComponent(row.handle)}">${escapeHtml(row.displayName)}</a></td>` +
                    `<td>${t('plaza.unit.days', { n: num(row.streak) })}</td><td>${t('plaza.unit.days', { n: num(row.activeDays) })}</td></tr>`,
            )
            .join('');
        return `
            <section class="plaza-section">
                <h3>${esc(t('plaza.t01'))}</h3>
                <p class="plaza-section-note">${esc(t('plaza.t02'))}</p>
                <table class="plaza-leaders">
                    <thead><tr><th></th><th>${esc(t('plaza.t03'))}</th><th>${esc(t('plaza.t04'))}</th><th>${esc(t('plaza.t05'))}</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
    }

    /**
     * 놀이 시즌 순위 (TASK-KL-182 F2).
     *
     * 놀이마다 순위판이 따로 있으면 「누가 제일 잘하나」에 답이 없다. 판마다 메달을 주고
     * **메달 수로** 줄 세운다 — 점수를 섞으면 단위가 다른 수를 더하는 셈이라 그 합은 뜻이 없다.
     */
    type SeasonRow = { handle: string; gold: number; silver: number; bronze: number; boards: number };

    function renderSeason(rows: SeasonRow[] | null): string {
        if (!rows || rows.length === 0) return '';
        const body = rows
            .map(
                (row, index) =>
                    `<tr><td>${index + 1}</td>` +
                    `<td><a href="/karmolab/u/?h=${encodeURIComponent(row.handle)}">@${escapeHtml(row.handle)}</a></td>` +
                    `<td>🥇 ${num(row.gold)}</td><td>🥈 ${num(row.silver)}</td><td>🥉 ${num(row.bronze)}</td></tr>`,
            )
            .join('');
        return `
            <section class="plaza-section">
                <h3>${esc(t('plaza.t06'))}</h3>
                <p class="plaza-section-note">${esc(t('plaza.t07'))}</p>
                <table class="plaza-leaders">
                    <thead><tr><th></th><th>${esc(t('plaza.t03'))}</th><th>${esc(t('plaza.t08'))}</th><th>${esc(t('plaza.t09'))}</th><th>${esc(t('plaza.t10'))}</th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </section>`;
    }

    async function api(path: string): Promise<unknown | null> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return null;
        try {
            const response = await fetch(`${base}${path}`, { credentials: 'include' });
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    function offline(container: HTMLElement): void {
        // 서버가 죽은 것과 「아무 일도 없다」는 다르다. 섞어서 말하지 않는다.
        container.innerHTML =
            `<div class="plaza-wrap"><p class="plaza-note">${esc(t('plaza.err.offline'))}</p></div>`;
    }

    /* ===== 방문 — 블로그의 Total / Today ===== */

    function renderVisits(visits: Visits | null): string {
        if (!visits || visits.total === 0) return '';
        const items = [
            { value: visits.total, label: t('plaza.t44'), note: 'Total' },
            { value: visits.today, label: t('plaza.t45'), note: 'Today' },
            { value: visits.peopleToday, label: t('plaza.t46'), note: t('plaza.t47') },
        ].filter((item) => item.value > 0);
        return `<div class="plaza-big">${items
            .map(
                (i) =>
                    `<div class="plaza-big-item"><strong>${num(i.value)}</strong><span>${escapeHtml(i.label)}</span><em>${escapeHtml(i.note)}</em></div>`,
            )
            .join('')}</div>`;
    }

    function renderSpark(visits: Visits | null): string {
        if (!visits || !visits.recentDays || visits.recentDays.length === 0) return '';
        const days = visits.recentDays;
        const max = Math.max(...days.map((d) => d.visits));
        if (max === 0) return '';
        const bars = days
            .map((d, index) => {
                const height = Math.round((d.visits / max) * 100);
                const today = index === days.length - 1 ? '1' : '0';
                return `<div class="plaza-spark-bar" data-today="${today}" title="${escapeHtml(d.day)} · ${t('plaza.spark.tip', { visits: num(d.visits), people: num(d.people) })}"><i style="height:${Math.max(height, d.visits > 0 ? 6 : 0)}%"></i></div>`;
            })
            .join('');
        return `
            <section class="plaza-section">
                <h3>${esc(t('plaza.t11'))}</h3>
                <p class="plaza-section-note">막대 하나가 하루입니다. 맨 오른쪽이 오늘 · 가장 높은 날 ${num(max)}번</p>
                <div class="plaza-spark">${bars}</div>
                <div class="plaza-spark-axis"><span>${escapeHtml(days[0].day)}</span><span>${esc(t('plaza.t12'))}</span></div>
            </section>`;
    }

    /* ===== 지금 보고 있는 사람 ===== */

    /**
     * 누적 수는 과거를 말하고, 이 수만이 **지금**을 말한다.
     * 0명이면 안 그린다 — 「지금 0명이 보고 있어요」는 오는 사람을 쫓아내는 문장이다.
     * (내가 보고 있으면 최소 1이므로, 0이 뜨는 건 서버가 아직 나를 못 센 순간뿐이다.)
     */
    function renderOnline(visits: Visits | null): string {
        const online = visits?.online ?? 0;
        if (online <= 0) return '';
        const others = online - 1;
        const line =
            others > 0
                ? `${t('plaza.online', { n: num(online) })}`
                : `지금은 혼자 보고 계세요`;
        return `<div class="plaza-online"><span class="plaza-online-dot"></span><span>${line}</span></div>`;
    }

    /* ===== 누가 왔나 (사람 · 검색엔진 · AI) ===== */

    const KIND_LABEL: Record<string, string> = {
        human: t('plaza.t03'),
        search: t('plaza.t48'),
        ai: 'AI',
        unknown: t('plaza.t49'),
    };

    /**
     * 사람 · 검색엔진 · AI 를 나눠서 공개한다 (사용자: "크롤러로 통계로 얼만큼인지 분류되면 좋을듯.
     * AI가 사이트 접속하는것도 만약 탐지 가능하면").
     *
     * 가려내는 근거는 **접속하는 쪽이 스스로 밝히는 이름** 하나뿐이다. 감추고 들어오면 못 잡는다 —
     * 그래서 그 사실을 숨기지 않고 화면에 같이 적는다. 못 알아본 것은 「알 수 없음」으로 가고
     * 사람 수에는 안 들어간다.
     */
    function renderKinds(visits: Visits | null): string {
        const kinds = visits?.kinds;
        if (!kinds) return '';
        const rows = Object.keys(KIND_LABEL)
            .map((key) => ({ key, label: KIND_LABEL[key], total: kinds.total[key] ?? 0, today: kinds.today[key] ?? 0 }))
            .filter((row) => row.total > 0);
        if (rows.length === 0) return '';
        const sum = rows.reduce((total, row) => total + row.total, 0);
        return `
            <section class="plaza-section">
                <h3>${esc(t('plaza.t13'))}</h3>
                <p class="plaza-section-note">${esc(t('plaza.t14'))}</p>
                <div class="plaza-rows">
                    ${rows
                        .map(
                            (row) => `<div class="plaza-row">
                                <span class="plaza-row-name">${escapeHtml(row.label)}</span>
                                <span class="plaza-kind-bar"><i style="width:${Math.max(2, Math.round((row.total / sum) * 100))}%" data-kind="${escapeHtml(row.key)}"></i></span>
                                <span class="plaza-row-value">${num(row.total)}${row.today ? ` <span class="plaza-row-today">${t('plaza.todayCount', { n: num(row.today) })}</span>` : ''}</span>
                            </div>`,
                        )
                        .join('')}
                </div>
                ${
                    // 가려내기는 나중에 붙였다. 그 전 방문은 종류를 모른다 — 그 사실을 안 적으면
                    // 위의 「방문 N」과 여기 합계가 안 맞는 것이 오류처럼 보인다.
                    (visits?.total ?? 0) > sum
                        ? `<p class="plaza-section-note">${t('plaza.beforeFilter', { n: num((visits?.total ?? 0) - sum) })}</p>`
                        : ''
                }
                <p class="plaza-section-note plaza-caveat">${esc(t('plaza.t15'))}</p>
            </section>`;
    }

    /* ===== 이번 주 KarmoLab ===== */

    /** 늘었나 줄었나 — 비교값 없는 수는 「많다/적다」를 말할 수 없다. */
    function delta(now: number, before: number): string {
        if (before === 0) return now > 0 ? `<span class="plaza-up">${esc(t('plaza.trend.new'))}</span>` : '';
        const diff = Math.round(((now - before) / before) * 100);
        if (diff === 0) return `<span class="plaza-flat">${esc(t('plaza.trend.flat'))}</span>`;
        return diff > 0
            ? `<span class="plaza-up">▲ ${diff}%</span>`
            : `<span class="plaza-down">▼ ${Math.abs(diff)}%</span>`;
    }

    function renderRecap(recap: Recap | null): string {
        if (!recap) return '';
        // 한 주 동안 아무 일도 없었으면 안 그린다. 0으로 채운 결산은 「죽은 사이트」의 증거가 된다.
        const quiet =
            recap.visits.now === 0 && recap.toolOpens.now === 0 && recap.posts === 0 && recap.replies === 0;
        if (quiet) return '';

        const lines: string[] = [];
        if (recap.people.now > 0) {
            lines.push(`<div class="plaza-row"><span class="plaza-row-name">${esc(t('plaza.t16'))}</span><span class="plaza-row-value">${t('plaza.unit.people', { n: num(recap.people.now) })} ${delta(recap.people.now, recap.people.before)}</span></div>`);
        }
        if (recap.toolOpens.now > 0) {
            lines.push(`<div class="plaza-row"><span class="plaza-row-name">${esc(t('plaza.t17'))}</span><span class="plaza-row-value">${t('plaza.unit.times', { n: num(recap.toolOpens.now) })} ${delta(recap.toolOpens.now, recap.toolOpens.before)}</span></div>`);
        }
        if (recap.topTools.length > 0) {
            const named = namedTools(recap.topTools.map((t) => t.toolId));
            if (named.length > 0) {
                lines.push(`<div class="plaza-row"><span class="plaza-row-name">${esc(t('plaza.t18'))}</span><span class="plaza-row-value">${named.map(escapeHtml).join(' · ')}</span></div>`);
            }
        }
        if (recap.newTools.length > 0) {
            const named = namedTools(recap.newTools);
            if (named.length > 0) {
                lines.push(`<div class="plaza-row"><span class="plaza-row-name">${esc(t('plaza.t19'))}</span><span class="plaza-row-value">${named.map(escapeHtml).join(' · ')}</span></div>`);
            }
        }
        if (recap.posts > 0 || recap.replies > 0) {
            lines.push(`<div class="plaza-row"><span class="plaza-row-name">${esc(t('plaza.t20'))}</span><span class="plaza-row-value">${t('plaza.recap.posts', { posts: num(recap.posts), replies: num(recap.replies) })}</span></div>`);
        }
        if (recap.topPost && recap.topPost.votes > 0) {
            const heading = recap.topPost.title || recap.topPost.text;
            lines.push(`<div class="plaza-row"><span class="plaza-row-name">${esc(t('plaza.t21'))}</span><span class="plaza-row-value">${escapeHtml(heading)} ${t('plaza.unit.votes', { n: num(recap.topPost.votes) })}</span></div>`);
        }
        if (lines.length === 0) return '';

        return `
            <section class="plaza-section">
                <h3>${esc(t('plaza.t22'))}</h3>
                <p class="plaza-section-note">${escapeHtml(recap.from)} ~ ${escapeHtml(recap.to)} · 지난주와 견줍니다</p>
                <div class="plaza-rows">${lines.join('')}</div>
            </section>`;
    }

    /* ===== 도구 ===== */

    function renderToolSummary(pulse: Pulse): string {
        if (pulse.opensTotal === 0) return '';
        const items = [
            { value: pulse.opensTotal, label: t('plaza.t52'), note: 'Total' },
            { value: pulse.opensToday, label: t('plaza.t53'), note: 'Today' },
            { value: pulse.toolsUsed, label: t('plaza.t54'), note: t('plaza.t55') },
        ].filter((item) => item.value > 0);
        return `<div class="plaza-big">${items
            .map(
                (i) =>
                    `<div class="plaza-big-item"><strong>${num(i.value)}</strong><span>${escapeHtml(i.label)}</span><em>${escapeHtml(i.note)}</em></div>`,
            )
            .join('')}</div>`;
    }

    function toolRows(tools: ToolStat[], max: number, from: number): string {
        return tools
            .map(
                (t, index) => `
                <div class="plaza-tool">
                    <div class="plaza-tool-rank">${from + index + 1}</div>
                    <a class="plaza-tool-name" href="/karmolab/t/${encodeURIComponent(t.toolId)}/">${escapeHtml(toolTitle(t.toolId) ?? t.toolId)}</a>
                    <div class="plaza-tool-bar"><i style="width:${Math.max(2, Math.round((t.recent / max) * 100))}%"></i></div>
                    <div class="plaza-tool-count">${num(t.recent)}회 / ${num(t.total)}</div>
                </div>`,
            )
            .join('');
    }

    function renderTools(container: HTMLElement, tools: ToolStat[]): void {
        const used = tools.filter((t) => t.recent > 0);
        const slot = container.querySelector('#plazaTools');
        if (!slot || used.length === 0) return;
        const max = used[0].recent;
        let shown = TOP_N;

        const draw = () => {
            const rest = used.length - shown;
            slot.innerHTML =
                `<div class="plaza-tools">${toolRows(used.slice(0, shown), max, 0)}</div>` +
                (rest > 0 ? `<button type="button" class="plaza-more" id="plazaMore">${t('plaza.more', { n: num(rest) })}</button>` : '');
            const more = slot.querySelector('#plazaMore');
            if (more) {
                (more as HTMLButtonElement).onclick = () => {
                    shown = used.length;
                    draw();
                };
            }
        };
        draw();
    }

    /* ===== 커뮤니티 ===== */

    function renderBoards(boards: Board[] | null): string {
        if (!boards) return '';
        const alive = boards.filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
        if (alive.length === 0) return '';
        const total = alive.reduce((sum, b) => sum + b.count, 0);
        return `
            <section class="plaza-section">
                <h3>${esc(t('plaza.t20'))}</h3>
                <p class="plaza-section-note">갤러리 ${num(boards.length)}개 · 글 ${num(total)}개</p>
                <div class="plaza-rows">
                    ${alive
                        .map(
                            (b) => `<div class="plaza-row">
                                <span class="plaza-row-name">${escapeHtml(b.label)}</span>
                                <span class="plaza-row-value">글 ${num(b.count)}개</span>
                            </div>`,
                        )
                        .join('')}
                </div>
            </section>`;
    }

    /* ===== 무엇을 안 세는가 (공개의 나머지 반쪽) ===== */

    const OPENNESS = `
        <section class="plaza-section">
            <div class="plaza-open">
                <h4>${esc(t('plaza.t23'))} <em>${esc(t('plaza.t24'))}</em> ${esc(t('plaza.t25'))}</h4>
                <ul>
                    <li><b>${esc(t('plaza.t26'))}</b> ${esc(t('plaza.t27'))}</li>
                    <li><b>${esc(t('plaza.t28'))}</b> ${esc(t('plaza.t29'))}</li>
                    <li><b>${esc(t('plaza.t30'))}</b> ${esc(t('plaza.t31'))}</li>
                    <li>${esc(t('plaza.t32'))}</li>
                </ul>
            </div>
        </section>`;


    /* ===== 방금 무슨 일이 있었나 (TASK-KL-151 ③) ===== */

    interface FeedPlay {
        game: string;
        variant: string | null;
        handle: string;
        score: number;
        at: string;
        best: boolean;
    }
    interface FeedGame {
        game: string;
        label: string;
        unit: string;
        better: 'high' | 'low';
        players: number;
        plays: number;
    }
    interface FeedPack {
        id: string;
        title: string;
        emoji: string;
        ownerHandle: string;
        items: number;
    }

    /** 「몇 분 전」. 시각을 그대로 적으면 살아 있는지 죽었는지가 안 읽힌다. */
    function ago(iso: string): string {
        const gap = Date.now() - new Date(iso).getTime();
        const min = Math.floor(gap / 60000);
        if (min < 1) return t('plaza.t56');
        if (min < 60) return t('plaza.ago.min', { n: min });
        const hour = Math.floor(min / 60);
        if (hour < 24) return t('plaza.ago.hour', { n: hour });
        return t('plaza.ago.day', { n: Math.floor(hour / 24) });
    }

    function renderFeed(
        feed: { plays?: FeedPlay[]; games?: FeedGame[]; packs?: FeedPack[] } | null
    ): string {
        if (!feed) return '';
        const games = new Map((feed.games ?? []).map((g) => [g.game, g]));
        const plays = (feed.plays ?? []).slice(0, 8);
        const packs = feed.packs ?? [];
        // 아직 아무도 안 놀았고 표도 없으면 **자리 자체를 안 만든다** — 0 이 늘어선 화면은
        // 「비었다」가 아니라 「죽었다」로 읽힌다 (이 파일의 규칙 ②).
        if (!plays.length && !packs.length) return '';

        const playRows = plays
            .map((p) => {
                const g = games.get(p.game);
                const label = g ? g.label : p.game;
                const unit = g ? g.unit : '';
                return `<li>${p.best ? '🏆 ' : ''}<b>${escapeHtml(p.handle)}</b> · ${escapeHtml(label)} ${p.score}${escapeHtml(unit)} <span class="plaza-dim">${ago(p.at)}</span></li>`;
            })
            .join('');
        const packRows = packs
            .map(
                (k) =>
                    `<li>${escapeHtml(k.emoji)} <b>${escapeHtml(k.title)}</b> <span class="plaza-dim">${t('plaza.unit.items', { n: k.items })} · ${escapeHtml(k.ownerHandle)}</span></li>`
            )
            .join('');

        return `
        <section class="plaza-section">
            <h3>${esc(t('plaza.t33'))}</h3>
            <p class="plaza-section-note">${esc(t('plaza.t34'))}</p>
            ${playRows ? `<ul class="plaza-feed">${playRows}</ul>` : ''}
            ${packRows ? `<h4 class="plaza-sub">${esc(t('plaza.t35'))}</h4><ul class="plaza-feed">${packRows}</ul>` : ''}
        </section>`;
    }

    async function buildOverview(container: HTMLElement): Promise<void> {
        container.innerHTML = `<div class="plaza-wrap"><p class="plaza-note">${esc(t('plaza.loading'))}</p></div>`;
        const [rawStats, rawBoards, rawRecap, rawLeaders, rawFeed, rawSeason] = await Promise.all([
            api('/kl/tools/stats'),
            api('/kl/boards'),
            api('/kl/recap'),
            // 명예의 전당 (TASK-KL-156 D4). 못 받아 와도 광장은 그대로 열린다.
            api('/kl/stats/leaders'),
            // 방금 있었던 일 (TASK-KL-151 ③). 마찬가지로 없으면 그 칸만 안 그린다.
            api('/kl/feed?limit=12'),
            // 놀이 시즌 순위 (TASK-KL-182 F2). 없으면 그 칸만 안 그린다.
            api('/kl/play/season'),
        ]);
        if (!container.isConnected) return;
        if (!rawStats) {
            offline(container);
            return;
        }
        const stats = rawStats as { tools: ToolStat[]; pulse: Pulse; visits?: Visits };
        const boards = (rawBoards as { boards?: Board[] } | null)?.boards ?? null;
        const recap = (rawRecap as { recap?: Recap } | null)?.recap ?? null;
        const visits = stats.visits ?? null;
        const leaders = (rawLeaders as { leaders?: Leader[] } | null)?.leaders ?? null;
        const season = (rawSeason as { ranking?: SeasonRow[] } | null)?.ranking ?? null;
        const feed = rawFeed as { plays?: FeedPlay[]; games?: FeedGame[]; packs?: FeedPack[] } | null;

        const hasTools = stats.tools.some((t) => t.recent > 0);
        const body = [
            `<p class="plaza-lead">${esc(t('plaza.t36'))}</p>`,
            renderOnline(visits),
            renderFeed(feed),
            visits ? `<section class="plaza-section"><h3>${esc(t('plaza.t37'))}</h3><p class="plaza-section-note">${esc(t('plaza.t38'))}</p>${renderVisits(visits)}</section>` : '',
            renderSpark(visits),
            renderLeaders(leaders),
            renderSeason(season),
            renderRecap(recap),
            renderKinds(visits),
            stats.pulse.opensTotal > 0
                ? `<section class="plaza-section"><h3>${esc(t('plaza.t39'))}</h3><p class="plaza-section-note">${esc(t('plaza.t40'))}</p>${renderToolSummary(stats.pulse)}</section>`
                : '',
            hasTools
                ? `<section class="plaza-section"><h3>${esc(t('plaza.t41'))}</h3><p class="plaza-section-note">${esc(t('plaza.t42'))}</p><div id="plazaTools"></div></section>`
                : '',
            renderBoards(boards),
            OPENNESS,
        ]
            .filter(Boolean)
            .join('');

        container.innerHTML = `<div class="plaza-wrap">${body}</div>`;
        if (hasTools) renderTools(container, stats.tools);
    }

    /* 메타는 `widgets-lazy-meta.ts` 한 곳에 산다 — 두 곳에 적으면 목록 이름과 화면 이름이 갈라진다. */
    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta('plaza'),
        // 글판은 여기 두지 않는다 — 커뮤니티(`/karmolab/c/`)가 제 페이지로 갖는다.
        // 같은 것을 두 곳에 두면 한쪽은 반드시 낡고, 어느 쪽이 진짜인지 아무도 모르게 된다.
        tabs: [
            {
                id: 'plaza-main',
                label: t('plaza.tab.stats', undefined, '통계'),
                /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 이 안에서 만들어진다. */
                build: function (container: HTMLElement): void {
                    void loadNamespace('plaza').then(function () {
                        buildOverview(container);
                    });
                },
            },
        ],
    });
})();
