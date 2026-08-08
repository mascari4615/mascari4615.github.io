/**
 * 도구 흐름 (TASK-KL-181) — 내 방식대로 이어 붙이고 저장한다.
 *
 * 도구가 160개인데 서로 못 만난다. 「이어서」(KL-133)가 한 쌍을 통하게 했지만 그건 그 자리에서
 * 한 번이다 — 같은 일을 매주 하는 사람은 매주 같은 순서를 손으로 다시 밟는다.
 *
 * 흐름은 **순서를 적어 둔 종이 한 장**이다. 파일도 결과도 서버에 안 올라간다. 실행은 이 화면이
 * 단계를 차례로 열어 주고, 앞 단계 결과는 지금 있는 「이어서」 배선으로 다음 단계에 넘어간다.
 */
(function (): void {
    type Step = { toolId: string; note?: string };
    type Flow = {
        id: string;
        title: string;
        ownerHandle: string | null;
        steps: Step[];
        runs: number;
        forkedFrom: string | null;
    };

    /** 실행 중인 흐름 — 화면을 옮겨 다녀야 하므로 이 창에 적어 둔다(탭을 닫으면 끝난다). */
    const RUN_KEY = 'karmolab_flow_run';

    Mdd.injectCSS('flow-page', `
        .flow-wrap { display:flex; flex-direction:column; gap:20px; }
        .flow-lead { margin:0; font-size:var(--font-size-sm); color:var(--text-secondary); }
        .flow-list { display:flex; flex-direction:column; gap:10px; }
        .flow-card { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:14px 16px;
            border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .flow-card h4 { margin:0; font-size:var(--font-size-sm); color:var(--text-primary); flex:1 1 160px; }
        .flow-steps { display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex:2 1 240px; }
        .flow-step { padding:4px 10px; border-radius:999px; border:1px solid var(--border);
            background:var(--bg-tertiary); font-size:var(--font-size-xs); color:var(--text-primary); }
        .flow-arrow { color:var(--text-tertiary); font-size:11px; }
        .flow-meta { font-size:11px; color:var(--text-tertiary); white-space:nowrap; }
        .flow-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .flow-btn { padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; font-size:var(--font-size-xs);
            border:1px solid var(--border); background:transparent; color:var(--text-secondary); }
        .flow-btn:hover { border-color:var(--accent); color:var(--text-primary); }
        .flow-btn-go { background:var(--accent); border-color:var(--accent); color:var(--bg-primary); font-weight:600; }
        .flow-make { display:flex; flex-direction:column; gap:10px; padding:16px; border:1px solid var(--border);
            border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .flow-make input, .flow-make select { padding:8px 10px; border-radius:8px; border:1px solid var(--border);
            background:var(--bg-tertiary); color:var(--text-primary); font:inherit; font-size:var(--font-size-xs); }
        .flow-make-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .flow-make-row > input { flex:1 1 180px; }
        .flow-draft { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-height:30px; }
        .flow-draft .flow-step { cursor:pointer; }
        .flow-draft .flow-step:hover { border-color:#dc2626; }
        .flow-empty { font-size:var(--font-size-xs); color:var(--text-tertiary); }
        /* 실행 띠 — 도구 화면 위에 얇게 뜬다. 도구를 가리면 흐름이 방해가 된다. */
        .flow-bar { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:65;
            display:flex; align-items:center; gap:12px; padding:10px 16px; border-radius:999px;
            border:1px solid var(--border); background:var(--bg-secondary); box-shadow:0 8px 24px rgba(0,0,0,.35); }
        .flow-bar-title { font-size:var(--font-size-xs); color:var(--text-primary); }
        .flow-bar-count { font-size:11px; color:var(--text-tertiary); }
    `);

    const api = (): string | null => window.KarmoAccount?.apiBase ?? null;

    function toolTitle(id: string): string {
        const meta = (window.KARMOLAB_LAZY_META_BY_ID ?? {})[id] as { title?: string } | undefined;
        return meta?.title || id;
    }

    function escapeHtml(value: string): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── 실행 ─────────────────────────────────────────────────────────
     *
     * 화면을 옮기며 도는 일이라 「지금 몇 번째인가」를 창에 적어 둔다. 탭을 닫으면 사라지는 게
     * 맞다 — 어제 시작한 흐름이 오늘 갑자기 이어지면 그건 자동화가 아니라 유령이다.
     */
    type RunState = { id: string; title: string; steps: Step[]; at: number };

    function readRun(): RunState | null {
        try {
            const raw = sessionStorage.getItem(RUN_KEY);
            return raw ? (JSON.parse(raw) as RunState) : null;
        } catch {
            return null;
        }
    }

    function writeRun(state: RunState | null): void {
        try {
            if (state) sessionStorage.setItem(RUN_KEY, JSON.stringify(state));
            else sessionStorage.removeItem(RUN_KEY);
        } catch {
            /* 저장이 막혀도 이번 단계는 돈다 */
        }
        paintBar();
    }

    function startRun(flow: Flow): void {
        writeRun({ id: flow.id, title: flow.title, steps: flow.steps, at: 0 });
        const base = api();
        if (base) {
            void fetch(`${base}/kl/flows/${encodeURIComponent(flow.id)}/run`, { method: 'POST', credentials: 'include' }).catch(() => {});
        }
        goStep(0);
    }

    function goStep(index: number): void {
        const run = readRun();
        if (!run || !run.steps[index]) return;
        writeRun({ ...run, at: index });
        Toolbox.switchPage?.(run.steps[index].toolId);
    }

    /** 실행 띠 — 어디쯤 왔고 다음이 무엇인지. 도구 화면을 가리지 않게 아래에 얇게 뜬다. */
    function paintBar(): void {
        document.querySelector('.flow-bar')?.remove();
        const run = readRun();
        if (!run) return;
        const step = run.steps[run.at];
        const next = run.steps[run.at + 1];
        const bar = document.createElement('div');
        bar.className = 'flow-bar';
        bar.innerHTML =
            `<span class="flow-bar-title">${escapeHtml(run.title)}</span>` +
            `<span class="flow-bar-count">${run.at + 1} / ${run.steps.length} · 지금 ${escapeHtml(toolTitle(step.toolId))}</span>` +
            (next
                ? `<button type="button" class="flow-btn flow-btn-go" data-flow-next>다음: ${escapeHtml(toolTitle(next.toolId))} →</button>`
                : '<button type="button" class="flow-btn flow-btn-go" data-flow-done>끝내기</button>') +
            '<button type="button" class="flow-btn" data-flow-stop>그만</button>';
        document.body.appendChild(bar);
        bar.querySelector('[data-flow-next]')?.addEventListener('click', () => goStep(run.at + 1));
        bar.querySelector('[data-flow-done]')?.addEventListener('click', () => {
            writeRun(null);
            Toolbox.showToast?.('흐름을 끝냈어요');
        });
        bar.querySelector('[data-flow-stop]')?.addEventListener('click', () => writeRun(null));
    }

    /* ── 화면 ─────────────────────────────────────────────────────── */

    async function loadFlows(): Promise<{ flows: Flow[]; mine: Flow[] } | null> {
        const base = api();
        if (!base) return null;
        try {
            const res = await fetch(`${base}/kl/flows`, { credentials: 'include' });
            if (!res.ok) return null;
            return (await res.json()) as { flows: Flow[]; mine: Flow[] };
        } catch {
            return null;
        }
    }

    function stepsHtml(steps: Step[]): string {
        return steps
            .map((step) => `<span class="flow-step">${escapeHtml(toolTitle(step.toolId))}</span>`)
            .join('<span class="flow-arrow">→</span>');
    }

    function cardHtml(flow: Flow, mine: boolean): string {
        return `
            <div class="flow-card" data-flow="${escapeHtml(flow.id)}">
                <h4>${escapeHtml(flow.title)}</h4>
                <div class="flow-steps">${stepsHtml(flow.steps)}</div>
                <span class="flow-meta">${flow.runs}번 돌았음${flow.ownerHandle ? ` · @${escapeHtml(flow.ownerHandle)}` : ''}</span>
                <div class="flow-actions">
                    <button type="button" class="flow-btn flow-btn-go" data-run="${escapeHtml(flow.id)}">시작</button>
                    ${mine
                        ? `<button type="button" class="flow-btn" data-del="${escapeHtml(flow.id)}">지우기</button>`
                        : `<button type="button" class="flow-btn" data-fork="${escapeHtml(flow.id)}">담기</button>`}
                </div>
            </div>`;
    }

    async function build(container: HTMLElement): Promise<void> {
        container.innerHTML = '<div class="flow-wrap"><p class="flow-lead">불러오는 중…</p></div>';
        const data = await loadFlows();
        if (!container.isConnected) return;
        if (!data) {
            container.innerHTML =
                '<div class="flow-wrap"><p class="flow-lead">지금은 흐름을 못 불러왔어요. 서버(집 노트북)에 못 닿았습니다 — 도구는 그대로 씁니다.</p></div>';
            return;
        }

        const signedIn = !!window.KarmoAccount?.state.account;
        const others = data.flows.filter((flow) => !data.mine.some((m) => m.id === flow.id));

        container.innerHTML = `
            <div class="flow-wrap">
                <p class="flow-lead">도구를 이어 붙여 <b>내 순서</b>를 만들어 둡니다. 시작하면 단계가 차례로 열리고,
                    앞 단계 결과는 다음 단계로 그대로 넘어갑니다. 저장되는 것은 <b>순서뿐</b>이라
                    파일은 이 브라우저를 떠나지 않습니다.</p>

                <div class="user-section">
                    <h3>➕ 만들기</h3>
                    ${signedIn
                        ? `<div class="flow-make">
                               <div class="flow-make-row">
                                   <input type="text" data-title placeholder="이름 (예: 문서 정리)" maxlength="40">
                                   <select data-pick></select>
                                   <button type="button" class="flow-btn" data-add>단계 추가</button>
                               </div>
                               <div class="flow-draft" data-draft><span class="flow-empty">아직 비었어요 — 도구를 골라 담아 보세요.</span></div>
                               <div class="flow-make-row">
                                   <button type="button" class="flow-btn flow-btn-go" data-save>저장</button>
                                   <span class="flow-empty">단계는 8개까지. 담은 것을 누르면 빠집니다.</span>
                               </div>
                           </div>`
                        : '<p class="flow-empty">만들려면 로그인이 필요합니다. 남의 흐름을 보고 시작하는 것은 지금도 됩니다.</p>'}
                </div>

                <div class="user-section">
                    <h3>🧰 내 흐름 (${data.mine.length})</h3>
                    <div class="flow-list">${data.mine.map((flow) => cardHtml(flow, true)).join('') || '<p class="flow-empty">아직 없어요.</p>'}</div>
                </div>

                <div class="user-section">
                    <h3>🌍 남들이 만든 것 (${others.length})</h3>
                    <div class="flow-list">${others.map((flow) => cardHtml(flow, false)).join('') || '<p class="flow-empty">아직 없어요.</p>'}</div>
                </div>
            </div>`;

        wireCards(container);
        if (signedIn) wireMaker(container);
        paintBar();
    }

    function wireCards(container: HTMLElement): void {
        const all = [...container.querySelectorAll<HTMLElement>('.flow-card')];
        const flowOf = (id: string): Flow | null => {
            const card = all.find((node) => node.dataset.flow === id);
            if (!card) return null;
            const steps = [...card.querySelectorAll('.flow-steps .flow-step')].map((node) => node.textContent ?? '');
            // 화면 글자가 아니라 서버에서 받은 값을 써야 하지만, 시작에 필요한 것은 순서뿐이라
            // 카드에 담아 둔 id 를 그대로 쓴다.
            return {
                id,
                title: card.querySelector('h4')?.textContent ?? '흐름',
                ownerHandle: null,
                steps: (card.dataset.steps ?? '').split(',').filter(Boolean).map((toolId) => ({ toolId })),
                runs: 0,
                forkedFrom: null,
            } as Flow & { _labels?: string[] };
        };
        container.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => {
            button.addEventListener('click', async () => {
                const base = api();
                const id = button.dataset.run ?? '';
                if (!base) return;
                try {
                    const res = await fetch(`${base}/kl/flows/${encodeURIComponent(id)}`);
                    if (!res.ok) throw new Error(String(res.status));
                    const flow = ((await res.json()) as { flow: Flow }).flow;
                    startRun(flow);
                } catch {
                    Toolbox.showToast?.('지금은 못 시작했어요');
                }
            });
        });
        container.querySelectorAll<HTMLButtonElement>('[data-fork]').forEach((button) => {
            button.addEventListener('click', async () => {
                const base = api();
                if (!base) return;
                try {
                    const res = await fetch(`${base}/kl/flows/${encodeURIComponent(button.dataset.fork ?? '')}/fork`, {
                        method: 'POST',
                        credentials: 'include',
                    });
                    Toolbox.showToast?.(res.ok ? '내 흐름에 담았어요' : '담지 못했어요');
                    if (res.ok) void build(button.closest('.tab-panel') ?? document.createElement('div'));
                } catch {
                    Toolbox.showToast?.('담지 못했어요');
                }
            });
        });
        container.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((button) => {
            button.addEventListener('click', async () => {
                if (!confirm('이 흐름을 지울까요? 남이 담아 간 것은 그대로 남습니다.')) return;
                const base = api();
                if (!base) return;
                await fetch(`${base}/kl/flows/${encodeURIComponent(button.dataset.del ?? '')}`, {
                    method: 'DELETE',
                    credentials: 'include',
                }).catch(() => {});
                void build(button.closest('.tab-panel') ?? document.createElement('div'));
            });
        });
        void flowOf;
    }

    function wireMaker(container: HTMLElement): void {
        const pick = container.querySelector<HTMLSelectElement>('[data-pick]');
        const draftSlot = container.querySelector<HTMLElement>('[data-draft]');
        const titleInput = container.querySelector<HTMLInputElement>('[data-title]');
        if (!pick || !draftSlot || !titleInput) return;

        /* 고를 수 있는 것은 **화면에 있는 도구 전부**다. 「이어지는 것만」으로 좁히면 아직
         * 형식을 안 밝힌 도구가 통째로 빠져 흐름을 못 만든다 — 좁히는 것은 나중에. */
        const metas = (window.KARMOLAB_LAZY_META ?? []) as Array<{ id: string; title?: string; hidden?: boolean }>;
        pick.innerHTML = metas
            .filter((meta) => !meta.hidden)
            .sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id))
            .map((meta) => `<option value="${escapeHtml(meta.id)}">${escapeHtml(meta.title ?? meta.id)}</option>`)
            .join('');

        let draft: Step[] = [];
        const paintDraft = (): void => {
            draftSlot.innerHTML = draft.length
                ? draft
                      .map(
                          (step, index) =>
                              `<span class="flow-step" data-drop="${index}">${escapeHtml(toolTitle(step.toolId))} ✕</span>`,
                      )
                      .join('<span class="flow-arrow">→</span>')
                : '<span class="flow-empty">아직 비었어요 — 도구를 골라 담아 보세요.</span>';
            draftSlot.querySelectorAll<HTMLElement>('[data-drop]').forEach((node) => {
                node.addEventListener('click', () => {
                    draft = draft.filter((_, index) => index !== Number(node.dataset.drop));
                    paintDraft();
                });
            });
        };

        container.querySelector('[data-add]')?.addEventListener('click', () => {
            if (draft.length >= 8) {
                Toolbox.showToast?.('8단계까지예요');
                return;
            }
            draft.push({ toolId: pick.value });
            paintDraft();
        });

        container.querySelector('[data-save]')?.addEventListener('click', async () => {
            const base = api();
            if (!base) return;
            if (!titleInput.value.trim() || draft.length === 0) {
                Toolbox.showToast?.('이름과 단계가 있어야 해요');
                return;
            }
            try {
                const res = await fetch(`${base}/kl/flows`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: titleInput.value, steps: draft }),
                });
                if (!res.ok) throw new Error(String(res.status));
                Toolbox.showToast?.('흐름을 저장했어요');
                void build(container);
            } catch {
                Toolbox.showToast?.('저장하지 못했어요');
            }
        });
    }

    // 도구 화면으로 옮겨 다녀도 띠는 따라온다.
    window.addEventListener('hashchange', paintBar);
    if (document.readyState === 'complete') paintBar();
    else window.addEventListener('load', paintBar);

    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta!('flow'),
        tabs: [
            {
                id: 'flow-main',
                label: '흐름',
                build: (container: HTMLElement) => {
                    /* 로그인 상태는 처음엔 **아직 모름**이다 (계정 확인이 늦게 온다).
                     * 한 번만 그리면 로그인한 사람에게도 「만들려면 로그인」이 남는다 —
                     * 상태가 정해질 때 다시 그린다. */
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
