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
(function (): void {
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
        recentDays: { day: string; visits: number; people: number }[];
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

        .plaza-section h3 { margin:0 0 4px; font-size:var(--font-size-md); color:var(--text-primary); }
        .plaza-section-note { margin:0 0 12px; font-size:11px; color:var(--text-tertiary); }

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
        return Number(value || 0).toLocaleString('ko-KR');
    }

    /** 도구 id → 사람이 읽는 이름. 모르면 id 그대로 (지어내지 않는다). */
    function toolTitle(toolId: string): string {
        const meta = (window.KARMOLAB_LAZY_META ?? []).find((m) => m.id === toolId);
        return meta?.title ?? toolId;
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
            '<div class="plaza-wrap"><p class="plaza-note">지금은 광장을 못 여네요. 숫자를 세는 서버(집 노트북 한 대)에 못 닿았습니다. 잠시 뒤에 다시 열어 주세요 — 도구는 그대로 쓸 수 있습니다.</p></div>';
    }

    /* ===== 방문 — 블로그의 Total / Today ===== */

    function renderVisits(visits: Visits | null): string {
        if (!visits || visits.total === 0) return '';
        const items = [
            { value: visits.total, label: '지금까지 방문', note: 'Total' },
            { value: visits.today, label: '오늘 방문', note: 'Today' },
            { value: visits.peopleToday, label: '오늘 다녀간 사람', note: '같은 사람은 하루 한 번' },
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
                return `<div class="plaza-spark-bar" data-today="${today}" title="${escapeHtml(d.day)} · 방문 ${num(d.visits)} · 사람 ${num(d.people)}"><i style="height:${Math.max(height, d.visits > 0 ? 6 : 0)}%"></i></div>`;
            })
            .join('');
        return `
            <section class="plaza-section">
                <h3>최근 2주</h3>
                <p class="plaza-section-note">막대 하나가 하루입니다. 맨 오른쪽이 오늘 · 가장 높은 날 ${num(max)}번</p>
                <div class="plaza-spark">${bars}</div>
                <div class="plaza-spark-axis"><span>${escapeHtml(days[0].day)}</span><span>오늘</span></div>
            </section>`;
    }

    /* ===== 도구 ===== */

    function renderToolSummary(pulse: Pulse): string {
        if (pulse.opensTotal === 0) return '';
        const items = [
            { value: pulse.opensTotal, label: '지금까지 도구 열림', note: 'Total' },
            { value: pulse.opensToday, label: '오늘 도구 열림', note: 'Today' },
            { value: pulse.toolsUsed, label: '실제로 쓰인 도구', note: '한 번도 안 열린 것은 안 셉니다' },
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
                    <a class="plaza-tool-name" href="/karmolab/t/${encodeURIComponent(t.toolId)}/">${escapeHtml(toolTitle(t.toolId))}</a>
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
                (rest > 0 ? `<button type="button" class="plaza-more" id="plazaMore">나머지 ${num(rest)}개 더 보기</button>` : '');
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
                <h3>커뮤니티</h3>
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
                <h4>여기서 세지 <em>않는</em> 것</h4>
                <ul>
                    <li><b>도구에 입력한 내용은 서버로 가지 않습니다.</b> 도구는 전부 브라우저 안에서 돕니다 — 파일도, 글도, 사진도 이 컴퓨터를 안 떠납니다.</li>
                    <li><b>IP 주소를 저장하지 않습니다.</b> 같은 사람인지만 알아보려고 되돌릴 수 없게 섞은 열쇠를 쓰고, 그것도 오늘치만 들고 있다가 날이 바뀌면 버립니다.</li>
                    <li><b>추적용 광고·분석 도구가 없습니다.</b> 위 숫자는 우리 서버가 직접 센 것뿐입니다.</li>
                    <li>같은 사람이 30분 안에 여러 번 움직인 것은 한 번으로 셉니다 — 수를 부풀리지 않으려고요.</li>
                </ul>
            </div>
        </section>`;

    async function buildOverview(container: HTMLElement): Promise<void> {
        container.innerHTML = '<div class="plaza-wrap"><p class="plaza-note">불러오는 중…</p></div>';
        const [rawStats, rawBoards] = await Promise.all([api('/kl/tools/stats'), api('/kl/boards')]);
        if (!container.isConnected) return;
        if (!rawStats) {
            offline(container);
            return;
        }
        const stats = rawStats as { tools: ToolStat[]; pulse: Pulse; visits?: Visits };
        const boards = (rawBoards as { boards?: Board[] } | null)?.boards ?? null;
        const visits = stats.visits ?? null;

        const hasTools = stats.tools.some((t) => t.recent > 0);
        const body = [
            `<p class="plaza-lead">이 사이트의 숫자를 전부 열어 둡니다. 아래는 서버가 실제로 센 값이고, 손으로 적었거나 부풀린 수는 하나도 없습니다.</p>`,
            visits ? `<section class="plaza-section"><h3>방문</h3><p class="plaza-section-note">첫 화면만 보고 가도 한 명입니다</p>${renderVisits(visits)}</section>` : '',
            renderSpark(visits),
            stats.pulse.opensTotal > 0
                ? `<section class="plaza-section"><h3>도구</h3><p class="plaza-section-note">도구를 연 횟수입니다 — 무엇을 입력했는지는 서버가 모릅니다</p>${renderToolSummary(stats.pulse)}</section>`
                : '',
            hasTools
                ? `<section class="plaza-section"><h3>많이 쓰인 도구</h3><p class="plaza-section-note">최근 7일 순 · 오른쪽은 「7일 / 전체」</p><div id="plazaTools"></div></section>`
                : '',
            renderBoards(boards),
            OPENNESS,
        ]
            .filter(Boolean)
            .join('');

        container.innerHTML = `<div class="plaza-wrap">${body}</div>`;
        if (hasTools) renderTools(container, stats.tools);
    }

    Toolbox.register({
        id: 'plaza',
        title: '광장',
        category: 'tool',
        desc: '이 사이트의 숫자를 전부 공개하는 자리 — 방문 · 도구 · 커뮤니티, 전부 실측',
        layout: 'form',
        icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3.5 12h17M12 3.2c2.4 2.6 2.4 14 0 17.6M12 3.2c-2.4 2.6-2.4 14 0 17.6" stroke="currentColor" stroke-width="1.2" fill="none"/>',
        // 글판은 여기 두지 않는다 — 커뮤니티(`/karmolab/c/`)가 제 페이지로 갖는다.
        // 같은 것을 두 곳에 두면 한쪽은 반드시 낡고, 어느 쪽이 진짜인지 아무도 모르게 된다.
        tabs: [{ id: 'plaza-main', label: '통계', build: buildOverview }],
    });
})();
