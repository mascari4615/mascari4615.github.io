/**
 * 광장 (TASK-KL-098 Cycle 2) — 남의 흔적이 보이는 자리.
 *
 * 왜 있나: 도구는 혼자 쓰는 것이라 아무리 사람이 와도 사이트는 늘 비어 보였다.
 * 여기에 실제로 일어난 일만 모은다 — 어느 도구가 쓰였는지, 사람들이 뭘 만들어 달라 했는지,
 * 어디에 표가 몰렸는지.
 *
 * 지어낸 수는 한 개도 없다. 그래서 초반에는 작을 것이고, 작은 게 맞다.
 * 대신 **아직 아무 일도 안 일어난 칸은 숫자 0 을 띄우지 않고 자리 자체를 안 만든다** —
 * 0 이 늘어선 화면은 「비어 있다」가 아니라 「죽어 있다」로 읽힌다.
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
    interface RequestItem {
        id: string;
        text: string;
        authorHandle: string;
        createdAt: string;
        votes: number;
        status: 'open' | 'planned' | 'done' | 'declined';
        reply: string | null;
        votedByMe: boolean;
    }

    const STATUS_LABEL: Record<RequestItem['status'], string> = {
        open: '받는 중',
        planned: '만들 예정',
        done: '만들었음',
        declined: '안 만듦',
    };

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
        .plaza-req { border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:8px;
            display:flex; gap:12px; align-items:flex-start; }
        .plaza-vote { flex:0 0 auto; min-width:52px; padding:6px 0; border-radius:8px; cursor:pointer;
            border:1px solid var(--border); background:transparent; color:var(--text-secondary);
            font-size:var(--font-size-xs); line-height:1.2; text-align:center; }
        .plaza-vote strong { display:block; font-size:var(--font-size-sm); }
        .plaza-vote[data-voted="1"] { border-color:var(--accent); color:var(--accent); }
        .plaza-vote[disabled] { cursor:default; opacity:.65; }
        .plaza-req-body { min-width:0; flex:1; }
        .plaza-req-text { font-size:var(--font-size-sm); color:var(--text-primary); word-break:break-word; }
        .plaza-req-meta { margin-top:4px; font-size:var(--font-size-xs); color:var(--text-tertiary); }
        .plaza-req-reply { margin-top:8px; padding:8px 10px; border-left:2px solid var(--accent);
            background:var(--bg-secondary); font-size:var(--font-size-xs); color:var(--text-secondary); }
        .plaza-tag { display:inline-block; margin-left:6px; padding:1px 7px; border-radius:20px;
            border:1px solid var(--border); font-size:10px; color:var(--text-secondary); }
        .plaza-form { display:flex; gap:8px; margin-bottom:14px; }
        .plaza-form input { flex:1; min-width:0; }
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

    function relativeDay(iso: string): string {
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return '';
        const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
        if (days <= 0) return '오늘';
        if (days === 1) return '어제';
        return `${days}일 전`;
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

    function renderPulse(pulse: Pulse): string {
        // 아직 아무도 안 쓴 상태면 맥박 자리를 통째로 안 그린다 — 0 세 개는 죽은 화면이다.
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

    function renderRequests(data: { requests: RequestItem[]; signedIn: boolean; maxLength: number }): string {
        const form = data.signedIn
            ? `<div class="plaza-form">
                   <input type="text" id="plazaReqText" name="plazaReqText" maxlength="${data.maxLength}"
                          placeholder="어떤 도구가 있었으면 하나요?" aria-label="도구 요청 한 줄">
                   <button type="button" class="btn btn-primary" id="plazaReqSubmit">올리기</button>
               </div>`
            : `<p class="plaza-note">로그인하면 요청을 올리고 표를 줄 수 있습니다. (내 정보 → 디스코드로 시작하기)</p>`;

        const list = data.requests.length
            ? data.requests
                  .map(
                      (r) => `
                <div class="plaza-req">
                    <button type="button" class="plaza-vote" data-id="${escapeHtml(r.id)}" data-voted="${r.votedByMe ? '1' : '0'}"
                            ${data.signedIn ? '' : 'disabled'} aria-label="이 요청에 표 주기">
                        <strong>${r.votes}</strong>표
                    </button>
                    <div class="plaza-req-body">
                        <div class="plaza-req-text">${escapeHtml(r.text)}${
                            r.status === 'open' ? '' : `<span class="plaza-tag">${STATUS_LABEL[r.status]}</span>`
                        }</div>
                        <div class="plaza-req-meta">@${escapeHtml(r.authorHandle)} · ${relativeDay(r.createdAt)}</div>
                        ${r.reply ? `<div class="plaza-req-reply">${escapeHtml(r.reply)}</div>` : ''}
                    </div>
                </div>`,
                  )
                  .join('')
            : '<p class="plaza-note">아직 올라온 요청이 없습니다. 첫 번째가 되어 주세요.</p>';

        return `<section class="plaza-section"><h3>도구 요청</h3>${form}${list}</section>`;
    }

    async function build(container: HTMLElement): Promise<void> {
        container.innerHTML = '<div class="plaza-wrap"><p class="plaza-note">불러오는 중…</p></div>';

        const [statsRaw, requestsRaw] = await Promise.all([api('/kl/tools/stats'), api('/kl/requests')]);
        if (!statsRaw || !requestsRaw) {
            // 서버가 죽은 것과 「아무 일도 없다」는 다르다. 섞어서 말하지 않는다.
            container.innerHTML =
                '<div class="plaza-wrap"><p class="plaza-note">지금은 광장을 못 여네요. 잠시 뒤에 다시 열어 주세요. (도구는 그대로 쓸 수 있습니다.)</p></div>';
            return;
        }

        const stats = statsRaw as { tools: ToolStat[]; pulse: Pulse };
        const requests = requestsRaw as { requests: RequestItem[]; signedIn: boolean; maxLength: number };

        container.innerHTML = `<div class="plaza-wrap">
            ${renderPulse(stats.pulse)}
            ${renderTools(stats.tools)}
            ${renderRequests(requests)}
        </div>`;

        container.querySelectorAll<HTMLButtonElement>('.plaza-vote').forEach((button) => {
            button.addEventListener('click', async () => {
                button.disabled = true;
                const result = await api(`/kl/requests/${encodeURIComponent(button.dataset.id ?? '')}/vote`, {
                    method: 'POST',
                });
                if (!result) {
                    button.disabled = false;
                    Toolbox.showToast?.('표를 못 넘겼어요. 잠시 뒤에 다시 눌러 주세요.');
                    return;
                }
                void build(container);
            });
        });

        const submit = container.querySelector<HTMLButtonElement>('#plazaReqSubmit');
        const input = container.querySelector<HTMLInputElement>('#plazaReqText');
        submit?.addEventListener('click', async () => {
            const text = (input?.value ?? '').trim();
            if (text.length < 2) {
                Toolbox.showToast?.('한 줄만 적어 주세요.');
                return;
            }
            submit.disabled = true;
            const result = await api('/kl/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            submit.disabled = false;
            if (!result) {
                // 하루 상한에 걸린 경우도 여기로 온다 — 왜 막혔는지 사람 말로 알린다.
                Toolbox.showToast?.('못 올렸어요. 하루에 올릴 수 있는 개수를 넘었거나, 잠시 연결이 끊겼습니다.');
                return;
            }
            void build(container);
        });
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') submit?.click();
        });
    }

    Toolbox.register({
        id: 'plaza',
        title: '광장',
        category: 'tool',
        desc: '지금 어떤 도구가 쓰이는지, 사람들이 뭘 만들어 달라 했는지 — 실제로 일어난 일만',
        layout: 'form',
        icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3.5 12h17M12 3.2c2.4 2.6 2.4 14 0 17.6M12 3.2c-2.4 2.6-2.4 14 0 17.6" stroke="currentColor" stroke-width="1.2" fill="none"/>',
        tabs: [{ id: 'plaza-main', label: '광장', build }],
    });
})();
