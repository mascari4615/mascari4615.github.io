/**
 * 남이 만든 도구 (TASK-KL-183 H) — 창작자 층.
 *
 * 표(KL-150)·흐름(KL-181) 다음은 **도구 자체**다. 여기서는 남의 코드를 내 브라우저에서 돌린다 —
 * 그래서 「어떻게 막을까」가 기능보다 먼저다.
 *
 * 모래상자 규칙 (하나라도 빠지면 안 하느니만 못하다):
 *  ① `sandbox="allow-scripts"` — **`allow-same-origin` 을 안 준다.** 그 순간 그 안의 코드는
 *     우리 출처가 아니게 되어 우리 쿠키·저장소·계정에 손댈 수 없다.
 *  ② CSP `connect-src 'none'` — 바깥으로 아무것도 못 보낸다. 남의 글을 어디로 실어 나르는 일이
 *     애초에 안 된다.
 *  ③ `srcdoc` 으로 넣는다 — 우리 주소로 뜨지 않으므로 우리 화면을 흉내 낼 수 없다.
 *  ④ 실행은 **누른 뒤에만**. 목록을 여는 것만으로 남의 코드가 도는 일은 없다.
 */
(function (): void {
    type UserTool = {
        id: string;
        title: string;
        ownerHandle: string;
        source?: string;
        listed: boolean;
        runs: number;
    };

    Mdd.injectCSS('usertool-page', `
        .ut-wrap { display:flex; flex-direction:column; gap:18px; }
        .ut-lead { margin:0; font-size:var(--font-size-sm); color:var(--text-secondary); }
        .ut-warn { margin:0; padding:10px 14px; border-radius:var(--radius-md); font-size:var(--font-size-xs);
            border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-secondary); }
        .ut-list { display:flex; flex-direction:column; gap:10px; }
        .ut-card { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:13px 15px;
            border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .ut-card h4 { margin:0; flex:1 1 160px; font-size:var(--font-size-sm); color:var(--text-primary); }
        .ut-meta { font-size:11px; color:var(--text-tertiary); }
        .ut-btn { padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; font-size:var(--font-size-xs);
            border:1px solid var(--border); background:transparent; color:var(--text-secondary); }
        .ut-btn:hover { border-color:var(--accent); color:var(--text-primary); }
        .ut-btn-go { background:var(--accent); border-color:var(--accent); color:var(--bg-primary); font-weight:600; }
        .ut-make { display:flex; flex-direction:column; gap:8px; padding:14px; border:1px solid var(--border);
            border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .ut-make input, .ut-make textarea { padding:8px 10px; border-radius:8px; border:1px solid var(--border);
            background:var(--bg-tertiary); color:var(--text-primary); font:inherit; font-size:var(--font-size-xs); }
        .ut-make textarea { min-height:160px; font-family:var(--font-mono, monospace); }
        .ut-stage { border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; background:#fff; }
        .ut-stage iframe { display:block; width:100%; height:420px; border:0; }
        .ut-stage-head { display:flex; align-items:center; gap:10px; padding:8px 12px;
            background:var(--bg-tertiary); font-size:var(--font-size-xs); color:var(--text-secondary); }
    `);

    const api = (): string | null => window.KarmoAccount?.apiBase ?? null;

    function escapeHtml(value: string): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 모래상자 한 장 — 이 함수가 이 기능의 안전 전부다. */
    function runInSandbox(host: HTMLElement, tool: UserTool): void {
        host.innerHTML = `
            <div class="ut-stage">
                <div class="ut-stage-head">
                    <span>${escapeHtml(tool.title)} · @${escapeHtml(tool.ownerHandle)}</span>
                    <span class="ut-meta">이 상자 안에서만 돕니다 — 바깥과 연결되지 않고, 계정·저장소에 못 닿습니다</span>
                    <button type="button" class="ut-btn" data-stop>닫기</button>
                </div>
                <iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="${escapeHtml(tool.title)}"></iframe>
            </div>`;
        const frame = host.querySelector('iframe');
        if (frame) {
            /* CSP 를 문서 안에 박아 넣는다 — 바깥으로 나가는 길과 끌어오는 길을 둘 다 막는다.
             * `connect-src 'none'` 이 없으면 남의 글이 어디로든 실려 갈 수 있다. */
            frame.srcdoc =
                '<!doctype html><meta charset="utf-8">' +
                '<meta http-equiv="Content-Security-Policy" content="' +
                "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; " +
                "script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'\">" +
                '<style>body{font-family:system-ui,sans-serif;margin:12px}</style>' +
                (tool.source ?? '');
        }
        host.querySelector('[data-stop]')?.addEventListener('click', () => {
            host.innerHTML = '';
        });
        const base = api();
        if (base) void fetch(`${base}/kl/tools/user/${encodeURIComponent(tool.id)}/run`, { method: 'POST' }).catch(() => {});
    }

    async function loadAll(): Promise<{ listed: UserTool[]; mine: UserTool[] }> {
        const base = api();
        if (!base) return { listed: [], mine: [] };
        const [a, b] = await Promise.all([
            fetch(`${base}/kl/tools/user`).then((r) => (r.ok ? r.json() : { tools: [] })).catch(() => ({ tools: [] })),
            fetch(`${base}/kl/tools/mine`, { credentials: 'include' })
                .then((r) => (r.ok ? r.json() : { tools: [] }))
                .catch(() => ({ tools: [] })),
        ]);
        return { listed: a.tools ?? [], mine: b.tools ?? [] };
    }

    function cardHtml(tool: UserTool, mine: boolean): string {
        return `
            <div class="ut-card">
                <h4>${escapeHtml(tool.title)}</h4>
                <span class="ut-meta">@${escapeHtml(tool.ownerHandle)} · ${tool.runs}번 돌았음${mine && !tool.listed ? ' · 목록에 안 올림' : ''}</span>
                <button type="button" class="ut-btn ut-btn-go" data-run="${escapeHtml(tool.id)}">열기</button>
                ${mine
                    ? `<button type="button" class="ut-btn" data-list="${escapeHtml(tool.id)}" data-on="${tool.listed ? '0' : '1'}">${tool.listed ? '목록에서 내리기' : '목록에 올리기'}</button>
                       <button type="button" class="ut-btn" data-del="${escapeHtml(tool.id)}">지우기</button>`
                    : ''}
            </div>`;
    }

    async function build(container: HTMLElement): Promise<void> {
        container.innerHTML = '<div class="ut-wrap"><p class="ut-lead">불러오는 중…</p></div>';
        const { listed, mine } = await loadAll();
        if (!container.isConnected) return;
        const signedIn = !!window.KarmoAccount?.state.account;

        container.innerHTML = `
            <div class="ut-wrap">
                <p class="ut-lead">여기 도구는 <b>사람들이 만들어 올린 것</b>입니다. 우리가 만든 것이 아닙니다.</p>
                <p class="ut-warn">열면 <b>상자 안에서만</b> 돕니다: 바깥으로 아무것도 못 보내고, 로그인·저장소에 못 닿습니다.
                    그래도 <b>내용은 만든 사람의 것</b>이니 모르는 도구는 눈으로 한 번 보고 여세요.</p>

                <div class="user-section">
                    <h3>🧑‍🔧 사람들이 올린 것 (${listed.length})</h3>
                    <div class="ut-list">${listed.map((tool) => cardHtml(tool, false)).join('') || '<p class="ut-meta">아직 없어요.</p>'}</div>
                </div>

                <div id="utStage"></div>

                <div class="user-section">
                    <h3>✍️ 내가 만든 것 (${mine.length})</h3>
                    ${signedIn
                        ? `<div class="ut-list">${mine.map((tool) => cardHtml(tool, true)).join('') || '<p class="ut-meta">아직 없어요.</p>'}</div>
                           <div class="ut-make">
                               <input type="text" data-title placeholder="이름 (예: 주사위)" maxlength="32">
                               <textarea data-source placeholder="&lt;p&gt;안녕&lt;/p&gt;&lt;script&gt;…&lt;/script&gt; — 화면 한 장을 그대로 적으세요"></textarea>
                               <div><button type="button" class="ut-btn ut-btn-go" data-save>올리기</button>
                                   <span class="ut-meta">2만 자까지 · 한 사람 10개까지 · 올린 것은 기본이 비공개입니다</span></div>
                           </div>`
                        : '<p class="ut-meta">만들려면 로그인이 필요합니다. 남이 올린 것을 여는 것은 지금도 됩니다.</p>'}
                </div>
            </div>`;

        const stage = container.querySelector<HTMLElement>('#utStage');
        container.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => {
            button.addEventListener('click', async () => {
                const base = api();
                if (!base || !stage) return;
                try {
                    const res = await fetch(`${base}/kl/tools/user/${encodeURIComponent(button.dataset.run ?? '')}`);
                    if (!res.ok) throw new Error(String(res.status));
                    runInSandbox(stage, ((await res.json()) as { tool: UserTool }).tool);
                    stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch {
                    Toolbox.showToast?.('지금은 못 열었어요');
                }
            });
        });
        container.querySelectorAll<HTMLButtonElement>('[data-list]').forEach((button) => {
            button.addEventListener('click', async () => {
                const base = api();
                if (!base) return;
                await fetch(`${base}/kl/tools/user/${encodeURIComponent(button.dataset.list ?? '')}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listed: button.dataset.on === '1' }),
                }).catch(() => {});
                void build(container);
            });
        });
        container.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!confirm('이 도구를 지울까요?')) return;
                const base = api();
                if (!base) return;
                await fetch(`${base}/kl/tools/user/${encodeURIComponent(button.dataset.del ?? '')}`, {
                    method: 'DELETE',
                    credentials: 'include',
                }).catch(() => {});
                void build(container);
            });
        });
        container.querySelector('[data-save]')?.addEventListener('click', async () => {
            const base = api();
            const title = container.querySelector<HTMLInputElement>('[data-title]')?.value ?? '';
            const source = container.querySelector<HTMLTextAreaElement>('[data-source]')?.value ?? '';
            if (!base) return;
            if (!title.trim() || !source.trim()) {
                Toolbox.showToast?.('이름과 내용이 있어야 해요');
                return;
            }
            try {
                const res = await fetch(`${base}/kl/tools/user`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, source }),
                });
                Toolbox.showToast?.(res.ok ? '올렸어요 (기본은 비공개)' : '올리지 못했어요');
                if (res.ok) void build(container);
            } catch {
                Toolbox.showToast?.('올리지 못했어요');
            }
        });
    }

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('usertool'),
        tabs: [
            {
                id: 'usertool-main',
                label: '만든 도구',
                build: (container: HTMLElement) => {
                    // 로그인 상태는 늦게 온다 — 정해질 때 다시 그린다(흐름과 같은 규칙).
                    let drawnFor: string | null | undefined;
                    const account = window.KarmoAccount;
                    if (!account) {
                        void build(container);
                        return;
                    }
                    const off = account.subscribe((state) => {
                        if (state.loading) return;
                        const key = state.account?.handle ?? null;
                        if (drawnFor === key) return;
                        drawnFor = key;
                        void build(container);
                    });
                    Toolbox.onDispose?.(off);
                },
            },
        ],
    });
})();
