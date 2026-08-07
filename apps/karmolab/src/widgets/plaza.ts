/**
 * 광장 (TASK-KL-098 Cycle 2~3) — 남의 흔적이 보이는 자리.
 *
 * 왜 있나: 도구는 혼자 쓰는 것이라 아무리 사람이 와도 사이트는 늘 비어 보였다.
 * 여기에 실제로 일어난 일만 모은다 — 어느 도구가 쓰였는지, 사람들이 무슨 이야기를 하는지,
 * 뭘 만들어 달라 했는지.
 *
 * 이야기(게시판)와 도구 요청은 **같은 글판**이다. 종류만 다르다 —
 * 이야기는 답글이 주인공이라 마지막 움직임 순으로 서고, 요청은 표가 주인공이라 표 순으로 선다.
 *
 * 지어낸 수는 한 개도 없다. 아직 아무 일도 안 일어난 칸은 0 을 띄우지 않고 자리 자체를
 * 안 만든다 — 0 이 늘어선 화면은 「비어 있다」가 아니라 「죽어 있다」로 읽힌다.
 *
 * 서버(노트북)에 못 닿으면 광장만 조용히 닫힌다. 도구는 그대로 돈다.
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

    Mdd.injectCSS('plaza', `
        .plaza-wrap { display:flex; flex-direction:column; gap:22px; }
        .plaza-pulse { display:flex; gap:12px; flex-wrap:wrap; }
        .plaza-pulse-item { flex:1 1 140px; padding:14px 16px; border:1px solid var(--border); border-radius:10px;
            background:var(--bg-secondary); }
        .plaza-pulse-item strong { display:block; font-size:24px; font-family:monospace; color:var(--accent); }
        .plaza-pulse-item span { font-size:var(--font-size-xs); color:var(--text-secondary); }
        .plaza-section h3 { margin:0 0 10px; font-size:var(--font-size-sm); }
        .plaza-tools { display:flex; flex-direction:column; gap:6px; }
        .plaza-tool { display:flex; align-items:center; gap:10px; }
        .plaza-tool-name { flex:0 0 40%; font-size:var(--font-size-xs); color:var(--text-primary);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .plaza-tool-bar { flex:1; height:8px; border-radius:4px; background:var(--bg-tertiary); overflow:hidden; }
        .plaza-tool-bar i { display:block; height:100%; background:var(--accent); }
        .plaza-tool-count { flex:0 0 72px; text-align:right; font-family:monospace; font-size:var(--font-size-xs);
            color:var(--text-secondary); }

        .plaza-note { font-size:var(--font-size-xs); color:var(--text-secondary); }
    `);

    function escapeHtml(value: string): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 도구 id → 사람이 읽는 이름. 모르면 id 그대로 (지어내지 않는다). */
    function toolTitle(toolId: string): string {
        const meta = (window.KARMOLAB_LAZY_META ?? []).find((m) => m.id === toolId);
        return meta?.title ?? toolId;
    }

    async function api(path: string, init: RequestInit = {}): Promise<unknown | null> {
        const base = window.KarmoAccount?.apiBase;
        if (!base) return null;
        try {
            const response = await fetch(`${base}${path}`, { ...init, credentials: 'include' });
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    function offline(container: HTMLElement): void {
        // 서버가 죽은 것과 「아무 일도 없다」는 다르다. 섞어서 말하지 않는다.
        container.innerHTML =
            '<div class="plaza-wrap"><p class="plaza-note">지금은 광장을 못 여네요. 잠시 뒤에 다시 열어 주세요. (도구는 그대로 쓸 수 있습니다.)</p></div>';
    }

    /* ===== 광장 첫 화면 — 사이트 맥박 + 요즘 열린 도구 ===== */

    function renderPulse(pulse: Pulse): string {
        if (pulse.opensTotal === 0) return '';
        const items = [
            { value: pulse.opensToday, label: '오늘 열린 도구' },
            { value: pulse.opensTotal, label: '지금까지 열린 도구' },
            { value: pulse.toolsUsed, label: '실제로 쓰인 도구 종류' },
        ].filter((item) => item.value > 0);
        return `<div class="plaza-pulse">${items
            .map((i) => `<div class="plaza-pulse-item"><strong>${i.value.toLocaleString()}</strong><span>${i.label}</span></div>`)
            .join('')}</div>`;
    }

    function renderTools(tools: ToolStat[]): string {
        const top = tools.filter((t) => t.recent > 0).slice(0, 8);
        if (top.length === 0) return '';
        const max = top[0].recent;
        return `
            <section class="plaza-section">
                <h3>요즘 많이 열린 도구 <span class="plaza-tag">최근 7일</span></h3>
                <div class="plaza-tools">
                    ${top
                        .map(
                            (t) => `
                        <div class="plaza-tool">
                            <a class="plaza-tool-name" href="/karmolab/t/${encodeURIComponent(t.toolId)}/">${escapeHtml(toolTitle(t.toolId))}</a>
                            <div class="plaza-tool-bar"><i style="width:${Math.round((t.recent / max) * 100)}%"></i></div>
                            <div class="plaza-tool-count">${t.recent.toLocaleString()}회</div>
                        </div>`,
                        )
                        .join('')}
                </div>
            </section>`;
    }

    async function buildOverview(container: HTMLElement): Promise<void> {
        container.innerHTML = '<div class="plaza-wrap"><p class="plaza-note">불러오는 중…</p></div>';
        const raw = await api('/kl/tools/stats');
        if (!raw) {
            offline(container);
            return;
        }
        const stats = raw as { tools: ToolStat[]; pulse: Pulse };
        const inner = `${renderPulse(stats.pulse)}${renderTools(stats.tools)}`;
        container.innerHTML = `<div class="plaza-wrap">${
            inner ||
            '<p class="plaza-note">아직 아무 도구도 안 열렸습니다. 도구를 하나 열고 오면 여기가 차기 시작합니다.</p>'
        }</div>`;
    }

    Toolbox.register({
        id: 'plaza',
        title: '광장',
        category: 'tool',
        desc: '지금 어떤 도구가 쓰이는지, 사람들이 무슨 이야기를 하는지 — 실제로 일어난 일만',
        layout: 'form',
        icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3.5 12h17M12 3.2c2.4 2.6 2.4 14 0 17.6M12 3.2c-2.4 2.6-2.4 14 0 17.6" stroke="currentColor" stroke-width="1.2" fill="none"/>',
        // 글판은 여기 두지 않는다 — 커뮤니티(`/karmolab/c/`)가 제 페이지로 갖는다.
        // 같은 것을 두 곳에 두면 한쪽은 반드시 낡고, 어느 쪽이 진짜인지 아무도 모르게 된다.
        tabs: [{ id: 'plaza-main', label: '지금', build: buildOverview }],
    });
})();
